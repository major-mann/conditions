/**
 * @module Parser module. This module is responsible for parsing the text into an config object
 *  which can then be read by the consumer.
 */
(function parser(module) {
    'use strict';

    // Public API
    module.exports = parse;
    // Constants
    module.exports.PROPERTY_ID = 'id'; // This identifies the name of the id property when parsing.
    module.exports.PROPERTY_SYMBOL_ID = Symbol('id');
    module.exports.PROPERTY_SYMBOL_ENVIRONMENT = Symbol('environment');
    module.exports.PROPERTY_SYMBOL_LOCALS = Symbol('locals');
    module.exports.PROPERTY_BASE_NAME = 'base';
    module.exports.VALID_GLOBALS = ['Infinity', 'NaN', 'undefined', 'Object', 'Number', 'String',
        'RegExp', 'Boolean', 'Array', 'Error', 'EvalError', 'InternalError', 'RangeError',
        'ReferenceError', 'SyntaxError', 'TypeError', 'URIError', 'Math', 'Date', 'isFinite',
        'isNaN', 'parseFloat', 'parseInt', 'decodeURI', 'decodeURIComponent', 'encodeURI',
        'encodeURIComponent', 'escape', 'unescape'];
    module.exports.ILLEGAL_GLOBALS = ['eval', 'Function'];

    // Dependencies
    const esprima = require('esprima'),
        escodegen = require('escodegen'),
        // TODO: Replace with common extend once it is written
        common = require('./common.js');

    /**
    * Parses the supplied data, attempting to build up a config object.
    * @param {string} str The data to parse.
    * @param {object} options The options to use when parsing the data. The following options are
    *   supported:
    *       * {object} environment - Environment variables to pass to the expressions.
    *       * {boolean} protectStructure - True to make object, array and getters non configurable.
    *           Defaults to false.
    *       * {boolean}  readOnly - True to disable any setting of properties. Defaults to false.
    *       * {boolean} preferPrototype - Defaults to false. Whether to take preference of
    *           prototype properties over locals and environment.
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
        options = common.extend({}, options);

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
                let msg = `configuration MUST have an object or array as the root element. ` +
                    `Got "${code.type}".`;
                throw new Error(errorMessage(msg, code));
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
            const arr = [];
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
            var idprop,
                result,
                props;

            result = {};
            if (initial) {
                config = result;
            }

            // Add locals via symbol.
            if (module.exports.PROPERTY_SYMBOL_LOCALS) {
                Object.defineProperty(result, module.exports.PROPERTY_SYMBOL_LOCALS, {
                    enumerable: false,
                    value: locals,
                    writable: !options.readOnly,
                    configurable: !options.protectStructure
                });
            }
            // Add environment variables via symbol.
            if (module.exports.PROPERTY_SYMBOL_ENVIRONMENT) {
                Object.defineProperty(result, module.exports.PROPERTY_SYMBOL_ENVIRONMENT, {
                    enumerable: false,
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

            // We add the named id after everything else, and only if a property named id does not
            //  exist.
            if (!Object.hasOwnProperty.call(result, module.exports.PROPERTY_ID) && idprop) {
                Object.defineProperty(result, module.exports.PROPERTY_ID, {
                    enumerable: true,
                    value: idprop,
                    writable: !options.readOnly,
                    configurable: !options.protectStructure
                });
            }

            return result;

            /**
             * Checks if this is an identifier id prop. If it is, adds it to locals, then the id
             *  as a string to the prototype. Finally returns false for the id property so it is
             *  not processed in the standard manner.
             */
            function processId(prop) {
                var name;
                if (prop.type === 'Property') {
                    name = propName(prop.key);
                    if (name === module.exports.PROPERTY_ID && prop.value.type === 'Identifier') {
                        if (locals.hasOwnProperty(prop.value.name)) {
                            throw new Error(errorMessage('duplicate id "' + prop.value.name + '"',
                                prop));
                        } else {
                            locals[prop.value.name] = result;
                        }
                        Object.defineProperty(result, module.exports.PROPERTY_SYMBOL_ID, {
                            enumerable: false,
                            value: prop.value.name,
                            writable: !options.readOnly,
                            configurable: !options.protectStructure
                        });
                        idprop = prop.value.name;
                        return false;
                    } else {
                        return true;
                    }
                } else {
                    let msg = `unsupported property type "${prop.type}"`;
                    throw new Error(errorMessage(msg, prop));
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
                        let msg = `unable to determine a property name from a ` +
                            `"${block.type}" block`;
                        msg = errorMessage(msg, block);
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
                * @param {string} name The variable to retrieve the value of.
                * @param {boolean} nothrow optional argument to prevent an error if the value
                *   is not found. This is useful with, for example, the typeof operator.
                */
                function context(name, nothrow) {
                    var proto = Object.getPrototypeOf(this),
                        locals = this[module.exports.PROPERTY_SYMBOL_LOCALS],
                        environment = this[module.exports.PROPERTY_SYMBOL_ENVIRONMENT],
                        value;
                    // If prototype is prefered check the entire chain for the property
                    if (options.preferPrototype && name in this) {
                        value = this[name];
                    } else if (this.hasOwnProperty(name)) { // Otherwise just the object
                        value = this[name];
                    } else if (isObject(locals) && locals.hasOwnProperty(name)) {
                        // Coming from an object in the config file with an id property.
                        value = locals[name];
                    } else if (isObject(environment) && environment.hasOwnProperty(name)) {
                        // Coming from the consumer supplied globals
                        value = environment[name];
                    } else if (name === module.exports.PROPERTY_BASE_NAME) {
                        value = proto && proto[prop.name];
                    } else if (name in this) { // We do this here for precedence
                        // This allows config to be extended.
                        value = this[name];
                    } else if (nothrow) { // Things like typeof
                        value = undefined;
                    } else {
                        throw new Error(`identifier named "${name}" has not been declared!`);
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
                            let msg = `"${obj.type}" block is illegal in expressions.`;
                            throw new Error(errorMessage(msg, obj));
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
            const supported = blockSupported(block);
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
                        // We should never arrive here if supported is true.
                        throw new Error('Critical error. Invalid program!');
                }
            } else {
                let msg = `blocks of type "${block.type}'" not supported`;
                throw new Error(errorMessage(msg, block));
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
                    // TODO: Should an error be thrown here? Not very forwards compatible...
                    let msg = `unrecognized block type "${block.type}"`;
                    throw new Error(errorMessage(msg, block));
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
                switch(block.type) {
                    case 'ConditionalExpression':
                        processBlock(block.test);
                        processBlock(block.consequent);
                        processBlock(block.alternate);
                        break;
                    case 'ObjectExpression':
                        for (let i = 0; i < block.properties.length; i++) {
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
                        for (let i = 0; i < block.elements.length; i++) {
                            processPotentialIdentifier(block.elements, i);
                        }
                        break;
                    case 'CallExpression':
                        processPotentialIdentifier(block, 'callee');
                        for (let i = 0; i < block.arguments.length; i++) {
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
                        for (let i = 0; i < block.expressions.length; i++) {
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
                    var tof = block.type === 'UnaryExpression' && block.operator === 'typeof';
                    block[property] = processIdentifierBlock(block[property], tof);
                }

                /**
                 * Replaces the identifier block if necesary, otherwise just returns the
                 *  supplied block unmodified.
                 * @param {object} block The AST identifier block to process.
                 * @param {boolean} typeOf Whether the identifier was part of a type of (This
                 *   changes the behaviour of unfound properties).
                 */
                function processIdentifierBlock(block, typeOf) {
                    if (validateIdentifier(block)) {
                        // Generates context.call(this, <block.name>, typeOf)
                        block = {
                            type: 'CallExpression',
                            callee: {
                                type: 'MemberExpression',
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
                                { type: 'Literal', value: block.name },
                                { type: 'Literal', value: !!typeOf }
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
                    if (module.exports.VALID_GLOBALS.indexOf(block.name) > -1) {
                        return false;
                    } else if (module.exports.ILLEGAL_GLOBALS.indexOf(block.name) > -1) {
                        let msg = `use of "${block.name}" is illegal`;
                        msg = errorMessage(msg, block);
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
                pos = `\nLine: ${block.loc.start.line}. Column: ${block.loc.start.column}`;
            } else {
                pos = '';
            }
            return msg + pos;
        }

        /** Simple non-null object check */
        function isObject(val) {
            return val && typeof val === 'object';
        }

        /** Called to perform custom processing of a block. */
        function customProcess(block, config, environment, locals) {
            if (options.custom && typeof options.custom === 'function') {
                return options.custom(block, config, environment, locals);
            } else {
                return false;
            }
        }
    }

}(module));
