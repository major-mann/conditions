(function (root, factory) {
    'use strict';

    // Universal Module Definition (UMD) to support AMD, CommonJS/Node.js,
    // Rhino, and plain browser loading.
    var tmp;
    if (typeof define === 'function' && define.amd) {
        define(['module'], factory);
    } else if (typeof module !== 'undefined') {
        factory(module);
    } else {
        tmp = { };
        factory(tmp);
        root.configurator = tmp.configurator;
    }
}(this, function (module) {
'use strict';
var reqCache = {}, exports, escodegen;
reqCache.esprima = { };
exports = reqCache.esprima;

/** Our override require function */
function require(name) {
    return reqCache[name];
}