'use strict';

// Constants
const CONFIG_OBJECT = Symbol('config-object'),
    DEPENDENCIES = Symbol('dependencies'),
    CONTEXT = Symbol('context'),
    EVENTS = Symbol('events'),
    CHANGE = 'change',
    OPTIONS = {
        readOnly: false,
        protectStructure: false
    };

// Expose the public API
module.exports = create;
module.exports.is = isConfigObject;
module.exports.context = context;
module.exports.events = events;
module.exports.CHANGE = CHANGE;
module.exports.DEPENDENCIES = DEPENDENCIES;

// Dependencies
const EventEmitter = require('events'),
    contextManager = require('./context-manager.js');

function create(obj, options) {
    if (!isConfigObject(obj) && obj && typeof obj === 'object') {
        options = Object.assign({}, OPTIONS, options);
        obj = initialize(obj, options);
        obj = managed(obj, options);
    }
    return obj;
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

/** Provides events and object set */
function managed(obj, options) {
    var result, possibleLengthChange, len, events = {}, isArray, traps;

    // TODO: Something with dependencies...
    isArray = Array.isArray(obj);
    if (isArray) {
        len = obj.length;
        possibleLengthChange = deliverArrayLength;
    } else {
        possibleLengthChange = () => {};
    }

    // Add the child change events
    Object.keys(obj)
        .filter(k => configObject(obj[k]))
        .forEach(k => addChildChangeEvent(obj, k, obj[k]));

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
    return result;

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
            return true;
        }
        return objSet(obj, name, value);
    }

    function objSet(obj, name, value) {
        var old = obj.hasOwnProperty(name) ?
            obj[name] :
            undefined;
        // If we have the property already, and are set to read only
        //  we will not allow a change in value.
        if (options.readOnly && obj.hasOwnProperty(name)) {
            // Return true without doing anything
            return true;
        }
        if (old !== value) {
            if (events[name]) {
                obj[EVENTS].removeListener(CHANGE, events[name]);
                delete events[name];
            }

            // Ensure de-registration on replacement
            if (name === contextManager.ID) {
                obj[CONTEXT].deregister(obj);
            } else {
                obj[CONTEXT].deregister(old);
            }

            // Check we have an object or array that is not a Date or RegExp.
            if (standardObject(value)) {
                value = create(value, options);
                // Pass any events from the child object to this object
                addChildChangeEvent(obj, name, value);
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

            // If we are setting the ID, register the property
            if (name === contextManager.ID) {
                obj[CONTEXT].register(obj, true);
            }
            obj[EVENTS].emit(CHANGE, name, value, old);

            // If we have an ID, try to emit a change event for that ID on the
            //  context manager root object.
            if (obj[contextManager.ID]) {
                let root = obj[CONTEXT].source();
                root = root && root[EVENTS];
                if (root) {
                    root.emit(CHANGE, result[contextManager.ID] + '.' + name, value, old);
                }
            }
        }
        return true;
    }

    function del(obj, name) {
        var old, hasOld;
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
        hasOld = obj.hasOwnProperty(name);

        // Ensure de-registration
        if (name === contextManager.ID) {
            obj[CONTEXT].deregister(obj);
        } else {
            obj[CONTEXT].deregister(old);
        }

        delete obj[name];

        if (hasOld) {
            obj[EVENTS].emit(CHANGE, name, undefined, old);
            if (obj[contextManager.ID]) {
                obj[EVENTS].emit(CHANGE,
                    obj[contextManager.ID] + '.' + name,
                    undefined, // New value is undefined
                    old);
            }
        }

        return true;
    }

    function defineProperty(obj, name, descriptor) {
        var res, old, hasOld, desc = {
            enumerable: descriptor.enumerable,
            configurable: !options.protectStructure
        };

        if (options.readOnly && result.hasOwnProperty(name)) {
            return false;
        }

        // Ensure we deregister on replacement
        old = obj[name];
        hasOld = obj.hasOwnProperty(name);
        if (name === contextManager.ID) {
            obj[CONTEXT].deregister(obj);
        } else {
            obj[CONTEXT].deregister(obj[name]);
        }
        if (descriptor.hasOwnProperty('get')) {
            desc.get = descriptor.get;
        }
        if (descriptor.hasOwnProperty('set') && !options.readOnly) {
            desc.set = descriptor.set;
        }
        if (descriptor.hasOwnProperty('value')) {
            desc.writable = !options.readOnly;
            desc.value = create(descriptor.value, options);
            if (desc.value && typeof desc.value === 'object') {
                // Pass any events from the child object to this object
                addChildChangeEvent(obj, name, desc.value);
                // Register without allowing duplicates
                obj[CONTEXT].register(desc.value, true);
            }
        }
        res = Reflect.defineProperty(obj, name, desc);
        if (name === contextManager.ID) {
            obj[CONTEXT].register(obj);
        }
        if (hasOld && obj[name] !== old) {
            obj[EVENTS].emit(CHANGE, name, obj[name], old);
            if (obj[contextManager.ID]) {
                obj[EVENTS].emit(CHANGE,
                    result[contextManager.ID] + '.' + name,
                    obj[name],
                    old
                );
            }
        }
        return true;
    }

    function addChildChangeEvent(obj, key, value) {
        events[key] = function onChildChange(name, value, old) {
            obj[EVENTS].emit(`${key}.${name}`, value, old);
        };
        value = value || obj[key];
        obj[EVENTS].on(CHANGE, events[key]);
    }
}

function initialize(obj, options) {
    var res, cman;
    if (configObject(obj)) {
        return obj;
    } else if (Array.isArray(obj)) {
        res = obj.map(element => initialize(element, options));
    } else if (obj instanceof Date) {
        return new Date(obj.getTime());
    } else if (obj instanceof RegExp) {
        return new RegExp(obj.toString(), obj.flags);
    } else if (obj && typeof obj === 'object') {
        res = {};
        // TODO: Need to search through object for ids to add / update?
        Object.keys(obj).forEach(k => copy(obj, res, k, options));
    } else {
        return obj;
    }
    options = options || {};
    if (options.contextManager) {
        cman = options.contextManager;
    } else {
        cman = contextManager(res, options.context || {}, options.environment || {});
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

    // Register, and throw on duplicate
    cman.register(res, true);

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

    return res;
}

function configObject(obj) {
    if (obj && obj[CONFIG_OBJECT]) {
        return obj;
    }
}

function copy(src, dest, name, options) {
    var ddesc, sdesc = Object.getOwnPropertyDescriptor(src, name);
    ddesc = { configurable: !options.protectStructure };
    if (sdesc.hasOwnProperty('value')) {
        ddesc.writable = !options.readOnly;
        ddesc.value = sdesc.value;
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
