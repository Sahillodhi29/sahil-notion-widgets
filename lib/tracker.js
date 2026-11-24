'use strict';
/* ============================================================
   A daily checklist tracker: one Notion row per day, one checkbox property per item.
   Must Do's, Best Hair and Best Face all run on this file (see handlers/mustdo.js, hair.js, face.js).

   How an item is written in Notion (the checkbox property's NAME):
     "07 · I must do my morning routine :: Gargle · Drink · Yoga @wed"
      │      │                             │                    └ optional tags: @opt = tracked but not counted in the %,
      │      │                             │                      @wed or @sat,sun = only counts on those weekdays
      │      │                             └ optional small line shown under the item
      │      └ the item
      └ optional number that sets the order (01 · … 20 · …); items without one go last
   ============================================================ */
const { HttpError, notion, queryAll, wrap, readBody, getAllowedPage, norm, todayStr } = require('./notion');

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const KEEP = new Set(['name', 'date', 'status', 'progress']);       // properties that are not checklist items
const TITLE = 'Name', DATEP = 'Date', MAX_ROWS = 120;

/* "07 · Label :: detail @opt"  ->  { key, label, detail, num, opt, days } */
function parseKey(raw) {
  const key = String(raw == null ? '' : raw);
  let s = key.trim(), opt = false, days = null, m;
  if ((m = /\s@([a-z,]+)\s*$/i.exec(s))) {
    s = s.slice(0, m.index);
    for (const t of m[1].toLowerCase().split(',')) {
      if (t === 'opt') opt = true;
      else { const i = DAYS.indexOf(t.slice(0, 3)); if (i >= 0) (days = days || []).push(i); }
    }
  }
  let num = null;
  if ((m = /^(\d{1,2})\s*·\s*/.exec(s)) || (m = /^(\d{1,2})[.)]\s+/.exec(s))) { num = +m[1]; s = s.slice(m[0].length); }
  let detail = '';
  const i = s.indexOf(' :: ');
  if (i >= 0) { detail = s.slice(i + 4).trim(); s = s.slice(0, i); }
  return { key, label: s.trim(), detail, num, opt, days };
}
const weekdayOf = date => new Date(date + 'T00:00:00Z').getUTCDay();
const applies = (h, date) => !h.opt && (!h.days || h.days.includes(weekdayOf(date)));

function makeTracker({ name, dbId, groupOf, extraKeep }) {
  const DB = norm(dbId);
  const keep = new Set([...KEEP, ...(extraKeep || [])]);
  const isHabit = (n, p) => p && p.type === 'checkbox' && !keep.has(String(n).trim().toLowerCase());

  const schemaCache = new Map();
  async function propsOf(fresh) {
    const hit = schemaCache.get(DB);
    if (!fresh && hit && Date.now() - hit.t < 300000) return hit.props;
    const db = await notion(`/databases/${DB}`);
    schemaCache.set(DB, { t: Date.now(), props: db.properties || {} });
    return db.properties || {};
  }

  function habitsFrom(props) {
    const list = Object.entries(props).filter(([n, p]) => isHabit(n, p)).map(([n], i) => ({ ...parseKey(n), _i: i }));
    list.sort((a, b) => (a.num == null) - (b.num == null) || (a.num ?? 0) - (b.num ?? 0) || a._i - b._i);
    return list.map(h => { delete h._i; if (groupOf) h.group = groupOf(h.num); return h; });
  }

  function rowFrom(page, habits) {
    const P = page.properties || {};
    const d = P[DATEP] && P[DATEP].date;
    if (!d || !d.start) return null;
    const date = d.start.slice(0, 10);
    const todo = habits.filter(h => applies(h, date));
    const done = todo.filter(h => P[h.key] && P[h.key].checkbox).length;
    return { id: page.id, date, done, total: todo.length };
  }

  async function load(today) {
    const [props, pages] = await Promise.all([
      propsOf(false),
      queryAll(DB, { sorts: [{ property: DATEP, direction: 'descending' }] }, MAX_ROWS),
    ]);
    const habits = habitsFrom(props);
    const rows = pages.map(p => rowFrom(p, habits)).filter(Boolean);
    const todayPage = pages.find(p => {
      const d = p.properties && p.properties[DATEP] && p.properties[DATEP].date;
      return d && d.start && d.start.slice(0, 10) === today;
    });
    let checks = null;
    if (todayPage) { checks = {}; for (const h of habits) checks[h.key] = !!(todayPage.properties[h.key] && todayPage.properties[h.key].checkbox); }
    return { habits, rows, checks, todayRowId: todayPage ? todayPage.id : null };
  }

  function dayTitle(dateStr) {
    const d = new Date(dateStr + 'T00:00:00Z');
    return `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()]}, ${d.getUTCDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]}`;
  }

  async function ensureRow(today) {
    const { rows } = await load(today);
    const hit = rows.find(r => r.date === today);
    if (hit) return hit;
    const page = await notion('/pages', { method: 'POST', body: { parent: { database_id: DB }, properties: {
      [TITLE]: { title: [{ type: 'text', text: { content: dayTitle(today) } }] },
      [DATEP]: { date: { start: today } },
    } } });
    schemaCache.delete(DB);
    return rowFrom(page, habitsFrom(await propsOf(true))) || { id: page.id, date: today, done: 0, total: 0 };
  }

  async function toggle(pageId, prop, value) {
    const page = await getAllowedPage(pageId, [DB]);
    const p = page.properties && page.properties[prop];
    if (!isHabit(prop, p)) throw new HttpError(400, 'That is not a checklist item.');
    await notion(`/pages/${pageId}`, { method: 'PATCH', body: { properties: { [prop]: { checkbox: !!value } } } });
    return { ok: true };
  }

  /* keep Notion's own Progress formula (if the database has one) in step with the item list */
  async function syncProgress(props) {
    const f = props.Progress;
    if (!f || f.type !== 'formula' || !f.formula || !f.formula.expression) return;
    const names = habitsFrom(props).filter(h => !h.opt).map(h => h.key);
    if (!names.length) return;
    const sum = names.map(n => `toNumber(prop("${String(n).replace(/"/g, '\\"')}"))`).join(',\n\t');
    const expr = `round((sum(\n\t${sum}\n) / ${names.length}) * 1000) / 1000`;
    try { await notion(`/databases/${DB}`, { method: 'PATCH', body: { properties: { Progress: { formula: { expression: expr } } } } }); } catch (e) { /* the widgets do their own maths */ }
    schemaCache.delete(DB);
  }

  async function addHabit(raw) {
    const label = String(raw || '').replace(/\s+/g, ' ').trim();
    if (!label) throw new HttpError(400, 'Give it a name.');
    if (label.length > 160) throw new HttpError(400, 'Keep the name under 160 characters.');
    if (keep.has(label.toLowerCase())) throw new HttpError(400, `"${label}" is a reserved name.`);
    const props = await propsOf(true);
    if (habitsFrom(props).length >= 40) throw new HttpError(400, 'That is already 40 items. Trim some first.');
    if (Object.keys(props).some(k => k.trim().toLowerCase() === label.toLowerCase())) throw new HttpError(400, `"${label}" is already on the list.`);
    const done = await notion(`/databases/${DB}`, { method: 'PATCH', body: { properties: { [label]: { checkbox: {} } } } });
    schemaCache.delete(DB);
    await syncProgress(done.properties || {});
    return { ok: true, habit: parseKey(label) };
  }

  async function removeHabit(key) {
    const props = await propsOf(true);
    if (!isHabit(key, props[key])) throw new HttpError(400, 'That is not on the list.');
    if (habitsFrom(props).length <= 1) throw new HttpError(400, 'Keep at least one item on the list.');
    const done = await notion(`/databases/${DB}`, { method: 'PATCH', body: { properties: { [key]: null } } });
    schemaCache.delete(DB);
    await syncProgress(done.properties || {});
    return { ok: true, removed: parseKey(key).label };
  }

  const handler = wrap(async (req, res) => {
    const today = todayStr();
    if (req.method === 'GET') {
      const q = new URL(req.url, 'http://local').searchParams;
      const days = Math.min(120, Math.max(1, parseInt(q.get('days'), 10) || 35));
      const { habits, rows, checks, todayRowId } = await load(today);
      const cut = new Date(today + 'T00:00:00Z'); cut.setUTCDate(cut.getUTCDate() - (days - 1));
      const from = cut.toISOString().slice(0, 10);
      return res.status(200).json({ today, habits, rows: rows.filter(r => r.date >= from), checks, todayRowId, generatedAt: new Date().toISOString() });
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
  handler.DB = { mustDo: DB, db: DB };
  handler.load = load;
  return handler;
}
module.exports = { makeTracker, parseKey, applies };
