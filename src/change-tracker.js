'use strict';

const COMMIT = Symbol('commit'),
    RESET = Symbol('reset');

module.exports = tracker;
module.exports.commit = obj => obj[COMMIT] && obj[COMMIT]();
module.exports.reset = obj => obj[RESET] && obj[RESET]();

function tracker(obj) {
    var inserts = {}, updates = {}, deletes = {};

    // TODO: Reset will need a way to clear expression overrides!?
    // What about readonly sets? this will be invoked from config object...
    //  readonly will have been passed in options... readonly is not
    //  compatible with tracker... maybe actually don't even initialize if readonly...

    obj[RESET] = reset;
    obj[COMMIT] = commit;

    return new Proxy(obj, {
        set,
        deleteProperty,
        defineProperty
    });

    function reset() {
        Object.keys(inserts).forEach(k => delete obj[k]);
        Object.keys(deletes).forEach(k => Object.defineProperty(obj, k, deletes[k]));
        Object.keys(updates).forEach(revertUpdate);
        commit();

        function revertUpdate(name) {
            if (updates[name].hasOwnProperty('value')) {
                obj[name] = updates[name].value;
            } else {
                // TODO: Need a way to clear expression overrides?
                // TODO: This is messed up... we have parser which relies on config object which relies on this...
                //  and we want to add somethins that is from parser... time to separate expression and context?
            }
        }
    }

    function commit() {
        inserts = {};
        updates = {};
        deletes = {};
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
