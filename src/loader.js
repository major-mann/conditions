/**
 * @module loader The loader module is responsible for providing a method of updating all loader
 *  references within a config file (according to the supplied prefix, or the default when none
 *  is supplied.)
 */
'use strict';

module.exports = process;

// The default prefix that should indicate a property is a loader property.
var OPTIONS_DEFAULT = {
    name: '$import',
    source: false,
    locals: false
};

// Dependencies
const parser = require('./parser.js'),
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
 *      * {object} environment - The environment variables to pass to the parser.
 *      * {boolean} protectStructure - Ensures all properties are non configurable.
 *      * {boolean} readOnly - Ensures all created properties are read only. Note: This will
 *          not apply to existing properties on config.
 *      * {string} context - Context informaiton to pass on errors.
 * @returns {promise} A promise which will be resolved with the config object once all includes
 *  have been loaded.
 */
function process(str, loader, options) {
    var imports, config;
    return new Promise(function (resolve, reject) {
        if (typeof loader !== 'function') {
            throw new Error(`loader MUST be a function. Got ${loader && typeof loader}`);
        }
        if (options && typeof options === 'object') {
            options = Object.assign({}, OPTIONS_DEFAULT, options);
        } else {
            options = Object.assign({}, OPTIONS_DEFAULT);
        }
        options.custom = handleCustomExpression;

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

    function handleCustomExpression(block) {
        var imported, location;
        if (block.type === 'CallExpression' && block.callee.name === options.name) {
            /* istanbul ignore else */
            if (block.arguments[0] && block.arguments[0].type === 'Literal') {
                location = block.arguments[0].value;
                doImport(block.arguments[0].value);
            }
            return customExpressionHandler;
        }
        return false;

        /**
         * This will return the loaded value.
         */
        function customExpressionHandler() {
            return imported;
        }

        function doImport(location) {
            var prom = loader(location);
            if (prom instanceof Promise) {
                imports.push(prom.then(data => processLoaderResult(location, data)));
            } else {
                // Note: We need to be in next tick to process since we need a
                //  copy of the context manager when processing and for that we need the
                //  current execution stack to complete
                imports.push(oneTick().then(() => processLoaderResult(location, prom)));
            }
        }

        function oneTick() {
            return new Promise(function (resolve) {
                resolve();
            });
        }

        /**
         * Processes the return value from the loader.
         */
        function processLoaderResult(location, data) {
            if (typeof data !== 'string') {
                imported = data;
                return Promise.resolve();
            }
            var opts = {
                environment: options.environment,
                readOnly: options.readOnly,
                protectStructure: options.protectStructure,
                custom: handleCustomExpression,
                context: location,
                contextManager: config[parser.PROPERTY_SYMBOL_CONTEXT]
            };
            return process(data, loader, opts)
                .then(function (cfg) {
                    imported = cfg;
                });
        }
    }
}
