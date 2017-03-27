describe('index', function () {
    'use strict';
    const index = require('../src/index.js');

    describe('structure', function () {
        it('should be a function', function () {
            expect(index).to.be.a('function');
        });
        it('should have a function named "parse"', function () {
            expect(index.parse).to.be.a('function');
        });
        it('should have a function named "loader"', function () {
            expect(index.loader).to.be.a('function');
        });
        it('should have a function named "extend"', function () {
            expect(index.extend).to.be.a('function');
        });
        it('should have an object named "expression"', function () {
            expect(index.expression).to.be.an('object');
        });
        it('should have a function named "tracker"', function () {
            expect(index.tracker).to.be.a('function');
        });
        it('should have a function named "on"', function () {
            expect(index.on).to.be.a('function');
        });
        it('should have a function named "addListener"', function () {
            expect(index.addListener).to.be.a('function');
        });
        it('should have a function named "removeListener"', function () {
            expect(index.removeListener).to.be.a('function');
        });
        it('should have a function named "changes"', function () {
            expect(index.changes).to.be.a('function');
        });
        it('should have a function named "commit"', function () {
            expect(index.commit).to.be.a('function');
        });
        it('should have a function named "reset"', function () {
            expect(index.reset).to.be.a('function');
        });
    });

    describe('addListener', function () {
        it('should return false if the supplied object is not a config object', function () {
            expect(index.addListener({}, 'test', () => {})).to.equal(false);
        });
        it('should add a handler for the event to the object', function () {
            var obj, events, handler;
            obj = index.configObject({});
            events = index.configObject.events(obj);
            handler = chai.spy();
            index.addListener(obj, 'test', handler);
            events.emit('test');
            expect(handler).to.have.been.called.once();
        });
    });
    describe('removeListener', function () {
        it('should return false if the supplied object is not a config object', function () {
            expect(index.removeListener({}, 'test', () => {})).to.equal(false);
        });
        it('should remove a handler for the event to the object', function () {
            var obj, events, handler;
            obj = index.configObject({});
            events = index.configObject.events(obj);
            handler = chai.spy();
            index.addListener(obj, 'test', handler);
            events.emit('test');
            expect(handler).to.have.been.called.once();
            index.removeListener(obj, 'test', handler);
            events.emit('test');
            expect(handler).to.have.been.called.once();
        });
    });

});
