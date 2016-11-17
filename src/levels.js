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
     *  structure with object prototypes pointing at various points in the base config structure.
     * Note: Arrays are extended using the special commands structure. See applyCommands function.
     * @param {object} config The config to extend
     * @param {array} levels The levels to extend the config by.
     * @param {object} options The options to apply when extending config.
     *  * readOnly - Whether all properties will be set to readOnly
     *  * protectStructure - Whether to make properties non-configurable
     */
    function load(config, levels, options) {
        var i, result;
        options = lodash.extend({}, options);

        // Process all arguments.
        result = config;
        if (Array.isArray(levels)) {
            for (i = 0; i < levels.length; i++) {
                result = extendBase(result, levels[i]);
            }
        }
        return result;

        function extendBase(base, extend) {
            if (Array.isArray(base) && Array.isArray(extend)) {
                return arrayExtend(base, extend);
            } else if (common.isObject(base) && common.isObject(extend)) {
                return objectExtend(base, extend);
            } else if (Array.isArray(extend)) {
                return extend.map(function (item) {
                    return extendBase({}, item);
                });
            } else if (common.isObject(extend)) {
                return extendBase({}, extend);
            } else {
                // Value copy
                return extend;
            }
        }

        function objectExtend(base, extend) {
            var proto = Object.create(base),
                result = Object.create(proto);

            Object.keys(extend).forEach(process);
            return result;

            function process(key) {
                var def = Object.getOwnPropertyDescriptor(extend, key),
                    res = result;
                if (def.hasOwnProperty('value')) {
                    // Undefined indicates property removal.
                    if (def.value === undefined) {
                        if (proto.hasOwnProperty(key)) {
                            // Do nothing as we don't want to override proto's existing value
                            return;
                        }
                        // We need this def to be written onto the prototype so it is
                        //  not listed as a property of result
                        res = proto;
                        def.writable = true;
                        def.enumerable = false;
                        def.configurable = true;
                    } else {
                        def.configurable = !options.protectStructure;
                        def.writable = !options.readOnly;
                        // TODO: If base is a accessor... should we not make this an
                        //  accessor (with potential setter for override?)
                        def.value = extendBase(base[key], def.value);
                    }
                } else {
                    def.configurable = !options.protectStructure;
                }
                Object.defineProperty(res, key, def);
            }
        }

        function arrayExtend(base, extend) {
            var commands;
            if (typeof module.exports.COMMAND_CHECK === 'function') {
                commands = module.exports.COMMAND_CHECK(extend);
                if (commands) {
                    return applyCommands(base.slice(), commands);
                }
            }
            return extend.slice();
        }

        /** Applies the commands to the base array. */
        function applyCommands(base, commands) {
            // We need to operate on a copy of base.
            base = base.map(function (item) {
                return extendBase({}, item);
            });
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
                                base[index] = extendBase(base[index], command.value);
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
