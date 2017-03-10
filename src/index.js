/** The main entry point into the module */
(function conditionsIndexModule() {
    'use strict';

    // Main code exports
    module.exports = require('./file-loader.js');
    module.exports.parse = require('./parser.js');
    module.exports.loader = require('./loader.js');
    module.exports.extend = require('./levels.js');
}());
