'use strict';

module.exports = Object.assign(createMock, {
    levels: require('./levels.js'),
    loader: require('./loader.js'),
    parser: require('./parser.js')
});

function createMock() {

    const configObject = require('../src/config-object.js');

    resourceLoader.result = Promise.resolve({ });
    resourceLoader.on = on;
    resourceLoader.addListener = addListener;
    resourceLoader.removeListener = removeListener;
    resourceLoader.emit = emit;

    return resourceLoader;

    /** A simple resourceLoader mock */
    function resourceLoader(location, options) {
        var res = resourceLoader.result;

        if (res instanceof Error) {
            throw res;
        }
        if (typeof res === 'function') {
            res = res.apply(this, arguments);
        }
        if (res instanceof Promise) {
            res = res.then(res => configObject(res));
        } else {
            res = configObject(res);
            res = Promise.resolve(res);
        }
        return res;
    }

    function emit(obj, name) {
        if (configObject.is(obj)) {
            const args = Array.prototype.slice.call(2);
            let events = configObject.events(obj);
            args.unshift(name);
            events.emit.apply(null, args);
            return true;
        } else {
            return false;
        }
    }

    /** Adds an event listener to the supplied config object */
    function addListener(obj, name, handler) {
        if (configObject.is(obj)) {
            let events = configObject.events(obj);
            events.on(name, handler);
            return true;
        } else {
            return false;
        }
    }

    /** Removes a handler from the change event */
    function removeListener(obj, name, handler) {
        if (configObject.is(obj)) {
            let events = configObject.events(obj);
            events.removeListener(name, handler);
            return true;
        } else {
            return false;
        }
    }

}
