'use strict';
const src = require('../src'),
    path = require('path');

(function doLoad() {
    debugger;
    // TODO: Looks like the development extension is causing the failure...
    src([path.join(__dirname, 'main.config')], { levels: ['', 'development'] })
        .then(config => {
            debugger;
            console.log(JSON.stringify(config, null, 4));
        })
        .catch(function (err) {
            console.error(err);
        });
}());
