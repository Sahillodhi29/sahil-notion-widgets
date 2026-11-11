'use strict';
/* ============================================================
   /api/stock  : data + actions for the Stock & Resources widgets

   GET  /api/stock?parts=items,meta
        -> { today, items, meta }
           items: one row per thing you keep in stock
           meta:  the category and unit options that exist in Notion

   POST /api/stock  { action: ... }
        item-create  { values }        add something new to the stock list
        item-update  { id, values }    change the cadence, pack, cost, category or note
        restock      { id, cost? }     bought it today: Last Restocked = today, Needed off
        restock-undo { id, prev }      put the dates back (same ID in the request)
        need         { id, value }     tick / untick "needed"

   Same rules as every other widget: reads take ?key=, writes need the
   x-widget-key header, and every write is locked to the Stock database.

   Optional env override: DB_STOCK
   ============================================================ */
const {
  HttpError, notion, queryAll, wrap, readBody, getAllowedPage, norm, todayStr, daysBetween,
} = require('../notion');

const DB = {
  stock: norm(process.env.DB_STOCK || '415fa2216987813e9c12e6f2c5bfb894'),
};

const MAX_ITEMS = 500;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/* Properties the widgets may write, and the Notion type each must be. */
const SPEC = {
  'Item': 'title',
  'Category': 'select',
  'Every': 'number',
  'Unit': 'select',
  'Cost': 'number',
  'Pack': 'rich_text',
  'Last Restocked': 'date',
  'Needed': 'checkbox',
  'Note': 'rich_text',
};

const UNITS = ['Day', 'Week', 'Month', 'Quarter', 'Year'];

/* ---------- schema (live option lists), cached for 5 minutes ---------- */
const schemaCache = new Map();
async function schemaOf(dbId, fresh) {
  const hit = schemaCache.get(dbId);
  if (!fresh && hit && Date.now() - hit.t < 300000) return hit.props;
  const db = await notion(`/databases/${dbId}`);
  const props = {};
  for (const [name, p] of Object.entries(db.properties || {})) {
    const o = { type: p.type };
    if (p.type === 'select') o.options = (p.select.options || []).map(x => x.name);
    if (p.type === 'multi_select') o.options = (p.multi_select.options || []).map(x => x.name);
    props[name] = o;
  }
  schemaCache.set(dbId, { t: Date.now(), props });
  return props;
}

/* ---------- widget values -> Notion property payloads ---------- */
const clip = (s, n) => String(s).slice(0, n);

function convert(name, def, raw) {
  const empty = raw === null || raw === undefined || raw === '' || (Array.isArray(raw) && !raw.length);
  switch (def.type) {
    case 'title': {
      const s = clip(String(raw || '').trim(), 200);
      if (!s) throw new HttpError(400, 'Give it a name first.');
      return { title: [{ type: 'text', text: { content: s } }] };
    }
    case 'rich_text': {
      if (empty) return { rich_text: [] };
      return { rich_text: [{ type: 'text', text: { content: clip(String(raw).trim(), 1900) } }] };
    }
    case 'select': {
      if (empty) return undefined;
      /* Notion creates the option for us when it is new, which is how a new category gets added. */
      return { select: { name: clip(String(raw).trim(), 100) } };
    }
    case 'number': {
      if (empty) return { number: null };
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0 || n > 1e9) throw new HttpError(400, `${name} must be a number above 0.`);
      return { number: n };
    }
    case 'date': {
      if (empty) return { date: null };
      if (!DATE_RE.test(String(raw))) throw new HttpError(400, `${name} must be a date like 2026-11-11.`);
      return { date: { start: String(raw) } };
    }
    case 'checkbox':
      return { checkbox: !!raw };
    default:
      throw new HttpError(400, `${name} cannot be set from the widget.`);
  }
}

function buildProperties(schema, values) {
  const out = {};
  for (const [name, raw] of Object.entries(values || {})) {
    if (!Object.prototype.hasOwnProperty.call(SPEC, name)) {
      throw new HttpError(400, `"${name}" is not a field the widget can set.`);
    }
    const def = schema[name];
    if (!def) throw new HttpError(400, `The Stock database has no property called "${name}".`,
      'Open /api/stock-health to see which property is missing.');
    if (def.type !== SPEC[name]) throw new HttpError(400, `Property "${name}" should be type ${SPEC[name]} but is ${def.type}.`);
    const v = convert(name, def, raw);
    if (v !== undefined) out[name] = v;
  }
  return out;
}

function tidyValues(values) {
  if (!values || typeof values !== 'object' || Array.isArray(values)) throw new HttpError(400, 'Nothing to save.');
  const out = { ...values };
  if (out.Every !== undefined) {
    const n = Number(out.Every);
    if (!Number.isFinite(n) || n < 1) throw new HttpError(400, '“Every” must be 1 or more.');
    out.Every = n;
  }
  if (out.Unit !== undefined && out.Unit !== null && out.Unit !== '') {
    const u = String(out.Unit).trim();
    const hit = UNITS.find(x => x.toLowerCase() === u.toLowerCase());
    if (!hit) throw new HttpError(400, `"${u}" is not a restock unit.`, 'Pick Day, Week, Month, Quarter or Year.');
    out.Unit = hit;
  }
  if (out.Cost !== undefined) {
    const n = Number(out.Cost);
    out.Cost = out.Cost === null || out.Cost === '' || !Number.isFinite(n) ? null : Math.max(0, n);
  }
  return out;
}

async function createItem(values) {
  const schema = await schemaOf(DB.stock);
  const props = buildProperties(schema, tidyValues(values));
  if (!props['Item']) throw new HttpError(400, 'Give it a name first.');
  if (!props['Every']) props['Every'] = { number: 1 };
  if (!props['Unit']) props['Unit'] = { select: { name: 'Month' } };
  const page = await notion('/pages', { method: 'POST', body: { parent: { database_id: DB.stock }, properties: props } });
  return { ok: true, row: slim(page) };
}

async function updateItem(id, values) {
  const page = await getAllowedPage(id, [DB.stock]);
  const schema = await schemaOf(DB.stock);
  const props = buildProperties(schema, tidyValues(values));
  if (!Object.keys(props).length) throw new HttpError(400, 'Nothing to change.');
  const done = await notion(`/pages/${id}`, { method: 'PATCH', body: { properties: props } });
  return { ok: true, row: slim(done) };
}

async function restock(id, cost) {
  const page = await getAllowedPage(id, [DB.stock]);
  const before = slim(page);
  const props = { 'Last Restocked': { date: { start: todayStr() } }, 'Needed': { checkbox: false } };
  if (cost !== undefined && cost !== null && cost !== '') {
    const n = Number(cost);
    if (!Number.isFinite(n) || n < 0 || n > 1e9) throw new HttpError(400, 'That cost is not a number.');
    props.Cost = { number: n };
  }
  const done = await notion(`/pages/${id}`, { method: 'PATCH', body: { properties: props } });
  return { ok: true, row: slim(done), prev: { last: before.last, needed: before.needed, cost: before.cost } };
}

async function restockUndo(id, prev) {
  if (!prev || typeof prev !== 'object') throw new HttpError(400, 'Nothing to undo.');
  const last = prev.last === null || prev.last === undefined ? null : String(prev.last);
  if (last !== null && !DATE_RE.test(last)) throw new HttpError(400, 'Bad undo data.');
  const cost = prev.cost === null || prev.cost === undefined ? null : Number(prev.cost);
  if (cost !== null && !Number.isFinite(cost)) throw new HttpError(400, 'Bad undo data.');
  await getAllowedPage(id, [DB.stock]);
  const done = await notion(`/pages/${id}`, {
    method: 'PATCH',
    body: { properties: {
      'Last Restocked': { date: last ? { start: last } : null },
      'Needed': { checkbox: !!prev.needed },
      'Cost': { number: cost },
    } },
  });
  return { ok: true, row: slim(done) };
}

async function setNeeded(id, value) {
  const page = await getAllowedPage(id, [DB.stock]);
  const before = slim(page);
  if (before.needed === !!value) return { ok: true, row: before, prev: before.needed };
  const done = await notion(`/pages/${id}`, { method: 'PATCH', body: { properties: { 'Needed': { checkbox: !!value } } } });
  return { ok: true, row: slim(done), prev: before.needed };
}

/* ---------- reading ---------- */
function slim(page) {
  const P = page.properties || {};
  const txt = n => (P[n] && P[n].rich_text ? P[n].rich_text.map(t => t.plain_text).join('').trim() : '');
  const title = P.Item && P.Item.title ? P.Item.title.map(t => t.plain_text).join('').trim() : '';
  if (!title) return null;
  return {
    id: page.id,
    item: title,
    cat: (P.Category && P.Category.select && P.Category.select.name) || null,
    every: typeof (P.Every && P.Every.number) === 'number' ? P.Every.number : 1,
    unit: (P.Unit && P.Unit.select && P.Unit.select.name) || 'Month',
    cost: P.Cost && typeof P.Cost.number === 'number' ? P.Cost.number : null,
    pack: txt('Pack'),
    last: P['Last Restocked'] && P['Last Restocked'].date && P['Last Restocked'].date.start
      ? P['Last Restocked'].date.start.slice(0, 10) : null,
    needed: !!(P.Needed && P.Needed.checkbox),
    note: txt('Note'),
  };
}

const settle = p => p.then(v => v, e => ({ error: e.message || 'Failed', hint: e.hint }));

/* ---------- handler ---------- */
const handler = wrap(async (req, res) => {
  const today = todayStr();

  if (req.method === 'GET') {
    const q = new URL(req.url, 'http://local').searchParams;
    const need = new Set((q.get('parts') || 'items,meta').split(',').map(s => s.trim()).filter(Boolean));
    const out = { today, generatedAt: new Date().toISOString() };
    const jobs = [];
    if (need.has('items')) {
      /* a plain array on success; { error, hint } if that one database failed */
      jobs.push(settle(queryAll(DB.stock, {}, MAX_ITEMS).then(pages => pages.map(slim).filter(Boolean)))
        .then(rows => { out.items = rows; }));
    }
    if (need.has('meta')) {
      jobs.push(settle(schemaOf(DB.stock, true).then(props => ({
        categories: (props.Category && props.Category.options) || [],
        units: UNITS,
      }))).then(v => { out.meta = v; }));
    }
    await Promise.all(jobs);
    return res.status(200).json(out);
  }

  if (req.method === 'POST') {
    const b = readBody(req);
    switch (b.action) {
      case 'item-create':   return res.status(200).json(await createItem(b.values));
      case 'item-update':   return res.status(200).json(await updateItem(String(b.id || ''), b.values));
      case 'restock':       return res.status(200).json(await restock(String(b.id || ''), b.cost));
      case 'restock-undo':  return res.status(200).json(await restockUndo(String(b.id || ''), b.prev));
      case 'need':          return res.status(200).json(await setNeeded(String(b.id || ''), b.value));
      default: throw new HttpError(400, 'Unknown action.');
    }
  }

  res.setHeader('Allow', 'GET, POST');
  throw new HttpError(405, 'Method not allowed.');
});

module.exports = handler;
module.exports.DB = DB;
module.exports.SPEC = SPEC;
module.exports.UNITS = UNITS;
module.exports.schemaOf = schemaOf;
module.exports.daysBetween = daysBetween;
