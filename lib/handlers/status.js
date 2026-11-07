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
  // The Meal Planner writes one Daily Log row per meal per day, so several rows
  // share a date; shape() folds them into one entry per day, one item per meal.
  meal:    norm(process.env.DB_MEAL || DBS.mealLog),
};
const DATE_PROP = 'Date';

function monday(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  const back = (d.getUTCDay() + 6) % 7;           // Monday = 0
  return addDays(dateStr, -back);
}

function shape(rows) {
  const byDate = new Map();
  for (const r of rows) {
    const props = r.properties || {};
    const d = props[DATE_PROP] && props[DATE_PROP].date;
    if (!d || !d.start) continue;
    const date = d.start.slice(0, 10);
    let items;
    if (props.Planned && props.Planned.type === 'multi_select') {
      // Daily Log: this row is one meal of the day; it is done when everything planned was eaten.
      const planned = (props.Planned.multi_select || []).map(o => o.name);
      const eaten = ((props.Eaten && props.Eaten.multi_select) || []).map(o => o.name);
      const name = ((props.Name && props.Name.title) || []).map(t => t.plain_text).join('').trim() || 'Meal';
      items = [{ label: name, done: planned.length > 0 && planned.every(p => eaten.includes(p)) }];
    } else {
      items = [];
      for (const [name, p] of Object.entries(props)) {
        if (p.type === 'checkbox') items.push({ label: name.trim(), done: !!p.checkbox });
      }
    }
    const row = byDate.get(date);
    if (row) row.items.push(...items);
    else byDate.set(date, { date, items });
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
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
