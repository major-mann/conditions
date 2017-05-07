/** Runs tests using the examples directory */
'use strict';
describe('Examples', function () {
    const path = require('path'),
        loader = require('../src');

    describe('Load', function () {
        it('should load the config correctly', function () {
            return loader([path.join(__dirname, '../example', 'load-example/main.config'), 'main.development.config'], { })
                .then(config => {
                    expect(config.server).to.be.an('object');
                    expect(config.stores.mongo.url).to.equal('mongodb://user:pass@db.example.com');
                });
        });
    });

    describe('Levels', function () {
        it('should load the config correctly', function () {
            return loader([path.join(__dirname, '../example', 'levels-example/app.config')], { levels: ['common', 'prod', 'dev'] })
                .then(config => {
                    expect(config.level).to.equal('dev');
                    expect(config.services.bar.level).to.equal('prod');
                });
        });
    });
});
