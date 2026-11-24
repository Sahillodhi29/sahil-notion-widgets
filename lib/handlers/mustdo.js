'use strict';
/* /api/mustdo : the Must Do's checklist ("Best Version of Me"). Optional env override: DB_MUSTDO */
const { DBS } = require('../notion');
const { makeTracker } = require('../tracker');
module.exports = makeTracker({ name: 'mustdo', dbId: process.env.DB_MUSTDO || DBS.mustdo });
