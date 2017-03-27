/**
 * @module Test helper module. This module performs setup of the test environment to make
 *  some things simpler.
 */

'use strict';

// Load chai so we can expose it.
const chai = require('chai'),
    cap = require('chai-as-promised'),
    spies = require('chai-spies');

// Add spies to chai
chai.use(cap);
chai.use(spies);

// Exose chai, and it's expect and assert functions as global variables
global.chai = chai;
global.expect = chai.expect;
global.assert = chai.assert;
