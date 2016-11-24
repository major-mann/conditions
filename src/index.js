/** The main entry point into the module */
(function conditionsIndexModule() {
    'use strict';

    module.exports = require('./file-loader.js');
    module.exports.parse = require('./parser.js');
    module.exports.loader = require('./loader.js');
    module.exports.extend = require('./levels.js');

    // In a browser context, bind to the window.
    if (process.title === 'browser') {
        window.conditions = module.exports;
    }
}());
