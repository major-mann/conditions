'use strict';

// Constants
const CONFIG_OBJECT = Symbol('config-object'),
    CONTEXT = Symbol('context'),
    EVENTS = Symbol('events'),
    CHANGE = 'change',
    REF_CHANGE = 'ref-change',
    OPTIONS = {
        readOnly: false,
        protectStructure: false
    };

// Dependencies
const EventEmitter = require('events'),
    contextManager = require('./context-manager.js'),
    changeTracker = require('./change-tracker.js'),
    expression = require('./expression.js');

// Expose the public API
module.exports = create;
module.exports.is = isConfigObject;
module.exports.context = context;
module.exports.events = events;
module.exports.commit = changeTracker.commit;
module.exports.reset = changeTracker.reset;
module.exports.changes = changeTracker.changes;
module.exports.CHANGE = CHANGE;

function create(obj, options, cache) {
    var res, i, events, preventCircularEvent = {};
    res = obj;
    if (/*!isConfigObject(obj) &&*/obj && typeof obj === 'object') {
        cache = cache || new WeakMap();
        if (cache.has(obj)) {
            return cache.get(obj);
        }
        events = {};
        options = Object.assign({}, OPTIONS, options);

        res = initialize(obj, options);
        if (!res || !res[CONFIG_OBJECT]) {
            // If we have something like date or regexp
            return res;
        }
        res = managed(res, options);
        res = changeTracker(res, {
            customRevert: expression.clearOverride
        });
        res[CONTEXT].register(res, false);

        // Caches the result to handle circular refs
        cache.set(obj, res);

        if (Array.isArray(res)) {
            for (i = 0; i < obj.length; i++) {
                res.push(create(res[i], options, cache));
            }
        } else {
            Object.keys(obj).forEach(k => copy(obj, res, k, options, cache));
        }

        // Add the child change events
        Object.keys(res)
            .map(k => undefinedOnError(res, k))
            .filter(k => isConfigObject(res[k]))
            .forEach(k => addChildChangeEvent(res, k, res[k]));

        changeTracker.commit(res);
    }
    return res;

    function undefinedOnError(obj, name) {
        try {
            return obj[name];
        } catch (ex) {
            return undefined;
        }
    }

    function addChildChangeEvent(obj, key, value) {
        if (typeof key === 'string') {
            events[key] = function onChildChange(name, value, old) {
                if (preventCircularEvent[name]) {
                    return;
                }
                name = `${key}.${name}`;
                preventCircularEvent[name] = true;
                obj[EVENTS].emit(CHANGE, name, value, old);
                delete preventCircularEvent[name];
            };
            value[EVENTS].on(CHANGE, events[key]);
        }
    }

    /** Provides events and object set */
    function managed(obj, options) {
        var result, len, isArray, traps, rootEvents,
            expressions = {};

        obj[EVENTS].on(CHANGE, onChange);
        // Get the root object
        rootEvents = obj[CONTEXT].source();
        rootEvents = rootEvents && rootEvents[EVENTS];

        /* istanbul ignore else */
        if (rootEvents) {
            if (obj[CONTEXT].source() === obj) {
                // For root objects this will emit a change event for the ref
                rootEvents.on(REF_CHANGE, onRootRefChange);
            } else {
                // This will only handle the event, not emit any other event
                //  in regards to this property
                rootEvents.on(REF_CHANGE, onSubRefChange);
            }
        }
        isArray = Array.isArray(obj);
        if (isArray) {
            len = obj.length;
        }

        traps = {
            deleteProperty: del,
            defineProperty
        };
        if (isArray) {
            traps.set = arrSet;
        } else {
            traps.set = objSet;
        }
        result = new Proxy(obj, traps);

        // Now we need to process all properties
        return result;

        function onRootRefChange(name, value, old) {
            onRefChange(name, value, old, () => rootEvents.emit(CHANGE, name, value, old));
        }

        function onSubRefChange(name, value, old) {
            onRefChange(name, value, old, () => onChange(name, value, old))
        }

        function onRefChange(name, value, old, handler) {
            var parts = name.split('.');
            // If a property with the root part of the name is found, it will take
            //  preference over an ID reference, so the change is not valid for this
            //  object.
            if (!result.hasOwnProperty(parts[0])) {
                handler();
            }
        }

        function onChange(name, value, old) {
            Object.keys(expressions).forEach(process);

            /** Processes an expression to check if it's change event should be raised. */
            function process(exp) {
                var current;
                if (expression.dependantOn(result, exp, name)) {
                    try {
                        current = result[exp];
                    } catch (ex) {
                        // Note: We purposefully swallow any error,
                        //  don't emit the change event, and don't update
                        //  the old value.
                        return;
                    }
                    // Note: If the new value throws an exception we don't want the change event
                    //  to raise, and we don't want the old value to be updated
                    obj[EVENTS].emit(CHANGE, exp, current, expressions[exp]);
                    expressions[exp] = result[exp];
                }
            }
        }

        function deliverArrayLength() {
            if (len !== obj.length) {
                obj[EVENTS].emit(CHANGE, 'length', obj.length, len);
                len = obj.length;
            }
        }

        function arrSet(obj, name, value) {
            // Handle the special case length extend, and pass along to the standard object set
            if (name === 'length' && value >= obj.length) {
                obj.length = value;
                deliverArrayLength();
                return true;
            }
            return objSet(obj, name, value);
        }

        function objSet(obj, name, value) {
            var old, hasOld, standard, evname, opts;
            // If we have the property already, and are set to read only
            //  we will not allow a change in value.
            hasOld = obj.hasOwnProperty(name);
            if (options.readOnly && hasOld) {
                // Return true without doing anything
                return true;
            }
            if (hasOld) {
                old = obj[name];
            }
            if (!hasOld || old !== value) {
                if (events[name]) {
                    obj[EVENTS].removeListener(CHANGE, events[name]);
                    delete events[name];
                }

                if (hasOld) {
                    deregister(obj, name);
                }

                // Check we have an object or array that is not a Date or RegExp.
                standard = standardObject(value);
                if (standard) {
                    opts = Object.assign({ }, options, { contextManager: obj[CONTEXT] });
                    value = create(value, opts);
                }
                if (obj.hasOwnProperty(name)) {
                    obj[name] = value;
                } else {
                    // Note: We have to do this so we don't update the values on the
                    //  prototype.
                    Object.defineProperty(obj, name, {
                        configurable: !options.protectStructure,
                        writable: !options.readOnly,
                        enumerable: true,
                        value
                    });
                }
                if (standard) {
                    // Pass any events from the child object to this object
                    addChildChangeEvent(obj, name, value);
                }

                register(obj, name);
                raiseChangeEvent(name, value, old);
            }
            return true;
        }

        function del(obj, name) {
            var old;
            if (!obj.hasOwnProperty(name)) {
                return true;
            }
            if (options.readOnly) {
                return false;
            }
            if (events[name]) {
                obj[EVENTS].removeListener(CHANGE, events[name]);
                delete events[name];
            }
            old = obj[name];

            deregister(obj, name);

            delete obj[name];
            delete expressions[name];

            raiseChangeEvent(name, undefined, old);
            return true;
        }

        function defineProperty(obj, name, descriptor) {
            var res, old, hasOld, changed, opts, curr, desc = {
                enumerable: descriptor.enumerable,
                configurable: !options.protectStructure
            };

            if (options.readOnly && result.hasOwnProperty(name)) {
                return false;
            }

            // Ensure we deregister on replacement
            hasOld = obj.hasOwnProperty(name);
            if (hasOld) {
                old = obj[name];
            }

            if (name === contextManager.ID) {
                obj[CONTEXT].deregister(obj);
            } else if (hasOld) {
                obj[CONTEXT].deregister(old);
            }

            if (descriptor.hasOwnProperty('get')) {
                desc.get = descriptor.get;
            }
            if (descriptor.hasOwnProperty('set') && !options.readOnly) {
                desc.set = descriptor.set;
            }
            if (descriptor.hasOwnProperty('value')) {
                desc.writable = !options.readOnly;
                opts = Object.assign({ }, options, { contextManager: obj[CONTEXT] });
                desc.value = create(descriptor.value, opts);
                if (desc.value && typeof desc.value === 'object') {
                    // Pass any events from the child object to this object
                    addChildChangeEvent(obj, name, desc.value);
                    // TODO: Shouldn't this go through the register function?
                    // Register without allowing duplicates
                    obj[CONTEXT].register(desc.value, true);
                }
            }
            res = Reflect.defineProperty(obj, name, desc);

            if (expression.is(obj, name)) {
                // Store the result so we can pass the old
                //  value on change
                try {
                    expressions[name] = obj[name];
                } catch (ex) {
                    // Note: We purposefully swallow any error
                    expressions[name] = undefined;
                }
            } else {
                delete expressions[name];
            }

            register(obj, name);

            try {
                // Protect againsr expression failure
                curr = obj[name];
            } catch (ex) {
                // We swallow the error.
                return true;
            }

            changed = curr !== old;
            if (!hasOld || changed) {
                raiseChangeEvent(name, curr, old);
            }
            return true;
        }

        function raiseChangeEvent(name, value, old) {
            if (typeof name === 'string') {
                obj[EVENTS].emit(CHANGE, name, value, old);
                if (obj[contextManager.ID] && rootEvents) {
                    var evname = obj[contextManager.ID] + '.' + name;
                    rootEvents.emit(REF_CHANGE, evname, value, old);
                }
            }
        }

        function register(obj, name) {
            if (name === contextManager.ID) {
                // Register and throw on duplicate
                obj[CONTEXT].register(obj, true);
            }
        }

        function deregister(obj, name) {
            if (name === contextManager.ID) {
                obj[CONTEXT].deregister(obj);
            } else {
                obj[CONTEXT].deregister(obj[name]);
            }
        }
    }
}

function context(obj) {
    return obj && obj[CONTEXT];
}

function events(obj) {
    return obj && obj[EVENTS];
}

function isConfigObject(obj) {
    return Boolean(obj && obj[CONFIG_OBJECT]);
}

/**
 * Initializes a new configuration object using the supplied object as a base.
 * @param {object} obj The object to initialize with.
 * @param {object} options Options to use when constructing the configuration objects.
 */
function initialize(obj, options) {
    var res, cman, i;
    if (Array.isArray(obj)) {
        res = [];
    } else if (obj instanceof Date) {
        res = obj.getTime();
        return new Date(res);
    } else if (obj instanceof RegExp) {
        res = new RegExp(obj.source, obj.flags);
        return res;
    } else {
        res = {};
    }
    if (options.contextManager) {
        cman = options.contextManager;
    } else {
        cman = contextManager(res, options.context || '', options.environment || {}, options.locals);
    }

    Object.defineProperty(res, CONTEXT, {
        enumerable: false,
        value: cman,
        writable: false,
        configurable: false
    });

    // If the object was supplied with an ID, we copy it across.
    if (obj[contextManager.ID]) {
        Object.defineProperty(res, contextManager.ID, {
            enumerable: false,
            value: obj[contextManager.ID],
            writable: false,
            configurable: false
        });
    }

    Object.defineProperty(res, CONFIG_OBJECT, {
        enumerable: false,
        value: true,
        writable: false,
        configurable: false
    });

    Object.defineProperty(res, EVENTS, {
        enumerable: false,
        value: new EventEmitter(),
        writable: false,
        configurable: false
    });
    // TODO: This should be adjusted to property length + 11 (default)
    //      then in property creation (including set) and deletion
    //      it should be plus 1ned and -1ned accordingly
    res[EVENTS].setMaxListeners(100);

    return res;
}

function copy(src, dest, name, options, cache) {
    var ddesc, sdesc = Object.getOwnPropertyDescriptor(src, name);
    ddesc = {
        enumerable: sdesc.enumerable,
        configurable: !options.protectStructure
    };
    if (sdesc.hasOwnProperty('value')) {
        ddesc.writable = !options.readOnly;
        ddesc.value = create(sdesc.value, options, cache);
    } else {
        ddesc.get = sdesc.get;
        ddesc.set = sdesc.set;
    }
    Object.defineProperty(dest, name, ddesc);
}

function standardObject(value) {
    return value && typeof value === 'object' &&
        value instanceof RegExp === false &&
        value instanceof Date === false &&
        value instanceof Error === false &&
        value instanceof Number === false &&
        value instanceof String === false;
}
