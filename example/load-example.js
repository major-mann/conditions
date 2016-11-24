'use strict';
var src = require('../src'),
    path = require('path');

src(path.join(__dirname, 'production.config'), 'development.config', {
    locals: true
}).then(function (config) {
        console.log('Server');
        console.log(config.server.protocol);
        console.log(config.server.host);
        console.log(config.server.port);
        console.log(config.server.url);
        console.log(' ');
        console.log('Database');
        console.log(config.database.mongo.url);
        console.log(config.database.redis.url);
        console.log(config.database.redis.options.timeout);
        console.log(' ');
        console.log('Stores');
        console.log(config.stores.query.url);
        console.log(config.stores.session.url);
        console.log(config.stores.session.options.timeout);
        console.log(config.stores.cache.url);
        console.log(config.stores.cache.options.timeout);
    })
    .catch(function (err) {
        console.error(err);
    });
