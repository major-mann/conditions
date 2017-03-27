'use strict';

// Main code exports
module.exports = require('./resource-loader.js');
module.exports.configObject = require('./config-object.js');
module.exports.parse = require('./parser.js');
module.exports.loader = require('./loader.js');
module.exports.extend = require('./levels.js');
module.exports.expression = require('./expression.js');
module.exports.tracker = require('./change-tracker.js');

// Shortcut functions
// Events
module.exports.on = addListener;
module.exports.addListener = addListener;
module.exports.removeListener = removeListener;
// Change tracking
module.exports.changes = module.exports.tracker.changes;
module.exports.reset = module.exports.tracker.reset;
module.exports.commit = module.exports.tracker.commit;

/** Adds an event listener to the supplied config object */
function addListener(obj, name, handler) {
    if (module.exports.configObject.is(obj)) {
        let events = module.exports.configObject.events(obj);
        events.on(name, handler);
        return true;
    } else {
        return false;
    }
}

/** Removes a handler from the change event */
function removeListener(obj, name, handler) {
    if (module.exports.configObject.is(obj)) {
        let events = module.exports.configObject.events(obj);
        events.removeListener(name, handler);
        return true;
    } else {
        return false;
    }
}
