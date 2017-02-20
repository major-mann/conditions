describe('common', function () {
    'use strict';
    var common;

    beforeEach(function () {
        delete require.cache[require.resolve('../src/common.js')];
        common = require('../src/common.js');
    });

    describe('typeOf', function () {
        it('should be a function', function () {
            expect(common.typeOf).to.be.a('function');
        });
        it('should return "string" when the value is a string', function () {
            expect(common.typeOf('foo')).to.equal('string');
        });
        it('should return "number" when the value is a number', function () {
            expect(common.typeOf(123)).to.equal('number');
        });
        it('should return "function" when the value is a function', function () {
            expect(common.typeOf(function () {})).to.equal('function');
        });
        it('should return "boolean" when the value is a boolean', function () {
            expect(common.typeOf(true)).to.equal('boolean');
        });
        it('should return "date" when the value is a Date', function () {
            expect(common.typeOf(new Date())).to.equal('date');
        });
        it('should return "regexp" when the value is a regular expression', function () {
            expect(common.typeOf(/foo/)).to.equal('regexp');
        });
        it('should return "array" when the value is an array', function () {
            expect(common.typeOf([])).to.equal('array');
        });
        it('should return "undefined" when the value is undefined', function () {
            expect(common.typeOf(undefined)).to.equal('undefined');
        });
        it('should return "null" when the value is null', function () {
            expect(common.typeOf(null)).to.equal('null');
        });
        it('should return "object" when the value is an object', function () {
            expect(common.typeOf({})).to.equal('object');
        });
    });

    describe('clone', function () {

        it ('should clone regular expressions', function () {
            var rex = /foo/igm,
                clone = common.clone(rex);

            expect(rex).not.to.equal(clone);
            expect(rex.source).to.equal(clone.source);
            expect(rex.global).to.equal(clone.global);
            expect(rex.multiline).to.equal(clone.multiline);
            expect(rex.ignoreCase).to.equal(clone.ignoreCase);

            rex = /foo/;
            clone = common.clone(rex);
            expect(rex).not.to.equal(clone);
            expect(rex.source).to.equal(clone.source);
            expect(rex.global).to.equal(clone.global);
            expect(rex.multiline).to.equal(clone.multiline);
            expect(rex.ignoreCase).to.equal(clone.ignoreCase);
        });

        it('should return the same value when a value type is passed', function () {
            expect(common.clone('foo')).to.equal('foo');
            expect(common.clone(true)).to.equal(true);
            expect(common.clone(1234)).to.equal(1234);
            expect(common.clone(null)).to.equal(null);
            expect(common.clone(undefined)).to.equal(undefined);
        });

        it ('should handle an object without a prototype', function () {
            expect(function () { common.clone(Object.create(null)); }).not.to.throw();
        });

        it('should deep clone objects', function () {
            var obj, sub, clone;
            obj = [1,2,3,4];
            clone = common.clone(obj);
            expect(clone).not.to.equal(obj);
            expect(clone).to.be.an('array');
            expect(clone[0]).to.equal(obj[0]);
            expect(clone[1]).to.equal(obj[1]);
            expect(clone[2]).to.equal(obj[2]);
            expect(clone[3]).to.equal(obj[3]);

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
            expect(clone).not.to.equal(obj);
            expect(clone).to.be.an('object');
            expect(clone.sub).not.to.equal(sub);
            expect(clone.sub).to.be.an('object');
            expect(clone.foo).to.equal('bar');
            expect(clone.sub.hello).to.equal('world');
        });

        it('should handle circular references', function () {
            var t1 = {}, t2 = {}, clone;
            t1.a = t2;
            t2.a = t1;
            clone = common.clone(t1);
            expect(clone.a).to.be.an('object');
            expect(clone.a.a).to.equal(clone);
        });
    });

    describe('isObject', function () {
        it('should return false if null is supplied', function () {
            expect(common.isObject(null)).to.equal(false);
        });
        it('should return true if a non null object is supplied', function () {
            expect(common.isObject({})).to.equal(true);
            expect(common.isObject([])).to.equal(true);
        });
        it('should return false if a non object is supplied', function () {
            expect(common.isObject(true)).to.equal(false);
            expect(common.isObject(1234)).to.equal(false);
            expect(common.isObject('foo bar')).to.equal(false);
        });
    });

    describe('startsWith', function () {
        it('should return true if the supplied string starts with the supplied value', function () {
            expect(common.startsWith('foobar', 'foo')).to.equal(true);
        });
        it('should return false if the supplied string does not start with the supplied value', function () {
            expect(common.startsWith('barbaz', 'foo')).to.equal(false);
        });
        it('should return false if the any of the supplied values is not a string', function () {
            expect(common.startsWith('foobar', {})).to.equal(false);
            expect(common.startsWith(1234, 'foo')).to.equal(false);
        });
    });

});
