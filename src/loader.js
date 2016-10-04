/**
 * @module loader The loader module is responsible for providing a method of updating all loader
 *  references within a config file (according to the supplied prefix, or the default when none
 *  is supplied.)
 */
(function loader(module) {
    'use strict';

    module.exports = process;

    // The default prefix that should indicate a property is a loader property.
    var PREFIX_DEFAULT = '$',
        OPTIONS_DEFAULT = {
            prefix: PREFIX_DEFAULT,
            source: false,
            locals: false
        };

    // Load the parser.
    var parser = require('./parser'),
        // TODO: Replace with common once extend function is written
        lodash = require('lodash'),
        common = require('./common.js');

    /**
     * Processes the supplied config object to find loader properties and add their values. The
     *  result of this function will be a proxied object.
     * @param {object} config The config object to process. If this is null, or not an object,
     *  it will be returned through the promise as is. Note: Unless there are no loader properties,
     *  a proxied object will be returned.
     *  loader.
     * @param {function} loader The function to call with loader values. This function should either
     *  return the value directly, or a promise to be resolved. Any errors from the loader, or
     *  promise rejections will be passed along to the returned promise. If loader is not a
     *  function, the config is returned through the promise. If a string is returned from the
     *  loader it will be parsed with the parser (with the environment parameter)
     *  before being assigned.
     * @param {object} options The options for the loader. This can contain the following:
     *      * prefix - The property prefix to determine which are loader
     *          properties. Defaults to "$"
     *      * prefixStrip - true to remove the prefix from the property name after load.
     *          "partial" to add a new property for the load without the prefix.
     *      * source - Defaults to false. true To pass the root of the config as an environment
     *          variable named source to the loaded files. If this is a function it will be passed
     *          the loader location to filter which items will be passed the source property.
     *      * locals - Defaults to false. true to pass the objects associated with any ids to the
     *          loaded config. If this is a function it will be passed
     *          the loader location to filter which items will be passed the locals.
     *      * environment - The environment variables to pass to the parser.
     *      * protectStructure - Ensures all properties are non configurable.
     *      * readOnly - Ensures all created properties are read only. Note: This will not apply
     *          to existing properties on config.
     * @returns {Promise} A promise which will be resolved once all includes have been loaded.
     */
    function process(config, loader, options) {
        var externals = [],
            recursives = [];
        // If environment is not supplied, the loader will be in it's parameter
        //  position (if that is supplied.)
        if (options && typeof options === 'object') {
            options = lodash.extend({}, OPTIONS_DEFAULT, options);
        } else {
            options = lodash.extend({}, OPTIONS_DEFAULT);
        }
        if (!options.prefix || typeof options.prefix !== 'string') {
            options.prefix = PREFIX_DEFAULT;
        }
        if (!options.environment || typeof options.environment !== 'object') {
            options.environment = {};
        }
        return new Promise(loaderExecutor);

        /** This handles processing the config and the result. */
        function loaderExecutor(resolve, reject) {
            if (config && typeof config === 'object' && typeof loader === 'function') {
                config = common.clone(config);
                config = processObject(config);
                // If result is undefined it means there were no loader properties,
                //  and proxy is not necessary.
                Promise.all(externals)
                    .then(waitForRecursives)
                    .then(protectConfig)
                    .then(resolve)
                    .catch(reject);
            } else {
                // If we cannot process, we just return the provided value.
                resolve(config);
            }

            /** Called once all the resources have been loaded */
            function waitForRecursives() {
                return Promise.all(recursives);
            }

            /** Called once all the loaded resources have been processed themselves */
            function protectConfig() {
                protect(config);
                return config;
            }

            /** Processes an object, checking for loader properties. */
            function processObject(obj) {
                Object.keys(obj).forEach(processKey);
                return obj;

                /** Processes a key from the object for loader properties. */
                function processKey(key) {
                    var loadPromise;
                    if (common.startsWith(key, options.prefix)) {
                        loadPromise = loader(obj[key], key, config);
                        if (!(loadPromise instanceof Promise)) {
                            loadPromise = Promise.resolve(loadPromise);
                        }
                        loadPromise
                            .then(onLoadedResource)
                            .catch(reject);
                        // Add the load so we make sure is is completed before returning the
                        //  processed config.
                        externals.push(loadPromise);
                    } else if (obj[key] && typeof obj[key] === 'object') {
                        obj[key] = processObject(obj[key]);
                    }

                    /** Called with the data supplied from the loader. */
                    function onLoadedResource(data) {
                        var env, locs, proto, opts;
                        proto = Object.getPrototypeOf(obj);

                        env = {};
                        if (assignAdditional('source', key)) {
                            env.source = config;
                        }
                        if (assignAdditional('locals', key)) {
                            locs = proto[parser.PROPERTY_PROTOTYPE_LOCALS];
                            if (common.isObject(locs)) {
                                lodash.extend(env, locs);
                            }
                        }

                        if (options.environment && typeof options.environment === 'object') {
                            lodash.extend(env, options.environment);
                        }

                        opts = {
                            environment: env,
                            // These will be done later, if necessary
                            readOnly: false,
                            protectStructure: false
                        };

                        if (typeof data === 'string') {
                            data = parser(data, opts);
                        }
                        if (options.prefixStrip === 'partial') {
                            key = key.substr(options.prefix.length);
                        } else if (options.prefixStrip) {
                            // Delete the original
                            delete obj[key];
                            key = key.substr(options.prefix.length);
                        }
                        Object.defineProperty(obj, key, {
                            enumerable: true,
                            value: data,
                            writable: !options.readOnly,
                            configurable: true
                        });

                        // Add to the recursives list so we can wait for the sub
                        //  load to finish.
                        recursives.push(process(obj[key]), loader, opts);

                        // TODO: Recursive.....
                        // We can't just add to externals as the Promise call will be going on
                        //  still... we need another collection...

                        // We may need to pass environment and locals

                        /**
                         * Assigns one of the additional properties, first checking if it is a
                         *   function, and using it as a filter if it is.
                         * @param {string} name The name of the additional property to assign.
                         */
                        function assignAdditional(name) {
                            var isFunc = typeof options[name] === 'function';
                            if (isFunc) {
                                return options[name](key, obj[key]);
                            } else {
                                return !!options[name];
                            }
                        }
                    }
                }
            }
        }

        /** Sets all properties to non-configurable, and optionally to read only.  */
        function protect(obj) {
            if (obj && typeof obj === 'object') {
                Object.keys(obj).forEach(processProperty);
            }

            /** Processes an object property. */
            function processProperty(prop) {
                var def = Object.getOwnPropertyDescriptor(obj, prop);
                if (def.hasOwnProperty('value')) {
                    def.writable = !options.readOnly;
                }
                if (def.configurable) {
                    def.configurable = !options.protectStructure;
                    Object.defineProperty(obj, prop, def);
                }
                protect(obj[prop]);
            }
        }
    }
}(module));
