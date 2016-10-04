/**
 * @module Levels The levels module is responsible for loading config files, and extending them
 *  with others. This is useful when wanting to either a base configuration that can
 *  be extended in specific situations.
 */
(function levelsModule(module) {
    'use strict';

    module.exports = load;
    module.exports.PROPERTY_COMMAND_NAME = '$';
    module.exports.COMMAND_CHECK = defaultCommandCheck;

    var common = require('./common.js'),
        lodash = require('lodash');

    /**
     * Applies the extension arguments to the config. This creates a completely new object
     *  structure with object prototypes pointing at various points in the config structure.
     * Note: Arrays are extended by index. If the extension level has undefined at any index,
     *  this indictaes that element should be removed.
     * @param {object} config The config to extend
     * @param {array} levels The levels to extend the config by.
     * @param {object} options The options to apply when extending config.
     *  * readOnly - Whether all properties will be set to readOnly
     *  * protectStructure - Whether to make properties non-configurable
     */
    function load(config, levels, options) {
        var i;

        // Ensure copied objects.
        config = common.clone(config);

        // Check that config is an object or array
        if (!common.isObject(config) && !Array.isArray(config)) {
            return config;
        }

        if (!Array.isArray(levels)) {
            return config;
        }

        options = lodash.extend({}, options);

        // Process all arguments.
        for (i = 0; i < levels.length; i++) {
            config = processLevel(config, levels[i]);
            if (common.isObject(config)) {
                config = postProcess(config);
            }
        }

        return config;

        /** Extends the config object with the level data */
        function processLevel(config, level) {
            if (Array.isArray(level)) {
                return processArray(level, config);
            } else if (common.isObject(level)) {
                if (common.isObject(config)) {
                    return processObject(config, level);
                } else {
                    // Just overwrite, ensuring we have a clone.
                    return common.clone(level);
                }
            } else {
                return common.clone(level);
            }
        }

        /** Processes an array merge, applying commands if there are any. */
        function processArray(arr, base) {
            var commands;
            if (typeof module.exports.COMMAND_CHECK === 'function') {
                commands = module.exports.COMMAND_CHECK(arr);
                if (commands) {
                    if (!Array.isArray(base)) {
                        base = [];
                    }
                    return applyCommands(base, commands);
                }
            }
            return arr.map(common.clone);

            /** Applies the commands to the base array. */
            function applyCommands(base, commands) {
                commands.forEach(applyCommand);
                return base;

                /** Executes the command on the base */
                function applyCommand(command) {
                    var index;
                    switch (command.action) {
                        case 'add':
                            base.push(command.value);
                            break;
                        case 'remove':
                            if (command.find) {
                                index = find(command.find);
                                if (index > -1) {
                                    base.splice(index, 1);
                                }
                            } else {
                                console.warn('No find parameters specified');
                            }
                            break;
                        case 'clear':
                            base.length = 0;
                            break;
                        case 'update':
                            if (command.find) {
                                index = find(command.find);
                                if (index > -1) {
                                    base[index] = command.value;
                                }
                            } else {
                                console.warn('No find parameters specified');
                            }
                            break;
                        case 'extend':
                            if (command.find) {
                                index = find(command.find);
                                if (index > -1) {
                                    base[index] = processLevel(base[index], command.value);
                                }
                            } else {
                                console.warn('No find parameters specified');
                            }
                            break;
                        default:
                            console.warn('Unrecognized configuration array action "' +
                                command.action + '"');
                            break;
                    }
                }

                /**
                 * Searches through the base for a value matching the supplied paramers
                 *  and returns it's index.
                 */
                function find(params) {
                    for (var i = 0; i < base.length; i++) {
                        if (base[i] === params) {
                            return i;
                        }
                        if (common.isObject(params) && common.isObject(base[i])) {
                            if (Object.keys(params).every(matches.bind(null, base[i]))) {
                                return i;
                            }
                        }
                    }
                    return -1;

                    /** Returns true if the value matches the parameter. */
                    function matches(val, param) {
                        return val[param] === params[param];
                    }
                }

            }
        }

        /** This performs the object extension. It does this by assigning the  */
        function processObject(config, level) {
            var proto = config,
                result = Object.create(proto);

            Object.keys(level).forEach(processKey);

            return result;

            /** Processes the level key */
            function processKey(key) {
                var def = Object.getOwnPropertyDescriptor(level, key);
                // Note: We need properties to be configurable for post processing.
                def.configurable = true;
                if (def.hasOwnProperty('value')) {
                    def.writable = !options.readOnly;
                    if (Array.isArray(def.value)) {
                        def.value = processArray(def.value, result[key]);
                    } else if (common.isObject(def.value)) {
                        if (common.isObject(result[key])) {
                            def.value = processObject(result[key], def.value);
                        } else {
                            def.value = common.clone(def.value);
                        }
                    } else {
                        def.value = common.clone(def.value);
                    }
                }
                Object.defineProperty(result, key, def);
            }
        }

        /**
         * Removes any undefined properties from the object and it's parents.
         * Locks the properties if protectStructure is truthy.
         */
        function postProcess(obj) {
            Object.keys(obj).forEach(processProperty);
            return obj;

            /**
             * Processes a property on the object, removing it is it is undefined (as well
             *  as any properties with the same name up the prototype chain). Locks all
             *  properties from configuration modifications if protectStructure is set to
             *  true.
             */
            function processProperty(key) {
                var def = Object.getOwnPropertyDescriptor(obj, key);
                if (def.hasOwnProperty('value')) {
                    if (def.value === undefined) {
                        // Remove the property
                        recursiveDelete(obj, key);
                        // We don't want to redefine the property at the end.
                        return;
                    } else if (Array.isArray(def.value) || common.isObject(def.value)) {
                        def.value = postProcess(def.value);
                    }
                    def.writable = !options.readOnly;
                }
                def.configurable = !options.protectStructure;
                Object.defineProperty(obj, key, def);
            }

            /** Removes property from object, and every object in the prototype chain. */
            function recursiveDelete(obj, key) {
                if (obj) {
                    delete obj[key];
                    recursiveDelete(Object.getPrototypeOf(obj), key);
                }
            }
        }
    }

    /**
     * The default check to see whether an array contains a list of commands. If it does, the
     *  command objects are returned directly. If it does not, undefined is returned.
     */
    function defaultCommandCheck(arr) {
        if (arr.every(isCommandElement)) {
            return arr.map(command);
        }

        /** Extracts the command from the element. */
        function command(ele) {
            return ele[module.exports.PROPERTY_COMMAND_NAME];
        }

        /** Checks whether the supplied element is a command element */
        function isCommandElement(ele) {
            var keys;
            if (common.isObject(ele)) {
                keys = Object.keys(ele);
                return keys.length === 1 && module.exports.PROPERTY_COMMAND_NAME;
            } else {
                return false;
            }
        }
    }

})(module);
