/**
 * @module Resource loader. The resource loader module provides common loading functionality, and extensibility points
 *  for adding additional load types.
 */

// Constants
const OVERRIDE_ORDER = ['protocol', 'host', 'pathname', 'search', 'hash'];

// Dependencies
const request = require('request'),
    loader = require('./loader.js'),
    levels = require('./levels.js'),
    url = require('url'),
    fs = require('fs');

// Expose the API
module.exports = load;
module.exports.loaders = {
    http: httpLoad,
    https: httpLoad,
    file: fsLoad
};

/**
 * Loads a config file, or series of config files (config levels).
 * @param {array} location An array of loader string paths, or objects to inject.
 * @param {object} options The last argument is the options to pass to parser, loader and levels.
 */
function load(location, options) {
    var base;
    options = options || {};
    return Promise.all(location.map(processLocation))
        .then(processLevels);

    function processLevels(lvls) {
        while (!lvls[0] && lvls.length) {
            lvls.shift();
        }
        if (lvls.length) {
            return levels(lvls[0], lvls.slice(1), options);
        } else {
            throw new Error(`No valid config levels able to be loaded!`);
        }
    }

    /** Processes an individual location */
    function processLocation(location) {
        var loaderName, protocolLoader;
        if (!location) {
            return;
        } else if (typeof location === 'object') {
            return location;
        } else if (typeof location !== 'string') {
            return;
        }

        // Setup the path we will need.
        base = setOverrides(base, url.parse(location));

        // Get the loader.
        loaderName = base.protocol;
        loaderName = loaderName && loaderName.substr(0, loaderName.length - 1);
        if (!loaderName) {
            throw new Error('No initial protocol has been set! You MUST set the first location with an absolute URI');
        }
        if (!load.loaders[loaderName]) {
            throw new Error(`Unable to find a loader named "${loaderName}"`)
        }
        protocolLoader = load.loaders[loaderName];

        return protocolLoader(Object.assign({}, base), options)
            .then(txt => processData(formatLocation(base), txt))
            .catch(onError);

        function processData(location, configData) {
            var opts, ldr = defaultLoader;
            if (typeof options.customLoader === 'function') {
                ldr = options.customLoader;
            }
            opts = Object.assign({}, { context: location }, options);
            return loader(configData, ldr, opts);

            /** The loader for imports */
            function defaultLoader(location) {
                return processLocation(location);
            }
        }

        function formatLocation(location) {
            if (typeof protocolLoader.format === 'function') {
                return protocolLoader.format(location);
            } else {
                return url.format(base);
            }
        }

        function onError(err) {
            console.warn('Unable to load configuration file from "%s". Skipping', location);
            console.warn(err);
        }
    }
}

function setOverrides(current, updated) {
    var name, override = {}, copying = false;
    // Everything less than max....
    for (var i = 0; i < OVERRIDE_ORDER.length; i++) {
        name = OVERRIDE_ORDER[i]
        if (typeof updated[name] === 'string') {
            copying = true;
        }
        if (copying) {
            override[name] = updated[name];
        }
    }
    return Object.assign({}, current, override);
}


function fsLoad(location) {
    return new Promise(function (resolve, reject) {
        location = fsLoad.format(location);
        fs.readFile(location, { encoding: 'utf8' }, function onComplete(err, data) {
            if (err) {
                reject(err);
            } else {
                resolve(data);
            }
        });
    });
}
fsLoad.format = function format(base) {
    base = Object.assign({}, base);
    base.slashes = false;
    delete base.protocol;
    delete base.auth;
    delete base.host;
    delete base.port;
    delete base.hostname;
    delete base.search;
    delete base.query;
    delete base.path;
    delete base.href;
    return url.format(base);
};

function httpLoad(location) {
    return new Promise(function (resolve, reject) {
        var req = {
            method: 'GET',
            uri: url.format(location)
        };
        request(req, function (err, res, body) {
            if (res.statusCode < 200 || res.statusCode > 299) {
                err = new Error(body);
            }
            if (err) {
                err.code = res && res.statusCode;
                reject(err);
            } else {
                resolve(body);
            }
        });
    });
}
