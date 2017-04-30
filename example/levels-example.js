'use strict';
const src = require('../src'),
    path = require('path');

(function doLoad() {
    debugger;
    src([path.join(__dirname, 'levels-example/app.config')], { levels: ['common', 'prod', 'dev'] })
        .then(config => {
            debugger;
            console.log(JSON.stringify(config, null, 4));
        })
        .catch(function (err) {
            console.error(err);
        });
}());
