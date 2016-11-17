/**
 * @module Parser module. This module is responsible for parsing the text into an config object
 *  which can then be read by the consumer.
 */
(function parser(module) {
    'use strict';

    // Public API
    module.exports = parse;
    // Constants
    module.exports.PROPERTY_ID = 'id';
    module.exports.PROPERTY_PROTOTYPE_ID = 'id';
    module.exports.PROPERTY_PROTOTYPE_ENVIRONMENT = '$environment';
    module.exports.PROPERTY_PROTOTYPE_LOCALS = '$locals';
    module.exports.PROPERTY_BASE_NAME = 'base';
    module.exports.VALID_GLOBALS = ['Infinity', 'NaN', 'undefined', 'Object', 'Number', 'String',
        'RegExp', 'Boolean', 'Array', 'Error', 'EvalError', 'InternalError', 'RangeError',
        'ReferenceError', 'SyntaxError', 'TypeError', 'URIError', 'Math', 'Date', 'isFinite',
        'isNaN', 'parseFloat', 'parseInt', 'decodeURI', 'decodeURIComponent', 'encodeURI',
        'encodeURIComponent', 'escape', 'unescape'];
    module.exports.ILLEGAL_GLOBALS = ['eval', 'Function'];

    // Dependencies
    var esprima = require('esprima'),
        escodegen = require('escodegen'),
        // TODO: Replace with common extend once it is written
        lodash = require('lodash');

    /**
    * Parses the supplied data, attempting to build up a config object.
    * @param {string} str The data to parse.
    * @param {object} options The options to use when parsing the data. The following options are
    *   supported:
    *       * {object} environment - Environment variables to pass to the expressions.
    *       * {boolean} protectStructure - True to make object, array and getters non configurable.
    *           Defaults to false.
    *       * {boolean}  readOnly - True to disable any setting of properties. Defaults to false.
    *       * {function} custom - A function to call that allows custom expressions functions
    *           to be constructed.
    * @throws {error} When str is not a string.
    */
    function parse(str, options) {
        var code, config, locals = { };

        // Ensure the data is valid
        if (typeof str !== 'string') {
            throw new Error('str MUST be a string');
        }

        // If the string is empty, return null.
        if (!str) {
            return null;
        }

        // Ensure options is an object, and we don't make changes to the supplied data.
        options = lodash.extend({}, options);

        // Make sure environment is an object
        if (!isObject(options.environment)) {
            options.environment = { };
        }

        // Wrap to force expression
        str = '(' + str + ')';

        // Get an AST representing the configuration
        code = esprima.parse(str, {
            loc: true
        });

        // Extract the root node.
        code = code.body[0].expression;

        // Check the root type, and make sure we have an object
        //   or an array.
        switch (code.type) {
            case 'ObjectExpression':
                return parseObject(code, true);
            case 'ArrayExpression':
                return parseArray(code, true);
            default:
                throw new Error(errorMessage('configuration MUST have an object or array as the ' +
                    'root element. Got "' + code.type + '"', code));
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
         * Returns a function which can be used as a getter to get the value of the template
         *   literal.
         */
        function parseTemplateLiteral(block) {
            var parts, oblock, body, func, res, i;
            if (block.expressions.length) {

                // Process the identifiers
                block = processIdentifiers(block);

                parts = [];
                for (i = 0; i < block.quasis.length; i++) {
                    parts.push({
                        type: 'Literal',
                        value: block.quasis[i].value.cooked
                    });
                    if (!block.quasis[i].tail) {
                        parts.push(block.expressions[i]);
                    }
                }

                // Keep a reference to the original for errors
                oblock = block;

                // Create binary expression
                block = {
                    type: 'BinaryExpression',
                    operator: '+',
                    left: parts.shift(),
                    right: parts.shift()
                };

                while (parts.length) {
                    block = {
                        type: 'BinaryExpression',
                        operator: '+',
                        left: block,
                        right: parts.shift()
                    };
                }

                // Wrap the expression with a return statement
                block = {
                    type: 'ReturnStatement',
                    argument: block
                };

                // Generate the code
                body = escodegen.generate(block);

                // Create the getter function
                func = new Function(['context'], body); // jshint ignore:line

                // Build a function which will give us line and column information.
                res = function (context) {
                    var val, e;
                    try {
                        val = func.call(this, context);
                    } catch (err) {
                        e = prepareError(err, oblock);
                        throw e;
                    }
                    return val;
                };

                return res;
            } else {
                return block.quasis[0].value.cooked;
            }

        }

        /**
        * Parses an array expression, and returns an array.
        * @param {object} block The ArrayExpression to parse.
        * @returns {array} The Array representing the supplied block.
        */
        function parseArray(block, initial) {
            var arr = [];
            if (initial) {
                config = arr;
            }
            block.elements.forEach(mapVal);
            return arr;

            /** Calls parseblock with the array as the second arg */
            function mapVal(block) {
                var parsed = parseBlock(block);
                arr.push(parsed);
            }
        }

        /**
        * Parses the supplied block
        * @param {object} block The block representing the object
        */
        function parseObject(block, initial) {
            var proto = {},
                result,
                props;

            result = Object.create(proto);

            if (initial) {
                config = result;
            }

            // Add locals to the prototype.
            if (module.exports.PROPERTY_PROTOTYPE_LOCALS) {
                Object.defineProperty(proto, module.exports.PROPERTY_PROTOTYPE_LOCALS, {
                    enumerable: true,
                    value: locals,
                    writable: !options.readOnly,
                    configurable: !options.protectStructure
                });
            }
            // Add environment variables to the prototype.
            if (module.exports.PROPERTY_PROTOTYPE_ENVIRONMENT) {
                Object.defineProperty(proto, module.exports.PROPERTY_PROTOTYPE_ENVIRONMENT, {
                    enumerable: true,
                    value: options.environment,
                    writable: !options.readOnly,
                    configurable: !options.protectStructure
                });
            }

            // Parse all the properties
            props = block.properties
                // This applies the filtered properties to the prototype.
                .filter(processId)
                .map(parseProperty);

            // Assign the properties to the object
            props.forEach(assignProp);

            return result;

            /**
             * Checks if this is an identifier id prop. If it is, adds it to locals, then the id
             *  as a string to the prototype. Finally returns false for the id property so it is
             *  not processed in the standard manner.
             */
            function processId(prop) {
                var name, proto;
                if (prop.type === 'Property') {
                    name = propName(prop.key);
                    if (name === module.exports.PROPERTY_ID && prop.value.type === 'Identifier') {
                        if (locals.hasOwnProperty(prop.value.name)) {
                            throw new Error(errorMessage('duplicate id "' + prop.value.name + '"',
                                prop));
                        } else {
                            locals[prop.value.name] = result;
                        }
                        proto = Object.getPrototypeOf(result);
                        Object.defineProperty(proto, module.exports.PROPERTY_PROTOTYPE_ID, {
                            enumerable: true,
                            value: prop.value.name,
                            writable: !options.readOnly,
                            configurable: !options.protectStructure
                        });
                        return false;
                    } else {
                        return true;
                    }
                } else {
                    throw new Error(errorMessage('unsupported property type "' + prop.type + '"',
                        prop));
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
                var msg;
                switch (block.type) {
                    case 'Literal':
                        return block.value;
                    case 'Identifier':
                        return block.name;
                    default:
                        msg = errorMessage('unable to determine a property name from a "' +
                            block.type + '" block', block);
                        throw new Error(msg);
                }
            }

            /**
            * Assigns the property to the result
            * @param {object} prop The property object as returned from parseProperty.
            */
            function assignProp(prop) {
                var definition;
                // Create the base definition
                definition = {
                    configurable: !options.protectStructure,
                    enumerable: true
                };

                // Do we have a getter, or a normal value
                if (typeof prop.value === 'function') {
                    definition.get = function getValue() {
                        return prop.value.call(this, context);
                    };
                } else {
                    definition.writable = !options.readOnly;
                    definition.value = prop.value;
                }

                // Define the property on the result
                Object.defineProperty(result, prop.name, definition);

                /**
                * Returns the value of the variable in the current context. Note: This function
                *   is specifically designed to operate in such a way that binding it to a new
                *   object will enable to to service that new object without side effects.
                *   i.e. There are no closure values accessed in this
                *   function.
                *)
                * @param {string} name The variable to retrieve the value of.
                */
                function context(name) {
                    var proto = Object.getPrototypeOf(this),
                        locals = proto && proto[module.exports.PROPERTY_PROTOTYPE_LOCALS],
                        environment = proto && proto[module.exports.PROPERTY_PROTOTYPE_ENVIRONMENT],
                        value;
                    if (this.hasOwnProperty(name)) {
                        // Coming from this object.
                        value = this[name];
                    } else if (isObject(locals) && locals.hasOwnProperty(name)) {
                        // Coming from an object in the config file with an id property.
                        value = locals[name];
                    } else if (isObject(environment) && environment.hasOwnProperty(name)) {
                        // Coming from the consumer supplied globals
                        value = environment[name];
                    } else if (name === module.exports.PROPERTY_BASE_NAME) {
                        value = proto && proto[prop.name];
                    } else if (proto && name in proto) { // We do this here for precedence
                        value = proto && proto[name];
                    } else {
                        // TODO: This is invalid if we, for example, have a typeof variable...
                        //  Not sure at this point how to achieve that.
                        // May need to be done by passing an additional parameter to this function
                        //  indcating no error on non-existence,
                        throw new Error('identifier named "' + name + '" has not been declared!');
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
            var body, func, res, block = oblock;

            // Get the possible custom expression function.
            func = customProcess(block, config, options.environment, locals);

            // Process normally if we did not get a function back.
            if (typeof func !== 'function') {
                // Ensure we are not doing something invalid.
                validateBlock(block);

                // Process the identifiers
                block = processIdentifiers(block);

                // Wrap the expression with a return statement
                block = {
                    type: 'ReturnStatement',
                    argument: block
                };

                // Generate the code
                body = escodegen.generate(block);

                // Create the getter function
                func = new Function(['context'], body); // jshint ignore:line
            }

            // Build a function which will give us line and column information.
            res = function (context) {
                var val, e;
                try {
                    val = func.call(this, context);
                } catch (err) {
                    e = prepareError(err, oblock);
                    throw e;
                }
                return val;
            };

            return res;

            /** Ensures blocks are valid */
            function validateBlock(obj) {
                var keys;
                if (obj && typeof obj === 'object') {
                    if (obj.type) {
                        if (!blockSupported(obj)) {
                            throw new Error(errorMessage('"' + obj.type +
                                '" block is illegal in expressions.', obj));
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
                    case 'TemplateLiteral':
                        return parseTemplateLiteral(block);
                    case 'ConditionalExpression':
                    case 'BinaryExpression':
                    case 'MemberExpression':
                    case 'UnaryExpression':
                    case 'CallExpression':
                    case 'ThisExpression':
                    case 'Identifier':
                    case 'Property':
                        return parseExpression(block);
                    default:
                        throw new Error('Critical error. Invalid program!');
                }
            } else {
                throw new Error(errorMessage('blocks of type "' + block.type +
                    '" not supported', block));
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
                case 'TemplateLiteral':
                case 'CallExpression':
                case 'ThisExpression':
                case 'Identifier':
                case 'Property':
                case 'Literal':
                    return true;

                case 'AssignmentExpression':
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
                case 'SequenceExpression':
                case 'FunctionExpression':
                case 'UpdateExpression':
                case 'YieldExpression':
                case 'ArrowExpression':
                case 'NewExpression':
                case 'FunctionDeclaration':
                case 'VariableDeclaration':
                case 'VariableDeclarator':

                case 'Program':
                    return false;

                default:
                    throw new Error(errorMessage('unrecognized block type "' +
                        block.type + '"', block));
            }
        }

        /**
        * Replaces identifiers that are not in the list of VALID_GLOBALS with a call to
        * context with the name of the identifier.
        */
        function processIdentifiers(obj) {
            // Note: While in most normal situations we would have to deal with adding
            //   the variables to some collection so they can be excluded from processing
            //   when adjusting the root identifiers. However, in this case we do not allow
            //   variable declarations in the expression, so we cannot have any to add.

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
                    case 'TemplateLiteral':
                        for (i = 0; i < block.expressions.length; i++) {
                            processPotentialIdentifier(block.expressions, i);
                        }
                        break;
                    case 'ThisExpression':
                    case 'Literal':
                        // Nothing to process
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

                /**
                 * Replaces the identifier block if necesary, otherwise just returns the
                 *  supplied block unmodified.
                 */
                function processIdentifierBlock(block) {
                    if (validateIdentifier(block)) {
                        // Generates context.call(this, <block.name>)
                        block = {
                            type: 'CallExpression',
                            callee: {
                                type: 'MemberExpression',
                                computed: false,
                                object: {
                                    type: 'Identifier',
                                    name: 'context'
                                },
                                property: {
                                    type: 'Identifier',
                                    name: 'call'
                                }
                            },
                            arguments: [
                                { type: 'ThisExpression' },
                                { type: 'Literal', value: block.name }
                            ]
                        };
                    }
                    return block;
                }

                /**
                 * Returns false if identifier is a valid global, true if it is not, and throws
                 *  an error if the identifier is illegal.
                 */
                function validateIdentifier(block) {
                    var msg;
                    if (module.exports.VALID_GLOBALS.indexOf(block.name) > -1) {
                        return false;
                    } else if (module.exports.ILLEGAL_GLOBALS.indexOf(block.name) > -1) {
                        msg = errorMessage('use of "' + block.name + '" is illegal', block);
                        throw new Error(msg);
                    } else {
                        return true;
                    }
                }
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

        /** Simple non-null object check */
        function isObject(val) {
            return val && typeof val === 'object';
        }

        function customProcess(block, config, environment, locals) {
            if (options.custom && typeof options.custom === 'function') {
                return options.custom(block, config, environment, locals);
            } else {
                return false;
            }
        }
    }

}(module));
