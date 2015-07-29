/** These tests perform some basic sanity checks on the builds */
describe('build tests', function () {

    var fs = require('fs');

    describe('commonjs', function () {
        it('should exist', function () {
            expect(fs.existsSync('./dist/conditions.js')).toBe(true);
        });
        it('should return the parser function in the exports', function () {
            var parse = require('../dist/conditions.js'),
                test = parse('{ foo: "bar", exp: foo + "baz" }');

            expect(test).toEqual(jasmine.any(Object));
            expect(test.foo).toBe('bar');
            expect(test.exp).toBe('barbaz');
        });
    });

});