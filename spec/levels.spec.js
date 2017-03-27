describe('levels', function () {
    'use strict';

    var parse, extend, oWarn, fs = require('fs');

    beforeEach(function () {
        delete require.cache[require.resolve('../src/levels.js')];
        delete require.cache[require.resolve('../src/parser.js')];
        extend = require('../src/levels.js');
        parse = require('../src/parser.js');
        oWarn = console.warn;
    });
    afterEach(function () {
        console.warn = oWarn;
    });

    describe('checks', function () {
        it('should return the supplied config value if it is not an object or array', function () {
            expect(extend('foo')).to.equal('foo');
            expect(extend(1234)).to.equal(1234);
            expect(extend(false)).to.equal(false);
        });
        it('should return the config if the supplied levels argument is not an array', function () {
            expect(extend({}, 'foo')).to.be.an('object');
            expect(extend({}, 123)).to.be.an('object');
        });
    });

    describe('extend', function () {
        it('should replace the object if a level value type is received', function () {
            var res = extend({}, ['foo', 1234, {}, true, 'bar']);
            expect(res).to.equal('bar');
        });
        it('should not modify the originally supplied object', function () {
            var config = {},
                ext = {},
                result;
            result = extend(config, [ext]);
            expect(result).not.to.equal(config);
        });
        it('should add properties to the underlying object', function () {
            var config = {},
                ext = {
                    foo: 'bar',
                    hello: 'world'
                },
                result;
            result = extend(config, [ext]);
            expect(result.foo).to.equal('bar');
            expect(result.hello).to.equal('world');
        });
        it('should handle circular references', function () {
            var config = { ext: {} },
                ext = {
                    foo: 'bar',
                    hello: 'world'
                },
                result;
            ext.ext = ext;
            result = extend(config, [ext]);
            expect(result.foo).to.equal('bar');
            expect(result.hello).to.equal('world');
        });
        it('should return a copy of arrays even when overwriting', function () {
            var res, arr = [1,2,3,4,5];
            res = extend('foo', [arr]);
            expect(res).to.be.an('array');
            expect(res).not.to.equal(arr);
            expect(res.length).to.equal(5);
        });
        it('delete properties extended if they are undefined', function () {
            var config = { 'test': 'value' },
                ext = {
                    foo: 'bar',
                    hello: 'world',
                    test: undefined
                },
                result;
            result = extend(config, [ext]);
            expect(result.foo).to.equal('bar');
            expect(result.hello).to.equal('world');
            expect(Object.keys(result).indexOf('test') === -1).to.equal(true);
            expect(result.test).to.equal(undefined);
        });
        it('should deep extend the properties', function () {
            var config, ext, keys, result;

            config = {
                section: {
                    value1: 'a',
                    value2: 'b',
                    subsection: {
                        value3: 'c'
                    }
                }
            };
            ext = {
                section: {
                    value2: 'd',
                    subsection: {
                        value4: 'e'
                    }
                },
                section2: {
                    foo: 'bar'
                }
            };
            Object.defineProperty(ext, 'test', {
                enumerable: true,
                configurable: true,
                get: function () {
                    return 10;
                }
            });

            result = extend(config, [ext]);
            expect(result.section).to.be.an('object');
            expect(result.section.subsection).to.be.an('object');
            expect(result.section2).to.be.an('object');
            expect(result.section.value1).to.equal('a');
            expect(result.section.value2).to.equal('d');
            expect(result.section.subsection.value3).to.equal('c');
            expect(result.section.subsection.value4).to.equal('e');
            expect(result.section2.foo).to.equal('bar');
            expect(result.test).to.equal(10);

            keys = Object.keys(result.section);
            expect(keys.length).to.equal(3);
            expect(keys.indexOf('value1') > -1).to.equal(true);
            expect(keys.indexOf('value2') > -1).to.equal(true);
            expect(keys.indexOf('subsection') > -1).to.equal(true);
        });

        it('should extend an array', function () {
            var config = [1,2,3,4,5],
                commands = [{ $: { action: 'remove', find: 2 } }],
                result;
            result = extend(config, [commands]);
            expect(result.length).to.equal(4);
            expect(result[0]).to.equal(1);
            expect(result[1]).to.equal(3);
            expect(result[2]).to.equal(4);
            expect(result[3]).to.equal(5);
        });

        describe('array commands', function () {
            it('should only apply commands if the entire array is commands', function () {
                var config, ext, result;
                config = {
                    vals: [1,2,3,4,5]
                };
                ext = {
                    vals: [
                        1, { $: { action: 'remove', find: 2 } }
                    ]
                };
                result = extend(config, [ext]);
                expect(result.vals).to.be.an('array');
                expect(result.vals.length).to.equal(2);
                expect(result.vals[0]).to.equal(1);
                expect(result.vals[1]).to.be.an('object');
            });
            it('should not apply commands if COMMAND_CHECK is not a function', function () {
                var config, ext, result;
                config = {
                    vals: [1,2,3,4,5]
                };
                ext = {
                    vals: [
                        { $: { action: 'remove', find: 2 } }
                    ]
                };
                delete extend.COMMAND_CHECK;
                result = extend(config, [ext]);
                expect(result.vals).to.be.an('array');
                expect(result.vals.length).to.equal(1);
                expect(result.vals[0]).to.be.an('object');
            });
            it('should allow elements to be searched by reference', function () {
                var config, ext, result;
                config = {
                    vals: [1,2,3,4,5]
                };
                ext = {
                    vals: [
                        { $: { action: 'remove', find: 2 } }
                    ]
                };
                result = extend(config, [ext]);
                expect(result.vals).to.be.an('array');
                expect(result.vals.length).to.equal(4);
                expect(result.vals[0]).to.equal(1);
                expect(result.vals[1]).to.equal(3);
                expect(result.vals[2]).to.equal(4);
                expect(result.vals[3]).to.equal(5);
            });
            it('should allow elements to be searched by property values', function () {
                var config, ext, result;
                config = {
                    vals: [{ id: 1 },{ id: 2 },{ id: 3 },{ id: 4 },{ id: 5 }]
                };
                ext = {
                    vals: [
                        { $: { action: 'remove', find: { id: 2 } } }
                    ]
                };
                result = extend(config, [ext]);
                expect(result.vals).to.be.an('array');
                expect(result.vals.length).to.equal(4);
                expect(result.vals[0].id).to.equal(1);
                expect(result.vals[1].id).to.equal(3);
                expect(result.vals[2].id).to.equal(4);
                expect(result.vals[3].id).to.equal(5);
            });
            it('should allow elements to be added', function () {
                var config, ext, result;
                config = {
                    vals: [1,2,3,4,5]
                };
                ext = {
                    vals: [
                        { $: { action: 'add', value: 6 } }
                    ]
                };
                result = extend(config, [ext]);
                expect(result.vals).to.be.an('array');
                expect(result.vals.length).to.equal(6);
                expect(result.vals[0]).to.equal(1);
                expect(result.vals[1]).to.equal(2);
                expect(result.vals[2]).to.equal(3);
                expect(result.vals[3]).to.equal(4);
                expect(result.vals[4]).to.equal(5);
                expect(result.vals[5]).to.equal(6);
            });
            it('should allow elements to be inserted', function () {
                var config, ext, result;
                config = {
                    vals: [1,2,3,4,5]
                };
                ext = {
                    vals: [
                        { $: { action: 'insert', value: 2.5, find: 3 } }
                    ]
                };
                result = extend(config, [ext]);
                expect(result.vals).to.be.an('array');
                expect(result.vals.length).to.equal(6);
                expect(result.vals[0]).to.equal(1);
                expect(result.vals[1]).to.equal(2);
                expect(result.vals[2]).to.equal(2.5);
                expect(result.vals[3]).to.equal(3);
                expect(result.vals[4]).to.equal(4);
                expect(result.vals[5]).to.equal(5);
            });
            it('should allow elements to be inserted after the specified element if after is true', function () {
                var config, ext, result;
                config = {
                    vals: [1,2,3,4,5]
                };
                ext = {
                    vals: [
                        { $: { action: 'insert', value: 2.5, find: 3, after: true } }
                    ]
                };
                result = extend(config, [ext]);
                expect(result.vals).to.be.an('array');
                expect(result.vals.length).to.equal(6);
                expect(result.vals[0]).to.equal(1);
                expect(result.vals[1]).to.equal(2);
                expect(result.vals[2]).to.equal(3);
                expect(result.vals[3]).to.equal(2.5);
                expect(result.vals[4]).to.equal(4);
                expect(result.vals[5]).to.equal(5);
            });
            it('should not insert if the specified element could not be found', function () {
                var config, ext, result;
                config = {
                    vals: [1,2,3,4,5]
                };
                ext = {
                    vals: [
                        { $: { action: 'insert', value: 2.5, find: 100 } }
                    ]
                };
                result = extend(config, [ext]);
                expect(result.vals).to.be.an('array');
                expect(result.vals.length).to.equal(5);
                expect(result.vals[0]).to.equal(1);
                expect(result.vals[1]).to.equal(2);
                expect(result.vals[2]).to.equal(3);
                expect(result.vals[3]).to.equal(4);
                expect(result.vals[4]).to.equal(5);
            });
            it('should print a warning of a find value is not specified for insert', function () {
                var config, ext, result;
                config = {
                    vals: [1,2,3,4,5]
                };
                ext = {
                    vals: [
                        { $: { action: 'insert', value: 2.5 } }
                    ]
                };
                console.warn = chai.spy();
                result = extend(config, [ext]);
                expect(console.warn).to.have.been.called.once();
            });
            it('should allow elements to be removed', function () {
                var config, ext, result;
                config = {
                    vals: [1,2,3,4,5]
                };
                ext = {
                    vals: [
                        { $: { action: 'remove', find: 2 } }
                    ]
                };
                result = extend(config, [ext]);
                expect(result.vals).to.be.an('array');
                expect(result.vals.length).to.equal(4);
                expect(result.vals[0]).to.equal(1);
                expect(result.vals[1]).to.equal(3);
                expect(result.vals[2]).to.equal(4);
                expect(result.vals[3]).to.equal(5);
            });
            it('should only remove if the value is found', function () {
                var config, ext, result;
                config = {
                    vals: [1,2,3,4,5]
                };
                ext = {
                    vals: [
                        { $: { action: 'remove', find: 100 } }
                    ]
                };
                result = extend(config, [ext]);
                expect(result.vals).to.be.an('array');
                expect(result.vals.length).to.equal(5);
                expect(result.vals[0]).to.equal(1);
                expect(result.vals[1]).to.equal(2);
                expect(result.vals[2]).to.equal(3);
                expect(result.vals[3]).to.equal(4);
                expect(result.vals[4]).to.equal(5);
            });
            it('should print a warning of a find value is not specified for remove', function () {
                var config, ext, result;
                config = {
                    vals: [1,2,3,4,5]
                };
                ext = {
                    vals: [
                        { $: { action: 'remove' } }
                    ]
                };
                console.warn = chai.spy();
                result = extend(config, [ext]);
                expect(console.warn).to.have.been.called.once();
            });
            it('should allow elements to be replaced', function () {
                var config, ext, result;
                config = {
                    vals: [1,2,3,4,5]
                };
                ext = {
                    vals: [
                        { $: { action: 'update', find: 2, value: 10 } }
                    ]
                };
                result = extend(config, [ext]);
                expect(result.vals).to.be.an('array');
                expect(result.vals.length).to.equal(5);
                expect(result.vals[0]).to.equal(1);
                expect(result.vals[1]).to.equal(10);
                expect(result.vals[2]).to.equal(3);
                expect(result.vals[3]).to.equal(4);
                expect(result.vals[4]).to.equal(5);
            });
            it('should only update if the value is found', function () {
                var config, ext, result;
                config = {
                    vals: [1,2,3,4,5]
                };
                ext = {
                    vals: [
                        { $: { action: 'update', find: 1000, value: 1000 } }
                    ]
                };
                result = extend(config, [ext]);
                expect(result.vals).to.be.an('array');
                expect(result.vals.length).to.equal(5);
                expect(result.vals[0]).to.equal(1);
                expect(result.vals[1]).to.equal(2);
                expect(result.vals[2]).to.equal(3);
                expect(result.vals[3]).to.equal(4);
                expect(result.vals[4]).to.equal(5);
            });
            it('should print a warning of a find value is not specified for update', function () {
                var config, ext, result;
                config = {
                    vals: [1,2,3,4,5]
                };
                ext = {
                    vals: [
                        { $: { action: 'update', value: 10 } }
                    ]
                };
                console.warn = chai.spy();
                result = extend(config, [ext]);
                expect(console.warn).to.have.been.called.once();
            });
            it('should allow elements to be cleared', function () {
                var config, ext, result;
                config = {
                    vals: [1,2,3,4,5]
                };
                ext = {
                    vals: [
                        { $: { action: 'clear' } }
                    ]
                };
                result = extend(config, [ext]);
                expect(result.vals).to.be.an('array');
                expect(result.vals.length).to.equal(0);
            });

            it('should allow elements to be extended', function () {
                var config, ext, result;
                config = {
                    vals: [{ id: 1 },{ id: 2 },{ id: 3 },{ id: 4 },{ id: 5 }]
                };
                ext = {
                    vals: [
                        { $: { action: 'extend', find: { id: 2 }, value: { foo: { bar: 'baz' } } } }
                    ]
                };
                result = extend(config, [ext]);
                expect(result.vals).to.be.an('array');
                expect(result.vals.length).to.equal(5);
                expect(result.vals[0].id).to.equal(1);
                expect(result.vals[1].id).to.equal(2);
                expect(result.vals[2].id).to.equal(3);
                expect(result.vals[3].id).to.equal(4);
                expect(result.vals[1].foo).to.be.an('object');
                expect(result.vals[1].foo.bar).to.equal('baz');
            });
            it('should only extend if the value is found', function () {
                var config, ext, result;
                config = {
                    vals: [{ id: 1 },{ id: 2 },{ id: 3 },{ id: 4 },{ id: 5 }]
                };
                ext = {
                    vals: [
                        { $: { action: 'extend', find: { id: 1000 }, value: { foo: { bar: 'baz' } } } }
                    ]
                };
                result = extend(config, [ext]);
                expect(result.vals).to.be.an('array');
                expect(result.vals.length).to.equal(5);
                expect(result.vals[0].id).to.equal(1);
                expect(result.vals[1].id).to.equal(2);
                expect(result.vals[2].id).to.equal(3);
                expect(result.vals[3].id).to.equal(4);
                expect(result.vals[4].id).to.equal(5);
            });
            it('should print a warning of a find value is not specified for extend', function () {
                var config, ext, result;
                config = {
                    vals: [{ id: 1 },{ id: 2 },{ id: 3 },{ id: 4 },{ id: 5 }]
                };
                ext = {
                    vals: [
                        { $: { action: 'extend', value: { foo: { bar: 'baz' } } } }
                    ]
                };
                console.warn = chai.spy();
                result = extend(config, [ext]);
                expect(console.warn).to.have.been.called.once();
            });
            it('should print a warning for any unrecognized action', function () {
                var config, ext, result;
                config = {
                    vals: [{ id: 1 },{ id: 2 },{ id: 3 },{ id: 4 },{ id: 5 }]
                };
                ext = {
                    vals: [
                        { $: { action: 'foo-bar-baz', value: { foo: { bar: 'baz' } } } }
                    ]
                };
                console.warn = chai.spy();
                result = extend(config, [ext]);
                expect(console.warn).to.have.been.called.once();
            });

            it('should set the prototypes so that base properties are available', function () {
                var lvl1 = parse(data('extend.production')),
                    lvl2 = parse(data('extend.development')),
                    config;
                config = extend(lvl1, [lvl2]);
                expect(config.server.domain).to.equal('dev-example.com');
                expect(config.server.url).to.equal('https://dev-example.com');
                config.server.port = 8080;
                expect(config.server.url).to.equal('https://dev-example.com:8080');
            });
        });
    });

    describe('options', function () {
        it('should make all properties read only when "readOnly" is truthy', function () {
            var config, ext, result;
            config = {
                vals: [{ id: 1 },{ id: 2 },{ id: 3 },{ id: 4 },{ id: 5 }]
            };
            ext = {
                vals: [
                    { $: { action: 'extend', find: { id: 2 }, value: { foo: { bar: 'baz' } } } }
                ]
            };
            result = extend(config, [ext], { readOnly: true });

            expect(result.vals[0].id).to.equal(1);
            result.vals[0].id = 100;
            expect(result.vals[0].id).to.equal(1); // Shouldn't this throw a TypeError?
        });
        it('should make all properties read only when "protectStructure" is truthy', function () {
            var config, ext, result, def;
            config = {
                vals: [{ id: 1 },{ id: 2 },{ id: 3 },{ id: 4 },{ id: 5 }]
            };
            ext = {
                vals: [
                    { $: { action: 'extend', find: { id: 2 }, value: { foo: { bar: 'baz' } } } }
                ]
            };
            result = extend(config, [ext], { protectStructure: true });

            def = Object.getOwnPropertyDescriptor(result, 'vals');
            expect(def.configurable).to.equal(false);

            def = Object.getOwnPropertyDescriptor(result.vals[0], 'id');
            expect(def.configurable).to.equal(false);
        });
    });

    /** Reads the contents from the specified data file */
    function data(file) {
        return fs.readFileSync('./spec/data/data.' + file + '.config', { encoding: 'utf8' });
    }
});
