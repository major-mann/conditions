/** The main entry point into the module */
(function conditionsIndexModule() {
    'use strict';
    module.exports = {
        parse: require('./parser.js'),
        loader: require('./loader.js'),
        extend: require('./levels.js')
    };

    // In a browser context, bind to the window.
    if (typeof window !== 'undefined') {
        window.conditions = module.exports;
    }
}());
