/**
 * @module Common module. Holds commonly used code.
 * @param {object} exports The object to expose the public API on.
 */
(function commonModule(exports) {
    'use strict';

    // TODO: Extend function

    exports.typeOf = typeOf;
    exports.clone = clone;
    exports.isObject = isObject;
    exports.startsWith = startsWith;

    /** A slightly more advanced typeof */
    function typeOf(val) {
        var vt = typeof val;
        if (vt === 'object') {
            if (Array.isArray(val)) {
                return 'array';
            } else if (val instanceof Date) {
                return 'date';
            } else if (val instanceof RegExp) {
                return 'regexp';
            } else if (val === null) {
                return 'null';
            } else {
                return 'object';
            }
        } else {
            return vt;
        }
    }

    /**
     * Deep clones the supplied value and it's prototype copying property definitions.
     *  This works well for the this case as the only accessors are defined as readonly
     *  from the parser, and the functions should work on which ever object is supplied.
     */
    function clone(val, history, results) {
        var vt = typeOf(val),
            resProto,
            proto,
            res,
            idx,
            i;
        if (!Array.isArray(history)) {
            history = [];
            results = [];
        }
        idx = history.indexOf(val);
        if (idx > -1) {
            return results[idx];
        }
        switch (vt) {
            case 'object':
                proto = Object.getPrototypeOf(val);
                resProto = proto ? {} : null;
                res = Object.create(resProto);
                history.push(val);
                results.push(res);
                Object.keys(val).forEach(copyProp.bind(null, val, res));
                if (proto && proto !== Object.prototype) {
                    Object.keys(proto).forEach(copyProp.bind(null, proto, resProto));
                }
                return res;
            case 'array':
                res = val.slice();
                history.push(val);
                results.push(res);
                for (i = 0; i < res.length; i++) {
                    res[i] = clone(res[i]);
                }
                return res;
            case 'regexp':
                res = cloneRegExp(val);
                history.push(val);
                results.push(res);
                return res;
            default:
                return val;
        }

        /**
         * Copies a property from source to destination using property definitions
         *  and cloning the value when it is available
         */
        function copyProp(src, dest, name) {
            var def = Object.getOwnPropertyDescriptor(src, name);
            if (def.hasOwnProperty('value')) {
                def.value = clone(def.value, history, results);
            }
            def.configurable = true;
            Object.defineProperty(dest, name, def);
        }

        /** Clones the supplied regular expression */
        function cloneRegExp(rexp) {
            var flags = [];
            if (rexp.global) {
                flags.push('g');
            }
            if (rexp.ignoreCase) {
                flags.push('i');
            }
            if (rexp.multiline) {
                flags.push('m');
            }
            return new RegExp(rexp.source, flags.join(''));
        }
    }

    /** Simple non-null object check */
    function isObject(val) {
        return !!val && typeof val === 'object';
    }

    /** Returns true if the supplied string starts with the specified value. */
    function startsWith(str, value) {
        if (typeof str === 'string' && typeof value === 'string') {
            return str.substr(0, value.length) === value;
        } else {
            return false;
        }
    }

}(module.exports));
