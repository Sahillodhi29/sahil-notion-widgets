'use strict';
/* ============================================================
   GET /api/status
   Read-only. Returns the checkbox history of your Must Do's,
   Workout Log and Meal Log databases for this month (plus any
   planned sessions in the next few weeks). The widget draws the
   charts; this file only reads and tidies.

   Optional env overrides: DB_MEAL, DB_WORKOUT (DB_MUSTDO already exists)
   ============================================================ */
const { DBS, HttpError, queryAll, wrap, norm, todayStr, addDays } = require('../notion');

const LOGS = {
  mustdo:  DBS.mustdo,
  workout: norm(process.env.DB_WORKOUT || 'ad93fbddb08f4fee8f20f077aae7d05c'),
  meal:    norm(process.env.DB_MEAL    || '402bc623392a444d86a49bce61e7008b'),
};
const DATE_PROP = 'Date';

function monday(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  const back = (d.getUTCDay() + 6) % 7;           // Monday = 0
  return addDays(dateStr, -back);
}

function shape(rows) {
  const out = [];
  for (const r of rows) {
    const props = r.properties || {};
    const d = props[DATE_PROP] && props[DATE_PROP].date;
    if (!d || !d.start) continue;
    const items = [];
    for (const [name, p] of Object.entries(props)) {
      if (p.type === 'checkbox') items.push({ label: name.trim(), done: !!p.checkbox });
    }
    out.push({ date: d.start.slice(0, 10), items });
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

async function load(dbId, from, to) {
  try {
    const rows = await queryAll(dbId, {
      filter: { and: [
        { property: DATE_PROP, date: { on_or_after: from } },
        { property: DATE_PROP, date: { on_or_before: to } },
      ] },
      sorts: [{ property: DATE_PROP, direction: 'ascending' }],
    }, 150);
    return { rows: shape(rows) };
  } catch (e) {
    return { error: e.message, hint: e.hint };
  }
}

module.exports = wrap(async (req, res) => {
  if (req.method !== 'GET') throw new HttpError(405, 'Use GET.');
  const today = todayStr();
  const monthStart = today.slice(0, 8) + '01';
  const from = [monday(today), monthStart].sort()[0];
  const to = addDays(today, 35);
  const [mustdo, workout, meal] = await Promise.all([
    load(LOGS.mustdo, from, to), load(LOGS.workout, from, to), load(LOGS.meal, from, to),
  ]);
  res.status(200).json({ today, from, mustdo, workout, meal, generatedAt: new Date().toISOString() });
});

module.exports.LOGS = LOGS;
