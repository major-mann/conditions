'use strict';

// Constants
const EXPRESSION = Symbol('expression'),
    CUSTOM = Symbol('custom'),
    OVERRIDE = Symbol('override'),
    DEPENDENCIES = Symbol('dependencies'),
    DEFAULT_BASE_NAME = 'base';

// Dependencies
const configObject = require('./config-object.js');

// Expose the public API
module.exports.clone = clone;
module.exports.clearOverride = clearOverride;
module.exports.copy = copy;
module.exports.attach = attach;
module.exports.is = isExpression;
module.exports.prepareExpression = prepareExpression;
module.exports.BASE_NAME = DEFAULT_BASE_NAME;

function prepareExpression(expression, dependencies, custom) {
    if (custom) {
        expression[CUSTOM] = true;
    }
    if (Array.isArray(dependencies)) {
        expression[DEPENDENCIES] = dependencies;
    }
}

function isExpression(obj, name) {
    if (obj && typeof obj === 'object') {
        let desc = Object.getOwnPropertyDescriptor(obj, name);
        return Boolean(desc.get && desc.get[EXPRESSION]);
    } else {
        return false;
    }
}

/** Clones an expression getter. */
function clone(expressionGet) {
    if (arguments[0] && typeof arguments[0] === 'object' && typeof arguments[1] === 'string') {
        let desc = Object.getOwnPropertyDescriptor(arguments[0], arguments[1]);
        if (desc && desc.get && typeof desc.get[EXPRESSION] === 'function') {
            return createExpressionGetter(desc.get[EXPRESSION]);
        } else {
            throw new Error(`Object does not have an expression property named "${arguments[1]}"`);
        }
    } else if (typeof expressionGet[EXPRESSION] === 'function') {
        return expressionGet && createExpressionGetter(expressionGet[EXPRESSION]);
    } else {
        throw new Error('Supplied expression getter does not appear to be an expression getter! ' +
            'Expected function to have the EXPRESSION symbol');
    }
}

/**
 * Creates a getter for the given expression. Note: This getter is
 * only good to be used for a single property.
 */
function createExpressionGetter(expression) {
    get[EXPRESSION] = expression;
    if (expression[CUSTOM]) {
        get[CUSTOM] = true;
    }
    if (Array.isArray(expression[DEPENDENCIES])) {
        get[DEPENDENCIES] = expression[DEPENDENCIES];
    }
    return get;

    // Note!!!!! : This getter is only good for attachment to a single property
    //  because of override!
    function get() {
        if (get.hasOwnProperty(OVERRIDE)) {
            return get[OVERRIDE];
        } else {
            return expression.call(this, context);
        }
    }
}

function createExpressionSetter(get) {
    return set;
    function set(value) {
        get[OVERRIDE] = value;
    }
}

/** Resets an expression set override. */
function clearOverride(obj, name) {
    var desc = Object.getOwnPropertyDescriptor(obj, name);
    if (desc && desc.get && desc.get.hasOwnProperty(OVERRIDE)) {
        delete desc.get[OVERRIDE];
        return true;
    } else {
        return false;
    }
}

/** Copies an expression from one object to another. */
function copy(src, srcName, dest, destName, options) {
    var getter = clone(src, srcName);
    options = options || {};
    Object.defineProperty(dest, destName, {
        enumerable: true,
        configurable: !options.protectStructure,
        get: getter,
        set: createExpressionSetter(getter)
    });
}

function attach(obj, name, expression, options) {
    var definition, getter, setter;
    if (typeof expression !== 'function') {
        throw new Error(`Supplied expression value MUST be a function. ` +
            `Got "${expression && typeof expression}"`);
    }
    options = options || {};
    getter = createExpressionGetter(expression);
    setter = createExpressionSetter(getter);
    definition = {
        enumerable: true,
        configurable: !options.protectStructure,
        get: getter,
        set: setter
    };
    // Define the property on the result
    Object.defineProperty(obj, name, definition);
}

/**
* Returns the value of the variable in the current context. Note: This function
*   is specifically designed to operate in such a way that binding it to a new
*   object will enable to to service that new object without side effects.
*   i.e. There are no closure values accessed in this
*   function.
* @param {string} property The name of the property this context is bound to.
*           This determines which property is accessed when the "base"
*           keyword is requested.
* @param {string} name The variable to retrieve the value of. (Name of the identifier)
* @param {boolean} nothrow optional argument to prevent an error if the value
*   is not found. This is useful with, for example, the typeof operator.
*/
function context(property, name, nothrow) {
    var proto, context, value;
    context = configObject.context(this);
    // If prototype is prefered check the entire chain for the property
    if (this.hasOwnProperty(name)) { // Otherwise just the object
        value = this[name];
    } else if (context.hasValue(name)) {
        // Coming from an object in the config file with an id property,
        //  or a value supplied as environment
        value = context.value(name);
    } else if (name === module.exports.BASE_NAME) {
        proto = Object.getPrototypeOf(this);
        while (proto && !configObject.is(proto)) {
            proto = Object.getPrototypeOf(proto);
        }
        if (proto) {
            value = proto && proto[property];
        } else {
            value = undefined;
        }
    } else if (name in this) { // We do this here for precedence
        // This allows config to be extended.
        value = this[name];
    } else if (nothrow) { // Things like typeof
        value = undefined;
    } else {
        let msg = `identifier named "${name}" has not been declared!`;
        if (context && typeof context.name === 'function') {
            let cname = context.name();
            if (cname) {
                msg += `. ${cname}`;
            }
        }
        throw new Error(msg);
    }
    return value;
}
