/**
 * @module Levels The levels module is responsible for loading config files, and extending them
 *  with others. This is useful when wanting to either a base configuration that can
 *  be extended in specific situations.
 */
(function levelsModule(module) {
    'use strict';

    const PROTO_MARKER = Symbol();

    module.exports = load;
    module.exports.PROPERTY_COMMAND_NAME = '$';
    module.exports.COMMAND_CHECK = defaultCommandCheck;

    const common = require('./common.js'),
        parser = require('./parser.js'),
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
        var i, result,
            locals = new WeakMap(),
            locsArr = [],
            envs = new WeakMap(),
            envsArr = [],
            objs = new WeakMap(),
            updates = {};
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
            var proto, bproto, eproto, result, presult, converted, locs, env, tmp, id;
            converted = objs.get(base);
            if (converted) {
                return converted;
            }

            bproto = Object.getPrototypeOf(base);
            proto = Object.create(base);
            result = Object.create(proto);
            objs.set(base, result);

            id = bproto[parser.PROPERTY_PROTOTYPE_ID];
            if (id) {
                updateId(id, base, result);
            }
            eproto = Object.getPrototypeOf(extend);
            if (eproto) {
                id = eproto[parser.PROPERTY_PROTOTYPE_ID];
                if (id) {
                    updateId(id, extend, result);
                }
            }
            locs = processLocals(bproto[parser.PROPERTY_PROTOTYPE_LOCALS]);
            env = processEnvironment(bproto[parser.PROPERTY_PROTOTYPE_ENVIRONMENT]);
            if (env.source) {
                tmp = objs.get(env.source);
                if (tmp) {
                    env.source = tmp;
                }
            }

            Object.defineProperty(proto, PROTO_MARKER, {
                enumerable: false,
                value: true,
                writable: false,
                configurable: false
            });

            // Add the locals and environment
            Object.defineProperty(proto, parser.PROPERTY_PROTOTYPE_LOCALS, {
                enumerable: false,
                value: locs,
                writable: !options.readOnly,
                configurable: !options.protectStructure
            });

            Object.defineProperty(proto, parser.PROPERTY_PROTOTYPE_ENVIRONMENT, {
                enumerable: false,
                value: env,
                writable: !options.readOnly,
                configurable: !options.protectStructure
            });

            Object.keys(extend).forEach(process);

            // Note: We process all properties that are not on extend here
            //  (the function filters) so that we can assign the correct context
            //  locals in the final object.
            Object.keys(base).filter(unprocessed).forEach(reverseProcess);

            // Note: This allows us to do things like Object.keys and get a more expected
            //  result.
            // Note: We cannot use result directly as there seems to be some issues when traversing
            //  the prototype chain.
            presult = new Proxy({}, {
                ownKeys: () => allKeys(result),
                getOwnPropertyDescriptor: (t, p) => getDeepPropertyDescriptor(result, p, t),
                getPrototypeOf: () => Object.getPrototypeOf(result),
                setPrototypeOf: (t, p) => { Object.setPrototypeOf(result, p); },
                isExtensible: () => Object.isExtensible(result),
                preventExtensions: () => Object.preventExtensions(result),
                defineProperty: (t, p, d) => Object.defineProperty(result, p, d),
                has: (t, p) => p in result,
                get: (t, p) => result[p],
                set: (t, p, v) => result[p] = v,
                deleteProperty: (t, p) => delete result[p]
            });
            return presult;

            function process(key) {
                const def = Object.getOwnPropertyDescriptor(extend, key);
                var res = result;
                if (def.hasOwnProperty('value')) {
                    // Undefined indicates property removal.
                    if (def.value === undefined) {
                        if (proto.hasOwnProperty(key)) {
                            // Do nothing as we don't want to override proto's existing value
                            return;
                        }
                        // We need this def to be written onto the prototype so it is
                        //  not listed as a property of result
                        // TODO: With allKeys it is listed now... How to make sure it is not...
                        //      NO... it is not... but showing from proto!?!?
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

            function unprocessed(key) {
                return common.typeOf(base[key]) === 'object' && !result.hasOwnProperty(key);
            }

            function reverseProcess(key) {
                Object.defineProperty(result, key, {
                    configurable: !options.protectStructure,
                    writable: !options.readOnly,
                    value: objectExtend(base[key], {})
                });
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
            base = base.map(emptyExtend);
            commands.forEach(applyCommand);
            return base;

            /** Extends an empty object so we have a new clone */
            function emptyExtend(item) {
                return extendBase({}, item);
            }

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

    /** Used to retrieve every public key on an object and its prototype chain */
    function allKeys(obj) {
        // TODO: Could it be missing from here???
        var res = [], prop;
        for (prop in obj) { // jshint ignore:line
            res.push(prop);
        }
        return res;
    }

    /** Looks up a property descriptor all the way up the objects prototype chain */
    function getDeepPropertyDescriptor(obj, prop, target) {
        var proto, res = Object.getOwnPropertyDescriptor(obj, prop);
        proto = Object.getPrototypeOf(obj);
        // Check for hidden properties
        if (isPossibleCloak(res)) {
            if (prop in proto) {
                return undefined;
            }
        }
        if (!res) {
            if (proto) {
                res = getDeepPropertyDescriptor(proto, prop, target);
            }
        }

        // Note: There seems to be a bug in that won't allow you to return a property descriptor
        //  on a proxy as non-configurable if it does not exist on the target object.
        if (res && res.configurable === false) {
            if (!Object.getOwnPropertyDescriptor(target, prop)) {
                Object.defineProperty(target, prop, res);
            }
        }
        return res;

        function isPossibleCloak(desc) {
            return desc &&
                desc.hasOwnProperty('value') &&
                desc.value === undefined &&
                desc.enumerable === false;
        }
    }

})(module);
