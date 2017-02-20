/** These tests perform some basic sanity checks on the builds */
describe('build tests', function () {
    'use strict';
    describe('commonjs', function () {
        afterEach(function () {
            delete global.window;
        });
        it('should exist', function () {
            expect(require('fs').existsSync('./dist/conditions.js')).to.equal(true);
        });
        it('should return the lib object with the parse, loader and extend functions in the exports', function () {
            var lib, test;

            // We do this since the library exposes itself onto window
            global.window = {};
            global.XMLHttpRequest = function () { return { open: () => {} }; };
            global.location = {};

            require('../dist/conditions.js');
            lib = global.window.conditions;

            expect(lib).to.be.a('function');

            expect(lib.parse).to.be.a('function');
            expect(lib.loader).to.be.a('function');
            expect(lib.extend).to.be.a('function');

            // Just do a simple parse to ensure sanity
            test = lib.parse('{ foo: "bar", exp: foo + "baz" }');

            expect(test).to.be.an('object');
            expect(test.foo).to.equal('bar');
            expect(test.exp).to.equal('barbaz');
        });
    });

});
