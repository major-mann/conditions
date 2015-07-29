(function parser(module) {
    'use strict';

    //Public API
    module.exports = parse;

    //Constants
    var VALID_GLOBALS = ['Infinity', 'NaN', 'undefined', 'Object', 'Number', 'String', 'RegExp', 
            'Boolean', 'Array', 'Error', 'EvalError', 'InternalError', 'RangeError', 'ReferenceError', 'SyntaxError', 
            'TypeError', 'URIError', 'Math', 'Date', 'isFinite', 'isNaN', 'parseFloat', 'parseInt', 'decodeURI', 
            'decodeURIComponent', 'encodeURI', 'ecodeURIComponent', 'escape', 'unescape'],
        ILLEGAL_GLOBALS = ['eval', 'Function'];

    //Dependencies
    var esprima = require('esprima'),
        escodegen = require('escodegen');

    /**
    * Parses the supplied data, attempting to build up a config object.
    * @param {string} str The data to parse.
    * @param {object} environment Additional values to add to the scope.
    * @returns {object} The config root object or array.
    * @throws Error When str is not a string.
    */
    function parse(str, environment) {
        var code, locals = new LocalStack();

        //Ensure the data is valid
        if (typeof(str) !== 'string') {
            throw new Error('str MUST be a string');
        }

        //If the string is empty, return null.
        if (!str) {
            return null;
        }

        //Make sure environment is an object
        if (!environment || typeof(environment) !== 'object') {
            environment = { };
        }

        //Wrap to force expression
        str = '(' + str + ')';

        //Get an AST representing the configuration
        code = esprima.parse(str, {
            loc: true
        });

        //Extracts the root node
        code = extractConfigRoot(code);

        //Check the root type, and make sure we have an object
        //  or an array.
        switch (code.type) {
            case 'ObjectExpression':
                return parseObject(code);
            case 'ArrayExpression':
                return parseArray(code);
            default:
                throw new Error(errorMessage('configuration MUST have an object or array as the root element. Got "' + code.type + '"', code));
        }

        /** Returns the value represented by the supplied literal block */
        function parseLiteral(block) {
            if (block.regex) {
                return new RegExp(block.regex.pattern, block.regex.flags);
            } else {
                return block.value;
            }
        }

        /**
        * Parses an array expression, and returns an array.
        * @param {object} block The ArrayExpression to parse.
        * @returns {array} The Array representing the supplied block.
        */
        function parseArray(block) {
            return block.elements.map(parseBlock);
        }

        /**
        * Parses the supplied block
        * @param {object} block The block representing the object
        */
        function parseObject(block) {
            var result = { },
                props,
                locs;

            //Push onto the local stack
            locals.push();

            //Parse all the properties
            props = block.properties
                .filter(processId)
                .map(parseProperty);

            //Assign the properties to the object
            props.forEach(assignProp);

            //Flatten locals after assigning the props
            locs = locals.flatten();

            //We are done with this level of the stack
            locals.pop();

            return result;

            /** Checks if this is an identifier id prop. If it is, adds it to locals, and returns false so it is removed. */
            function processId(prop) {
                var name;
                switch (prop.type) {
                    case 'Property':
                        name = propName(prop.key);
                        if (name === 'id' && prop.value.type === 'Identifier') {
                            locals.set(prop.value.name, result);
                            return false;
                        } else {
                            return true;
                        } // jshint ignore:line
                    default:
                        throw new Error(errorMessage('unsupported property type "' + prop.type + '"', prop));
                }
            }
            
            /**
            * Parses a "Property" block, returning an object containing a name and value for it
            * @prop {object} The property block to parse.
            */
            function parseProperty(prop) {
                var name, value;
                name = propName(prop.key);
                value = parseBlock(prop.value);
                return {
                    name: name,
                    value: value
                };
            }

            /**
            * Returns a literal value, or identifier name depending on the block type supplied.
            */
            function propName(block) {
                switch (block.type) {
                    case 'Literal':
                        return block.value;
                    case 'Identifier':
                        return block.name;
                    default:
                        throw new Error(errorMessage('unable to determine a property name from a "' + block.type + '" block', block));
                }
            }

            /**
            * Assigns the property to the result
            * @param {object} prop The property object as returned from parseProperty.
            */
            function assignProp(prop) {
                var writable, definition;

                //If the object is an object, array or getter (function) it is not writable or configurable
                writable = !Array.isArray(prop.value) &&
                    typeof(prop.value) !== 'object' &&
                    typeof(prop.value) === 'function';

                //Create the base definition
                definition = {
                    configurable: writable,
                    enumerable: true
                };

                //Do we have a getter, or a normal value
                if (typeof(prop.value) === 'function') {
                    definition.get = prop.value.bind(null, context);
                } else {
                    definition.writable = writable;
                    definition.value = prop.value;
                }

                //Define the property on the result
                Object.defineProperty(result, prop.name, definition);

                /**
                * Returns the value of the variable in the current context.
                * @param {string} name The variable to retrieve the value of.
                */
                function context(name) {
                    var value;
                    if (result.hasOwnProperty(name)) {
                        value = result[name];
                    } else if (locs.hasOwnProperty(name)) {
                        value = locs[name];
                    } else if (environment.hasOwnProperty(name)) {
                        value = environment[name];
                    } else {
                        throw new Error('identifier named "' + name + '" not found!');
                    }

                    return value;
                }
            }
        }

        /**
        * Wraps the block expression with a return, and in turn wraps
        *   that in a function, and then generates the appropriate code,
        *   and returns a function which executes the expression with the
        *   given context.
        */
        function parseExpression(oblock) {
            var body, func, result, block = oblock;

            //Ensure we are not doing something invalid.
            validateBlock(block);

            //Process the identifiers
            block = processIdentifiers(block);

            //Wrap the expression with a return statement
            block = {
                type: 'ReturnStatement',
                argument: block
            };

            //Generate the code
            body = escodegen.generate(block);

            //Create the getter function
            func = new Function(['context'], body); // jshint ignore:line

            //Build a function which will give us line and column information.
            result = function (context) {
                var val, e;
                try {
                    val = func(context);
                } catch (err) {
                    e = prepareError(err, oblock);
                    throw e;
                }
                return val;
            };

            return result;

            /**
            * Replaces identifiers that are not in the list of VALID_GLOBALS with a call to
            * context with the name of the identifier.
            */
            function processIdentifiers(obj) {
                //Note: While in most normal situations we would have to deal with adding
                //  the variables to some collection so they can be excluded from processing
                //  when adjusting the root identifiers. However, in this case we do not allow
                //  variable declarations in the expression, so we cannot have any to add.

                return processBlock(obj);

                /** Processes a block for potential identifiers. */
                function processBlock(block) {
                    var i;
                    switch(block.type) {
                        case 'ConditionalExpression':
                            processBlock(block.test);
                            processBlock(block.consequent);
                            processBlock(block.alternate);
                            break;
                        case 'ObjectExpression':
                            for (i = 0; i < block.properties.length; i++) {
                                processPotentialIdentifier(block.properties[i], 'value');
                            }
                            break;
                        case 'BinaryExpression':
                            processPotentialIdentifier(block, 'left');
                            processPotentialIdentifier(block, 'right');
                            break;
                        case 'MemberExpression':
                            processPotentialIdentifier(block, 'object');
                            break;
                        case 'ArrayExpression':
                            for (i = 0; i < block.elements.length; i++) {
                                processPotentialIdentifier(block.elements, i);
                            }
                            break;
                        case 'CallExpression':
                            processPotentialIdentifier(block, 'callee');
                            for (i = 0; i < block.arguments.length; i++) {
                                processPotentialIdentifier(block.arguments, i);
                            }
                            break;
                        case 'UnaryExpression':
                            processPotentialIdentifier(block, 'argument');
                            break;
                        case 'Identifier':
                            block = processIdentifierBlock(block);
                            break;
                        case 'Literal':
                            //Nothing to process
                            break;
                        default:
                            throw new Error('invalid program! Got ' + block.type);
                    }

                    return block;

                    /** 
                    * Checks whether the property on block is an identifier.
                    * If it is, it is processed, otherwise the block is recursively processed.
                    */
                    function processPotentialIdentifier(block, property) {
                        if (block[property].type === 'Identifier') {
                            processIdentifier(block, property);
                        } else {
                            processBlock(block[property]);
                        }
                    }

                    /** Processes the identifier on the supplied block at the supplied property */
                    function processIdentifier(block, property) {
                        block[property] = processIdentifierBlock(block[property]);
                    }

                    /** Replaces the identifier block if necesary, otherwise just returns the supplied block unmodified. */
                    function processIdentifierBlock(block) {
                        if (VALID_GLOBALS.indexOf(block.name) === -1) {
                            if (ILLEGAL_GLOBALS.indexOf(block.name) > -1) {
                                throw new Error(errorMessage('use of "' + block.name + '" is illegal', block));
                            } else {
                                block = {
                                    type: 'CallExpression',
                                    callee: {
                                        type: 'Identifier',
                                        name: 'context'
                                    },
                                    arguments: [
                                        { type: 'Literal', value: block.name }
                                    ]
                                };
                            }
                        }
                        return block;
                    }
                }
            }

            /** Ensures blocks are valid */
            function validateBlock(obj) {
                var keys;
                if (obj && typeof(obj) === 'object') {
                    if (obj.type) {
                        if (!blockSupported(obj)) {
                            throw new Error(errorMessage('"' + obj.type + '" block is illegal in expressions.', obj));
                        }
                    }
                    keys = Object.keys(obj)
                        .forEach(val);
                }

                /** returns the named value from the object */
                function val(name) {
                    validateBlock(obj[name]);
                }
            }

            /** Attempts to add line and column information to an error */
            function prepareError(err, block) {
                if (err instanceof Error) {
                    err.message = errorMessage(err.message, block);
                } else {
                    err = errorMessage(err, block);
                }
                return err;
            }
        }

        /**
        * Parses the supplied block into a value.
        * @param {object} block The block to parse
        */
        function parseBlock(block) {
            var supported = blockSupported(block);
            if (supported) {
                switch (block.type) {
                    case 'ObjectExpression':
                        return parseObject(block);
                    case 'ArrayExpression':
                        return parseArray(block);
                    case 'Literal':
                        return parseLiteral(block);
                    case 'ConditionalExpression':
                    case 'BinaryExpression':
                    case 'MemberExpression':
                    case 'UnaryExpression':
                    case 'CallExpression':
                    case 'Identifier':
                    case 'Property':
                        return parseExpression(block);
                    default:
                        throw new Error('Critical errorInvalid program!');
                }
            } else {
                throw new Error(errorMessage('blocks of type "' + block.type + '" not supported', block));
            }
        }

        /** Checks whether the supplied block type is supported in expressions. */
        function blockSupported(block) {
            switch (block.type) {
                case 'ConditionalExpression':
                case 'ObjectExpression':
                case 'BinaryExpression':
                case 'MemberExpression':
                case 'UnaryExpression':
                case 'ArrayExpression':
                case 'CallExpression':
                case 'Identifier':
                case 'Property':
                case 'Literal':
                    return true;

                case 'ExpressionStatement':
                case 'ContinueStatement':
                case 'LabeledStatement':
                case 'SwitchStatement':
                case 'ReturnStatement':
                case 'BreakStatement':
                case 'BlockStatement':
                case 'ThrowStatement':
                case 'WhileStatement':
                case 'WhileStatement':
                case 'ForInStatement':
                case 'ForOfStatement':
                case 'EmptyStatement':
                case 'WithStatement':
                case 'TryStatement':
                case 'ForStatement':
                case 'LetStatement':
                case 'IfStatement':
                case 'AssignmentExpression':
                case 'SequenceExpression':
                case 'FunctionExpression':
                case 'UpdateExpression':
                case 'YieldExpression':
                case 'ArrowExpression':
                case 'ThisExpression':
                case 'NewExpression':
                case 'FunctionDeclaration':
                case 'VariableDeclaration':
                case 'VariableDeclarator':
                
                case 'Program':
                    return false;
                
                default:
                    throw new Error(errorMessage('unrecognized block type "' + block.type + '"', block));
            }
        }

        /**
        * Extracts the configuration root which could be an object expression,
        *   or an array expression. If the contents of the expression statement
        *   is not one of those 2, an Error is thrown.
        * @param {object} code The esprima program node.
        * @return {object} The root expression.
        */
        function extractConfigRoot(code) {
            if (code.body.length > 1) {
                throw new Error(errorMessage('configuration may not may have multiple root values', code));
            } else {
                return code.body[0].expression;
            }
        }

        /** Creates an error with line and column information. */
        function errorMessage(msg, block) {
            var pos;
            if (block.loc) {
                pos = '\nLine: %s. Column: %s'
                    .replace('%s', block.loc.start.line)
                    .replace('%s', block.loc.start.column);
            } else {
                pos = '';
            }
            return msg + pos;
        }

        /** A stack system for managing local variable ids. */
        function LocalStack() {

            var stack = [];

            this.set = set;
            this.pop = pop;
            this.push = push;
            this.flatten = flatten;

            /** Sets a value for the current frame */
            function set(name, val) {
                var frame = stack[stack.length - 1];
                if (frame) {
                    frame[name] = val;
                }
            }

            /** Pops the top frame off the stack */
            function pop() {
                stack.pop();
            }

            /** Adds a frame to the stack */
            function push() {
                stack.push({});
            }

            /** Returns an object copying the local values upwards through the stack */
            function flatten() {
                var i, j, k, keys, copy = { };
                for (i = 0; i < stack.length; i++) {
                    keys = Object.keys(stack[i]);
                    for (j = 0; j < keys.length; j++) {
                        k = keys[j];
                        copy[k] = stack[i][k];
                    }
                }
                return copy;
            }
        }
    }

}(module));