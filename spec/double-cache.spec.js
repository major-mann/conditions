describe('Double cache', function () {
    'use strict';
    const double = require('../src/double-cache.js'),
        a = {}, b = {}, c = {};
    var cache;

    beforeEach(function () {
        cache = double();
    });

    describe('get', function () {
        it('should be a function', function () {
            expect(cache.get).to.be.a('function');
        });
        it('should return the value if it exists in the cache', function () {
            cache.set(a, b, 'foo');
            cache.set(a, c, 'bar');
            cache.set(b, c, 'baz');
            cache.set(undefined, c, 'hello');
            cache.set(b, null, 'world');
            cache.set(c, false, 'hello world');
            expect(cache.get(a, b)).to.equal('foo');
            expect(cache.get(a, c)).to.equal('bar');
            expect(cache.get(b, c)).to.equal('baz');
            expect(cache.get(undefined, c)).to.equal('hello');
            expect(cache.get(c, false)).to.equal('hello world');
        });
        it('should return undefined if the supplied pair does not exist in the cache', function () {
            expect(cache.get(a, b)).to.equal(undefined);
            expect(cache.get(a, c)).to.equal(undefined);
            expect(cache.get(b, c)).to.equal(undefined);
        });
    });

    describe('set', function () {
        it('should be a function', function () {
            expect(cache.set).to.be.a('function');
        });
        it('should add a value to the cache', function () {
            expect(cache.get(a, b)).to.equal(undefined);
            expect(cache.get(a, c)).to.equal(undefined);
            expect(cache.get(b, c)).to.equal(undefined);
            cache.set(a, b, 'foo');
            cache.set(a, c, 'bar');
            cache.set(b, c, 'baz');
            expect(cache.get(a, b)).to.equal('foo');
            expect(cache.get(a, c)).to.equal('bar');
            expect(cache.get(b, c)).to.equal('baz');
        });
        it('should replace and existing value in the cache', function () {
            cache.set(a, b, 'foo');
            cache.set(a, c, 'bar');
            cache.set(b, c, 'baz');
            expect(cache.get(a, b)).to.equal('foo');
            expect(cache.get(a, c)).to.equal('bar');
            expect(cache.get(b, c)).to.equal('baz');
            cache.set(a, b, 'oof');
            cache.set(a, c, 'rab');
            cache.set(b, c, 'zab');
            expect(cache.get(a, b)).to.equal('oof');
            expect(cache.get(a, c)).to.equal('rab');
            expect(cache.get(b, c)).to.equal('zab');
        });
    });

    describe('has', function () {
        it('should be a function', function () {
            expect(cache.has).to.be.a('function');
        });
        it('should return true if the supplied pair exists in the cache', function () {
            cache.set(a, b, 'foo');
            cache.set(a, c, 'bar');
            cache.set(b, c, 'baz');
            expect(cache.has(a, b)).to.equal(true);
            expect(cache.has(a, c)).to.equal(true);
            expect(cache.has(b, c)).to.equal(true);
        });
        it('should return false if the supplied pair does not exist in the cache', function () {
            var d = {};
            cache.set(a, b, 'foo');
            cache.set(a, c, 'bar');
            cache.set(b, c, 'baz');
            cache.set(a, d, 'hello');
            expect(cache.has(b, d)).to.equal(false);
            expect(cache.has(c, d)).to.equal(false);
        });
    });

    describe('delete', function () {
        it('should be a function', function () {
            expect(cache.delete).to.be.a('function');
        });
        it('should remove a value from the cache', function () {
            cache.set(a, b, 'foo');
            cache.set(a, c, 'bar');
            cache.set(b, c, 'baz');
            cache.set('hello', c, 'baz');
            cache.set(a, 'world', 'baz');
            expect(cache.has(a, b)).to.equal(true);
            expect(cache.has(a, c)).to.equal(true);
            expect(cache.has(b, c)).to.equal(true);
            cache.delete(a, c);
            cache.delete(b, c);
            expect(cache.has(a, b)).to.equal(true);
            expect(cache.has(a, c)).to.equal(false);
            expect(cache.has(b, c)).to.equal(false);
            // Rest for coverage
            cache.delete(a, b);
            cache.delete(a, b);
            cache.delete('hello', c);
            cache.delete(a, 'world');
        });
        it('should do nothing if no value exists', function () {
            cache.set(a, b, 'foo');
            cache.set(a, c, 'bar');
            cache.set(b, c, 'baz');
            expect(cache.has(a, b)).to.equal(true);
            expect(cache.has(a, c)).to.equal(true);
            expect(cache.has(b, c)).to.equal(true);
            cache.delete({}, c);
            cache.delete(b, {});
            expect(cache.has(a, b)).to.equal(true);
            expect(cache.has(a, c)).to.equal(true);
            expect(cache.has(b, c)).to.equal(true);
        });
    });
});
