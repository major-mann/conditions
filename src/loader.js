/**
 * @module loader The loader module is responsible for providing a method of updating all loader
 *  references within a config file (according to the supplied prefix, or the default when none
 *  is supplied.)
 */
'use strict';
// TODO: Could use some cleanup and documentation
module.exports = process;

const OPTIONS_DEFAULT = {
        name: '$import',
        from: '$importFrom',
        source: true,
        locals: true
    };

// Dependencies
const escodegen = require('escodegen'),
    uuid = require('uuid'),
    utils = require('./utils'),
    parser = require('./parser.js'),
    levels = require('./levels.js'),
    configObject = require('./config-object.js');

/**
 * Parses the supplied config string, with additional custom handling of import statements.
 * @param {string} str The config string. This will be parsed with the parser.
 * @param {function} loader The function to call with loader values. This function should either
 *  return the value directly, or a promise to be resolved. Any errors from the loader, or
 *  promise rejections will be passed along to the returned promise. If loader is not a
 *  function, the config is returned through the promise. If a string is returned from the
 *  loader it will be parsed with the parser (with the environment parameter)
 *  before being assigned.
 * @param {object} options The options for the loader. This can contain the following:
 *      * {string} name The name of the import function. Defaults to "$import"
 *      * {string} from The name of the imortFrom function. Defaults to $importFrom
 *      * {array} levels The levels to apply to filenames before loading
 *      * {object} environment - The environment variables to pass to the parser.
 *      * {boolean} protectStructure - Ensures all properties are non configurable.
 *      * {boolean} readOnly - Ensures all created properties are read only. Note: This will
 *          not apply to existing properties on config.
 *      * {string} context - Context informaiton to pass on errors.
 * @returns {promise} A promise which will be resolved with the config object once all includes
 *  have been loaded.
 */
function process(str, loader, options) {
    var imports, config, importCache = {};
    return new Promise(function (resolve, reject) {
        if (typeof loader !== 'function') {
            throw new Error(`loader MUST be a function. Got ${loader && typeof loader}`);
        }
        if (options && typeof options === 'object') {
            options = Object.assign({}, OPTIONS_DEFAULT, options);
        } else {
            options = Object.assign({}, OPTIONS_DEFAULT);
        }

        options.environment = Object.assign({}, options.environment);
        options.custom = customProcessExpression;
        options.post = postProcessExpression;
        options.lookup = lookup;

        imports = [];
        try {
            config = parser(str, options);
            Promise.all(imports)
                .then(() => configObject.commit(config))
                .then(() => resolve(config))
                .catch(reject);
        } catch (ex) {
            reject(ex);
        }
    });

    function lookup(context, property, name, nothrow) {
        if (importCache.hasOwnProperty(name)) {
            return () => importCache[name];
        } else {
            return context.call(this, property, name, nothrow);
        }
    }

    function customProcessExpression(block) {
        block = { block };
        processBlock(block);
        return block.block;

        /** Replaces import calls with custom generated names. */
        function processBlock(block) {
            Object.keys(block).forEach(function (key) {
                const type = block[key] && block[key].type;
                if (type === 'CallExpression') {
                    const name = block[key].callee.name;
                    if (name === options.name) {
                        const id = `customImport${uuid.v4().replace(/-/g, '')}`;
                        block[key].callee.name = id;
                        importCache[id] = undefined;
                    }
                }
            });
        }
    }

    function postProcessExpression(block, contextManager, object, property, context) {
        const localImports = [];

        processBlock(block);

        if (localImports.length) {
            const liChain = chain(localImports);
            // Chain the imports so we can ensure leaf first
            imports.push(liChain);
        }

        return block;

        /** Chains together the list of functions (expecting promise returns) */
        function chain(steps) {
            var result = Promise.resolve();
            for (let i = 0; i < steps.length; i++) {
                result = result.then(() => steps[i]());
            }
            return result;
        }

        /** Searches recursively for import calls to process. */
        function processBlock(block) {
            var name, handler, func;
            if (block.type === 'CallExpression' && block.callee.arguments.length >= 3) {
                name = block.callee.arguments[2] && block.callee.arguments[2].value;
                /* istanbul ignore else */
                if (importCache.hasOwnProperty(name)) {
                    const body = escodegen.generate({
                        type: 'ReturnStatement',
                        argument: {
                            type: 'CallExpression',
                            callee: {
                                type: 'Identifier',
                                name: '$import'
                            },
                            arguments: block.arguments
                        }
                    });
                    func = new Function(['context', '$import'], body);
                    localImports.push(() => importCache[name] = call());
                }
            }
            if (block && typeof block === 'object') {
                Object.keys(block).forEach(processBlock);
            }

            function call() {
                return func.call(object, context, doImport)
                    .then(res => importCache[name] = res);
            }

            function doImport() {
                var locations = Array.prototype.slice.call(arguments);
                if (Array.isArray(options.levels) && options.levels.every(l => typeof l === 'string')) {
                    locations = utils.explodeLevels(locations, options.levels);
                }
                return Promise.all(locations.map(processLocation))
                    .then(combine);

                function combine(parts) {
                    parts = parts.filter(p => p !== undefined); // Clear any that could not be loaded
                    /* istanbul ignore else */
                    if (parts.length) {
                        const opts = Object.assign({}, options);
                        /* istanbul ignore else */
                        if (!opts.contextManager) {
                            opts.contextManager = configObject.context(config);
                        }
                        return levels(parts[0], parts.slice(1), opts);
                    } else {
                        return undefined;
                    }
                }

                /** Processes an individual location argument */
                function processLocation(location) {
                    if (typeof location === 'string') {
                        return processLoaderLocation(location);
                    } else {
                        return location;
                    }
                }

                function processLoaderLocation(location) {
                    var prom = loader(location);
                    if (prom instanceof Promise !== true) {
                        const result = prom;
                        prom = Promise.resolve().then(() => result);
                    }
                    imports.push(prom);
                    return prom;
                }

            }
        }
    }
}
