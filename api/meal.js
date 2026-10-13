'use strict';
/* ============================================================
   /api/meal  : data + actions for the Meal Planner widgets

   GET  /api/meal?days=35  -> Meal Log rows (with page ids) for the last N days
   POST /api/meal          -> { action: 'toggle', pageId, prop, value }

   Locked down: it can only touch pages inside your Meal Log database.

   Optional env overrides:
     DB_MEAL  : Meal Log database id   (already used by status.js)
     DS_MEAL  : Meal Log data-source id (only needed on newer Notion setups)
   ============================================================ */
const { HttpError, notion, queryAll, wrap, readBody, norm, todayStr, addDays } = require('../lib/notion');
const { LOGS } = require('./status');

const DATE_PROP = 'Date';
const MAX_DAYS = 120;
// A row can report its parent as the database OR (newer Notion API) the data source.
const ALLOWED_PARENTS = [LOGS.meal, norm(process.env.DS_MEAL || 'd9d78dea-63db-4f2b-97a2-7bddc6a5dec1')];

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

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

// Accepts JSON sent as application/json OR as text/plain (the widget uses text/plain
// so the browser doesn't need a CORS preflight inside Notion's sandboxed embed).
function parseBody(req) {
  let b = null;
  try { b = readBody(req); } catch (e) { b = null; }
  if (b && typeof b === 'object' && b.action) return b;
  let raw = req.body;
  if (Buffer.isBuffer(raw)) raw = raw.toString('utf8');
  if (typeof raw === 'string') { try { return JSON.parse(raw); } catch (e) { /* fall through */ } }
  if (raw && typeof raw === 'object') return raw;
  return b || {};
}

async function toggle(pageId, prop, value) {
  if (!/^[0-9a-f-]{32,36}$/i.test(String(pageId || ''))) throw new HttpError(400, 'Missing or invalid page id.');
  const page = await notion(`/pages/${pageId}`);
  const parent = page.parent || {};
  const parents = [parent.database_id, parent.data_source_id].filter(Boolean).map(norm);
  if (!parents.some(p => ALLOWED_PARENTS.includes(p))) {
    throw new HttpError(403, 'That page is not in your Meal Log database.');
  }
  const p = page.properties && page.properties[prop];
  if (!p || p.type !== 'checkbox') throw new HttpError(400, `"${prop}" is not a checkbox in the Meal Log.`);
  await notion(`/pages/${pageId}`, { method: 'PATCH', body: { properties: { [prop]: { checkbox: !!value } } } });
  return { ok: true };
}

module.exports = wrap(async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
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
    const b = parseBody(req);
    if (b.action === 'toggle') return res.status(200).json(await toggle(b.pageId, String(b.prop || ''), b.value));
    throw new HttpError(400, 'Unknown action.');
  }

  res.setHeader('Allow', 'GET, POST, OPTIONS');
  throw new HttpError(405, 'Method not allowed.');
});
