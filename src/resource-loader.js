/**
 * @module Resource loader. The resource loader module provides common loading functionality, and extensibility points
 *  for adding additional load types.
 */

// Constants
const OVERRIDE_ORDER = ['protocol', 'host', 'pathname', 'search', 'hash'];

// Dependencies
const request = require('request'),
    configObject = require('./config-object.js'),
    loader = require('./loader.js'),
    levels = require('./levels.js'),
    path = require('path'),
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
 *          {function} customLoader The loader to pass that will be used to load import data.
 *          TODO: Parser options
 *          TODO: Levels options
 *          TODO: Protocol loader options§
 *          TODO: Loader options
 */
function load(location, options) {
    var base = { protocol: 'file:' };
    options = options || {};

    // Explode the locations to include the level files.
    if (Array.isArray(options.levels) && options.levels.every(l => typeof l === 'string')) {
        const newLocation = location.map(loc => processLevel(loc, options.levels));
        location = newLocation[0].concat.apply(newLocation[0], newLocation.slice(1));
    }
    return Promise.all(location.map(l => processLocation(l, true)))
        .then(processLevels);

    function processLevel(value, levels) {
        const uri = url.parse(value);
        const directory = path.dirname(uri.pathname);
        const ext = path.extname(uri.pathname);
        const fileName = path.basename(uri.pathname, ext);

        return levels.map(function processLevel(level) {
            var newFileName;
            if (level) {
                newFileName = path.join(directory, `${fileName}.${level}${ext}`);
            } else {
                newFileName = path.join(directory, `${fileName}${ext}`);
            }
            uri.pathname = newFileName;
            return url.format(uri);
        });
    }

    function processLevels(lvls) {
        while (!lvls[0] && lvls.length) {
            lvls.shift();
        }
        if (lvls.length) {
            const opts = Object.assign({}, options);
            if (!opts.contextManager) {
                opts.contextManager = configObject.context(lvls[0]);
            }
            return levels(lvls[0], lvls.slice(1), opts);
        } else {
            throw new Error(`No valid config levels able to be loaded!`);
        }
    }

    /** Processes an individual location */
    function processLocation(location, processLoadedData) {
        var loaderName, protocolLoader, parsed, protocol;
        if (!location) {
            return;
        } else if (typeof location === 'object') {
            // TODO: Make sure we have a config object?
            return location;
        } else if (typeof location !== 'string') {
            return;
        }

        // Setup the path we will need.
        parsed = url.parse(location);
        protocol = parsed.protocol || base.protocol;
        loaderName = protocol && protocol.substr(0, protocol.length - 1);

        // Get the loader.
        if (!loaderName) {
            throw new Error('No initial protocol has been set! You MUST set the first location with an absolute URI');
        }
        if (!load.loaders[loaderName]) {
            throw new Error(`Unable to find a loader named "${loaderName}"`)
        }
        protocolLoader = load.loaders[loaderName];

        base = setOverrides(base, parsed, protocolLoader.override);
        var res = protocolLoader(Object.assign({}, base), options);
        if (processLoadedData) {
            const formatted = formatLocation(base);
            res = res.then(txt => processData(formatted, txt));
        }
        res = res.catch(onError);
        return res;

        function processData(location, configData) {
            var opts, ldr = defaultLoader;
            if (typeof options.customLoader === 'function') {
                ldr = options.customLoader;
            }
            opts = Object.assign({}, { context: location }, options);
            return loader(configData, ldr, opts);

            /** The loader for imports */
            function defaultLoader(location) {
                // Process the location as usual, but don't process the loaded data
                //  This is since the loader expects text, not the created object
                return processLocation(location, false);
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

function setOverrides(current, updated, protocolOverride) {
    var name, override = {}, copying = false;
    // Everything less than max....
    for (var i = 0; i < OVERRIDE_ORDER.length; i++) {
        name = OVERRIDE_ORDER[i]
        if (typeof updated[name] === 'string') {
            copying = true;
        }
        if (copying) {
            if (protocolOverride && typeof protocolOverride[name] === 'function') {
                override[name] = protocolOverride[name](current, updated);
            } else {
                override[name] = updated[name];
            }
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
fsLoad.override = {
    pathname: function joinPath(base, updated) {
        var bpath, upath, bext, uext;
        upath = updated.pathname;
        if (path.isAbsolute(upath)) {
            return upath;
        }
        bpath = base.pathname;
        if (bpath) {
            bext = path.extname(bpath);
            if (bext) {
                bpath = path.dirname(bpath, bext);
            }
            return path.join(bpath, upath);
        } else {
            throw new Error(`Received relative path "${upath}" without absolute base path!`);
        }
    }
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
