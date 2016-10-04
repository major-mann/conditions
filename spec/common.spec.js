describe('common', function () {

    var common;

    beforeEach(function () {
        delete require.cache[require.resolve('../src/common.js')];
        common = require('../src/common.js');
    });

    describe('typeOf', function () {
        it('should be a function', function () {
            expect(common.typeOf).toEqual(jasmine.any(Function));
        });
        it('should return "string" when the value is a string', function () {
            expect(common.typeOf('foo')).toBe('string');
        });
        it('should return "number" when the value is a number', function () {
            expect(common.typeOf(123)).toBe('number');
        });
        it('should return "function" when the value is a function', function () {
            expect(common.typeOf(function () {})).toBe('function');
        });
        it('should return "boolean" when the value is a boolean', function () {
            expect(common.typeOf(true)).toBe('boolean');
        });
        it('should return "date" when the value is a Date', function () {
            expect(common.typeOf(new Date())).toBe('date');
        });
        it('should return "regexp" when the value is a regular expression', function () {
            expect(common.typeOf(/foo/)).toBe('regexp');
        });
        it('should return "array" when the value is an array', function () {
            expect(common.typeOf([])).toBe('array');
        });
        it('should return "undefined" when the value is undefined', function () {
            expect(common.typeOf(undefined)).toBe('undefined');
        });
        it('should return "null" when the value is null', function () {
            expect(common.typeOf(null)).toBe('null');
        });
        it('should return "object" when the value is an object', function () {
            expect(common.typeOf({})).toBe('object');
        });
    });

    describe('clone', function () {

        it ('should clone regular expressions', function () {
            var rex = /foo/igm,
                clone = common.clone(rex);

            expect(rex).not.toBe(clone);
            expect(rex.source).toBe(clone.source);
            expect(rex.global).toBe(clone.global);
            expect(rex.multiline).toBe(clone.multiline);
            expect(rex.ignoreCase).toBe(clone.ignoreCase);

            rex = /foo/;
            clone = common.clone(rex);
            expect(rex).not.toBe(clone);
            expect(rex.source).toBe(clone.source);
            expect(rex.global).toBe(clone.global);
            expect(rex.multiline).toBe(clone.multiline);
            expect(rex.ignoreCase).toBe(clone.ignoreCase);
        });

        it('should return the same value when a value type is passed', function () {
            var obj, sub, clone;
            expect(common.clone('foo')).toBe('foo');
            expect(common.clone(true)).toBe(true);
            expect(common.clone(1234)).toBe(1234);
            expect(common.clone(null)).toBe(null);
            expect(common.clone(undefined)).toBe(undefined);
        });

        it ('should handle an object without a prototype', function () {
            expect(function () { common.clone(Object.create(null)); }).not.toThrow();
        });

        it('should deep clone objects', function () {
            obj = [1,2,3,4];
            clone = common.clone(obj);
            expect(clone).not.toBe(obj);
            expect(clone).toEqual(jasmine.any(Object));
            expect(clone[0]).toBe(obj[0]);
            expect(clone[1]).toBe(obj[1]);
            expect(clone[2]).toBe(obj[2]);
            expect(clone[3]).toBe(obj[3]);

            sub = {
                hello: 'world'
            };
            obj = {
                foo: 'bar',
                sub: sub
            };
            Object.defineProperty(sub, 'accessor', {
                configurable: true,
                enumerable: true,
                get: function () {
                    return 10;
                }
            });
            clone = common.clone(obj);
            expect(clone).not.toBe(obj);
            expect(clone).toEqual(jasmine.any(Object));
            expect(clone.sub).not.toBe(sub);
            expect(clone.sub).toEqual(jasmine.any(Object));
            expect(clone.foo).toBe('bar');
            expect(clone.sub.hello).toBe('world');
        });
    });

    describe('isObject', function () {
        it('should return false if null is supplied', function () {
            expect(common.isObject(null)).toBe(false);
        });
        it('should return true if a non null object is supplied', function () {
            expect(common.isObject({})).toBe(true);
            expect(common.isObject([])).toBe(true);
        });
        it('should return false if a non object is supplied', function () {
            expect(common.isObject(true)).toBe(false);
            expect(common.isObject(1234)).toBe(false);
            expect(common.isObject('foo bar')).toBe(false);
        });
    });

    describe('startsWith', function () {
        it('should return true if the supplied string starts with the supplied value', function () {
            expect(common.startsWith('foobar', 'foo')).toBe(true);
        });
        it('should return false if the supplied string does not start with the supplied value', function () {
            expect(common.startsWith('barbaz', 'foo')).toBe(false);
        });
        it('should return false if the any of the supplied values is not a string', function () {
            expect(common.startsWith('foobar', {})).toBe(false);
            expect(common.startsWith(1234, 'foo')).toBe(false);
        });
    });

});
