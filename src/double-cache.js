'use strict';

/** Creates a double weakmap cache */
module.exports = function createDoubleCache() {
    const objectLookup = new WeakMap(),
        symbolLookup = {},
        valueLookup = {};

    return {
        has,
        get,
        set,
        delete: del
    };

    /** Checks whether a valud pair exists in the cache */
    function has(v1, v2) {
        v1 = cacheRef(v1);
        v2 = cacheRef(v2);
        return valueLookup[v1] && valueLookup[v1].hasOwnProperty(v2);
    }

    /** Gets the value associated with the value pair. */
    function get(v1, v2) {
        v1 = cacheRef(v1);
        v2 = cacheRef(v2);
        return valueLookup[v1] && valueLookup[v1][v2];
    }

    /** Sets the value associated with the value pair */
    function set(v1, v2, value) {
        v1 = cacheRef(v1);
        v2 = cacheRef(v2);

        // Cleanup any old object references
        del(v1, v2);

        if (!valueLookup[v1]) {
            valueLookup[v1] = {};
        }
        if (!valueLookup[v2]) {
            valueLookup[v2] = {};
        }

        valueLookup[v1][v2] = value;
        valueLookup[v2][v1] = value;
    }

    /** Removes a value pair from the cache */
    function del(v1, v2) {
        v1 = cacheRef(v1);
        v2 = cacheRef(v2);
        if (valueLookup[v1]) {
            delete valueLookup[v1][v2];
        }
        if (valueLookup[v2]) {
            delete valueLookup[v2][v1];
        }
        if (valueLookup[v1] && Reflect.ownKeys(valueLookup[v1]).length === 0) {
            if (symbolLookup[v1]) {
                objectLookup.delete(symbolLookup[v1]);
                delete symbolLookup[v1];
            }
            delete valueLookup[v1];
        }
        if (valueLookup[v2] && Reflect.ownKeys(valueLookup[v2]).length === 0) {
            if (symbolLookup[v2]) {
                objectLookup.delete(symbolLookup[v2]);
                delete symbolLookup[v2];
            }
            delete valueLookup[v2];
        }
    }

    /** Creates a value type for the supplied value */
    function cacheRef(value) {
        if (value && typeof value === 'object' || typeof value === 'function') {
            if (objectLookup.has(value)) {
                return objectLookup.get(value);
            } else {
                const sym = Symbol('object-lookup');
                objectLookup.set(value, sym);
                symbolLookup[sym] = value;
                return sym;
            }
        } else {
            return value;
        }
    }
};
