describe('levels', function () {
    var levels, parse;

    beforeEach(function () {
        delete require.cache[require.resolve('../src/levels.js')];
        delete require.cache[require.resolve('../src/parser.js')];
        extend = require('../src/levels.js');
        parse = require('../src/parser.js');
    });

    describe('checks', function () {
        it('should return the supplied config value if it is not an object or array', function () {
            expect(extend('foo')).toBe('foo');
            expect(extend(1234)).toBe(1234);
            expect(extend(false)).toBe(false);
        });
        it('should return the config if the supplied levels argument is not an array', function () {
            expect(extend({}, 'foo')).toEqual(jasmine.any(Object));
            expect(extend({}, 123)).toEqual(jasmine.any(Object));
        });
    });

    describe('extend', function () {
        it('should replace the object if a level value type is received', function () {
            var res = extend({}, ['foo', 1234, {}, true, 'bar']);
            expect(res).toBe('bar');
        });
        it('should not modify the originally supplied object', function () {
            var config = {},
                ext = {},
                result;
            result = extend(config, [ext]);
            expect(result).not.toBe(config);
        });
        it('should add properties to the underlying object', function () {
            var config = {},
                ext = {
                    foo: 'bar',
                    hello: 'world'
                },
                result;
            result = extend(config, [ext]);
            expect(result.foo).toBe('bar');
            expect(result.hello).toBe('world');
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
            expect(result.foo).toBe('bar');
            expect(result.hello).toBe('world');
            expect(result.hasOwnProperty('test')).toBe(false);
        });
        it('should deep extend the properties', function () {
            var config, ext;

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
            expect(result.section).toEqual(jasmine.any(Object));
            expect(result.section.subsection).toEqual(jasmine.any(Object));
            expect(result.section2).toEqual(jasmine.any(Object));
            expect(result.section.value1).toBe('a');
            expect(result.section.value2).toBe('d');
            expect(result.section.subsection.value3).toBe('c');
            expect(result.section.subsection.value4).toBe('e');
            expect(result.section2.foo).toBe('bar');
            expect(result.test).toBe(10);
        });

        it('should extend an array', function () {
            var config = [1,2,3,4,5],
                commands = [{ $: { action: 'remove', find: 2 } }],
                result;
            result = extend(config, [commands]);
            expect(result.length).toBe(4);
            expect(result[0]).toBe(1);
            expect(result[1]).toBe(3);
            expect(result[2]).toBe(4);
            expect(result[3]).toBe(5);
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
                expect(result.vals).toEqual(jasmine.any(Array));
                expect(result.vals.length).toBe(2);
                expect(result.vals[0]).toBe(1);
                expect(result.vals[1]).toEqual(jasmine.any(Object));
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
                expect(result.vals).toEqual(jasmine.any(Array));
                expect(result.vals.length).toBe(4);
                expect(result.vals[0]).toBe(1);
                expect(result.vals[1]).toBe(3);
                expect(result.vals[2]).toBe(4);
                expect(result.vals[3]).toBe(5);
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
                expect(result.vals).toEqual(jasmine.any(Array));
                expect(result.vals.length).toBe(4);
                expect(result.vals[0].id).toBe(1);
                expect(result.vals[1].id).toBe(3);
                expect(result.vals[2].id).toBe(4);
                expect(result.vals[3].id).toBe(5);
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
                expect(result.vals).toEqual(jasmine.any(Array));
                expect(result.vals.length).toBe(6);
                expect(result.vals[0]).toBe(1);
                expect(result.vals[1]).toBe(2);
                expect(result.vals[2]).toBe(3);
                expect(result.vals[3]).toBe(4);
                expect(result.vals[4]).toBe(5);
                expect(result.vals[5]).toBe(6);
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
                expect(result.vals).toEqual(jasmine.any(Array));
                expect(result.vals.length).toBe(4);
                expect(result.vals[0]).toBe(1);
                expect(result.vals[1]).toBe(3);
                expect(result.vals[2]).toBe(4);
                expect(result.vals[3]).toBe(5);
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
                expect(result.vals).toEqual(jasmine.any(Array));
                expect(result.vals.length).toBe(5);
                expect(result.vals[0]).toBe(1);
                expect(result.vals[1]).toBe(10);
                expect(result.vals[2]).toBe(3);
                expect(result.vals[3]).toBe(4);
                expect(result.vals[4]).toBe(5);
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
                expect(result.vals).toEqual(jasmine.any(Array));
                expect(result.vals.length).toBe(0);
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
                expect(result.vals).toEqual(jasmine.any(Array));
                expect(result.vals.length).toBe(5);
                expect(result.vals[0].id).toBe(1);
                expect(result.vals[1].id).toBe(2);
                expect(result.vals[2].id).toBe(3);
                expect(result.vals[3].id).toBe(4);
                expect(result.vals[1].foo).toEqual(jasmine.any(Object));
                expect(result.vals[1].foo.bar).toBe('baz');
            });
        });
    });

    describe('options', function () {
        it('should make all properties read only when "readOnly" is truthy', function () {
            var config, ext, result, def;
            config = {
                vals: [{ id: 1 },{ id: 2 },{ id: 3 },{ id: 4 },{ id: 5 }]
            };
            ext = {
                vals: [
                    { $: { action: 'extend', find: { id: 2 }, value: { foo: { bar: 'baz' } } } }
                ]
            };
            result = extend(config, [ext], { readOnly: true });

            def = Object.getOwnPropertyDescriptor(result, 'vals');
            expect(def.writable).toBe(false);

            def = Object.getOwnPropertyDescriptor(result.vals[0], 'id');
            expect(def.writable).toBe(false);
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
            expect(def.configurable).toBe(false);

            def = Object.getOwnPropertyDescriptor(result.vals[0], 'id');
            expect(def.configurable).toBe(false);
        });
    });
});
