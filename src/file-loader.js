/**
 * The file loader module provides file loading functionality with a common API targeting browser
 *  and node processes.
 */
(function fileLoaderModule(module) {
    'use strict';

    module.exports = load;

    // Constants
    const HTTP_MATCH = /^https?:\/\//i,
        FILE_MATCH = /^file:\/\//i;

    // Dependencies
    const loader = require('./loader.js'),
        levels = require('./levels.js'),
        http = require('http'),
        path = require('path'),
        url = require('url');

    // Assign global options to the functions
    load.warnOnError = true;

    /**
     * Loads a config file, or series of config files (config levels).
     * @param {...string} location A fs path or url where the config can be retrieved from.
     * @param {object} options The last argument is the options to pass to the loader and levels.
     */
    function load(location, options) {
        var domain, base, suffix, res, args, lvls, i;

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
            res = processLocation(args[0])
                .then(addLevel);
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
            if (l) {
                lvls.push(l);
            }
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
                .then(processData)
                .catch(onError);

            function onError(err) {
                if (load.warnOnError) {
                    console.warn('Unable to load configuration file from "%s". Skipping', location);
                    console.warn(err);
                } else {
                    throw err;
                }
            }
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
         * @param {string} location The HTTP or fs location.
         * @param {boolean} allowOverride Whether to allow the location to override the previous
         *  base path.
         */
        function loadFile(location, allowOverride) {
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
                let pth = path.join(base, location);
                pth = domain + pth + suffix;
                if (HTTP_MATCH.test(pth)) {
                    return loadHttp(pth);
                } else {
                    return loadFs(pth);
                }
            }

            /** Load config from the local file system */
            function loadFs(location) {
                // We need to do this (wrap require) so no attempt is made to bundle fs by
                //  browserify
                const fs = (require)('fs');

                return new Promise(function (resolve, reject) {
                    fs.readFile(location, { encoding: 'utf8' }, onFileRead);

                    /** A basic callback to promise wrap */
                    function onFileRead(err, data) {
                        if (err) {
                            reject(err);
                        } else {
                            resolve(data);
                        }
                    }
                });
            }

            /** Load data from an HTTP location */
            function loadHttp(location) {
                return new Promise(function (resolve, reject) {
                    // Make the HTTP request
                    const req = http.get(location, onResponse);
                    // Ensure we catch any errors
                    req.on('error', onError);

                    /** Called once a response from the HTTP request has been received */
                    function onResponse(res) {
                        var body = [];
                        res.on('data', onDataReceived);
                        res.on('end', onRequestEnd);

                        /** Called when data is received from tge request */
                        function onDataReceived(chunk) {
                            body.push(chunk);
                        }

                        /** Called once all data is received */
                        function onRequestEnd() {
                            body = body.join('');
                            if (res.statusCode >= 200 && res.statusCode < 300) {
                                resolve(body);
                            } else {
                                reject(body);
                            }
                        }
                    }

                    /** Called if an error occurs during the HTTP request */
                    function onError(err) {
                        reject(err);
                    }
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

            /** Configures the base from an HTTP load */
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

            /** Configures the base from a FS load */
            function configureStandardBase() {
                domain = '';
                suffix = '';
                base = path.dirname(location);
            }
        }
    }

}(module));
