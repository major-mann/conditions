/**
 * @module Context manager module. This manages locals and environment variables.
 */
(function contextManager(module) {
    'use strict';
    module.exports = createContextManager;

    var parser;

    /**
     * Creates a new context manager which can be used to manage locals and evironment variables.
     * @param {string} name The name of the context
     * @param {object} env Any envrironment variables.
     * @param {object} locals The locals to create the context manager with.
     */
    function createContextManager(source, name, env, locals) {
        // Do this here to avoid circular ref issues.
        if (!parser) {
            parser = require('./parser.js');
        }

        if (!env || typeof env !== 'object') {
            env = {};
        }

        if (!locals || typeof locals !== 'object') {
            locals = {};
        }

        return {
            root: true,
            environment: () => env,
            name: () => name,
            hasValue,
            register,
            locals: () => locals,
            source: () => source,
            value,
            update,
            sub
        };

        function hasValue(name) {
            return env.hasOwnProperty(name) || locals.hasOwnProperty(name) || name === 'source';
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

        function register(id, obj) {
            locals[id] = obj;
        }

        function update(orig, updated) {
            if (source === orig) {
                source = updated;
            }
            for (let prop in env) {
                if (env.hasOwnProperty(prop)) {
                    if (env[prop] === orig) {
                        env[prop] = updated;
                    }
                }
            }
        }

        /** Creates a manager for a sub object which interacts with this manager */
        function sub(nm, environment, locs) {
            if (environment && typeof environment === 'object') {
                Object.assign(env, environment);
            }
            if (locs && typeof locs === 'object') {
                Object.assign(locals, locs);
            }
            return {
                root: false,
                environment: () => env,
                name: () => nm || name,
                hasValue,
                register,
                locals: () => locals,
                source: () => source,
                value,
                update,
                sub: (n, e, l) => sub(nm || name, e, l)
            };
        }
    }

}(module));
