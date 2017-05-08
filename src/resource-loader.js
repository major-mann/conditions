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
    utils = require('./utils'),
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
 *          {boolean} verbose Whether to print out information about why resources could not be loaded.
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
        location = utils.explodeLevels(location, options.levels);
    }
    return Promise.all(location.map(l => processLocation(base, l)))
        .then(processLevels);

    function processLevels(lvls) {
        lvls = lvls.filter(l => !!l);
        if (lvls.length) {
            const opts = Object.assign({}, options);
            /* istanbul ignore else */
            if (!opts.contextManager) {
                opts.contextManager = configObject.context(lvls[0]);
            }
            return levels(lvls[0], lvls.slice(1), opts);
        } else {
            throw new Error(`No valid config levels able to be loaded!`);
        }
    }

    /** Processes an individual location */
    function processLocation(base, location) {
        var loaderName, protocolLoader, parsed, protocol;
        if (!location) {
            return;
        } else if (typeof location === 'object') {
            return location;
        } else if (typeof location !== 'string') {
            return;
        }

        // Setup the path we will need.
        parsed = url.parse(location);
        protocol = parsed.protocol || base.protocol;
        loaderName = protocol && protocol.substr(0, protocol.length - 1);

        // Get the loader.
        /* istanbul ignore if */
        if (!loaderName) {
            throw new Error('No initial protocol has been set! You MUST set the first location with an absolute URI');
        }
        if (!load.loaders[loaderName]) {
            throw new Error(`Unable to find a loader named "${loaderName}"`)
        }
        protocolLoader = load.loaders[loaderName];

        setOverrides(base, parsed, protocolLoader.override);
        var res = protocolLoader(Object.assign({}, base), options);
        const formatted = formatLocation(base);
        return res.then(txt => processData(formatted, txt))
            .catch(onError);

        function processData(location, configData) {
            var opts, ldr = defaultLoader;
            if (typeof options.customLoader === 'function') {
                ldr = options.customLoader;
            }
            opts = Object.assign({}, { context: location }, options);
            // Problem is passing in the loader here... The in loader,
            //  we process the result, and reference recursively...
            // Shouldn't the
            return loader(configData, ldr, opts);

            /** The loader for imports. */
            function defaultLoader(location) {
                const newBase = Object.assign({}, base);
                return processLocation(newBase, location);
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
            const loc = err.path || /* istanbul ignore next */ location;
            console.warn('Unable to load configuration file from "%s". Skipping', loc);
            if (options.verbose) {
                console.warn(err);
            }
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
    Object.assign(current, override);
}


function fsLoad(location) {
    return new Promise(function (resolve, reject) {
        location = fsLoad.format(location);
        fs.readFile(location, { encoding: 'utf8' }, function onComplete(err, data) {
            if (err) {
                err.path = location;
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
        /* istanbul ignore else */
        if (bpath) {
            bext = path.extname(bpath);
            /* istanbul ignore else */
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
                err.path = req.uri;
                err.code = res && res.statusCode;
                reject(err);
            } else {
                resolve(body);
            }
        });
    });
}
