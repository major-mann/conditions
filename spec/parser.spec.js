describe('configuration parser', function () {
    /* jshint maxlen: 200 */
    'use strict';

    var parse = require('../src/parser.js'),
        fs = require('fs');

    beforeEach(function () {
        delete require.cache[require.resolve('../src/parser.js')];
        parse = require('../src/parser.js');
    });

    describe('checks', function() {
        it('should ensure the supplied data is a string', function () {
            expect(parse.bind(null, { })).to.throw(/must.*string/i);
            expect(parse.bind(null, true)).to.throw(/must.*string/i);
            expect(parse.bind(null, function () { })).to.throw(/must.*string/i);
            expect(parse.bind(null, 123)).to.throw(/must.*string/i);
        });
        it('should return null when the supplied str is empty', function() {
            expect(parse('')).to.equal(null);
        });
        it('should ensure the supplied config file defines an object or array at its root', function () {
            expect(parse.bind(null, data('invalid'))).to.throw(/object.*array/i);
        });
        it('should not allow calls to functions which are illegal', function () {
            expect(parse.bind(null, data('illegal'))).to.throw(/illegal/i);
        });
        it('should prevent illegal expression types from being used', function () {
            expect(parse.bind(null, data('illegalexpression'))).to.throw(/illegal/i);
        });
    });

    describe('root', function () {
        it('should allow an object to be defined at the root, and should return an object when parsed', function () {
            var val = parse(data('object'));
            expect(val).to.be.an('object');
        });
        it('should allow an array to be defined at the root, and should return an array when parsed', function () {
            var val = parse(data('array'));
            expect(val).to.be.an('array');
        });
    });

    describe('literals', function () {
        var config;
        beforeEach(function () {
            config = parse(data('literal'));
        });
        it('should return a string when a string property is defined', function () {
            expect(config.str).to.equal('foo bar');
        });
        it('should return a number when a number property is defined', function () {
            expect(config.num).to.equal(10);
        });
        it('should return a boolean when a boolean property is defined', function () {
            expect(config.bool).to.equal(true);
        });
        it('should return undefined when a undefined property is defined', function () {
            expect(config.undefined).to.equal(undefined);
        });
        it('should return null when null is defined', function () {
            expect(config.nul).to.equal(null);
        });
        it('should return a regular expression when a regular expression is defined', function () {
            expect(config.rex).to.be.a('regexp');
            expect(config.rex.source).to.equal('abc');
            expect(config.rex.global).to.equal(true);
            expect(config.rex.multiline).to.equal(false);
            expect(config.rex.ignoreCase).to.equal(true);
        });
    });

    describe('interpolation', function () {
        var config;
        beforeEach(function () {
            config = parse(data('interpolation'));
        });
        it('should return the value with the variables interpolated into the string', function () {
            expect(config.value).to.equal('hello cruel world!');
        });
        it('should return a new value if any of the variables have changed', function () {
            expect(config.value).to.equal('hello cruel world!');
            config.type = 'good';
            expect(config.value).to.equal('hello good world!');
        });
    });

    describe('objects', function () {
        it('should parse sub objects in the configuration', function () {
            var val = parse(data('object'));
            expect(val).to.be.an('object');
            expect(val.sub).to.be.an('object');
            expect(val.sub.foo).to.equal('bar');
        });
        it('should parse sub arrays in the configuration', function () {
            var val = parse(data('object'));
            expect(val).to.be.an('object');
            expect(val.sub).to.be.an('object');
            expect(val.sub.baz).to.be.an('array');
            expect(val.sub.baz[0]).to.equal(1);
            expect(val.sub.baz[1]).to.equal(2);
            expect(val.sub.baz[2]).to.equal(3);
        });
    });

    describe('sequence', function () {
        var val = parse(data('sequence'));
        expect(val).to.be.an('array');
        expect(val.length).to.equal(3);
        expect(val[0]).to.equal('foo');
        expect(val[1]).to.equal('bar');
        expect(val[2]).to.equal('baz');
    });

    describe('expressions', function () {
        var val, env = { env: 'foo bar' };
        beforeEach(function () {
            val = parse(data('expressions'), { environment: env });
        });
        it('should return the value of the expression', function () {
            expect(val.exp1).to.equal(20);
            expect(val.exp2).to.equal('foo bar');
            expect(val.exp3).to.equal('foo bar');
        });
        it('should allow expressions to reference object by their id', function () {
            expect(val.sub.exp4).to.equal(30);
        });
        it('should allow configuration values on the current object to be referenced by name', function () {
            expect(val.exp6).to.equal(30);
        });
        it('should treat literal strings inside template literals as a normal string instead of expression', function () {
            expect(val.literal).to.equal('template-txt');
            const desc = Object.getOwnPropertyDescriptor(val, 'literal');
            expect(desc.value).to.equal('template-txt');
        });
        it('should allow configuration values on the current object to be through this', function () {
            expect(val.exp7).to.equal('foo bar baz');
        });
        it('should allow a value to be set to override expression values', function () {
            val = parse(data('array-expression'), { });
            const test = Symbol('test');
            val.hello.world[test] = 'foo bar'; // For coverage
            expect(val.hello.world[0]).to.equal(1);
            val.hello.world[0] = 'testing';
            expect(val.hello.world[0]).to.equal('testing');

            expect(val.hello.world[1]).to.equal(2);
            val.hello.world[1] = 'testing';
            expect(val.hello.world[1]).to.equal('testing');
        });
        it('should use values from options.environment to the parse function in expressions', function () {
            expect(val.exp8).to.equal('foo bar baz');
        });
        it('should not allow new expressions', function () {
            expect(parse.bind(null, '{ foo: new Date() }')).to.throw(/not.*supported/i);
        });
        it('should not throw an error if an undefined identier us used with typeof', function () {
            const config = parse('{ foo: typeof dontexist }');
            expect(config.foo).to.equal('undefined');
        });
        it('should not allow new expressions', function () {
            expect(parse.bind(null, '{ foo: new Date() }')).to.throw(/not.*supported/i);
        });
        it('should not allow assignment expressions', function () {
            expect(parse.bind(null, '{ foo: Date = 10 }')).to.throw(/not.*supported/i);
        });
        it('should parse constant expressions to normal values', function () {
            expect(val.constant).to.equal(2500);
            val.constant = 100;
            expect(val.constant).to.equal(100);
        });
        it('should allow expressions to be used in arrays', function () {
            val = parse(data('array-expression'), { });
            expect(val.hello.world).to.be.an('array');
            expect(val.hello.world.length).to.equal(3);
            expect(val.hello.world[0]).to.equal(1);
            expect(val.hello.world[1]).to.equal(2);
            expect(val.hello.world[2]).to.equal(3);
            val.foo.bar = 5;
            expect(val.hello.world[0]).to.equal(1);
            expect(val.hello.world[1]).to.equal(5);
            expect(val.hello.world[2]).to.equal(3);
        });
    });

    describe('errors', function() {
        it('should report the line and column of an error when one occurs', function () {
            var d = data('syntaxerror'), cfg;
            expect(parse.bind(null, d)).to.throw(/line.*6/i);

            var env = {}, err;
            Object.defineProperty(env, 'env', {
                enumerable: true,
                configurable: true,
                get: function () {
                    if (err) {
                        throw new Error('fake');
                    }
                }
            });

            d = data('expressions');
            cfg = parse(d, { environment: env });
            err = true;
            expect(function () { return cfg.exp8; }).to.throw();
        });
        it('should report the line and column when an error occurs in an expression', function () {
            var val = parse(data('error'));
            expect(get).to.throw(/line.*column/i);
            function get() {
                return val.invalid;
            }
        });
        it('should report the context from options if one was supplued', function () {
            var val = parse(data('error'), { context: 'fakefile' });
            expect(get).to.throw(/fakefile/i);
            function get() {
                return val.invalid;
            }
        });
    });

    /** Reads the contents from the specified data file */
    function data(file) {
        return fs.readFileSync('./spec/data/data.' + file + '.config', { encoding: 'utf8' });
    }

});
