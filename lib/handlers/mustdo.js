'use strict';
/* ============================================================
   /api/mustdo        (Must Do's widgets)

   Your Must Do's database has one row per day and one CHECKBOX
   property per must-do. So:
     the list of must-dos  = the checkbox properties of the database
     adding a must-do      = adding a checkbox property
     removing a must-do    = deleting that property (and its past ticks)

   GET  ?days=35                  today, habits, today's ticks, last N days
   POST {action:'ensure'}                      make sure today's row exists
   POST {action:'toggle', pageId, prop, value} tick / untick one box
   POST {action:'habit-add', label}
   POST {action:'habit-remove', key}

   Every write answers with the fresh list of habits, so the widget
   never has to guess. The database is read again on every request
   (nothing is cached on the server).
   Optional env: DB_MUSTDO (already used by the other widgets)
   ============================================================ */
const { DBS, HttpError, notion, queryAll, wrap, readBody, getAllowedPage, todayStr, addDays } = require('../lib/notion');

const DB = DBS.mustdo;
const RESERVED = ['name', 'date', 'status', 'progress'];
/* The order you already see in Notion; anything new is added after these, in database order. */
const KNOWN_ORDER = ['Night Care Begin at 9 pm', 'Sleep before 11 pm', 'Wake up before 6 am', 'Morning quick routine', 'Bank Officer in Making',
  'Eggs & Breakfast', 'Morning Sunlight', 'Yoga & Workout', 'Grooming & Bathing', 'Evening Sunlight', 'Seeds & Peanuts'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

async function schema() {
  const db = await notion(`/databases/${DB}`);
  const props = db.properties || {};
  const habits = Object.entries(props).filter(([, p]) => p.type === 'checkbox').map(([name]) => ({ key: name, label: name.trim() }));
  const rank = h => { const i = KNOWN_ORDER.findIndex(k => k.toLowerCase() === h.label.toLowerCase()); return i < 0 ? 999 : i; };
  habits.forEach((h, i) => { h.o = i; });
  habits.sort((a, b) => rank(a) - rank(b) || a.o - b.o);
  habits.forEach(h => { delete h.o; });
  return { props, habits };
}

const countDone = (row, habits) => habits.filter(h => row.properties && row.properties[h.key] && row.properties[h.key].checkbox).length;
const rowDate = r => { const d = r.properties && r.properties.Date && r.properties.Date.date; return d && d.start ? d.start.slice(0, 10) : null; };

async function findToday(today) {
  const rows = await queryAll(DB, { filter: { property: 'Date', date: { equals: today } }, page_size: 10 }, 10);
  return rows[0] || null;
}

async function ensureToday(habits) {
  const today = todayStr();
  let row = await findToday(today);
  if (!row) {
    const d = new Date(today + 'T00:00:00Z');
    const name = `${DOW[d.getUTCDay()]}, ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`;
    row = await notion('/pages', {
      method: 'POST',
      body: { parent: { database_id: DB }, properties: {
        Name: { title: [{ text: { content: name } }] },
        Date: { date: { start: today } },
      } },
    });
  }
  return { id: row.id, date: today, done: countDone(row, habits), total: habits.length };
}

async function read(days) {
  const { habits } = await schema();
  const today = todayStr();
  const from = addDays(today, -(days - 1));
  const rows = await queryAll(DB, {
    filter: { and: [{ property: 'Date', date: { on_or_after: from } }, { property: 'Date', date: { on_or_before: today } }] },
    sorts: [{ property: 'Date', direction: 'ascending' }],
  }, 200);
  const out = [];
  let todayRow = null;
  for (const r of rows) {
    const date = rowDate(r); if (!date) continue;
    out.push({ id: r.id, date, done: countDone(r, habits), total: habits.length });
    if (date === today) todayRow = r;
  }
  const checks = {};
  if (todayRow) habits.forEach(h => { checks[h.key] = !!(todayRow.properties[h.key] && todayRow.properties[h.key].checkbox); });
  return { today, habits, checks, todayRowId: todayRow ? todayRow.id : null, rows: out };
}

async function addHabit(label) {
  label = String(label || '').replace(/\s+/g, ' ').trim();
  if (!label) throw new HttpError(400, 'Give the must do a name.');
  if (label.length > 80) throw new HttpError(400, 'That name is too long (80 characters at most).');
  const { props, habits } = await schema();
  const low = label.toLowerCase();
  if (RESERVED.includes(low)) throw new HttpError(400, `"${label}" is a reserved name in the database. Pick another.`);
  if (Object.keys(props).some(k => k.trim().toLowerCase() === low)) throw new HttpError(409, `"${label}" already exists.`);
  await notion(`/databases/${DB}`, { method: 'PATCH', body: { properties: { [label]: { checkbox: {} } } } });
  const fresh = await schema();
  return { ok: true, key: label, habits: fresh.habits.length > habits.length ? fresh.habits : habits.concat([{ key: label, label }]) };
}

async function removeHabit(key) {
  const { props, habits } = await schema();
  const p = props[key];
  if (!p) throw new HttpError(404, 'That must do is already gone.');
  if (p.type !== 'checkbox') throw new HttpError(400, 'Only must-do checkboxes can be removed here.');
  await notion(`/databases/${DB}`, { method: 'PATCH', body: { properties: { [key]: null } } });
  return { ok: true, habits: habits.filter(h => h.key !== key) };
}

async function toggle({ pageId, prop, value }) {
  await getAllowedPage(pageId, [DB]);
  const { props } = await schema();
  if (!props[prop] || props[prop].type !== 'checkbox') throw new HttpError(404, 'That must do no longer exists.');
  await notion(`/pages/${pageId}`, { method: 'PATCH', body: { properties: { [prop]: { checkbox: !!value } } } });
  return { ok: true };
}

module.exports = wrap(async (req, res) => {
  if (req.method === 'GET') {
    const url = new URL(req.url || '/', 'http://local');
    const days = Math.min(120, Math.max(7, parseInt(url.searchParams.get('days'), 10) || 35));
    return res.status(200).json(await read(days));
  }
  if (req.method !== 'POST') throw new HttpError(405, 'Use GET or POST.');
  const b = readBody(req);
  switch (b.action) {
    case 'ensure': { const { habits } = await schema(); return res.status(200).json(await ensureToday(habits)); }
    case 'toggle': return res.status(200).json(await toggle(b));
    case 'habit-add': return res.status(200).json(await addHabit(b.label));
    case 'habit-remove': return res.status(200).json(await removeHabit(b.key));
    default: throw new HttpError(400, 'Unknown action.');
  }
});
