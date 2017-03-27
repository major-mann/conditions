/**
 * @module Context manager module. This manages locals and environment variables.
 */
'use strict';

// Constants
const ID = Symbol('id');

// Expose the public API
module.exports = createContextManager;
module.exports.ID = ID;

/**
 * Creates a new context manager which can be used to manage locals and evironment variables,
 *   and also to monitor for changes to those values.
 * @param {object} source The config root
 * @param {string} name The name of the context
 * @param {object} env Any envrironment variables.
 * @param {object} locals The locals to create the context manager with.
 */
function createContextManager(source, name, env, locals) {
    if (!env || typeof env !== 'object') {
        env = {};
    }
    if (!locals || typeof locals !== 'object') {
        locals = {};
    }
    var res = {};
    res.source = () => source;
    res.name = () => name;
    res.environment = () => env;
    res.locals = () => Object.assign({}, locals);

    res.hasValue = hasValue;
    res.value = value;
    res.localValue = localValue;

    res.register = register;
    res.deregister = deregister;
    res.update = update;

    return res;

    function hasValue(name) {
        return env.hasOwnProperty(name) || locals.hasOwnProperty(name) || name === 'source' || false;
    }

    function value(name) {
        if (locals.hasOwnProperty(name)) {
            return locals[name];
        } else if (env.hasOwnProperty(name)) {
            return env[name];
        } else if (name === 'source') {
            return source;
        } else {
            return undefined;
        }
    }

    function localValue(name) {
        if (locals.hasOwnProperty(name)) {
            return locals[name];
        }
    }

    /** Performs object registration */
    function register(obj, noDuplicate) {
        registerObj(obj, new WeakMap());
        function registerObj(obj, cache) {
            if (!obj || typeof obj !== 'object') {
                return;
            }
            if (cache.has(obj)) {
                return;
            }
            cache.set(obj, true);
            var id = obj[ID];
            if (id) {
                if (noDuplicate && locals.hasOwnProperty(id) && locals[id] !== obj) {
                    throw new Error(`ID "${id}" has already been registered!`);
                }
                locals[id] = obj;
            }
            Object.keys(obj).forEach(k => registerObj(obj[k], cache));
        }
    }

    function deregister(obj) {
        // locals[id] should always be undefined or an object (not any other type)
        //  this means that we can rely on the id being deleted from locals
        //  below where it gets the id property from the
        deregisterObj(obj, new WeakMap());

        /** Deregisters all sub instances */
        function deregisterObj(obj, cache) {
            if (!obj || typeof obj !== 'object') {
                return;
            }
            if (cache.has(obj)) {
                return;
            }
            cache.set(obj, true);
            Object.keys(obj).forEach(k => deregisterObj(obj[k], cache));
            if (obj[ID]) {
                delete locals[obj[ID]];
            }
        }
    }

    function update(orig, updated) {
        var prop;
        // This will update the root if necessary.
        if (source === orig) {
            source = updated;
        }

        // Update any references from the environment
        for (prop in env) {
            if (env.hasOwnProperty(prop) && env[prop] === orig) {
                env[prop] = updated;
            }
        }
        for (prop in locals) {
            if (locals.hasOwnProperty(prop) && locals[prop] === orig) {
                locals[prop] = updated;
            }
        }
    }
}
