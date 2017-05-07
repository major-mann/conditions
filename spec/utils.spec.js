'use strict';
describe('Utilities', function () {
    const utils = require('../src/utils.js');

    describe('explodeLevels', function () {
        const explode = utils.explodeLevels;
        it('should be a function', function () {
            expect(explode).to.be.a('function');
        });
        it('should explode supplied file names with supplied levels', function () {
            const res = explode(['path/foo.config', 'path/bar.config'], ['prod', 'dev']);
            expect(res.length).to.equal(4);
            expect(res[0]).to.equal('path/foo.prod.config');
            expect(res[1]).to.equal('path/foo.dev.config');
            expect(res[2]).to.equal('path/bar.prod.config');
            expect(res[3]).to.equal('path/bar.dev.config');
        });
        it('should ignore non strings', function () {
            const obj = {};
            const res = explode(['path/foo.config', obj, 'path/bar.config'], ['prod', 'dev']);
            expect(res.length).to.equal(5);
            expect(res[0]).to.equal('path/foo.prod.config');
            expect(res[1]).to.equal('path/foo.dev.config');
            expect(res[2]).to.equal(obj);
            expect(res[3]).to.equal('path/bar.prod.config');
            expect(res[4]).to.equal('path/bar.dev.config');
        });
        it('should ignore extensions with the same name as levels', function () {
            const res = explode(['path/foo.prod', 'path/bar.prod'], ['prod', 'dev']);
            expect(res.length).to.equal(4);
            expect(res[0]).to.equal('path/foo.prod.prod');
            expect(res[1]).to.equal('path/foo.dev.prod');
            expect(res[2]).to.equal('path/bar.prod.prod');
            expect(res[3]).to.equal('path/bar.dev.prod');
        });
        it('should allow empty level names to be declared', function () {
            var res = explode(['path/foo.config', 'path/bar.config'], ['', 'dev']);
            expect(res.length).to.equal(4);
            expect(res[0]).to.equal('path/foo.config');
            expect(res[1]).to.equal('path/foo.dev.config');
            expect(res[2]).to.equal('path/bar.config');
            expect(res[3]).to.equal('path/bar.dev.config');

            res = explode(['path/foo.bar.config', 'path/bar.bar.config'], ['', 'dev']);
            expect(res.length).to.equal(4);
            expect(res[0]).to.equal('path/foo.bar.config');
            expect(res[1]).to.equal('path/foo.bar.dev.config');
            expect(res[2]).to.equal('path/bar.bar.config');
            expect(res[3]).to.equal('path/bar.bar.dev.config');
        });
    });
});
