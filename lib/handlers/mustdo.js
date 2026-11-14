'use strict';
/* ============================================================
   /api/mustdo  : data + actions for the Must Do's widgets

   The Must Do's database has one row per day (Date + Name) and one
   checkbox property per must-do. A checked box is that habit done
   that day, so the week chart and the month heatmap are just history.

   GET   /api/mustdo?days=35
         -> { today, habits: [{ key, label }], rows: [{ id, date, done, total }] }

   POST  { action: ... }
         ensure               create today's row if it is missing
         toggle { pageId, prop, value }   tick one habit on one day
         habit-add { label }  add a new must-do (a new checkbox property)
         habit-remove { key } remove a must-do from the database

   Optional env override: DB_MUSTDO
   ============================================================ */
const {
  DBS, HttpError, notion, queryAll, wrap, readBody, getAllowedPage, norm, todayStr,
} = require('../notion');

const DB = { mustDo: norm(process.env.DB_MUSTDO || DBS.mustdo) };

const MUST_TITLE = 'Name';
const MUST_DATE = 'Date';
const MAX_ROWS = 120;
const KEEP = new Set(['name', 'date', 'status', 'progress']);   // properties that are not must-do's

const labelOf = k => String(k == null ? '' : k).trim();
const keyOf = label => label.replace(/\s+/g, ' ').trim();

/* ---------- schema, cached for 5 minutes ---------- */
const schemaCache = new Map();
async function propsOf(fresh) {
  const hit = schemaCache.get(DB.mustDo);
  if (!fresh && hit && Date.now() - hit.t < 300000) return hit.props;
  const db = await notion(`/databases/${DB.mustDo}`);
  schemaCache.set(DB.mustDo, { t: Date.now(), props: db.properties || {} });
  return db.properties || {};
}

const isHabit = (name, p) => p && p.type === 'checkbox' && !KEEP.has(String(name).trim().toLowerCase());

function habitsFrom(props) {
  return Object.entries(props)
    .filter(([name, p]) => isHabit(name, p))
    .map(([key]) => ({ key, label: labelOf(key) }));
}

/* ---------- reading ---------- */
function rowFrom(page, total) {
  const P = page.properties || {};
  const d = P[MUST_DATE] && P[MUST_DATE].date;
  if (!d || !d.start) return null;
  let done = 0;
  for (const [key, p] of Object.entries(P)) {
    if (p && p.type === 'checkbox' && !KEEP.has(key.trim().toLowerCase()) && p.checkbox) done++;
  }
  return { id: page.id, date: d.start.slice(0, 10), done, total };
}

async function load(today) {
  const [props, pages] = await Promise.all([
    propsOf(false),
    queryAll(DB.mustDo, { sorts: [{ property: MUST_DATE, direction: 'descending' }] }, MAX_ROWS),
  ]);
  const habits = habitsFrom(props);
  const rows = pages.map(p => rowFrom(p, habits.length)).filter(Boolean);
  const todayPage = pages.find(p => {
    const d = p.properties && p.properties[MUST_DATE] && p.properties[MUST_DATE].date;
    return d && d.start && d.start.slice(0, 10) === today;
  });
  let checks = null;
  if (todayPage) {
    checks = {};
    for (const h of habits) checks[h.key] = !!(todayPage.properties[h.key] && todayPage.properties[h.key].checkbox);
  }
  return { habits, rows, checks, todayRowId: todayPage ? todayPage.id : null };
}

/* ---------- writing ---------- */
function dayTitle(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()];
  const mo = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()];
  return `${wd}, ${d.getUTCDate()} ${mo}`;
}

async function ensureRow(today) {
  const { rows } = await load(today);
  const hit = rows.find(r => r.date === today);
  if (hit) return hit;
  const page = await notion('/pages', {
    method: 'POST',
    body: {
      parent: { database_id: DB.mustDo },
      properties: {
        [MUST_TITLE]: { title: [{ type: 'text', text: { content: dayTitle(today) } }] },
        [MUST_DATE]: { date: { start: today } },
      },
    },
  });
  schemaCache.delete(DB.mustDo);
  const habits = habitsFrom(await propsOf(true));
  const row = rowFrom(page, habits.length);
  return row || { id: page.id, date: today, done: 0, total: habits.length };
}

async function toggle(pageId, prop, value) {
  const page = await getAllowedPage(pageId, [DB.mustDo]);
  const p = page.properties && page.properties[prop];
  if (!p || p.type !== 'checkbox' || KEEP.has(String(prop).trim().toLowerCase())) {
    throw new HttpError(400, 'That is not a must-do checkbox.');
  }
  await notion(`/pages/${pageId}`, { method: 'PATCH', body: { properties: { [prop]: { checkbox: !!value } } } });
  return { ok: true };
}

/* keep Notion's own Progress formula in step with the habit list */
async function syncProgress(props) {
  const f = props.Progress;
  if (!f || f.type !== 'formula' || !f.formula || !f.formula.expression) return;
  const names = habitsFrom(props).map(h => h.key);
  if (!names.length) return;
  const sum = names.map(n => `toNumber(prop("${String(n).replace(/"/g, '\\"')}"))`).join(',\n\t');
  const expr = `round((sum(\n\t${sum}\n) / ${names.length}) * 1000) / 1000`;
  try {
    await notion(`/databases/${DB.mustDo}`, { method: 'PATCH', body: { properties: { Progress: { formula: { expression: expr } } } } });
  } catch (e) { /* the widgets do their own maths; a stale formula is not fatal */ }
  schemaCache.delete(DB.mustDo);
}

async function addHabit(rawLabel) {
  const label = keyOf(String(rawLabel || ''));
  if (!label) throw new HttpError(400, 'Give the must-do a name.');
  if (label.length > 80) throw new HttpError(400, 'Keep the name under 80 characters.');
  if (KEEP.has(label.toLowerCase())) throw new HttpError(400, `"${label}" is a reserved name.`);
  const props = await propsOf(true);
  if (habitsFrom(props).length >= 30) throw new HttpError(400, 'That is already 30 must-do\'s — trim some first.');
  const exists = Object.keys(props).some(k => labelOf(k).toLowerCase() === label.toLowerCase());
  if (exists) throw new HttpError(400, `"${label}" is already on the list.`);
  const done = await notion(`/databases/${DB.mustDo}`, {
    method: 'PATCH',
    body: { properties: { [label]: { checkbox: {} } } },
  });
  schemaCache.delete(DB.mustDo);
  await syncProgress(done.properties || {});
  return { ok: true, habit: { key: label, label } };
}

async function removeHabit(key) {
  const props = await propsOf(true);
  const p = props[key];
  if (!isHabit(key, p)) throw new HttpError(400, 'That is not a must-do.');
  if (habitsFrom(props).length <= 1) throw new HttpError(400, 'Keep at least one must-do on the list.');
  const done = await notion(`/databases/${DB.mustDo}`, {
    method: 'PATCH',
    body: { properties: { [key]: null } },
  });
  schemaCache.delete(DB.mustDo);
  await syncProgress(done.properties || {});
  return { ok: true, removed: labelOf(key) };
}

/* ---------- handler ---------- */
module.exports = wrap(async (req, res) => {
  const today = todayStr();

  if (req.method === 'GET') {
    const q = new URL(req.url, 'http://local').searchParams;
    const days = Math.min(120, Math.max(1, parseInt(q.get('days'), 10) || 35));
    const { habits, rows, checks, todayRowId } = await load(today);
    const cut = new Date(today + 'T00:00:00Z');
    cut.setUTCDate(cut.getUTCDate() - (days - 1));
    const from = cut.toISOString().slice(0, 10);
    return res.status(200).json({
      today,
      habits,
      rows: rows.filter(r => r.date >= from),
      checks,
      todayRowId,
      generatedAt: new Date().toISOString(),
    });
  }

  if (req.method === 'POST') {
    const b = readBody(req);
    switch (b.action) {
      case 'ensure':        return res.status(200).json(await ensureRow(today));
      case 'toggle':        return res.status(200).json(await toggle(String(b.pageId || ''), String(b.prop || ''), b.value));
      case 'habit-add':     return res.status(200).json(await addHabit(b.label));
      case 'habit-remove':  return res.status(200).json(await removeHabit(String(b.key || '')));
      default: throw new HttpError(400, 'Unknown action.');
    }
  }

  res.setHeader('Allow', 'GET, POST');
  throw new HttpError(405, 'Method not allowed.');
});

module.exports.DB = DB;
module.exports.load = load;
