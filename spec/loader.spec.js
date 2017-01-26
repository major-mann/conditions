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
        it('should ensure the first argument is a string', function (done) {
            var noop = function () {};
            Promise.all([ doCheck(1), doCheck(true), doCheck({}) ])
                .then(done)
                .catch(done.fail);

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
        it('should ensure loader is a function', function (done) {
            Promise.all([ doCheck(1), doCheck(true), doCheck({}) ])
                .then(done)
                .catch(done.fail);

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
        it('should assign any non string value directly to the config', function (done) {
            var loadRes = {},
                config = '{ foo: "hello", bar: $import("..."), baz: "world", boo: $import("...") }';
            loader(config, loaderHandler)
                .then(function (config) {
                    expect(config.bar).toBe(loadRes);
                    expect(config.boo).toBe(loadRes);
                    done();
                })
                .catch(done.fail);


            function loaderHandler() {
                return loadRes;
            }
        });
        it('should use the parser to parse any string returned by the loader', function (done) {
            var loadRes = { foo: 'bar' },
                config = '{ foo: "hello", bar: $import("..."), baz: "world", boo: $import("...") }';
            loader(config, loaderHandler)
                .then(function (config) {
                    expect(config.bar).not.toBe(loadRes);
                    expect(config.boo).not.toBe(loadRes);
                    expect(config.bar).not.toBe(config.boo);
                    expect(config.bar.foo).toBe('bar');
                    expect(config.boo.foo).toBe('bar');
                    done();
                })
                .catch(done.fail);


            function loaderHandler() {
                return JSON.stringify(loadRes);
            }

        });
    });

    describe('options', function () {
        it('should pass all locals from the current config to the loaded configs if options.locals is truthy', function (done) {
            var config = Object.create({
                $locals: {
                    foo: 'bar'
                }
            });
            config.$sub = '...';
            loader(config, loaderHandler, { locals: true })
                .then(function (config) {
                    try {
                        expect(config.$sub.baz).toBe('bar');
                        done();
                    } catch(err) {
                        done.fail(err);
                    }
                })
                .catch(done);


            function loaderHandler() {
                return '{ baz: foo }';
            }

        });
        it('should pass the root of the config as the environment variable "source" to the loaded configs if options.source is truthy', function (done) {
            var config = '{ foo: "bar", sub: $import("...") }';
            loader(config, loaderHandler, { source: true })
                .then(function (config) {
                    expect(config.sub.baz).toBe('bar');
                    done();
                })
                .catch(done.fail);

            function loaderHandler() {
                return '{ baz: source.foo }';
            }
        });
        it('should pass all values defined in options.environment to the loaded configs', function (done) {
            var config = '{ sub: $import("...") }';
            loader(config, loaderHandler, { environment: { hello: 'world' } })
                .then(function (config) {
                    expect(config.sub.baz).toBe('world');
                    done();
                })
                .catch(done.fail);

            function loaderHandler() {
                return '{ baz: hello }';
            }
        });
        it('should make all properties non-configurable when protectStructure is truthy', function (done) {
            var config = '{ foo: "bar", sub: $import("...") }';
            loader(config, loaderHandler, { environment: { hello: 'world' }, protectStructure: true })
                .then(function (config) {
                    var def = Object.getOwnPropertyDescriptor(config, 'foo');
                    expect(def.value).toBe('bar');
                    expect(def.configurable).toBe(false);
                    def = Object.getOwnPropertyDescriptor(config.sub, 'baz');
                    expect(def.get.call(config.sub)).toBe('world');
                    expect(def.configurable).toBe(false);
                    done();
                })
                .catch(done.fail);

            function loaderHandler() {
                return Promise.resolve('{ baz: hello }');
            }
        });
    });

});
