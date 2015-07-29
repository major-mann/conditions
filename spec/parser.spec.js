describe('configuration parser', function () {

    var parse = require('../src/parser.js'),
        fs = require('fs');

    describe('checks', function() {
        it('should ensure the supplied data is a string', function () {
            expect(parse.bind(null, { })).toThrowError(/must.*string/i);
            expect(parse.bind(null, true)).toThrowError(/must.*string/i);
            expect(parse.bind(null, function () { })).toThrowError(/must.*string/i);
            expect(parse.bind(null, 123)).toThrowError(/must.*string/i);
        });
        it('should return null when the supplied str is empty', function() {
            expect(parse('')).toBe(null);
        });
        it('should ensure the supplied config file defines an object or array at its root', function () {
            expect(parse.bind(null, data('invalid'))).toThrowError(/object.*array/i);
        });
        it('should not allow calls to functions which are illegal', function () {
            expect(parse.bind(null, data('illegal'))).toThrowError(/illegal/i);
        });
        it('should prevent illegal expression types from being used', function () {
            expect(parse.bind(null, data('illegalexpression'))).toThrowError(/illegal/i);
        });
    });

    describe('root', function () {
        it('should allow an object to be defined at the root, and should return an object when parsed', function () {
            var val = parse(data('object'));
            expect(val).toEqual(jasmine.any(Object));
        });
        it('should allow an array to be defined at the root, and should return an array when parsed', function () {
            var val = parse(data('array'));
            expect(val).toEqual(jasmine.any(Array));
        });
    });

    describe('literals', function () {
        var config;
        beforeEach(function () {
            config = parse(data('literal'));
        });
        it('should return a string when a string property is defined', function () {
            expect(config.str).toBe('foo bar');
        });
        it('should return a number when a number property is defined', function () {
            expect(config.num).toBe(10);
        });
        it('should return a boolean when a boolean property is defined', function () {
            expect(config.bool).toBe(true);
        });
        it('should return undefined when a undefined property is defined', function () {
            expect(config.undefined).toBe(undefined);
        });
        it('should return null when null is defined', function () {
            expect(config.nul).toBe(null);
        });
        it('should return a regular expression when a regular expression is defined', function () {
            expect(config.rex).toEqual(jasmine.any(RegExp));
            expect(config.rex.source).toBe('abc');
            expect(config.rex.global).toBe(true);
            expect(config.rex.multiline).toBe(false);
            expect(config.rex.ignoreCase).toBe(true);
        });
    });

    describe('objects', function () {
        it('should parse sub objects in the configuration', function () {
            var val = parse(data('object'));
            expect(val).toEqual(jasmine.any(Object));
            expect(val.sub).toEqual(jasmine.any(Object));
            expect(val.sub.foo).toBe('bar');
        });
        it('should parse sub arrays in the configuration', function () {
            var val = parse(data('object'));
            expect(val).toEqual(jasmine.any(Object));
            expect(val.sub).toEqual(jasmine.any(Object));
            expect(val.sub.baz).toEqual(jasmine.any(Array));
            expect(val.sub.baz[0]).toBe(1);
            expect(val.sub.baz[1]).toBe(2);
            expect(val.sub.baz[2]).toBe(3);

        });
    });

    describe('expressions', function () {
        var val, env = { env: 'foo bar' };
        beforeEach(function () {
            val = parse(data('expressions'), env);
        });

        it('should return the value of the expression', function () {
            expect(val.exp1).toBe(20);
            expect(val.exp2).toBe('foo bar');
            expect(val.exp3).toBe('foo bar');
        });
        it('should allow expressions to reference object by their id', function () {
            expect(val.sub.exp4).toBe(30);
        });
        it('should allow configuration values on the current object to be referenced by name', function () {
            expect(val.exp6).toBe(30);
        });
        it('should allow configuration values on the current object to be through this', function () {
            expect(val.exp7).toBe('foo bar baz');
        });
        it('should use values on the second object passed to the parse function in expressions', function () {
            expect(val.exp8).toBe('foo bar baz');
        });
    });

    describe('errors', function() {
        it('should report the line and column of an error when one occurs', function () {
            var d = data('syntaxerror');
            expect(parse.bind(null, d)).toThrowError(/line.*6/i);

        });
        it('should report the line and column when an error occurs in an expression', function () {
            var val = parse(data('error'));
            expect(get).toThrowError(/line.*column/i);
            function get() {
                return val.invalid;
            }
        });
    });

    /** Reads the contents from the specified data file */
    function data(file) {
        return fs.readFileSync('./spec/data.' + file + '.config', { encoding: 'utf8' });
    }

});