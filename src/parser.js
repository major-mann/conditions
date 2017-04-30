/**
* @module Parser module. This module is responsible for parsing the text into an config object
*  which can then be read by the consumer.
*/
'use strict';

// Public API
module.exports = parse;

// Dependencies
const configObject = require('./config-object.js'),
    contextManager = require('./context-manager.js'),
    expression = require('./expression.js'),
    uuid = require('uuid');

// Internal constants
const CONSTANT_INVALID = ['Identifier', 'ThisExpression'],
    CONSTANT_CHAIN = ['Identifier', 'MemberExpression'],
    CUSTOM = Symbol('custom'),
    ARRAY_EXPRESSION = Symbol('array-expression');

// Constants
module.exports.PROPERTY_ID = 'id'; // This identifies the name of the id property when parsing.
module.exports.CUSTOM = CUSTOM;

// These are globals identifiers which will left as is in the code instead of being replaced
//  by a context call.
module.exports.VALID_GLOBALS = ['Infinity', 'NaN', 'undefined', 'Object', 'Number', 'String',
    'RegExp', 'Boolean', 'Array', 'Error', 'EvalError', 'InternalError', 'RangeError',
    'ReferenceError', 'SyntaxError', 'TypeError', 'URIError', 'Math', 'Date', 'isFinite',
    'isNaN', 'parseFloat', 'parseInt', 'decodeURI', 'decodeURIComponent', 'encodeURI',
    'encodeURIComponent', 'escape', 'unescape'];
// These are globals which may not be used.
module.exports.ILLEGAL_GLOBALS = ['eval', 'Function'];

// Dependencies
const esprima = require('esprima'),
    escodegen = require('escodegen');

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
*       * {function} post - A function to call that allows post processing to take place on expressions
*           right before they are generated.
*       * {function} lookup - A function to use intercept contextual identifier lookup.
*       * {string} context Additional context to be provided in any errors.
*       * {object} contextManager Optional contextManager instead of creating a new one
* @throws {error} When str is not a string.
* @returns {*} The loaded configuration.
*/
function parse(str, options) {
    var code, config, cman = options.contextManager;

    // Ensure the data is valid
    if (typeof str !== 'string') {
        throw new Error(`str MUST be a string. Got ${str && typeof str}`);
    }

    // Empty file is assumed to be an object with no properties
    if (str === '') {
        return configObject({}, options);
    }

    // Ensure options is an object, and we don't make changes to the supplied data.
    options = Object.assign({}, options);

    // Make sure environment is an object
    if (!isObject(options.environment)) {
        options.environment = cman && cman.environment() || { };
    }

    // Get an AST representing the configuration
    try {
        // Wrap to force expression
        code = esprima.parse(`(${str})`, {
            loc: true
        });
    } catch (ex) {
        try {
            // Retry wrapped as object.
            code = esprima.parse(`({${str}})`, {
                loc: true
            });
        } catch (ex2) {
            // Preserve original exception.
            throw ex;
        }
    }

    // Extract the root node.
    code = code.body[0].expression;

    // Check the root type, and make sure we have an object
    //   or an array.
    var result;
    switch (code.type) {
        case 'ObjectExpression':
            result = parseObject(code);
            break;
        case 'ArrayExpression':
            result = parseArray(code);
            break;
        case 'SequenceExpression':
            // Convert to an array expression
            code.type = 'ArrayExpression';
            code.elements = code.expressions;
            delete code.expressions;
            result = parseArray(code, true);
            break;
        default:
            let msg = `configuration MUST have an object or array as the root element. ` +
                `Got "${code.type}".`;
            throw new Error(errorMessage(msg, code));
    }
    configObject.commit(result);
    return result;

    /** Returns the value represented by the supplied literal block */
    function parseLiteral(block) {
        if (block.regex) {
            return new RegExp(block.regex.pattern, block.regex.flags);
        } else {
            return block.value;
        }
    }

    function createConfigObject(base) {
        const result = configObject(base, {
            contextManager: cman,
            readOnly: options.readOnly,
            protectStructure: options.protectStructure,
            environment: options.environment,
            context: options.context
        });
        // Set it for all future objects being loaded if it was undefined
        //  (otherwise the original value will be returned)
        cman = configObject.context(result);
        return result;
    }

    /**
    * Parses an array expression, and returns an array.
    * @param {object} block The ArrayExpression to parse.
    * @returns {array} The Array representing the supplied block.
    */
    function parseArray(block) {
        var arr = createConfigObject([]);
        if (!config) {
            config = arr;
        }
        block.elements.forEach(mapVal);

        // We do this so we can handle expressions in arrays
        arr = new Proxy(arr, { get, set });

        return arr;

        /** Calls parseblock with the array as the second arg */
        function mapVal(block, index) {
            var set, parsed = parseBlock(arr, block, index);
            if (typeof parsed === 'function') {
                expression.attach(arr, arr.length, parsed, options);
            } else {
                arr.push(parsed);
            }
        }

        function get(target, prop) {
            if (typeof prop === 'symbol') {
                return target[prop];
            }
            if (expression.is(target, prop)) {
                return target[prop].get.call(target);
            } else {
                return target[prop];
            }
        }

        function set(target, prop, value) {
            if (typeof prop === 'symbol') {
                target[prop] = value;
                return true;
            }
            if (expression.is(target, prop)) {
                // Only execute expressions
                target[prop].set.call(target, value);
            } else {
                target[prop] = value;
            }
            return true;
        }
    }

    /**
    * Parses the supplied block
    * @param {object} block The block representing the object
    */
    function parseObject(block) {
        var idprop, result, props;

        // Create the config object
        result = createConfigObject({});

        // Set the base to the root object
        if (!config) {
            config = result;
        }

        // Parse all the properties
        props = block.properties
            // This applies the filtered properties to the prototype.
            .filter(processId);
        props = props.map(parseProperty);

        if (result[contextManager.ID]) {
            cman.register(result);
        }

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
            const name = propName(prop.key);
            if (name === module.exports.PROPERTY_ID && prop.value.type === 'Identifier') {
                Object.defineProperty(result, contextManager.ID, {
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
        }

        /**
        * Parses a "Property" block, returning an object containing a name and value for it
        * @prop {object} The property block to parse.
        */
        function parseProperty(prop) {
            var name, value;
            name = propName(prop.key);
            value = parseBlock(result, prop.value, name);

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
                /* istanbul ignore next */
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
            if (typeof prop.value === 'function') {
                // Attach the expression to the result.
                expression.attach(result, prop.name, prop.value, options);
            } else {
                // We can just assign. config-object will take care of processing.
                result[prop.name] = prop.value;
            }
        }
    }

    /**
    * Wraps the block expression with a return, and in turn wraps
    *   that in a function, and then generates the appropriate code,
    *   and returns a function which executes the expression with the
    *   given context.
    */
    function parseExpression(result, oblock, propertyName) {
        var body, func, res, haveCustom, refs, block = oblock;

        // Get the possible custom expression function.
        block = customProcess(block, cman, result, propertyName);

        if (typeof block === 'function') {
            haveCustom = true;
            func = block;
        } else {
            // Ensure we are not doing something invalid.
            validateBlock(block);
        }

        if (!haveCustom && isConstantExpression(block)) {
            return constantExpression(block);
        } else if (!haveCustom) {
            // Process the identifiers
            block = processIdentifiers(propertyName, block);
            refs = block.refs;

            // Allow any last minute adjustments by a consumer.
            block = postProcess(block, cman, result, propertyName, createExtendedContext(expression.context));

            // Wrap the expression with a return statement
            block = {
                type: 'ReturnStatement',
                argument: block
            };

            // Generate the code
            body = escodegen.generate(block);

            // Create the getter function
            func = new Function(['context'], body);
        }

        // Build a function which will give us line and column information.
        res = function (context) {
            var val, e;
            try {
                const extendedContext = createExtendedContext(context);
                val = func.call(this, extendedContext);
            } catch (ex) {
                // TODO: We seem to be getting double position information
                //  Check where else we are adding this information and if
                //  this is an offender.
                e = prepareError(ex, oblock);
                throw e;
            }
            return val;
        };
        expression.prepareExpression(res, refs, haveCustom);
        return res;

        function createExtendedContext(context) {
            /** Allows a custom lookup function to intercept the lookup. */
            return function extendedContext(property, name, nothrow) {
                if (typeof options.lookup === 'function') {
                    return options.lookup.call(this, context, property, name, nothrow);
                } else {
                    return context.call(this, property, name, nothrow);
                }
            }
        }

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

    /**
     * Checks whether the given AST represents a constant expression
     *  which can be executed on the spot to provide a value.
     */
    function isConstantExpression(exp) {
        if (CONSTANT_INVALID.indexOf(exp.type) > -1) {
            return false;
        }
        return Object.keys(exp).every(k => processVal(exp[k]));
        function processVal(val) {
            if (Array.isArray(val)) {
                return val.every(processVal);
            } else if (val && typeof val === 'object') {
                return isConstantExpression(val);
            } else {
                return true;
            }
        }
    }

    /**
     * Compiles and executes a constant expression
     */
    function constantExpression(exp) {
        var func, body;
        exp = {
            type: 'ReturnStatement',
            argument: exp
        };
        body = escodegen.generate(exp);
        func = new Function([], body); // jshint ignore:line
        return func();
    }

    /** Attempts to add line and column information to an error */
    function prepareError(err, block) {
        /* istanbul ignore else */
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
    function parseBlock(result, block, propertyName) {
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
                case 'ConditionalExpression':
                case 'BinaryExpression':
                case 'MemberExpression':
                case 'UnaryExpression':
                case 'CallExpression':
                case 'ThisExpression':
                case 'Identifier':
                case 'Property':
                    return parseExpression(result, block, propertyName);
                /* istanbul ignore next */
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
            case 'TemplateElement':
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

            /* istanbul ignore next */
            default:
                // TODO: Should an error be thrown here? Not very forwards compatible...
                //  Perhaps just log an return false?
                let msg = `Unrecognized block type "${block.type}"`;
                throw new Error(errorMessage(msg, block));
        }
    }

    /**
    * Replaces identifiers that are not in the list of VALID_GLOBALS with a call to
    * context with the name of the identifier.
    * @param {string} propertyName The name of the property the expression is for.
    * @param {object} obj The AST block.
    */
    function processIdentifiers(propertyName, obj) {

        // Create an array to hold the references we want to
        //  tie up change event watchers to.
        var refs, res;

        refs = [];
        res = processBlock(obj);
        res.refs = refs;
        return res;

        /** Processes a block for potential identifiers. */
        function processBlock(block, chain) {
            if (typeof block === 'function') {
                return block;
            }

            // Process chain
            if (CONSTANT_CHAIN.indexOf(block.type) > -1) {
                chain = chain || [];
            } else {
                chain = undefined;
            }

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
                    chain.unshift(block.property.name);
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
                    chain.unshift('block.name');
                    refs.push(chain.join('.'));
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
                /* istanbul ignore next */
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
                    processBlock(block[property], chain);
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
                            { type: 'Literal', value: propertyName },
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
             * @returns {boolean} true if the identifier should be replaced, else false
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
        /* istanbul ignore else */
        if (block.loc) {
            pos = `\nLine: ${block.loc.start.line}. Column: ${block.loc.start.column}`;
        } else {
            pos = '';
        }
        msg = msg + pos;
        if (options.context) {
            /* istanbul ignore else */
            if (msg) {
                msg = msg + '. ';
            }
            msg += options.context;
        }
        return msg + pos;
    }

    /** Simple non-null object check */
    function isObject(val) {
        return val && typeof val === 'object';
    }

    /** Called to perform custom processing of a block. */
    function customProcess(block, contextManager, result, property) {
        if (options.custom && typeof options.custom === 'function') {
            return options.custom(block, contextManager, result, property);
        } else {
            return false;
        }
    }

    /** Called to perform post processing of an expression before it is generated. */
    function postProcess(block, contextManager, result, property, context) {
        if (options.post && typeof options.post === 'function') {
            return options.post(block, contextManager, result, property, context);
        } else {
            return block;
        }
    }
}
