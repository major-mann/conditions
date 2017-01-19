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
        parser = require('./parser.js');

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
        var locals, locsArr, envs, envsArr, objs, updates, i, result, cache;

        options = options || {};
        locals = new WeakMap();
        locsArr = [];
        envs = new WeakMap();
        envsArr = [];
        objs = new WeakMap();
        updates = {};

        if (Array.isArray(levels)) {
            cache = new WeakMap();
            result = processLevel(config, levels[0]);
            for (i = 1; i < levels.length; i++) {
                cache = new WeakMap();
                result = processLevel(result, levels[i]);
            }
        } else {
            result = config;
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
                return level.map(e => load({}, e, options));
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

        function objectExtend(base, extend) {
            var result, cachedResult, extendCachedResult, keys, locals, env, tmp;

            cachedResult = cache.get(base);
            if (cachedResult) {
                extendCachedResult = cachedResult.get(extend);
                if (extendCachedResult) {
                    return extendCachedResult;
                }
            }

            // Create the result with the base as a prototype
            result = Object.create({});
            if (!cachedResult) {
                extendCachedResult = new WeakMap();
                cache.set(base, extendCachedResult);
                extendCachedResult.set(extend, result);
            }
            locals = processLocals(base[parser.PROPERTY_SYMBOL_LOCALS]);
            env = processEnvironment(base[parser.PROPERTY_SYMBOL_ENVIRONMENT]);
            if (env.source) {
                tmp = objs.get(env.source);
                if (tmp) {
                    env.source = tmp;
                }
            }

            writeLocalsAndEnvironment(result);

            // Update the locals and environment
            update();

            // Now we are ready to process the keys.
            keys = allKeys(base, extend);
            keys.forEach(processKey);
            Object.setPrototypeOf(result, base);
            return result;

            function update() {
                var id = base[parser.PROPERTY_SYMBOL_ID];
                if (id) {
                    updateId(id, base, result);
                }
                id = extend[parser.PROPERTY_SYMBOL_ID];
                if (id) {
                    updateId(id, extend, result);
                }
            }

            function updateId(id, obj, updated) {
                var i, target;
                target = Object.getPrototypeOf(Object.getPrototypeOf(updated)).id;
                for (i = 0; i < locsArr.length; i++) {
                    if (obj && locsArr[i][id] === obj) {
                        locsArr[i][id] = updated;
                        updates[id] = updated;
                    }
                }
                for (i = 0; i < envsArr.length; i++) {
                    if (obj && envsArr[i][id] === obj) {
                        envsArr[i][id] = updated;
                        updates[id] = updated;
                    }
                }
            }

            /** Processes an individual key */
            function processKey(k) {
                var bt = common.typeOf(base[k]),
                    et = common.typeOf(extend[k]),
                    def = Object.getOwnPropertyDescriptor(extend, k);

                // If we have an accessor, we just copy it onto the result, unless it
                //  is an object which we then recursively process and define as a normal
                //  value property
                if (def && !def.hasOwnProperty('value')) {
                    if (extend[k] && typeof extend[k] === 'object') {
                        def.value = processLevel(base[k], extend[k]);
                        delete def.get;
                        delete def.set;
                    }
                    Object.defineProperty(result, k, def);
                    return;
                }
                def = undefined;
                if (!extend.hasOwnProperty(k)) {
                    def = Object.getOwnPropertyDescriptor(base, k);
                    if (def && !def.hasOwnProperty('value')) {
                        if (extend[k] && typeof extend[k] === 'object') {
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
                    var tmp = {};
                    writeLocalsAndEnvironment(tmp);
                    return processLevel(tmp, extend);
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

            function writeLocalsAndEnvironment(obj) {
                // Add the locals and environment
                Object.defineProperty(obj, parser.PROPERTY_SYMBOL_LOCALS, {
                    enumerable: false,
                    value: locals,
                    writable: !options.readOnly,
                    configurable: !options.protectStructure
                });
                Object.defineProperty(obj, parser.PROPERTY_SYMBOL_ENVIRONMENT, {
                    enumerable: false,
                    value: env,
                    writable: !options.readOnly,
                    configurable: !options.protectStructure
                });
            }

        }

        function processLocals(locs) {
            var res;
            if (locs && typeof locs === 'object') {
                res = locals.get(locs);
                if (!res) {
                    res = Object.assign({}, locs);
                    locsArr.push(res);
                    Object.assign(res, updates);
                    locals.set(locs, res);
                }
            } else {
                res = {};
            }
            return res;
        }

        function processEnvironment(env) {
            var res;
            if (env && typeof env === 'object') {
                res = envs.get(env);
                if (!res) {
                    res = Object.assign({}, env);
                    envsArr.push(res);
                    Object.assign(res, updates);
                    envs.set(env, res);
                }
            } else {
                res = {};
            }
            return res;
        }

        function arrayExtend(base, extend) {
            var commands;
            if (typeof module.exports.COMMAND_CHECK === 'function') {
                commands = module.exports.COMMAND_CHECK(extend);
                if (commands) {
                    return applyCommands(base.slice(), commands);
                }
            }
            return extend.map(e => processLevel({}, e));
        }

        /** Applies the commands to the base array. */
        function applyCommands(base, commands) {
            // We need to operate on a copy of base.
            base = base.map(e => processLevel({}, e));
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
