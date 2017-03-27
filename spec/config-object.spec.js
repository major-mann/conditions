'use strict';

describe('Config object', function () {
    const EventEmitter = require('events'),
        mockery = require('mockery'),
        expression = require('../src/expression.js'),
        contextManager = require('../src/context-manager.js'),
        changeTrack = require('../src/change-tracker.js');
    var configObject = require('../src/config-object.js');

    describe('create', function () {
        it('should return null if the first parameter is null', function () {
            expect(configObject(null)).to.equal(null);
        });
        it('should return the first parameters if it is not an object', function () {
            expect(configObject('foo')).to.equal('foo');
            expect(configObject(123)).to.equal(123);
            expect(configObject(true)).to.equal(true);
            expect(configObject(false)).to.equal(false);
        });
        it('should return the first parameter if it is a config object', function () {
            var obj = configObject({});
            expect(configObject(obj)).to.equal(obj);
        });
        it('should return date directly', function () {
            var dt, res;
            dt = new Date();
            res = configObject(dt);
            expect(res.getTime()).to.equal(dt.getTime());
        });
        it('should return regexp directly', function () {
            var regex, res;
            regex = new RegExp('abc');
            res = configObject(regex);
            expect(res.toString()).to.equal(regex.toString());
        });
        it('should copy existing data across', function () {
            var obj = configObject({ foo: 'bar', hello: { response: 'world' } });
            expect(obj.foo).to.equal('bar');
            expect(configObject.is(obj.hello)).to.equal(true);
            expect(obj.hello.response).to.equal('world');
        });
    });

    describe('context', function () {
        it('should be a function', function () {
            expect(configObject.context).to.be.a('function');
        });
        it('should return the context manager attached to the config object', function () {
            var obj, ctx;
            obj = configObject({});
            ctx = configObject.context(obj);
            expect(ctx).to.be.an('object');
            expect(ctx.source).to.be.a('function');
            expect(ctx.name).to.be.a('function');
            expect(ctx.environment).to.be.a('function');
            expect(ctx.locals).to.be.a('function');
            expect(ctx.hasValue).to.be.a('function');
            expect(ctx.value).to.be.a('function');
            expect(ctx.localValue).to.be.a('function');
            expect(ctx.register).to.be.a('function');
            expect(ctx.deregister).to.be.a('function');
            expect(ctx.update).to.be.a('function');
        });
    });
    describe('events', function () {
        it('should be a function', function () {
            expect(configObject.events).to.be.a('function');
        });
        it('should return the events manager attached to the config object', function () {
            var obj, events;
            obj = configObject({});
            events = configObject.events(obj);
            expect(events instanceof EventEmitter).to.equal(true);
        });
    });
    describe('is', function () {
        it('should be a function', function () {
            expect(configObject.is).to.be.a('function');
        });
        it('should return true if the supplied value is a config object', function () {
            expect(configObject.is({})).to.equal(false);
            expect(configObject.is('foo bar')).to.equal(false);
            var obj = configObject({});
            expect(configObject.is(obj)).to.equal(true);
        });
    });

    describe('instance', function () {
        var obj, events;
        beforeEach(function () {
            obj = configObject({});
            events = configObject.events(obj);
        });
        it('should be a config object', function () {
            expect(configObject.is(obj)).to.equal(true);
        });
        it('should register the object with the context manager if the id property is set', function () {
            obj[contextManager.ID] = 'foo';
            obj.bar = 'baz';
            var context = configObject.context(obj);
            expect(context.locals().foo.bar).to.equal('baz');
        });
        it('should deregister the object with the context manager if the id property is deleted', function () {
            obj[contextManager.ID] = 'foo';
            obj.bar = 'baz';
            var context = configObject.context(obj);
            expect(context.locals().foo.bar).to.equal('baz');

            delete obj[contextManager.ID];
            expect(context.locals().foo).to.equal(undefined);
        });
        it('should handle circular references', function () {
            obj = {};
            obj.obj = obj;
            expect(configObject(obj)).to.be.an('object');
        });
        it('should raise a change event when a property has changed on the object', function () {
            var handler = chai.spy(changeHandler);
            events.on('change', handler);
            obj.foo = 'bar';
            expect(handler).to.have.been.called();

            function changeHandler(name, value, old) {
                expect(name).to.equal(name);
                expect(value).to.equal('bar');
                expect(old).to.equal(undefined);
            }
        });
        it('should raise a change event on the root when a property has changed on the object and it has an id', function () {
            var handler = chai.spy();

            obj.foo = 'bar';
            obj.sub = {
                bar: 'baz'
            };
            obj.sub[contextManager.ID] = 'ref';

            events.on('change', handler);
            obj.foo = 'baz';
            expect(handler).to.have.been.called.with('foo');

            obj.sub.bar = 'hello';
            expect(handler).to.have.been.called.with('ref.bar');

        });
        it('should not raise a change event on the root when a property has changed on the object, it has an id but a property with the same name as the id exists on the root', function () {
            var handler = chai.spy();

            obj.foo = 'bar';
            obj.sub = {
                bar: 'baz'
            };
            obj.ref = 'testing';
            obj.sub[contextManager.ID] = 'ref';

            events.on('change', handler);
            obj.foo = 'baz';
            expect(handler).to.have.been.called.with('foo');

            obj.sub.bar = 'hello';
            expect(handler).not.to.have.been.called.with('ref.bar');

        });
        it('should raise a change event for an expression when a property it is dependant on has changed', function () {
            var exp, handler, gotExpressionChange;
            obj.bar = 'foo';
            exp = function (context) { return context.call(this, 'test', 'bar') + 'baz'; };
            expression.prepareExpression(exp, ['bar']);
            expression.attach(obj, 'test', exp);
            handler = chai.spy(onChange);
            events.on('change', handler);
            obj.bar = 'bar';
            expect(handler).to.have.been.called.twice();

            function onChange(name, value, old) {
                if (name === 'bar') {
                    return;
                }
                gotExpressionChange = true;
                expect(name).to.equal('test');
                expect(value).to.equal('barbaz')
                expect(old).to.equal('foobaz')
            }
        });
        it('should not raise a change event for an expression when a property it is dependant on has changed, but the expression causes an exception on access', function () {
            var exp, handler, gotExpressionChange;
            obj.bar = 'foo';
            exp = function (context) { return context.call(this, 'test', 'dont-exist') + 'baz'; };
            expression.prepareExpression(exp, ['bar']);
            expression.attach(obj, 'test', exp);
            handler = chai.spy(onChange);
            events.on('change', handler);
            obj.bar = 'bar';
            expect(handler).to.have.been.called.once();

            function onChange(name, value, old) {
                expect(name).to.equal('bar');
                expect(value).to.equal('bar');
                expect(old).to.equal('foo');
            }
        });
        it('should raise a change event when a property has changed on a sub object', function () {
            obj.sub = {
                foo: 'bar'
            };
            var handler = chai.spy(function (name, value, old) {
                expect(name).to.equal('sub.foo');
                expect(value).to.equal('baz');
                expect(old).to.equal('bar');
            });
            events.on('change', handler);
            obj.sub.foo = 'baz';
            expect(handler).to.have.been.called.once();
        });
        it('should not raise a change event when a property has changed on a sub object, but the sub object is connected through a symbol', function () {
            var sym = Symbol('test');
            obj.sub = { };
            Object.defineProperty(obj.sub, sym, {
                enumerable: true,
                configurable: true,
                writable: true,
                value: 'bar'
            });
            var handler = chai.spy();
            events.on('change', handler);
            obj.sub[sym] = {
                bar: 'baz'
            };
            expect(handler).not.to.have.been.called();
        });
        it('should no longer raise a change event when a property has changed on a sub object that has been removed', function () {
            obj.sub = {
                foo: 'bar'
            };
            var handler = chai.spy();
            var sub = obj.sub;
            events.on('change', handler);
            sub.foo = 'baz';
            expect(handler).to.have.been.called.once();
            obj.sub = {};
            handler.reset();
            sub.foo = 'baz';
            expect(handler).not.to.have.been.called();
        });
        it('should raise a change event on the root prefixed with "<id>." when a property has changed on the object', function () {
            var sub1, sub2, exp, handler, changes;

            sub1 = { foo: 'bar' };
            sub1[contextManager.ID] = 'exp';
            sub2 = { };
            exp = function (context) {
                return context.call(this, 'baz', 'exp').foo + 'baz';
            };
            expression.prepareExpression(exp, ['exp.foo']);

            obj.sub1 = sub1;
            obj.sub2 = sub2;
            expression.attach(obj.sub2, 'baz', exp);

            changes = {
                root: false,
                rootRef: false,
                expression: false
            };

            handler = chai.spy(function (name, value, old) {
                switch (name) {
                    case 'sub1.foo':
                        expect(value).to.equal('baz');
                        expect(old).to.equal('bar');
                        changes.root = true;
                        break;
                    case 'exp.foo':
                        expect(value).to.equal('baz');
                        expect(old).to.equal('bar');
                        changes.expression = true;
                        break;
                    case 'sub2.baz':
                        expect(value).to.equal('bazbaz');
                        expect(old).to.equal('barbaz');
                        changes.rootRef = true;
                        break;
                    default:
                        throw new Error(`Did not expect event "${name}" to be emitted!`);
                }
            });
            events.on('change', handler);

            expect(obj.sub2.baz).to.equal('barbaz');
            debugger;
            obj.sub1.foo = 'baz';
            expect(obj.sub2.baz).to.equal('bazbaz');

            // Should see the following change events at the root
            //  sub1.foo -> For the sub object
            //  exp.foo -> For the ref change event
            //  sub2.baz -> For the expression
            expect(handler).to.have.been.called.exactly(3);
            expect(changes.root).to.equal(true);
            expect(changes.rootRef).to.equal(true);
            expect(changes.expression).to.equal(true);
        });
        it('should only raise a change event when the value has changed', function () {
            obj.sub = {
                foo: 'bar'
            };
            var handler = chai.spy();
            events.on('change', handler);
            obj.sub.foo = 'bar';
            expect(handler).not.to.have.been.called();
        });
        it('should only raise a change event on an array when the value has changed', function () {
            var tmp1 = {};
            Object.defineProperty(tmp1, 'foo', {
                enumerable: true,
                configurable: true,
                get: () => 'foo'
            });
            var tmp2 = configObject(tmp1); // Note: tmp1 and tmp2 are here for coverage
            expect(tmp2.foo).to.equal('foo');
            obj.sub = [1, 2, 3, 4, 5, tmp2];
            var handler = chai.spy();
            events.on('change', handler);
            obj.sub.length = 6;
            expect(handler).not.to.have.been.called();
        });
        it('should change object values into config objects when they are set as properties of a config object', function () {
            var sub = {};
            expect(configObject.is(sub)).to.equal(false);
            obj.sub = sub;
            expect(obj.sub).not.to.equal(sub);
            expect(configObject.is(obj.sub)).to.equal(true);
        });
        it('should raise a change event when a property is deleted', function () {
            var handler;
            obj.sub = {
                foo: 'bar'
            };
            handler = chai.spy();
            events.on('change', handler);

            // We do both for coverage
            delete obj.sub.foo;
            expect(handler).to.have.been.called.once();
            delete obj.sub;
            expect(handler).to.have.been.called.twice();
        });
        it('should not raise a change event if a property that does not exist is deleted', function () {
            obj.sub = {
                foo: 'bar'
            };
            var handler = chai.spy();
            events.on('change', handler);
            delete obj.sub.baz;
            expect(handler).not.to.have.been.called();
        });
        it('should cause an error when delete is called and readonly is true', function () {
            var obj = configObject({}, { readOnly: true });
            obj.sub = {
                foo: 'bar'
            };
            expect(() => { delete obj.sub.foo; }).to.throw(/foo/);
        });
        it('should raise a change event when a property is added', function () {
            obj.sub = { };
            var handler = chai.spy(function (name, value, old) {
                expect(name).to.equal('sub.foo');
                expect(value).to.equal('bar');
                expect(old).to.equal(undefined);
            });
            events.on('change', handler);
            obj.sub.foo = 'bar';
            expect(handler).to.have.been.called.once();
        });
        it('should raise a change event when a property is defined', function () {
            obj.sub = { };
            var handler = chai.spy(function (name, value, old) {
                expect(name).to.equal('sub.foo');
                expect(value).to.equal('bar');
                expect(old).to.equal(undefined);
            });
            events.on('change', handler);
            Object.defineProperty(obj.sub, 'foo', {
                enumerable: true,
                configurable: true,
                writable: true,
                value: 'bar'
            });
            expect(handler).to.have.been.called.once();
        });
        it('should not raise a change event when a property is defined, but the value does not change', function () {
            obj.sub = { foo: 'bar' };
            var handler = chai.spy();
            events.on('change', handler);
            Object.defineProperty(obj.sub, 'foo', {
                enumerable: true,
                configurable: true,
                writable: true,
                value: 'bar'
            });
            expect(handler).not.to.have.been.called();
        });
        it('should process a value from a property define if it is an object', function () {
            var updated = { hello: 'world' };
            obj.sub = { foo: 'bar' };
            var handler = chai.spy(function (name, value, old) {
                expect(name).to.equal('sub.foo');
                expect(value).to.be.an('object');
                expect(old).to.equal('bar');
            });
            events.on('change', handler);
            debugger;
            Object.defineProperty(obj.sub, 'foo', {
                enumerable: true,
                configurable: true,
                writable: true,
                value: updated
            });
            expect(handler).to.have.been.called.once();
            expect(obj.sub.foo).not.to.equal(updated);
            expect(configObject.is(obj.sub.foo)).to.equal(true);
            expect(obj.sub.foo.hello).to.equal('world');
        });
        it('should throw an error if an attempt is made to redefine a property when read only', function () {
            obj = configObject({}, { readOnly: true });

            def('bar');
            expect(() => def('baz')).to.throw(/foo/);

            function def(val) {
                Object.defineProperty(obj, 'foo', {
                    enumerable: true,
                    configurable: true,
                    writable: true,
                    value: val
                });
            }
        });
        it('should apply change tracking to the object', function () {
            expect(changeTrack.commit(obj)).to.equal(true);
        });
    });
});
