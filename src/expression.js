/**
 * @module Expression module. This is a module to hold code dealing with config expressions.
 */

'use strict';

// Constants
const EXPRESSION = Symbol('expression'),
    CUSTOM = Symbol('custom'),
    OVERRIDE = Symbol('override'),
    DEPENDENCIES = Symbol('dependencies'),
    DEFAULT_BASE_NAME = 'base';

// Expose the public API
module.exports.clone = clone;
module.exports.cloneArrayExpression = cloneArrayExpression;
module.exports.clearOverride = clearOverride;
module.exports.copy = copy;
module.exports.attach = attach;
module.exports.is = isExpression;
module.exports.prepareExpression = prepareExpression;
module.exports.dependantOn = dependantOn;
module.exports.context = context;
module.exports.BASE_NAME = DEFAULT_BASE_NAME;

// Globals
// Note: This is quite the hack. Make it so we always return
//  false for isExpression. Then when the array getter checks,
//  it will return the underlying expression object... disgusting :O
var noExpressions, configObject;

function prepareExpression(expression, dependencies, custom) {
    if (custom) {
        expression[CUSTOM] = true;
    }
    if (Array.isArray(dependencies)) {
        expression[DEPENDENCIES] = dependencies;
    }
}

function isExpression(obj, name) {
    var desc;
    if (noExpressions) {
        return false;
    } else if (name === undefined) {
        if (typeof obj.get === 'function') {
            return Boolean(obj && obj.get && obj.get[EXPRESSION]);
        } else {
            return Boolean(obj && obj[EXPRESSION] === true);
        }
    } else if (Array.isArray(obj)) {
        noExpressions = true;
        try {
            desc = obj[name];
        } finally {
            noExpressions = false;
        }
        return Boolean(desc && desc[EXPRESSION] === true);
    } else if (obj && typeof obj === 'object') {
        desc = Object.getOwnPropertyDescriptor(obj, name);
        return Boolean(desc && desc.get && desc.get[EXPRESSION]);
    } else {
        return false;
    }
}

function dependantOn(obj, name, dependency) {
    var desc = Object.getOwnPropertyDescriptor(obj, name);
    if (desc.get && Array.isArray(desc.get[DEPENDENCIES])) {
        return desc.get[DEPENDENCIES].indexOf(dependency) > -1;
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

function cloneArrayExpression(arr, index) {
    noExpressions = true;
    if (arr && arr[index] && typeof arr[index].get === 'function' && typeof arr[index].get[EXPRESSION] === 'function') {
        const get = createExpressionGetter(arr[index].get[EXPRESSION]);
        const set = createExpressionSetter(get);
        noExpressions = false;
        const res = {
            get,
            set
        };
        res[EXPRESSION] = true;
        return res;
    } else {
        noExpressions = false;
        throw new Error('Supplied array value does not contain an expression!');
    }
}

/**
 * Creates a getter for the given expression. Note: This getter is
 * only good to be used for a single property.
 */
function createExpressionGetter(expression) {
    get[EXPRESSION] = expression;
    /* istanbul ignore if */
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
    return function set(value) {
        get[OVERRIDE] = value;
    }
}

/** Resets an expression set override. */
function clearOverride(obj, name) {
    var desc;
    if (isExpression(obj, name)) {
        if (Array.isArray(obj)) {
            noExpressions = true;
            try {
                desc = obj[name];
            } finally {
                noExpressions = false;
            }
        } else {
            desc = Object.getOwnPropertyDescriptor(obj, name);
        }
        if (desc && desc.get && desc.get.hasOwnProperty(OVERRIDE)) {
            delete desc.get[OVERRIDE];
            return true;
        }
    }
    return false;
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
    if (!options.readOnly) {
        setter = createExpressionSetter(getter);
    }
    if (typeof name !== 'symbol' && Array.isArray(obj) && Number.isInteger(parseFloat(name))) {
        const expObj = {
            get: getter,
            set: setter
        };
        expObj[EXPRESSION] = true;
        obj[name] = expObj;
    } else {
        definition = {
            enumerable: true,
            configurable: !options.protectStructure,
            get: getter,
            set: setter
        };
        // Define the property on the result
        Object.defineProperty(obj, name, definition);
    }
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

    // We want this function as part of expression, but expression
    //  is referenced from configObject, so we lazy load
    if (!configObject) {
        configObject  = require('./config-object.js');
    }

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
