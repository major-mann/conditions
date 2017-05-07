'use strict';
describe('Context manager', function () {
    const contextManager = require('../src/context-manager.js');

    describe('factory', function () {
        it('should be a function', function () {
            expect(contextManager).to.be.a('function');
        });
        it('should create locals if an object is not supplied', function () {
            var cm = contextManager({}, '');
            expect(cm.locals()).to.be.an('object');
        });
        it('should create env if an object is not supplied', function () {
            var cm = contextManager({}, '');
            expect(cm.environment()).to.be.an('object');
        });
        it('should throw an error if name is not a string', function () {
            expect(() => contextManager({}, 123)).to.throw(/name.*string/i);
            expect(() => contextManager({}, true)).to.throw(/name.*string/i);
            expect(() => contextManager({}, {})).to.throw(/name.*string/i);
        });
    });

    describe('instance', function () {
        var cman, source, name, env, locals;

        beforeEach(function () {
            source = {};
            name = 'foo-bar-baz';
            env = {};
            locals = {
                foo: 'bar'
            };
            cman = contextManager(source, name, env, locals);
        });

        it('should be an object', function () {
            expect(cman).to.be.an('object');
        });
        it('should return the source supplied to create on source()', function () {
            expect(cman.source()).to.equal(source);
        });
        it('should return the name supplied to create on name()', function () {
            expect(cman.name()).to.equal(name);
        });
        it('should return the environment on environment() (By reference)', function () {
            expect(cman.environment()).to.equal(env);
        });
        it('should return a copy of the current locals', function () {
            var locs = cman.locals();
            expect(locs.foo).to.equal('bar');
            expect(locs).not.to.equal(locals);
            var locs2 = cman.locals();
            expect(locs2).not.to.equal(locs);
        });
        it('should return the value a call to localValue if the supplied name exists in loals', function () {
            expect(cman.localValue('foo')).to.equal('bar');
            expect(cman.localValue('baz')).to.equal(undefined);
        });

        describe('hasValue', function () {
            it('should be a function', function () {
                expect(cman.hasValue).to.be.a('function');
            });
            it('should return true if the environment has a property with the given name', function () {
                env.hello = 'world!';
                expect(cman.hasValue('hello')).to.equal(true);
            });
            it('should return true if there is a local given name', function () {
                expect(cman.hasValue('foo')).to.equal(true);
            });
            it('should return true if the name is "source"', function () {
                expect(cman.hasValue('source')).to.equal(true);
            });
            it('should return false if no value with the given name exists', function () {
                expect(cman.hasValue('baz')).to.equal(false);
            });
        });
        describe('value', function () {
            it('should be a function', function () {
                expect(cman.value).to.be.a('function');
            });
            it('should return the local if there is one by the given name', function () {
                expect(cman.value('foo')).to.equal('bar');
            });
            it('should return the environment var if there is one by the given name', function () {
                env.hello = 'world!';
                expect(cman.value('hello')).to.equal('world!');
            });
            it('should return the source value supplied to the factory if name is "source"', function () {
                expect(cman.value('source')).to.equal(source);
            });
            it('should return undefined if the name does not exist in any of the above', function () {
                expect(cman.value('baz')).to.equal(undefined);
            });
        });
        describe('register', function () {
            it('should be a function', function () {
                expect(cman.register).to.be.a('function');
            });
            it('should ignore the object if it is not a non null object', function () {
                expect(cman.register(123)).to.equal(undefined);
            });
            it('should register the object as a local if it has an id property', function () {
                var obj = {};
                obj[contextManager.ID] = 'baz';
                cman.register(obj);
                expect(cman.hasValue('baz')).to.equal(true);
            });
            it('should handle circular references without any issue', function () {
                var obj = {};
                obj.obj = obj;
                obj[contextManager.ID] = 'baz';
                cman.register(obj);
                expect(cman.hasValue('baz')).to.equal(true);
            })
            it('should register any sub properties as locals if they have id properties', function () {
                var obj = {};
                obj[contextManager.ID] = 'baz';
                obj.sub1 = {};
                obj.sub1[contextManager.ID] = 'sub1';
                obj.sub2 = {};
                obj.sub2[contextManager.ID] = 'sub2';

                cman.register(obj);
                expect(cman.hasValue('baz')).to.equal(true);
                expect(cman.hasValue('sub1')).to.equal(true);
                expect(cman.hasValue('sub2')).to.equal(true);
            });
            it('should throw an error if no duplicate is true and an attempt is made to register a duplicate', function () {
                var obj1 = {}, obj2 = {};
                obj1[contextManager.ID] = 'baz';
                obj2[contextManager.ID] = 'baz';

                cman.register(obj1, true);
                expect(() => cman.register(obj2, true)).to.throw(/baz/i);
            });
        });
        describe('registered', function () {
            it('should be a function', function () {
                expect(cman.registered).to.be.a('function');
            });
            it('should return true if the value supplied is registered', function () {
                var obj = {}, obj2 = {};
                obj[contextManager.ID] = 'baz';
                cman.register(obj);
                cman.register(obj2);
                expect(cman.registered(obj)).to.equal(true);
                expect(cman.registered(obj2)).to.equal(false);
            });
        });
        describe('deregister', function () {
            it('should be a function', function () {
                expect(cman.deregister).to.be.a('function');
            });
            it('should ignore the object if it is not a non null object', function () {
                expect(cman.deregister(123)).to.equal(undefined);
            });
            it('should deregister the object as a local if it has an id property', function () {
                var obj = {};
                obj[contextManager.ID] = 'baz';

                cman.register(obj);
                expect(cman.hasValue('baz')).to.equal(true);

                cman.deregister(obj);
                expect(cman.hasValue('baz')).to.equal(false);
            });
            it('should handle circular references', function () {
                var obj = {};
                obj.obj = obj;
                obj[contextManager.ID] = 'baz';

                cman.register(obj);
                expect(cman.hasValue('baz')).to.equal(true);

                cman.deregister(obj);
                expect(cman.hasValue('baz')).to.equal(false);
            });
            it('should deregister any sub properties as locals if they have id properties', function () {
                var obj = {};
                obj[contextManager.ID] = 'baz';
                obj.sub1 = {};
                obj.sub1[contextManager.ID] = 'sub1';
                obj.sub2 = {};
                obj.sub2[contextManager.ID] = 'sub2';

                cman.register(obj);
                expect(cman.hasValue('baz')).to.equal(true);
                expect(cman.hasValue('sub1')).to.equal(true);
                expect(cman.hasValue('sub2')).to.equal(true);

                cman.deregister(obj);
                expect(cman.hasValue('baz')).to.equal(false);
                expect(cman.hasValue('sub1')).to.equal(false);
                expect(cman.hasValue('sub2')).to.equal(false);
            });
            it('should throw an error if an attempt is made to deregister an ID with the wrong object', function () {
                const obj1 = {},
                    obj2 = {};
                obj1[contextManager.ID] = 'foo';
                obj2[contextManager.ID] = 'foo';

                cman.register(obj1);
                expect(cman.registered(obj1)).to.equal(true);
                expect(() => cman.deregister(obj2)).to.throw(/deregister.*incorrect/i);
            });
        });
        describe('update', function () {
            it('should be a function', function () {
                expect(cman.update).to.be.a('function');
            });
            it('should update source if orig === source', function () {
                var updated = {};
                cman.update(source, updated);
                expect(cman.source()).to.equal(updated);
            });
            it('should update environment vars if orig === environment.<name>', function () {
                var updated = {};
                env.test = 'foo-bar-baz';
                expect(cman.value('test')).to.equal('foo-bar-baz');
                cman.update('foo-bar-baz', updated);
                expect(cman.value('test')).to.equal(updated);
            });
            it('should update local vars if orig === locals.<name>', function () {
                var updated = {};
                expect(cman.value('foo')).to.equal('bar');
                cman.update('bar', updated);
                expect(cman.value('foo')).to.equal(updated);
            });
            it('should do nothing if orig is not source, environment or local', function () {
                env.prop = 'hello world'; // For coverage
                expect(cman.update('foo-bar-baz', {})).to.equal(undefined);
            });
        });
    });
});
