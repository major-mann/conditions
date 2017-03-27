describe('Change tracker', function () {
    'use strict';

    const tracker = require('../src/change-tracker.js');
    var tracked;

    beforeEach(function () {
        tracked = tracker({});
    });

    describe('tracked', function () {
        it('should be a function', function () {
            expect(tracker.tracked).to.be.a('function');
        });
        it('should return true if the supplied value is a tracked object', function () {
            expect(tracker.tracked(tracked)).to.equal(true);
        });
        it('should return false if the supplied value is not a tracked object', function () {
            expect(tracker.tracked(123)).to.equal(false);
            expect(tracker.tracked({})).to.equal(false);
            expect(tracker.tracked(true)).to.equal(false);
        });
    });

    describe('changes', function () {
        var changes;
        beforeEach(function () {
            tracked.foo = 'a';
            tracked.bar = 'b';
            tracked.baz = 'c';
            tracker.commit(tracked);

            tracked.foo = 'x';
            tracked.bar = 'y';
            tracked.hello = 'world!';
            delete tracked.baz;

            changes = tracker.changes(tracked);
        })
        it('should return an object', function () {
            var changes = tracker.changes(tracked);
            expect(changes).to.be.an('object');
        });
        it('should have an object called inserts containing inserted keys and their values', function () {
            expect(changes.inserts).to.be.an('object');
            const keys = Object.keys(changes.inserts);
            expect(keys.length).to.equal(1);
            expect(keys[0]).to.equal('hello');
            expect(changes.inserts.hello).to.equal('world!');
        });
        it('should have an object called deletes containing all deleted fields and their values when deleted', function () {
            expect(changes.deletes).to.be.an('object');
            const keys = Object.keys(changes.deletes);
            expect(keys.length).to.equal(1);
            expect(keys[0]).to.equal('baz');
            expect(changes.deletes.baz).to.equal('c');
        });
        it('should have an object called updates with all the updated properties, their original value, and their current value', function () {
            expect(changes.updates).to.be.an('object');
            const keys = Object.keys(changes.updates);
            expect(keys.length).to.equal(2);
            expect(keys.includes('foo')).to.equal(true);
            expect(keys.includes('bar')).to.equal(true);

            expect(changes.updates.foo).to.be.an('object');
            expect(changes.updates.foo.value).to.equal('x');
            expect(changes.updates.foo.old).to.equal('a');

            expect(changes.updates.bar).to.be.an('object');
            expect(changes.updates.bar.value).to.equal('y');
            expect(changes.updates.bar.old).to.equal('b');
        });
        it('should return empty objects for inserts, updates and deletes if the supplied value is not a tracked object', function () {
            changes = tracker.changes({});
            expect(changes).to.be.an('object');
            expect(changes.inserts).to.be.an('object');
            expect(changes.updates).to.be.an('object');
            expect(changes.deletes).to.be.an('object');

            expect(Object.keys(changes.inserts).length).to.equal(0);
            expect(Object.keys(changes.updates).length).to.equal(0);
            expect(Object.keys(changes.deletes).length).to.equal(0);
        });
    });
    describe('commit', function () {
        it('should be a function', function () {
            expect(tracker.commit).to.be.a('function');
        });
        it('should return true if the supplied object is a tracked object', function () {
            expect(tracker.commit(tracked)).to.equal(true);
        });
        it('should return false if the supplied object is not a tracked object', function () {
            expect(tracker.commit({})).to.equal(false);
        });
        it('should commit all inserts to the tracked object', function () {
            tracked.foo = 'bar';
            var changes = tracker.changes(tracked);
            expect(changes.inserts.foo).to.equal('bar');
            tracker.commit(tracked);
            changes = tracker.changes(tracked);
            expect(Object.keys(changes.inserts).length).to.equal(0);
            expect(tracked.foo).to.equal('bar');
        });
        it('should commit all updates to the tracked object', function () {
            tracked.foo = 'bar';
            tracker.commit(tracked);
            var changes = tracker.changes(tracked);
            expect(Object.keys(changes.updates).length).to.equal(0);
            tracked.foo = 'baz';
            changes = tracker.changes(tracked);
            expect(changes.updates.foo).to.be.an('object');
            expect(changes.updates.foo.value).to.equal('baz');
            expect(changes.updates.foo.old).to.equal('bar');
            tracker.commit(tracked);
            changes = tracker.changes(tracked);
            expect(Object.keys(changes.updates).length).to.equal(0);
        });
        it('should commit all deletes to the tracked object', function () {
            tracked.foo = 'bar';
            tracker.commit(tracked);
            var changes = tracker.changes(tracked);
            expect(Object.keys(changes.updates).length).to.equal(0);
            delete tracked.foo;
            changes = tracker.changes(tracked);
            expect(changes.deletes).to.be.an('object');
            expect(changes.deletes.foo).to.equal('bar');
            tracker.commit(tracked);
            changes = tracker.changes(tracked);
            expect(Object.keys(changes.deletes).length).to.equal(0);
        });
    });
    describe('reset', function () {
        it('should be a function', function () {
            expect(tracker.reset).to.be.a('function');
        });
        it('should return true if the supplied object is a tracked object', function () {
            expect(tracker.reset(tracked)).to.equal(true);
        });
        it('should return false if the supplied object is not a tracked object', function () {
            expect(tracker.reset({})).to.equal(false);
        });
        it('should handle circular references', function () {
            tracked.circ = tracked;
            tracker.commit(tracked);
            expect(tracker.reset(tracked)).to.equal(true);
        });
        it('should revert at a descriptor level', function () {
            // Note: We do this first set and define property
            //  for coverage reasons
            var val = 'barbaz';
            Object.defineProperty(tracked, 'foo', {
                enumerable: true,
                configurable: true,
                get: function () { return val },
                set: function (v) { val = v; }
            });
            tracker.commit(tracked);
            expect(tracked.foo).to.equal('barbaz');
            tracked.foo = 'bar';
            expect(tracker.changes(tracked).updates.foo.value).to.equal('bar');
            tracker.commit(tracked);
            Object.defineProperty(tracked, 'foo', {
                enumerable: true,
                configurable: true,
                writable: true,
                value: 456
            });
            expect(tracked.foo).to.equal(456);

            var desc = Object.getOwnPropertyDescriptor(tracked, 'foo');
            expect(desc).to.be.an('object');
            expect(desc.value).to.equal(456);

            tracker.reset(tracked);

            desc = Object.getOwnPropertyDescriptor(tracked, 'foo');
            expect(desc).to.be.an('object');
            expect(desc.value).to.equal(undefined);
            expect(desc.get).to.be.a('function');
            expect(tracked.foo).to.equal('bar');
        });
        it('should revert all additions to the tracked object', function () {
            tracked.foo = 'bar';
            var changes = tracker.changes(tracked);
            expect(changes.inserts.foo).to.equal('bar');
            tracker.reset(tracked);
            changes = tracker.changes(tracked);
            expect(Object.keys(changes.inserts).length).to.equal(0);
            expect(tracked.foo).to.equal(undefined);
        });
        it('should revert all udpates to the tracked object', function () {
            tracked.foo = 'bar';
            tracker.commit(tracked);
            var changes = tracker.changes(tracked);
            expect(Object.keys(changes.updates).length).to.equal(0);
            tracked.foo = 'baz';
            changes = tracker.changes(tracked);
            expect(changes.updates.foo).to.be.an('object');
            expect(changes.updates.foo.value).to.equal('baz');
            expect(changes.updates.foo.old).to.equal('bar');
            tracker.reset(tracked);
            changes = tracker.changes(tracked);
            expect(Object.keys(changes.updates).length).to.equal(0);
        });
        it('should revert all deletions from the tracked object', function () {
            tracked.foo = 'bar';
            tracker.commit(tracked);
            var changes = tracker.changes(tracked);
            expect(Object.keys(changes.updates).length).to.equal(0);
            delete tracked.foo;
            delete tracked.nonexistant; // For coverage
            changes = tracker.changes(tracked);
            expect(changes.deletes).to.be.an('object');
            expect(changes.deletes.foo).to.equal('bar');
            tracker.reset(tracked);
            changes = tracker.changes(tracked);
            expect(Object.keys(changes.deletes).length).to.equal(0);
            expect(tracked.foo).to.equal('bar');
        });
        it('should call options.customRevert if it is supplied', function () {
            var cr = chai.spy();
            tracked = tracker({}, {
                customRevert: cr
            });
            tracked.foo = 'bar';
            tracker.commit(tracked);
            tracked.foo = 'baz';
            tracker.reset(tracked);
            expect(cr).to.have.been.called.once.with(tracked, 'foo');
        });
        it('should not do normal reversion if options.customRevert returns true', function () {
            var cr = chai.spy(() => true);
            tracked = tracker({}, {
                customRevert: cr
            });
            tracked.foo = 'bar';
            tracker.commit(tracked);
            tracked.foo = 'baz';
            tracker.reset(tracked);
            expect(cr).to.have.been.called.once.with(tracked, 'foo');
            expect(tracked.foo).to.equal('baz');
        });
    });
});
