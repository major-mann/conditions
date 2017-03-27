'use strict';
describe('Expression module', function () {
    const FAKE_CONFIG = Symbol('fake-config');
    const mockery = require('mockery');
    var expression, configObject, context, contextName, contextValue,
        nothrow, exp, obj;

    beforeEach(function () {
        contextName = 'test-context';
        contextValue = {};
        context = {
            name: function name() {
                return  contextName;
            },
            value: function value(name) {
                if (contextValue.hasOwnProperty(name)) {
                    return contextValue[name];
                } else if (nothrow) {
                    return undefined;
                } else {
                    throw new Error(`${name} not found in context`);
                }
            },
            hasValue: function hasValue(name) {
                return contextValue.hasOwnProperty(name);
            }
        };

        configObject = {
            is: chai.spy(function is(obj) {
                if (obj && typeof obj === 'object') {
                    return obj[FAKE_CONFIG];
                } else {
                    return false;
                }
            }),
            context: chai.spy(function (obj) {
                return context;
            })
        };

        mockery.registerMock('./config-object.js', configObject);
        mockery.enable({
            useCleanCache: true,
            warnOnUnregistered: false
        });
        expression = require('../src/expression.js');

        exp = chai.spy(() => 'foobarbaz');
        expression.prepareExpression(exp, ['foo']);
        obj = {};
        obj[FAKE_CONFIG] = true;
        expression.attach(obj, 'test', exp);
    });

    afterEach(function () {
        mockery.disable();
        mockery.deregisterAll();
    });

    describe('attach', function () {
        it('should be a function', function () {
            expect(expression.attach).to.be.a('function');
        });
        it('should set the value if obj is an array', function () {
            var arr, set;
            set = chai.spy(function (target, name, value) {
                target[name] = value;
                return true;
            });
            arr = new Proxy([], {
                set
            });
            expression.attach(arr, 0, exp);
            expect(set).to.have.been.called.once();
        });
        it('should not attach a setter if options.readOnly is truthy', function () {
            expression.attach(obj, 'foo', exp, { readOnly: true });
            const desc = Object.getOwnPropertyDescriptor(obj, 'foo');
            expect(desc.get).to.be.a('function');
            expect(desc.set).to.equal(undefined);

        });
        it('should define the property if obj is not an array', function () {
            var obj, defProp;
            defProp = chai.spy(function (target, name, desc) {
                return Reflect.defineProperty(target, name, desc);
            });
            obj = new Proxy({}, {
                defineProperty: defProp
            });
            expression.attach(obj, 'foo', exp);
            expect(defProp).to.have.been.called.once();
        });
        it('should throw an Error if expression is not a function', function () {
            expect(() => expression.attach(obj, 'foo', 123)).to.throw(/function/);
        });
    });

    describe('clone', function () {
        it('should be a function', function () {
            expect(expression.clone).to.be.a('function');
        });
        it('should extract the existing expression from the getter and create a new one', function () {
            var desc, res;
            desc = Object.getOwnPropertyDescriptor(obj, 'test');
            res = expression.clone(desc.get);
            expect(res).to.be.a('function');
            expect(res()).to.equal('foobarbaz');
        });
        it('should allow an object and name to be specified to clone', function () {
            var res = expression.clone(obj, 'test');
            expect(res).to.be.a('function');
            expect(res()).to.equal('foobarbaz');
        });
        it('should throw an error if the object and name do not reference a getter', function () {
            expect(() => expression.clone(obj, 'fake')).to.throw(/fake/);
        });
        it('should throw an error if the supplied function is not a getter', function () {
            expect(() => expression.clone(function () {})).to.throw(/getter/);
        });
    });

    describe('clearOverride', function () {
        it('should be a function', function () {
            expect(expression.clearOverride).to.be.a('function');
        });
        it('should return false the supplied property is not an expression', function () {
            expect(expression.clearOverride(obj, 'fake')).to.equal(false);
        });
        it('should clear any set override of an expression', function () {
            expect(obj.test).to.equal('foobarbaz');
            obj.test = 'hello';
            expect(obj.test).to.equal('hello');
            expression.clearOverride(obj, 'test');
            expect(obj.test).to.equal('foobarbaz');

            /* obj = new Proxy([], {
                get: function (target, name) {
                    if (name === '0' && typeof target[name].get === 'function') {
                        return target[name].get();
                    } else {
                        return target[name];
                    }
                }
            });*/
            obj = [];
            expression.attach(obj, 0, function () { return 'foo' });
            expect(obj[0].get.call(obj)).to.equal('foo');
            obj[0].set('bar');
            expect(obj[0].get.call(obj)).to.equal('bar');
            expression.clearOverride(obj, 0);
            expect(obj[0].get.call(obj)).to.equal('foo');
        });
        it('should return true if an override was cleared', function () {
            expect(obj.test).to.equal('foobarbaz');
            obj.test = 'hello';
            expect(obj.test).to.equal('hello');
            expect(expression.clearOverride(obj, 'test')).to.equal(true);
            expect(obj.test).to.equal('foobarbaz');
        });
        it('should return false if no override was cleared', function () {
            expect(obj.test).to.equal('foobarbaz');
            obj.test = 'hello';
            expect(obj.test).to.equal('hello');
            expect(expression.clearOverride(obj, 'test')).to.equal(true);
            expect(obj.test).to.equal('foobarbaz');
            expect(expression.clearOverride(obj, 'test')).to.equal(false);
        });
    });

    describe('copy', function () {
        it('should be a function', function () {
            expect(expression.copy).to.be.a('function');
        });
        it('should copy the expression from the source to the destination', function () {
            var dest = {};
            expression.copy(obj, 'test', dest, 'prop');
            expect(dest.prop).to.equal('foobarbaz');
            expect(exp).to.have.been.called.once();
        });
    });

    describe('is', function () {
        it('should be a function', function () {
            expect(expression.is).to.be.a('function');
        });
        it('should return false when busy checking an array value', function () {
            var arr, get;
            get = chai.spy(function (target, name) {
                expect(expression.is(arr, 0)).to.equal(false);
                return target[name];
            });
            arr = new Proxy([], {
                get
            });
            expression.is(arr, 0, exp);
            expect(get).to.have.been.called.once();
        });
        it('should return true if the property is an expression', function () {
            expect(expression.is(obj, 'test')).to.equal(true);
        });
        it('should return false if the property is not an expression', function () {
            expect(expression.is(obj, 'fake')).to.equal(false);
        });
        it('should return false if the supplied value is not an object', function () {
            expect(expression.is('fake')).to.equal(false);
        });
    });

    describe('prepareExpression', function () {
        it('should be a function', function () {
            expect(expression.prepareExpression).to.be.a('function');
        });
        it('should attach a symbol to the object if it is custom', function () {
            var test = () => {};
            expect(Object.getOwnPropertySymbols(test).length).to.equal(0);
            expression.prepareExpression(test, undefined, true);
            expect(Object.getOwnPropertySymbols(test).length).to.equal(1);
        });
        it('should attach a symbol to the object if it has dependencies', function () {
            var test = () => {};
            expect(Object.getOwnPropertySymbols(test).length).to.equal(0);
            expression.prepareExpression(test, []);
            expect(Object.getOwnPropertySymbols(test).length).to.equal(1);
        });
    });

    describe('dependantOn', function () {
        it('should be a function', function () {
            expect(expression.dependantOn).to.be.a('function');
        });
        it('should check whether the supplied dependency is in the dependencies list for the property', function () {
            expect(expression.dependantOn(obj, 'test', 'foo')).to.equal(true);
        });
        it('should return false if the supplied value is not an accessor', function () {
            obj.bar = 'baz';
            expect(expression.dependantOn(obj, 'bar', 'foo')).to.equal(false);
        });
    });

    describe('context', function () {
        var proto;
        beforeEach(function () {
            proto = {};
            proto.bar = 'baz';
            proto[FAKE_CONFIG] = true;
            Object.setPrototypeOf(obj, proto);
        });
        it('should be a function', function () {
            expect(expression.context).to.be.a('function');
        });
        it('should return the property from this if it exists', function () {
            var self = { prop: 'hello world' };
            expect(expression.context.call(self, '', 'prop')).to.equal('hello world');
        });
        it('should return the property the context if it exists there', function () {
            contextValue.contextProp = 'hello world';
            expect(expression.context.call(obj, '', 'contextProp')).to.equal('hello world');
        });
        it('should return the property value from the base if name is "base"', function () {
            expect(expression.context.call(obj, 'bar', 'base')).to.equal('baz');
        });
        it('should return undefined if name is "base" and no property exists on the base', function () {
            expect(expression.context.call({}, 'bar', 'base')).to.equal(undefined);
        });
        it('should return the value from the prototype', function () {
            expect(expression.context.call(obj, '', 'bar')).to.equal('baz');
        });
        it('should throw an error if name is not found', function () {
            expect(() => expression.context.call({}, '', 'dontexist')).to.throw(/dontexist/);
        });
        it('should add the context name to the error', function () {
            expect(() => expression.context.call({}, '', 'dontexist')).to.throw(new RegExp(contextName));
        });
        it('should not the context name to the error if it has none', function () {
            var cname = contextName;
            contextName = undefined;
            try {
                expression.context.call({}, '', 'dontexist');
            } catch (ex) {
                expect(ex.message).not.to.match(new RegExp(cname));
            }

            delete context.name;
            try {
                expression.context.call({}, '', 'dontexist');
            } catch (ex) {
                expect(ex.message).not.to.match(new RegExp(cname));
            }
        });
        it('should return undefined if name is not found but nothrow is true', function () {
            expect(expression.context.call({}, '', 'dontexist', true)).to.equal(undefined);
        });
    });
});
