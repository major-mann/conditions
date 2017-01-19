/** These tests perform some basic sanity checks on the builds */
describe('build tests', function () {
    'use strict';
    var fs = require('fs');

    describe('commonjs', function () {
        afterEach(function () {
            delete global.window;
        });
        it('should exist', function () {
            expect(fs.existsSync('./dist/conditions.js')).toBe(true);
        });
        it('should return the lib object with the parse, loader and extend functions in the exports', function () {
            var lib, test;

            // We do this since the library exposes itself onto window
            global.window = {};
            global.XMLHttpRequest = function () { return { open: () => {} }; };
            global.location = {};

            require('../dist/conditions.js');
            lib = global.window.conditions;

            expect(lib).toEqual(jasmine.any(Function));

            expect(lib.parse).toEqual(jasmine.any(Function));
            expect(lib.loader).toEqual(jasmine.any(Function));
            expect(lib.extend).toEqual(jasmine.any(Function));

            // Just do a simple parse to ensure sanity
            test = lib.parse('{ foo: "bar", exp: foo + "baz" }');

            expect(test).toEqual(jasmine.any(Object));
            expect(test.foo).toBe('bar');
            expect(test.exp).toBe('barbaz');
        });
    });

});
