/**
 * @module loader The loader module is responsible for providing a method of updating all loader
 *  references within a config file (according to the supplied prefix, or the default when none
 *  is supplied.)
 */
(function loader(module) {
    'use strict';

    module.exports = process;

    // The default prefix that should indicate a property is a loader property.
    var OPTIONS_DEFAULT = {
        name: '$import',
        source: false,
        locals: false
    };

    // Dependencies
    const parser = require('./parser'),
        // TODO: Replace with common once extend function is written
        lodash = require('lodash'),
        common = require('./common.js');

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
     *      * {object} source Defaults to false. true To pass the root of the config as an
     *          environment variable named source to the loaded files. If this is a function it
     *          will be passed the loader location to filter which items will be passed the source
     *          property.
     *      * {object} locals - Defaults to false. true to pass the objects associated with any ids
     *          to the loaded config. If this is a function it will be passed the loader location
     *          to filter which items will be passed the locals.
     *      * environment - The environment variables to pass to the parser.
     *      * protectStructure - Ensures all properties are non configurable.
     *      * readOnly - Ensures all created properties are read only. Note: This will not apply
     *          to existing properties on config.
     * @returns {promise} A promise which will be resolved with the config object once all includes
     *  have been loaded.
     */
    function process(str, loader, options) {
        var imports;
        return new Promise(function (resolve, reject) {
            if (typeof loader !== 'function') {
                throw new Error('loader MUST be a function');
            }
            if (options && typeof options === 'object') {
                options = lodash.extend({}, OPTIONS_DEFAULT, options);
            } else {
                options = lodash.extend({}, OPTIONS_DEFAULT);
            }
            options.custom = handleCustomExpression;

            imports = [];
            try {
                let config = parser(str, options);
                Promise.all(imports)
                    .then(function () { resolve(config); })
                    .catch(reject);
            } catch (ex) {
                reject(ex);
            }
        });

        function handleCustomExpression(block, source, environment, locals) {
            var imported, location;
            if (block.type === 'CallExpression' && block.callee.name === options.name) {
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
                    imports.push(prom.then(processLoaderResult));
                } else {
                    processLoaderResult(prom);
                }
            }

            /**
             * Processes the return value from the loader.
             */
            function processLoaderResult(data) {
                var env, opts;
                if (typeof data !== 'string') {
                    imported = data;
                    return;
                }
                env = {};
                if (assignAdditional('source', location)) {
                    env.source = source;
                }
                if (assignAdditional('locals', location)) {
                    // TODO: Where are these locals from?
                    if (common.isObject(locals)) {
                        lodash.extend(env, locals);
                    }
                }

                lodash.extend(env, environment);
                if (options.environment && typeof options.environment === 'object') {
                    lodash.extend(env, environment, options.environment);
                }

                opts = {
                    environment: env,
                    // These will be done later, if necessary
                    readOnly: options.readOnly,
                    protectStructure: options.protectStructure,
                    custom: handleCustomExpression
                };
                return process(data, loader, opts)
                    .then(function (cfg) {
                        imported = cfg;
                    });
            }
        }

        /**
         * Assigns one of the additional properties, first checking if it is a
         *   function, and using it as a filter if it is.
         * @param {string} name The name of the additional property to assign.
         */
        function assignAdditional(name, location) {
            const isFunc = typeof options[name] === 'function';
            if (isFunc) {
                return !!options[name](location);
            } else {
                return !!options[name];
            }
        }
    }
}(module));
