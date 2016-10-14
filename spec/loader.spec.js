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
        it('should return the first argument if it is not an object', function (done) {
            var obj = {}, noop = function () {};
            Promise.all([loader(1, noop), loader('foo', noop), loader(true, noop), loader('baz', function () {})])
                .then(function (loaders) {
                    expect(loaders[0]).toBe(1);
                    expect(loaders[1]).toBe('foo');
                    expect(loaders[2]).toBe(true);
                    expect(loaders[3]).toBe('baz');
                    done();
                })
                .catch(done.fail);
        });
        it('should return the first argument (config) when the second argument (loader) is not a function', function (done) {
            var obj = { foo: 'bar' }, noop = function () {};
            Promise.all([loader(obj), loader(obj, 'foo'), loader(obj, obj), loader(obj, true), loader(obj, function () {})])
                .then(function (loaders) {
                    expect(loaders[0]).toBe(obj);
                    expect(loaders[1]).toBe(obj);
                    expect(loaders[2]).toBe(obj);
                    expect(loaders[3]).toBe(obj);
                    expect(loaders[4].foo).toBe('bar');
                    done();
                })
                .catch(done.fail);
        });
    });

    describe('loading', function () {
        it('should use options.loaderPrefix to determine which properties are loader properties', function (done) {
            var loads, config1, config2, loadRes = {};
            loads = [];

            config1 = {
                $foo: 'hello',
                bar: 'world'
            };
            config2 = {
                foo: 'hello',
                __bar: 'world'
            };
            Promise.all([loader(config1, loaderHandler), loader(config2, loaderHandler, { prefix: '__' })])
                .then(function (configs) {
                    expect(loads.length).toBe(2);
                    expect(configs[0].$foo).toBe(loadRes);
                    expect(configs[1].__bar).toBe(loadRes);
                    expect(loads[0]).toBe('hello');
                    expect(loads[1]).toBe('world');
                    done();
                })
                .catch(done.fail);

            function loaderHandler(src) {
                loads.push(src);
                return loadRes;
            }

        });
        it('should call the loader function with every property prefixed with the loaderPrefix', function (done) {
            var loadRes = {},
                loads = [],
                config = {
                    foo: 'hello',
                    _$_bar: '...',
                    baz: 'world',
                    _$_boo: '...'
                };
            loader(config, loaderHandler, { prefix: '_$_' })
                .then(function (config) {
                    expect(config.foo).toBe('hello');
                    expect(config.baz).toBe('world');
                    expect(config._$_bar).toBe(loadRes);
                    expect(config._$_boo).toBe(loadRes);
                    done();
                })
                .catch(done.fail);


            function loaderHandler(src) {
                loads.push(src);
                return loadRes;
            }
        });
        it('should assign any non string value directly to the config', function (done) {
            var loadRes = {},
                config = {
                    foo: 'hello',
                    _$_bar: '...',
                    baz: 'world',
                    _$_boo: '...'
                };
            loader(config, loaderHandler, { prefix: '_$_' })
                .then(function (config) {
                    expect(config._$_bar).toBe(loadRes);
                    expect(config._$_boo).toBe(loadRes);
                    done();
                })
                .catch(done.fail);


            function loaderHandler() {
                return loadRes;
            }
        });
        it('should use the parser to parse any string returned by the loader', function (done) {
            var loadRes = { foo: 'bar' },
                config = {
                    foo: 'hello',
                    _$_bar: '...',
                    baz: 'world',
                    _$_boo: '...'
                };
            loader(config, loaderHandler, { prefix: '_$_' })
                .then(function (config) {
                    expect(config._$_bar).not.toBe(loadRes);
                    expect(config._$_boo).not.toBe(loadRes);
                    expect(config._$_bar).not.toBe(config._$_boo);
                    expect(config._$_bar.foo).toBe('bar');
                    expect(config._$_boo.foo).toBe('bar');
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
            var config, sub;
            config = Object.create({
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
            var config, sub;
            config = {
                foo: 'bar'
            };
            config.$sub = '...';
            loader(config, loaderHandler, { source: true })
                .then(function (config) {
                    expect(config.$sub.baz).toBe('bar');
                    done();
                })
                .catch(done.fail);

            function loaderHandler() {
                return '{ baz: source.foo }';
            }
        });
        it('should pass all values defined in options.environment to the loaded configs', function (done) {
            var config, sub;
            config = { };
            config.$sub = '...';
            loader(config, loaderHandler, { environment: { hello: 'world' } })
                .then(function (config) {
                    expect(config.$sub.baz).toBe('world');
                    done();
                })
                .catch(done.fail);

            function loaderHandler() {
                return '{ baz: hello }';
            }
        });
        it('should make all properties non-configurable when protectStructure is truthy', function (done) {
            var config, sub;
            config = { foo: 'bar' };
            config.$sub = '...';
            loader(config, loaderHandler, { environment: { hello: 'world' }, protectStructure: true })
                .then(function (config) {
                    var def = Object.getOwnPropertyDescriptor(config, 'foo');
                    expect(def.value).toBe('bar');
                    expect(def.configurable).toBe(false);
                    def = Object.getOwnPropertyDescriptor(config.$sub, 'baz');
                    expect(def.get.call(config.$sub)).toBe('world');
                    expect(def.configurable).toBe(false);
                    done();
                })
                .catch(done.fail);

            function loaderHandler() {
                return Promise.resolve('{ baz: hello }');
            }
        });
        it('should assign the default prefix ("$") to prefix if a non-string, or empty string are supplied', function (done) {
            var config = {
                foo: 'hello',
                baz: {
                    $bar: '...'
                }
            };

            Promise.all([loader(config, loaderHandler, { prefix: '' }), loader(config, loaderHandler, { prefix: 1234 })])
                .then(function (configs) {
                    expect(configs[0].baz.$bar).toBe(1234);
                    expect(configs[1].baz.$bar).toBe(1234);
                    done();
                })
                .catch(done.fail);

            function loaderHandler() {
                return 1234;
            }
            done();
        });
        it('should assign loaded config to the value without the prefix, and delete the original load property when prefixStrip is true', function (done) {
            var loadRes = {},
                config = {
                    foo: 'hello',
                    $bar: '...'
                };
            loader(config, loaderHandler, { prefixStrip: true })
                .then(function (config) {
                    expect(config.$bar).toBe(undefined);
                    expect(config.bar).toBe(1234);
                    done();
                })
                .catch(done.fail);


            function loaderHandler() {
                return 1234;
            }
        });
        it('should assign loaded config to the value without the prefix, and keep the original load property when prefixStrip is "partial"', function (done) {
            var loadRes = {},
                config = {
                    foo: 'hello',
                    $bar: '...'
                };
            loader(config, loaderHandler, { prefixStrip: 'partial' })
                .then(function (config) {
                    expect(config.$bar).toBe('...');
                    expect(config.bar).toBe(1234);
                    done();
                })
                .catch(done.fail);


            function loaderHandler() {
                return 1234;
            }
        });
        it('should allow a filter function to be defined for "source" which will allow properties to receive the "source" value to be filtered', function (done) {
            var loadRes = {},
                config = {
                    foo: 'hello',
                    $bar: '...',
                    $baz: '...'
                };
            loader(config, loaderHandler, { source: check })
                .then(function (config) {
                    expect(config.$bar.test).toBe('object');
                    expect(function () { return config.$baz.test; })
                        .toThrowError(/source.*not.*declared/);
                    done();
                })
                .catch(done.fail);

            function check(name) {
                return name === '$bar';
            }

            function loaderHandler() {
                return '{ test: typeof source }';
            }
        });
        it('should allow a filter function to be defined for "locals" which will allow properties to receive the "locals" values to be filtered', function (done) {
            var loadRes = {},
                config = parser('{ id: main, foo: "hello", $bar: "...", $baz: "..." }');
            loader(config, loaderHandler, { locals: check })
                .then(function (config) {
                    expect(config.$bar.test).toBe('object');
                    expect(function () { return config.$baz.test; })
                        .toThrowError(/main.*not.*declared/);
                    done();
                })
                .catch(done.fail);

            function check(name) {
                return name === '$bar';
            }

            function loaderHandler() {
                return '{ test: typeof main }';
            }
        });
    });

});
