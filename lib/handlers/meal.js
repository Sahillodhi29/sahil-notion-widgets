'use strict';
/* ============================================================
   /api/meal  : data + actions for the Meal Planner widgets

   GET  /api/meal?days=35  -> Meal Log rows (with page ids) for the last N days
   POST /api/meal          -> { action: 'toggle', pageId, prop, value }
                              { action: 'start-day' }  (creates today's row if it doesn't exist yet)

   Same rules as /api/sail: reads take ?key=, writes need the
   x-widget-key header. Locked down to pages inside the Meal Log.
   ============================================================ */
const { HttpError, notion, queryAll, wrap, readBody, getAllowedPage, todayStr, addDays } = require('../notion');
const { LOGS } = require('./status');

const DATE_PROP = 'Date';
const MAX_DAYS = 120;
const TITLE_FALLBACK = 'Session';     // the Meal Log's title property
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function shape(rows) {
  const out = [];
  for (const r of rows) {
    const props = r.properties || {};
    const d = props[DATE_PROP] && props[DATE_PROP].date;
    if (!d || !d.start) continue;
    const items = [];
    for (const [key, p] of Object.entries(props)) {
      if (p.type === 'checkbox') items.push({ key, label: key.trim(), done: !!p.checkbox });
    }
    out.push({ id: r.id, date: d.start.slice(0, 10), items });
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

async function toggle(pageId, prop, value) {
  const page = await getAllowedPage(pageId, [LOGS.meal]);
  const p = page.properties && page.properties[prop];
  if (!p || p.type !== 'checkbox') throw new HttpError(400, `"${prop}" is not a checkbox in the Meal Log.`);
  await notion(`/pages/${pageId}`, { method: 'PATCH', body: { properties: { [prop]: { checkbox: !!value } } } });
  return { ok: true };
}

/* Does the same job as the Notion "New Day" button: one row per day, titled "<Weekday>'s Meals". */
async function startDay(today) {
  const found = await queryAll(LOGS.meal, { filter: { property: DATE_PROP, date: { equals: today } } }, 5);
  if (found.length) return { ok: true, created: false, row: shape([found[0]])[0] };   // never makes a second row for the day

  let titleProp = TITLE_FALLBACK;
  try {
    const db = await notion(`/databases/${LOGS.meal}`);
    titleProp = Object.keys(db.properties || {}).find(k => db.properties[k].type === 'title') || TITLE_FALLBACK;
  } catch (e) { /* keep the fallback */ }

  const name = `${WEEKDAYS[new Date(today + 'T00:00:00Z').getUTCDay()]}'s Meals`;
  const page = await notion('/pages', {
    method: 'POST',
    body: {
      parent: { database_id: LOGS.meal },
      properties: {
        [titleProp]: { title: [{ type: 'text', text: { content: name } }] },
        [DATE_PROP]: { date: { start: today } },
      },
    },
  });
  let row = shape([page])[0];
  if (!row || !row.items.length) row = shape([await notion(`/pages/${page.id}`)])[0];
  return { ok: true, created: true, row };
}

module.exports = wrap(async (req, res) => {
  const today = todayStr();

  if (req.method === 'GET') {
    const q = new URL(req.url, 'http://local').searchParams;
    const days = Math.min(MAX_DAYS, Math.max(7, parseInt(q.get('days'), 10) || 35));
    const from = addDays(today, -(days - 1));
    const rows = await queryAll(LOGS.meal, {
      filter: { and: [
        { property: DATE_PROP, date: { on_or_after: from } },
        { property: DATE_PROP, date: { on_or_before: today } },
      ] },
      sorts: [{ property: DATE_PROP, direction: 'ascending' }],
    }, 150);
    return res.status(200).json({ today, from, rows: shape(rows), generatedAt: new Date().toISOString() });
  }

  if (req.method === 'POST') {
    const b = readBody(req);
    if (b.action === 'toggle') return res.status(200).json(await toggle(b.pageId, String(b.prop || ''), b.value));
    if (b.action === 'start-day') return res.status(200).json(await startDay(today));
    throw new HttpError(400, 'Unknown action.');
  }

  res.setHeader('Allow', 'GET, POST');
  throw new HttpError(405, 'Method not allowed.');
});
