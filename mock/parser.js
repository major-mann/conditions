/** @module Parser mock. A mock for dealing with the parser */
'use strict';

module.exports = function createMock() {
    const configObject = require('../src/config-object.js');

    parser.result = Promise.resolve({ });
    parser.explicitResult = { };

    return parser;

    /** A simple parser mock */
    function parser(str, options) {
        var res;
        if (typeof str !== 'string') {
            throw new Error(`str MUST be a string. Got ${str && typeof str}`);
        }
        if (parser.explicitResult && parser.explicitResult.hasOwnProperty(str)) {
            res = parser.explicitResult[str];
        } else {
            res = parser.result;
        }
        if (res instanceof Error) {
            throw parser.result;
        }
        if (typeof res === 'function') {
            res = res(str, options);
        }
        if (res && typeof res === 'object') {
            res = configObject(res);
        }
        return res;
    }

}
