/**
 * @module Levels The levels module is responsible for loading config files, and extending them
 *  with others. This is useful when wanting to either a base configuration that can
 *  be extended in specific situations.
 */
'use strict';

module.exports = load;
module.exports.PROPERTY_COMMAND_NAME = '$';
module.exports.COMMAND_CHECK = defaultCommandCheck;

// Constants
const EMPTY = Object.freeze({}),
    OPTIONS = {
        readOnly: false,
        protectStructure: false
    };

// Dependencies
const expression = require('./expression.js'),
    doubleCache = require('./double-cache.js'),
    configObject = require('./config-object.js'),
    contextManager = require('./context-manager.js');

/**
 * Applies the extension arguments to the config. This creates a completely new object
 *  structure with object prototypes pointing at various points in the base config structure.
 * Note: Arrays are extended using the special commands structure. See applyCommands function.
 * @param {object} config The config to extend
 * @param {array} levels The levels to extend the config by.
 * @param {object} options The options to apply when extending config.
 *      * {boolean} readOnly - Whether all properties will be set to readOnly
 *      * {boolean} protectStructure - Whether to make properties non-configurable
 *      * {object} contextManager - The manager to override with and provide context
 */
function load(config, levels, options) {
    var i, cache, res = config, cman;

    // Get the context info to use when creating config objects
    options = Object.assign({}, OPTIONS, options);

    if (options.contextManager) {
        cman = options.contextManager;
    }

    cache = doubleCache();
    if (Array.isArray(levels)) {
        for (i = 0; i < levels.length; i++) {
            res = processLevel(res, levels[i], cache);
        }
    }
    configObject.commit(res);
    return res;


    function processLevel(base, extend, cache) {
        var i, res;
        if (cache.has(base, extend)) {
            return cache.get(base, extend);
        }
        if (Array.isArray(base) && Array.isArray(extend)) {
            return arrayExtend(base, extend);
        } else if (isObj(base) && isObj(extend)) {
            return objectExtend(base, extend);
        } else if (Array.isArray(extend)) {
            res = createConfigObject([], base, extend);
            cache.set(base, extend, res);
            for (i = 0; i < extend.length; i++) {
                res.push(processLevel(EMPTY, extend[i], cache));
            }
            return res;
        } else if (isObj(extend)) {
            return processLevel(EMPTY, extend, cache);
        } else {
            return extend;
        }

        function objectExtend(base, extend) {
            const res = createConfigObject({}, base, extend);
            cache.set(base, extend, res);

            Object.keys(base).forEach(processKey);
            Object.keys(extend).forEach(processKey);

            return res;

            function processKey(k) {
                if (res.hasOwnProperty(k)) {
                    // Already processed
                    return;
                }
                if (extend.hasOwnProperty(k)) {
                    if (expression.is(extend, k)) {
                        expression.copy(extend, k, res, k);
                    } else if (extend[k] === undefined) {
                        // Note: This means we need to remove a property. When we created
                        //  the config object, we added added an additional prototype layer
                        //  to manage this situation. (So we have base -> additional -> obj)
                        // By setting this here, the name does not appear in the keys,
                        //  and any attempt to access the value returns undefined.
                        Object.getPrototypeOf(res)[k] = undefined;
                    } else {
                        const baseVal = base[k];
                        const extendVal = extend[k];
                        res[k] = processLevel(baseVal, extendVal, cache);
                    }
                } else { // base has the property
                    if (expression.is(base, k)) {
                        expression.copy(base, k, res, k);
                    } else {
                        res[k] = processLevel(EMPTY, base[k], cache);
                    }
                }
            }
        }

        function arrayExtend(base, extend) {
            var commands, items, res, i;
            res = createConfigObject([], base, extend);
            cache.set(base, extend, res);
            if (typeof module.exports.COMMAND_CHECK === 'function') {
                commands = module.exports.COMMAND_CHECK(extend);
                if (commands) {
                    // Note: We need to apply to a vanilla array in case
                    //  we are in read only mode which will prevent certain
                    //  types of splice re-arrangement from happening.
                    items = base.slice();
                    items = applyCommands(items, commands);
                    for (i = 0; i < items.length; i++) {
                        res.push(processLevel(EMPTY, items[i], cache));
                    }
                    return res;
                }
            }
            for (i = 0; i < extend.length; i++) {
                res.push(processLevel(EMPTY, extend[i], cache));
            }
            return res;
        }

        /** Applies the commands to the base array. */
        function applyCommands(base, commands) {
            // We need to operate on a copy of base.
            for (let i = 0; i < base.length; i++) {
                base[i] = processLevel(EMPTY, base[i], cache);
            }
            commands.forEach(applyCommand);
            return base;

            /** Executes the command on the base */
            function applyCommand(command) {
                var index;
                switch (command.action) {
                    case 'add':
                        base.push(command.value);
                        break;
                    case 'insert':
                        if (command.find) {
                            index = find(command.find);
                            if (index > -1) {
                                if (command.after) {
                                    base.splice(index + 1, 0, command.value);
                                } else {
                                    base.splice(index, 0, command.value);
                                }
                            }
                        } else {
                            console.warn('No find parameters specified');
                        }
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
                                base[index] = processLevel(base[index], command.value, cache);
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
                    if (isObject(params) && isObject(base[i])) {
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

        function createConfigObject(type, base, extend, opts) {
            opts = Object.assign({
                readOnly: options.readOnly,
                protectStructure: options.protectStructure,
                environment: cman && cman.environment() || {},
                locals: cman && cman.locals() || {},
                context: options.context || cman && cman.name(),
                contextManager: cman
            }, opts);
            const res = configObject(type, opts);

            // Set the prototype to base so extended expressions can
            //  use the base keyword.
            if (base && typeof base === 'object') {
                // Note: We add an additional prototype layer that we can use to hide
                //  underlying propery values.
                Object.setPrototypeOf(res, Object.create(base));
            }
            cman = configObject.context(res);
            return res;
        }

        function isObj(obj) {
            return obj && typeof obj === 'object' && !Array.isArray(obj);
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
        if (isObject(ele)) {
            keys = Object.keys(ele);
            return keys.length === 1 && module.exports.PROPERTY_COMMAND_NAME;
        } else {
            return false;
        }
    }
}

/** Simple non-null object check */
function isObject(val) {
    return !!val && typeof val === 'object';
}
