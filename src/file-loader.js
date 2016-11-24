/**
 * The file loader module provides file loading functionality with a common API targeting browser
 *  and node processes.
 */
'use strict';

var loader = require('./loader.js'),
    levels = require('./levels.js'),
    http = require('http'),
    path = require('path'),
    url = require('url');

var HTTP_MATCH = /^https?:\/\//i,
    FILE_MATCH = /^file:\/\//i;

module.exports = load;

/**
 * Loads a config file, or series of config files (config levels).
 * @param {string...} location A fs path or url where the config can be retrieved from.
 * @param {object} options The last argument is the options to pass to the loader and levels.
 */
function load() {
    var domain, base, suffix, res, args, options, lvls, i;

    options = arguments[arguments.length - 1];
    if (!options || typeof options !== 'object') {
        options = {};
    }

    // Initialize the base information.
    if (process.title === 'browser') {
        configureBase(window.location.href);
    } else {
        configureBase(process.cwd());
    }

    // Now process locations 1 at a time
    lvls = [];
    args = Array.prototype.slice.call(arguments).filter(string);
    while (!args[0] && args.length) {
        args[i].shift();
    }
    if (args.length) {
        res = processLocation(args[0]).then(addLevel);
        for (i = 1; i < args.length; i++) {
            if (args[i]) {
                res = res.then(doProcessLocation(args[i]))
                    .then(addLevel);
            }
        }
        res = res.then(function () { return lvls; }).then(combineLevels);
    } else {
        res = Promise.resolve();
    }
    return res;

    function addLevel(l) {
        lvls.push(l);
    }

    function string(str) {
        return typeof str === 'string';
    }

    function doProcessLocation(location) {
        return function () {
            return processLocation(location);
        };
    }

    function processLocation(location) {
        return loadFile(location, true)
            .then(processData);
    }

    function processData(configData) {
        var ldr = defaultLoader;
        if (typeof options.customLoader === 'function') {
            ldr = options.customLoader;
        }
        return loader(configData, ldr, options);

        /** The loader for imports */
        function defaultLoader(location) {
            return loadFile(location, false);
        }
    }

    /** Combines loaded configs */
    function combineLevels(lvls) {
        return levels(lvls[0], lvls.slice(1), options);
    }

    /**
     * Loads the given location (could be fs or HTTP location).
     * @param {string} The HTTP or fs location.
     */
    function loadFile(location, allowOverride) {
        var pth;
        if (HTTP_MATCH.test(location)) {
            if (allowOverride) {
                configureBase(location);
            }
            return loadHttp(location);
        } else if (path.isAbsolute(location)) {
            if (allowOverride) {
                configureBase(location);
            }
            if (domain) {
                return loadHttp(domain + location);
            } else {
                return loadFs(location);
            }
        } else {
            pth = path.join(base, location);
            pth = domain + pth + suffix;
            if (HTTP_MATCH.test(pth)) {
                return loadHttp(pth);
            } else {
                return loadFs(pth);
            }
        }

        function loadFs(location) {
            // We need to do this (wrap require) so no attempt is made to bundle fs by browserify
            var fs = (require)('fs');

            return new Promise(function (resolve, reject) {
                fs.readFile(location, { encoding: 'utf8' }, function onFileRead(err, data) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(data);
                    }
                });
            });
        }

        function loadHttp(location) {
            return new Promise(function (resolve, reject) {
                var req = http.get(location, function onResponse(res) {
                    var body = [];
                    res.on('data', function onDataReceived(chunk) {
                        body.push(chunk);
                    });
                    res.on('end', function onRequestEnd() {
                        body = body.join('');
                        if (res.statusCode >= 200 && res.statusCode < 300) {
                            resolve(body);
                        } else {
                            reject(body);
                        }
                    });
                });
                req.on('error', function onError(err) {
                    reject(err);
                });
            });
        }
    }

    function configureBase(location) {
        if (FILE_MATCH.test(location)) {
            configureStandardBase();
        } else if (domain || HTTP_MATCH.test(location)) {
            configureHttpBase();
        } else {
            configureStandardBase();
        }

        function configureHttpBase() {
            var u, parts;
            if (HTTP_MATCH.test(location)) {
                u = url.parse(location);
                domain = u.protocol + '//' + u.host;
                base = u.pathname;
                suffix = u.search;
            } else {
                parts = location.split('?');
                base = parts[0];
                if (parts[1]) {
                    u.search = '?' + parts[1];
                }
            }
        }

        /** Configures the  */
        function configureStandardBase() {
            domain = '';
            suffix = '';
            base = path.dirname(location);
        }
    }
}
