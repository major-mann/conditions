/** @module Levels mock. A mock for dealing with the loader */
'use strict';

module.exports = function createMock() {
    const configObject = require('../src/config-object.js');

    levels.result = Promise.resolve({ });
    return levels;

    /** A simple levels mock */
    function levels(config, lvls, options) {
        var res;
        if (typeof config !== 'object') {
            throw new Error(`config MUST be an object. Got "${typeof config}"`);
        }
        res = levels.result;
        if (typeof res === 'function') {
            res = res(str, loader, options);
        }
        if (res instanceof Error) {
            throw res;
        }
        if (res instanceof Promise) {
            res = res.then(res => configObject(res));
        } else {
            res = configObject(res);
            res = Promise.resolve(res);
        }
        return res;
    }
}
