'use strict';
describe('Resource loader', function () {
    const mockery = require('mockery'),
        mockRequest = require('mock-request'),
        mock = require('../mock'),
        url = require('url');
    var rload, fs, loader, levels, request, options,
        fsRes, fsArgs, loaderMock;

    beforeEach(function () {
        fsRes = '';
        options = {};
        fs = {
            readFile: chai.spy(function (file, options, cb) {
                fsArgs = Array.prototype.slice.call(arguments);
                if (fsRes instanceof Error) {
                    cb(fsRes);
                } else {
                    cb(null, fsRes);
                }
            })
        }
        loaderMock = mock.loader();
        loader = chai.spy(loaderMock);
        levels = chai.spy(mock.levels());

        mockery.registerMock('./loader.js', loader);
        mockery.registerMock('./levels.js', levels);
        mockery.registerMock('request', function doRequest() {
            if (!request) {
                request = mockRequest.mock().run();
            }
            return request.apply(request, arguments);
        });
        mockery.registerMock('fs', fs);

        mockery.enable({
            warnOnUnregistered: false,
            useCleanCache: true
        });
        rload = require('../src/resource-loader.js');
    });

    afterEach(function () {
        mockery.deregisterAll();
        mockery.disable();
    });

    it('should be a function', function () {
        expect(rload).to.be.a('function');
    });
    it('should export an object container the potential loaders', function () {
        expect(rload.loaders).to.be.an('object');
    });

    describe('processing', function () {
        var loadResult = '';
        beforeEach(function () {
            rload.loaders.http = chai.spy(() => {
                return Promise.resolve(loadResult);
            });
            rload.loaders.https = chai.spy(() => Promise.resolve(loadResult));
            rload.loaders.file = chai.spy(() => Promise.resolve(loadResult));
        });
        it('should throw an error if the first supplied URI is not absolute', function () {
            expect(() => rload(['foo/bar'])).to.throw(/absolute/i);
        });
        it('should throw an error if the protocol supplied in the location is not found in the loaders', function () {
            expect(() => rload(['mycustom://foo/bar'])).to.throw(/mycustom/i);
        });
        it('should ignore the location if it is falsy', function () {
            return rload(['http://www.example.com/config.json', false])
                .then(cfg => expect(cfg).to.be.an('object'));
        });
        it('should ignore the location if it is not a string or an object', function () {
            return rload(['http://www.example.com/config.json', 123])
                .then(cfg => expect(cfg).to.be.an('object'));
        });
        it('should return the location if it is an object', function () {
            var test = {};
            return rload([test])
                .then(cfg => expect(cfg).to.be.an('object'));
        });
        it('should be rejected if no valid config levels could be loaded', function () {
            return expect(rload([undefined]))
                .to.eventually.be.rejectedWith(/no.*valid.*levels/i);
        });
        it('should determine a new base loader when the supplied location is absolute', function () {
            return rload(['http://www.example.com/config.json', '/other-config.json', 'file://local.config'])
                .then(function checkCalls() {
                    expect(rload.loaders.http).to.have.been.called.twice();
                    expect(rload.loaders.file).to.have.been.called.once();
                });
        });
        it('should cache parts of the URI in logical order so that locations following an absolute may be relative', function () {
            var requests = [];
            rload.loaders.http = chai.spy(function (base) {
                var req = url.format(base);
                requests.push(req);
                return Promise.resolve('');
            });

            return rload(['http://www.example.com/config.json', '/path/config.json', '?foo=bar/baz', '#andhash=too', '#replacement=hash'])
                .then(function checkCalls() {
                    expect(rload.loaders.http).to.have.been.called.exactly(5);
                    expect(requests[0]).to.equal('http://www.example.com/config.json');
                    expect(requests[1]).to.equal('http://www.example.com/path/config.json');
                    expect(requests[2]).to.equal('http://www.example.com/path/config.json?foo=bar/baz');
                    expect(requests[3]).to.equal('http://www.example.com/path/config.json?foo=bar/baz#andhash=too');
                    expect(requests[4]).to.equal('http://www.example.com/path/config.json?foo=bar/baz#replacement=hash');
            });
        });
        it('should pass options.customLoader to the loader if it is a function', function () {
            var options  = {
                customLoader: function noop () {}
            };
            return rload(['http://www.example.com/config'], options)
                .then(() => expect(loader).to.have.been.called.with(options.customLoader));
        });
        it('should use the default loader if no custom is supplied', function () {
            loaderMock.loaders = [undefined];
            debugger;
            return rload(['http://www.example.com/config'], options)
                .then(cfg => expect(cfg).to.be.an('object'));
        });
    });
    describe('Built in loaders', function () {
        it('should load using fs when the protocol is "file:"', function () {
            return rload(['file:///foo/bar/config.json'], options)
                .then(() => expect(fs.readFile).to.have.been.called.with('/foo/bar/config.json'));
        });
        it('should be warn if the file handler encounters an error', function () {
            fsRes = new Error('fake');
            console.warn = chai.spy();
            request = mockRequest.mock({ host: 'www.example.com' })
                .get('/config')
                .respond({ statusCode: 200, body: {} })
                .run();
            return rload(['file:///foo/bar/config.json', 'http://www.example.com/config'], options)
                .then(() => expect(console.warn).to.have.been.called());
        });
        it('should load using request when the protocol is "http:"', function () {
            request = mockRequest.mock({ protocol: 'http', host: 'www.example.com' })
                .get('/config')
                .respond({ statusCode: 200, body: {} })
                .run();
            return rload(['http://www.example.com/config'], options)
                .then(cfg => expect(cfg).to.be.an('object'));
        });
        it('should load using request when the protocol is "https:"', function () {
            request = mockRequest.mock({ protocol: 'https', host: 'www.example.com' })
                .get('/config')
                .respond({ statusCode: 200, body: {} })
                .run();
            return rload(['https://www.example.com/config'], options)
                .then(cfg => expect(cfg).to.be.an('object'));
        });
        it('should warn if the http handler encounters an error', function () {
            request = mockRequest.mock({ host: 'www.dont-exist.com' })
                .get('/config.json')
                .respond({ statusCode: 404, body: 'Not found' })
                .run();
            console.warn = chai.spy();
            return rload(['file:///foo/bar/config.json', 'http://www.dont-exist.com/config.json'], options)
                .then(() => expect(console.warn).to.have.been.called());
        });
    });
});
