describe('loader', function () {
    'use strict';

    var loader, parser;

    beforeEach(function () {
        delete require.cache[require.resolve('../src/loader.js')];
        delete require.cache[require.resolve('../src/parser.js')];
        loader = require('../src/loader.js');
        parser = require('../src/parser.js');
    });

    describe('checks', function() {
        it('should ensure the first argument is a string', function () {
            var noop = function () {};
            return Promise.all([ doCheck(1), doCheck(true), doCheck({}) ]);

            function doCheck(val) {
                return new Promise(function (resolve, reject) {
                    loader(val, noop)
                        .then(function () {
                            reject('Expected passing "' + typeof val + '" for the first argument to fail.');
                        })
                        .catch(function () {
                            resolve();
                        });
                });
            }
        });
        it('should ensure loader is a function', function () {
            return Promise.all([ doCheck(1), doCheck(true), doCheck({}) ]);

            function doCheck(val) {
                return new Promise(function (resolve, reject) {
                    loader('{}', val)
                        .then(function () {
                            reject('Expected passing "' + typeof val + '" for the second argument to fail.');
                        })
                        .catch(function () {
                            resolve();
                        });
                });
            }
        });
    });

    describe('loading', function () {
        it('should assign any non string value directly to the config', function () {
            var loadRes = {},
                config = '{ foo: "hello", bar: $import("..."), baz: "world", boo: $import("...") }';
            return loader(config, loaderHandler)
                .then(function (config) {
                    expect(config.bar).to.equal(loadRes);
                    expect(config.boo).to.equal(loadRes);
                });


            function loaderHandler() {
                return loadRes;
            }
        });
    });

    describe('options', function () {
        it('should pass all values defined in options.environment to the loaded configs', function () {
            var config = '{ sub: $import("...") }';
            loader(config, loaderHandler, { environment: { hello: 'world' } })
                .then(function (config) {
                    expect(config.sub.baz).to.equal('world');
                });

            function loaderHandler() {
                return '{ baz: hello }';
            }
        });
        it('should make all properties non-configurable when protectStructure is truthy', function () {
            var config = '{ foo: "bar", sub: $import("...") }';
            loader(config, loaderHandler, { environment: { hello: 'world' }, protectStructure: true })
                .then(function (config) {
                    var def = Object.getOwnPropertyDescriptor(config, 'foo');
                    expect(def.value).to.equal('bar');
                    expect(def.configurable).to.equal(false);
                    def = Object.getOwnPropertyDescriptor(config.sub, 'baz');
                    expect(def.get.call(config.sub)).to.equal('world');
                    expect(def.configurable).to.equal(false);
                });

            function loaderHandler() {
                return Promise.resolve('{ baz: hello }');
            }
        });
    });

});
