/** @module Loader mock. A mock for dealing with the loader */
'use strict';

module.exports = function createMock() {
    const configObject = require('../src/config-object.js');

    loader.result = Promise.resolve({ });
    loader.explicitResult = {};
    loader.loaders = [ ];

    return loader;

    /** A simple loader mock */
    function loader(str, ldr, options) {
        var res;
        if (typeof str !== 'string') {
            throw new Error(`str MUST be a string. Got ${str && typeof str}`);
        }
        if (typeof ldr !== 'function') {
            throw new Error(`loader MUST be a function. Got ${ldr && typeof ldr}`);
        }
        if (Array.isArray(loader.loaders)) {
            loader.loaders.forEach(l => ldr(l));
        }
        if (loader.explicitResult && loader.explicitResult.hasOwnProperty(str)) {
            res = loader.explicitResult[str];
        } else {
            res = loader.result;
        }
        if (res instanceof Error) {
            throw loader.result;
        }
        if (typeof res === 'function') {
            res = res(str, ldr, options);
        }
        if (res instanceof Promise) {
            res = res.then(res => configObject(res));
        } else {
            res = configObject(res);
            res = Promise.resolve(res);
        }
        return res;
    }

};
