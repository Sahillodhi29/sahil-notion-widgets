'use strict';
/* ============================================================
   /api/workout  : data + actions for the Workout Planner widgets

   GET  /api/workout?days=56 -> Workout Log rows (with page ids) for the last
                                N days plus the next two weeks, the weekly
                                schedule, and today's date.
   POST /api/workout         -> { action: 'toggle', pageId, prop, value }
                                { action: 'ensure' }   (create today's row)

   Same rules as /api/meal and /api/sail: reads take ?key=, writes need the
   x-widget-key header, and writes can only touch pages inside the Workout Log.

   THE WEEKLY SCHEDULE lives here, in one place. The widgets get it from the
   GET response, so change it here and every widget follows.
   ============================================================ */
const { HttpError, notion, queryAll, wrap, readBody, getAllowedPage, todayStr, addDays } = require('../lib/notion');
const { LOGS } = require('./status');

const DATE_PROP = 'Date';
const MAX_DAYS = 120;
const AHEAD = 14;               // days of planned sessions to include after today
const WORKOUT_TIME = '5:00 PM'; // shown on rest days ("next workout ...")

// 0 = Sunday ... 6 = Saturday.  'workout' | 'bonus' (optional session) | 'rest'
const SCHEDULE = { 0: 'bonus', 1: 'workout', 2: 'rest', 3: 'workout', 4: 'rest', 5: 'workout', 6: 'rest' };
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Display order of the checkboxes (matched ignoring case, spaces and the "x2" suffix).
const ORDER = [
  'wide pushups', 'incline pushups', 'diamond pushups',
  'wide pullups', 'close pullups', 'chin ups',
  'goated leg',
  'pre-workout snack', 'post-workout snack',
];

const norm = s => String(s).toLowerCase().replace(/\s*x\d+$/i, '').replace(/\s+/g, ' ').trim();

// Which part of the session a checkbox belongs to. New checkboxes you add later are sorted by name.
function groupOf(label) {
  const l = label.toLowerCase();
  if (/snack|meal|fuel/.test(l)) return 'fuel';
  if (/leg|squat|lunge/.test(l)) return 'legs';
  if (/pull|chin/.test(l)) return 'pull';
  if (/push|dip/.test(l)) return 'push';
  return 'other';
}

const weekdayOf = d => new Date(d + 'T00:00:00Z').getUTCDay();
const kindOf = d => SCHEDULE[weekdayOf(d)] || 'workout';

function rankOf(label) {
  const i = ORDER.indexOf(norm(label));
  return i === -1 ? 999 : i;
}

function shapeRow(r) {
  const props = r.properties || {};
  const d = props[DATE_PROP] && props[DATE_PROP].date;
  if (!d || !d.start) return null;
  const items = [];
  let idx = 0;
  for (const [key, p] of Object.entries(props)) {
    if (p.type !== 'checkbox') continue;
    const label = key.trim();
    items.push({ key, label, name: label.replace(/\s*x\d+$/i, ''), group: groupOf(label), done: !!p.checkbox, _o: idx++ });
  }
  items.sort((a, b) => (rankOf(a.label) - rankOf(b.label)) || (a._o - b._o) || a.label.localeCompare(b.label));
  items.forEach(i => { delete i._o; });
  const date = d.start.slice(0, 10);
  return { id: r.id, date, kind: kindOf(date), items };
}

function shape(rows, from, to) {
  const out = [];
  for (const r of rows) {
    const s = shapeRow(r);
    if (s && s.date >= from && s.date <= to) out.push(s);
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

async function load(from, to) {
  // Ask for one extra day on each side, then trim by the date as written in your time zone.
  const rows = await queryAll(LOGS.workout, {
    filter: { and: [
      { property: DATE_PROP, date: { on_or_after: addDays(from, -1) } },
      { property: DATE_PROP, date: { on_or_before: addDays(to, 1) } },
    ] },
    sorts: [{ property: DATE_PROP, direction: 'ascending' }],
  }, 200);
  return shape(rows, from, to);
}

/* ---------- actions ---------- */
async function toggle(pageId, prop, value) {
  const page = await getAllowedPage(pageId, [LOGS.workout]);
  const p = page.properties && page.properties[prop];
  if (!p || p.type !== 'checkbox') throw new HttpError(400, `"${prop}" is not a checkbox in the Workout Log.`);
  await notion(`/pages/${pageId}`, { method: 'PATCH', body: { properties: { [prop]: { checkbox: !!value } } } });
  return { ok: true };
}

// Creates today's row if there isn't one yet. The title says whether it is a training or rest day;
// the widgets decide what to show from the weekly schedule, so a rest-day row only asks for the snacks.
async function ensure(today) {
  const existing = (await load(today, today))[0];
  if (existing) return { ok: true, created: false, row: existing };

  const db = await notion(`/databases/${LOGS.workout}`);
  const titleKey = Object.keys(db.properties || {}).find(k => db.properties[k].type === 'title');
  if (!titleKey || !db.properties[DATE_PROP]) throw new HttpError(500, 'The Workout Log needs a title property and a "Date" property.');

  const kind = kindOf(today);
  const title = `${WEEKDAYS[weekdayOf(today)]}'s ${kind === 'rest' ? 'Rest' : 'Workout'}`;
  const page = await notion('/pages', {
    method: 'POST',
    body: {
      parent: { database_id: LOGS.workout },
      properties: {
        [titleKey]: { title: [{ type: 'text', text: { content: title } }] },
        [DATE_PROP]: { date: { start: today } },
      },
    },
  });
  const row = shapeRow(page);
  if (!row) throw new HttpError(502, 'Notion created the row but it came back without a date.');
  return { ok: true, created: true, row };
}

module.exports = wrap(async (req, res) => {
  const today = todayStr();

  if (req.method === 'GET') {
    const q = new URL(req.url, 'http://local').searchParams;
    const days = Math.min(MAX_DAYS, Math.max(7, parseInt(q.get('days'), 10) || 56));
    const from = addDays(today, -(days - 1));
    const rows = await load(from, addDays(today, AHEAD));
    return res.status(200).json({
      today, from, rows, schedule: SCHEDULE, time: WORKOUT_TIME, generatedAt: new Date().toISOString(),
    });
  }

  if (req.method === 'POST') {
    const b = readBody(req);
    if (b.action === 'toggle') return res.status(200).json(await toggle(b.pageId, String(b.prop || ''), b.value));
    if (b.action === 'ensure') return res.status(200).json(await ensure(today));
    throw new HttpError(400, 'Unknown action.');
  }

  res.setHeader('Allow', 'GET, POST');
  throw new HttpError(405, 'Method not allowed.');
});
