'use strict';

/** Creates a double weakmap cache */
module.exports = function createDoubleCache() {

    var cache = new WeakMap();

    return {
        has,
        get,
        set,
        delete: del
    };

    function has(v1, v2) {
        if (cache.has(v1)) {
            return cache.get(v1).has(v2);
        }
        return false;
    }

    function get(v1, v2) {
        if (cache.has(v1)) {
            return cache.get(v1).get(v2);
        }
    }

    function set(v1, v2, value) {
        if (!cache.has(v1)) {
            cache.set(v1, new WeakMap());
        }
        cache.get(v1).set(v2, value);
    }

    function del(v1, v2) {
        if (cache.has(v1)) {
            cache.get(v1).delete(v2);
        }
    }
};
