'use strict';
/* /api/face : "Best Face" routine. Optional env override: DB_FACE */
const { makeTracker } = require('../tracker');
module.exports = makeTracker({ name: 'face', dbId: process.env.DB_FACE || '422fa221698781b4a963e3c56ba5a09b' });
