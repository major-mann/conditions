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

    const common = require('./common.js'),
        parser = require('./parser.js'),
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
     */
    function load(config, levels, options) {
        var locals, locsArr, envs, envsArr, objs, updates, i, result, cache, cman;
        debugger;
        options = options || {};
        locals = new WeakMap();
        locsArr = [];
        envs = new WeakMap();
        envsArr = [];
        objs = new WeakMap();
        updates = {};

        cman = config[parser.PROPERTY_SYMBOL_CONTEXT];
        if (!cman) {
            cman = contextManager(config);
        }

        result = config;
        if (Array.isArray(levels) && levels.length) {
            // prepareLevelProcess(levels[0]);
            cache = new WeakMap();
            result = processLevel(config, levels[0]);
            for (i = 1; i < levels.length; i++) {
                // prepareLevelProcess(levels[i]);
                cache = new WeakMap();
                result = processLevel(result, levels[i]);
            }
        }
        return result;

        /** Processes an individual level. */
        function processLevel(config, level) {
            if (isObj(config) && isObj(level)) {
                return objectExtend(config, level);
            } else if (Array.isArray(config) && Array.isArray(level)) {
                return arrayExtend(config, level);
            } else if (isObj(level)) {
                return processLevel({}, level);
            } else if (Array.isArray(level)) {
                let res = level.map(e => processLevel({}, e));
                Object.defineProperty(res, parser.PROPERTY_SYMBOL_CONTEXT, {
                    enumerable: false,
                    value: cman,
                    writable: !options.readOnly,
                    configurable: !options.protectStructure
                });
                return res;
            } else {
                return level;
            }

            /**
             * Checks whether the supplied value is an object that is not
             *  an array, date or regex.
             */
            function isObj(obj) {
                return common.typeOf(obj) === 'object';
            }
        }

        function processContext(base, extend, result) {
            var ectx, rctx, id;
            ectx = extend[parser.PROPERTY_SYMBOL_CONTEXT];
            if (ectx) {
                rctx = cman.sub(ectx.name(), ectx.environment(), ectx.locals());
            } else {
                rctx = cman.sub();
            }

            Object.defineProperty(result, parser.PROPERTY_SYMBOL_CONTEXT, {
                enumerable: false,
                value: rctx,
                writable: !options.readOnly,
                configurable: !options.protectStructure
            });

            // Ensure environment is updated
            rctx.update(base, result);
            rctx.update(extend, result);

            // Register if we have an id
            if (extend[parser.PROPERTY_SYMBOL_ID]) {
                id = extend[parser.PROPERTY_SYMBOL_ID];
            } else if (base[parser.PROPERTY_SYMBOL_ID]) {
                id = base[parser.PROPERTY_SYMBOL_ID];
            }
            if (id) {
                rctx.register(id, result);
                Object.defineProperty(result, parser.PROPERTY_SYMBOL_ID, {
                    enumerable: false,
                    value: id,
                    writable: !options.readOnly,
                    configurable: !options.protectStructure
                });
            }
        }

        function objectExtend(base, extend) {
            var result, cachedResult, keys;

            cachedResult = cacheGet(base, extend);
            if (cachedResult) {
                return cachedResult;
            }

            // Create the result with the base as a prototype
            result = Object.create({});
            processContext(base, extend, result);
            cacheSet(base, extend, result);

            // Now we are ready to process the keys.
            keys = allKeys(base, extend);
            keys.forEach(processKey);
            Object.setPrototypeOf(result, base);

            if (result[parser.PROPERTY_SYMBOL_ID] && !result.hasOwnProperty(parser.PROPERTY_ID)) {
                result[parser.PROPERTY_ID] = result[parser.PROPERTY_SYMBOL_ID];
            }

            if (result[parser.PROPERTY_SYMBOL_ID]) {
                console.log('%s same as registered? %s',
                    result[parser.PROPERTY_SYMBOL_ID],
                    cman.value(result[parser.PROPERTY_ID]) === result);
            }

            return result;

            function cacheGet(base, extend) {
                var cachedResult, extendCachedResult;
                cachedResult = cache.get(base);
                if (cachedResult) {
                    extendCachedResult = cachedResult.get(extend);
                    if (extendCachedResult) {
                        return extendCachedResult;
                    }
                }
            }

            function cacheSet(base, extend, value) {
                var cachedResult;
                cachedResult = cache.get(base);
                if (!cachedResult) {
                    cachedResult = new WeakMap();
                    cache.set(base, cachedResult);
                }
                cachedResult.set(extend, value);
            }

            /** Processes an individual key */
            function processKey(k) {
                var bt, et, def;

                def = Object.getOwnPropertyDescriptor(extend, k);

                // If we have an accessor, we just copy it onto the result, unless it
                //  is an object which we then recursively process and define as a normal
                //  value property
                // TODO: This is not working well.....
                if (def && def.get && def.get[module.exports.PROPERTY_SYMBOL_CUSTOM]) {
                    if (extend[k] && typeof extend[k] === 'object') {
                        def.value = processLevel(base[k], extend[k]);
                        delete def.get;
                        delete def.set;
                    }
                    Object.defineProperty(result, k, def);
                    return;
                } else if (def && def.get) {
                    Object.defineProperty(result, k, def);
                    return;
                }

                def = undefined;
                bt = common.typeOf(base[k]);
                et = common.typeOf(extend[k]);
                if (!extend.hasOwnProperty(k)) {
                    def = Object.getOwnPropertyDescriptor(base, k);
                    if (def && !def.hasOwnProperty('value')) {
                        if (base[k] && typeof base[k] === 'object') {
                            def.value = processExtendObject(base[k]);
                            delete def.get;
                            delete def.set;
                        }
                        Object.defineProperty(result, k, def);
                        return;
                    }
                }

                // All following is to process non-accessors
                // If we have an object, or array we want to make sure we pass locals and
                //  environment along.
                if (bt !== et && et === 'object') {
                    setResultValue(result, k, processExtendObject(extend[k]));
                } else if (bt !== et && et === 'array') {
                    result[k] = extend[k].map(processExtendObject);
                } else if (extend.hasOwnProperty(k) && et === 'undefined') {
                    // Hide the prop
                    Object.defineProperty(result, k, {
                        enumerable: false,
                        configurable: true,
                        get: function () {
                            return undefined;
                        },
                        set: function (value) {
                            // We need to redifine as an enumerable...
                            Object.defineProperty(result, k, {
                                enumerable: true,
                                configurable: true,
                                value: value
                            });
                        }
                    });
                } else if (et === 'undefined') {
                    setResultValue(result, k, processExtendObject(base[k]));
                } else {
                    setResultValue(result, k, processLevel(base[k], extend[k]));
                }

                function processExtendObject(extend) {
                    return processLevel({}, extend);
                }

                function setResultValue(result, name, value) {
                    Object.defineProperty(result, name, {
                        enumerable: true,
                        value: value,
                        writable: !options.readOnly,
                        configurable: !options.protectStructure
                    });
                }
            }
        }

        function arrayExtend(base, extend) {
            var commands, res, i;
            if (typeof module.exports.COMMAND_CHECK === 'function') {
                commands = module.exports.COMMAND_CHECK(extend);
                if (commands) {
                    res = base.slice();
                    processContext(base, extend, res);
                    return applyCommands(res, commands);
                }
            }
            res = [];
            processContext(base, extend, res);
            for (i = 0; i < extend.length; i++) {
                res.push(processLevel({}, extend[i]));
            }
            return res;
        }

        /** Applies the commands to the base array. */
        function applyCommands(base, commands) {
            // We need to operate on a copy of base.
            for (let i = 0; i < base.length; i++) {
                base[i] = processLevel({}, base[i]);
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

    function allKeys(obj1, obj2) {
        var keys = Object.keys(obj1).concat(Object.keys(obj2));
        return keys.filter((k, i) => keys.indexOf(k) === i);
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
