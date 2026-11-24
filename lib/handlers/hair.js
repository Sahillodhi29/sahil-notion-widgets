'use strict';
/* /api/hair : "Best Hair" habits, foods and treatments. Optional env override: DB_HAIR
   Items numbered 1-20 are the daily Habits & Foods; 21 and up are the Cleaning & Treatment steps. */
const { makeTracker } = require('../tracker');
module.exports = makeTracker({
  name: 'hair',
  dbId: process.env.DB_HAIR || '422fa221698781f7a2c5c815464538da',
  groupOf: num => (num != null && num >= 21 ? 'Cleaning & treatment' : 'Habits & foods'),
});
