'use strict';

// TODO: Add some documentation to this module.

const COMMIT = Symbol('commit'),
    RESET = Symbol('reset'),
    CHANGES = Symbol('changes');

module.exports = tracker;
module.exports.tracked = tracked;
module.exports.commit = commit;
module.exports.reset = reset;
module.exports.changes = changes;

function tracked(obj) {
    if (obj && obj[CHANGES]) {
        return true;
    } else {
        return false;
    }
}

function commit(obj, cache) {
    if (obj && obj[COMMIT]) {
        cache = cache || new WeakMap();
        if (cache.has(obj)) {
            return cache.get(obj);
        }
        cache.set(obj, true);
        obj[COMMIT](cache);
        return true;
    } else {
        return false;
    }
}

function reset(obj, cache) {
    if (obj && obj[RESET]) {
        cache = cache || new WeakMap();
        if (cache.has(obj)) {
            return cache.get(obj);
        }
        cache.set(obj, true);
        obj[RESET](cache);
        return true;
    } else {
        return false;
    }
}

function changes(obj) {
    if (obj && obj[CHANGES]) {
        return obj[CHANGES]();
    } else {
        return {
            inserts: {},
            updates: {},
            deletes: {}
        };
    }
}

function tracker(obj, options) {
    var inserts, updates, deletes, result;

    inserts = {};
    updates = {};
    deletes = {};
    options = options || {};

    // TODO: Reset will need a way to clear expression overrides!?
    // What about readonly sets? this will be invoked from config object...
    //  readonly will have been passed in options... readonly is not
    //  compatible with tracker... maybe actually don't even initialize if readonly...

    obj[RESET] = reset;
    obj[COMMIT] = commit;
    obj[CHANGES] = changes;

    result = new Proxy(obj, {
        set,
        deleteProperty,
        defineProperty
    });
    return result;

    function changes() {
        // TODO: Should be recursive!
        return {
            inserts: buildInserts(),
            updates: buildUpdates(),
            deletes: buildDeletes()
        };

        function buildInserts() {
            var res = {};
            Object.keys(inserts).forEach(k => res[k] = result[k]);
            return res;
        }

        function buildUpdates() {
            var res = {};
            Object.keys(updates).forEach(k => res[k] = {
                value: result[k],
                old: descriptorValue(updates[k])
            });
            return res;
        }

        function buildDeletes() {
            const res = {};
            Object.keys(deletes).forEach(d => res[d] = descriptorValue(deletes[d]));
            return res;
        }

        function descriptorValue(desc) {
            if (desc.hasOwnProperty('value')) {
                return desc.value;
            } else {
                return desc.get.call(obj);
            }
        }
    }

    function reset(cache) {
        Object.keys(inserts).forEach(k => delete obj[k]);
        Object.keys(deletes).forEach(k => Object.defineProperty(obj, k, deletes[k]));
        Object.keys(updates).forEach(revertUpdate);
        Object.keys(obj).forEach(processKey);
        commit();

        function revertUpdate(name) {
            if (typeof options.customRevert === 'function') {
                // TODO: Need to make sure expression reversions raise change events...
                if (options.customRevert(result, name)) {
                    return;
                }
            }
            Object.defineProperty(obj, name, updates[name]);
        }

        function processKey(k) {
            try {
                module.exports.reset(obj[k], cache);
            } catch (ex) {
                // Do nothing
            }
        }
    }

    function commit(cache) {
        inserts = {};
        updates = {};
        deletes = {};
        Object.keys(obj).forEach(processKey);

        function processKey(k) {
            try {
                module.exports.commit(obj[k], cache);
            } catch (ex) {
                // Do nothing
            }
        }
    }

    function set(obj, name, value) {
        if (obj.hasOwnProperty(name)) {
            trackOriginal(updates, obj, name);
        } else {
            inserts[name] = true;
        }
        obj[name] = value;
        return true;
    }

    function deleteProperty(obj, name) {
        if (obj.hasOwnProperty(name)) {
            trackOriginal(deletes, obj, name);
        }
        delete obj[name];
        return true;
    }

    function defineProperty(obj, name, descriptor) {
        if (obj.hasOwnProperty(name)) {
            trackOriginal(updates, obj, name);
        } else {
            inserts[name] = true;
        }
        return Reflect.defineProperty(obj, name, descriptor);
    }

    function trackOriginal(set, obj, name) {
        if (!set.hasOwnProperty(name)) {
            set[name] = Object.getOwnPropertyDescriptor(obj, name);
        }
    }
}
