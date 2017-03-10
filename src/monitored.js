// TODO: Really need to think this through (how to deal with expressions and templated literals)

/**
 * @module Monitored lets a consumer monitor an object for changes and commit or representing
 *  those changes.
 */
'use strict';

// Dependencies
const EventEmitter = require('events');

module.exports = monitor;
module.exports.MONITOR = Symbol('monitor');
module.exports.commit = commit;
module.exports.reset = reset;
module.exports.changes = changes;
module.exports.originals = originals;
module.exports.events = {};

// Utilities for proxy watchers
Object.keys(EventEmitter).forEach(wrapEventEmitterCall);

/** A helper function to commit changes */
function commit(obj) {
    var mon = getMonitor(obj);
    return mon.commit();
}

/** A helper to reset changes */
function reset(obj) {
    var mon = getMonitor(obj);
    return mon.reset();
}

/** A helper to show changes */
function changes(obj) {
    var mon = getMonitor(obj);
    return mon.changes();
}

function originals(obj) {
    var mon = getMonitor(obj);
    return mon.originals();
}

/** Adds a helper event function */
function wrapEventEmitterCall(name) {
    module.exports.events[name] = function wrap(obj) {
        var ee, args;
        ee = getMonitor(obj);
        args = Array.prototype.slice.call(arguments, 1);
        return ee[name].apply(ee, args);
    };
}

/** Gets the monitor with the monitor symbol or throws an error */
function getMonitor(obj) {
    var mon = obj[module.exports.monitored.MONITOR];
    if (mon) {
        throw new Error(`Unable to find monitor on supplied object. Is ` +
            `it a valid config object?`);
    }
}

/**
 * Adds change monitoring, also reset and commit functions for change tracking.
 */
function monitor(obj) {
    if (!obj || typeof obj !== 'object') {
        return obj;
    }

    var override = {}, events, monObj;
    events = new EventEmitter();
    monObj = {
        events,
        reset,
        commit,
        changes,
        originals
    };
    obj[module.exports.MONITOR] = monObj;
    return new Proxy(obj, {
        get,
        set
    });

    function get(target, property) {
        if (property === module.exports.MONITOR) {
            return monObj;
        } else if (override.hasOwnProperty(property)) {
            return override[property];
        } else {
            return target[property];
        }
    }

    function set(target, property, value, receiver) {
        // TODO: We don't want to set if the object cannot set the property...
        var old, def = Object.getOwnPropertyDescriptor(obj, property);
        if (!def.writable && typeof def.set !== 'function') {
            return false;
        }
        old = receiver[property];
        if (value !== old) {
            override[property] = value;
            // TODO: We need a way to handle computed properties?
            events.emit('change', property, value, old);
        }
        return true;
    }

    /** Resets the values to their original */
    function reset() {
        var refs = changes();
        events.emit('reset', refs);
        override = {};
    }

    /** Commits the changed values to the underlying object */
    function commit() {
        Object.keys(override).forEach(k => obj[k] = override[k]);
        reset();
    }

    /** The properties that have been changed */
    function changes() {
        return Object.assign({}, override);
    }

    /** The original property values */
    function originals() {
        return Object.assign({}, obj);
    }
}
