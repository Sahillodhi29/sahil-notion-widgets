'use strict';
/* ============================================================
   /api/wardrobe  : data + actions for the Wardrobe widgets

   GET  /api/wardrobe?need=items,outfits,wishes,schema
        -> { today, items, outfits, wishes, schema }
           each section is { rows } (or { error, hint } if that one failed)

   POST /api/wardrobe  { action: ... }
        item-create   { values }          add a row to Wardrobe Contents
        wish-create   { values }          add a row to Wishlist
        wear          { kind, id }        kind = 'item' | 'outfit'  (+1 wear, Last Worn = today)
        wear-restore  { changes }         undo a wear (uses what 'wear' returned)
        wish-status   { id, status }      change Wishlist Status
        wish-to-item  { id }              wish bought -> new wardrobe item + wish marked Purchased
        outfit-create { items, name? }    log today's outfit: new Outfits row + every piece worn today
        outfit-undo   { id, changes }     undo outfit-create (archives the outfit, restores the pieces)
        outfit-status { id, status }      Active | Favorite

   Same rules as /api/sail and /api/meal: reads take ?key=, writes need the
   x-widget-key header. Every write is locked to the three Wardrobe databases.

   Optional env overrides: DB_WARDROBE, DB_OUTFITS, DB_WISHLIST
   ============================================================ */
const {
  HttpError, notion, queryAll, wrap, readBody, getAllowedPage, norm, todayStr,
} = require('../notion');

const DB = {
  items:   norm(process.env.DB_WARDROBE || 'b0cfa2216987827b82668159caed09ad'),
  outfits: norm(process.env.DB_OUTFITS  || '401fa221698783e99930815cc2dce05f'),
  wishes:  norm(process.env.DB_WISHLIST || '18afa22169878223947581be9fd44ae2'),
};

const MAX_ITEMS = 600;
const MAX_OUTFITS = 200;
const MAX_WISHES = 300;

/* Properties the widgets may write, and the Notion type each must be. */
const ITEM_SPEC = {
  'Name': 'title', 'Item Category': 'select', 'Item Subcategory': 'multi_select',
  'Primary Color': 'select', 'Secondary Colors': 'multi_select', 'Brand': 'rich_text',
  'Size': 'rich_text', 'Price': 'number', 'Date Acquired': 'date', 'Item Status': 'multi_select',
  'Location': 'select', 'Season': 'multi_select', 'Occasion': 'multi_select',
  'Condition': 'multi_select', 'Fabric': 'multi_select', 'Pattern': 'multi_select',
  'Style/Aesthetic': 'multi_select', 'Care': 'multi_select', 'Tags': 'multi_select',
  'Notes': 'rich_text', 'Photo': 'files', 'Wear Count': 'number', 'Last Worn': 'date',
};
const WISH_SPEC = {
  'Item Name': 'title', 'Category': 'multi_select', 'Brand': 'rich_text',
  'Estimated Price': 'number', 'Wishlist Priority': 'select', 'Wishlist Status': 'select',
  'Link': 'url', 'Reason / Gap Filled': 'rich_text', 'Notes': 'rich_text',
  'Date Added': 'date', 'Photo': 'files',
};
const OUTFIT_SPEC = {
  'Outfit Name': 'title', 'Items': 'relation', 'Times Worn': 'number', 'Last Worn': 'date',
  'Outfit Status': 'select',
};
const SPECS = { items: ITEM_SPEC, outfits: OUTFIT_SPEC, wishes: WISH_SPEC };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

class OptionError extends HttpError {}

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

function clientSchema(spec, props) {
  const out = {};
  for (const name of Object.keys(spec)) {
    const p = props[name];
    if (!p) continue;
    out[name] = { type: p.type };
    if (p.options) out[name].options = p.options;
  }
  return out;
}

/* ---------- turning widget values into Notion property payloads ---------- */
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
      if (empty) return undefined;
      return { rich_text: [{ type: 'text', text: { content: clip(String(raw).trim(), 1900) } }] };
    }
    case 'select': {
      if (empty) return undefined;
      const s = String(raw);
      if (!(def.options || []).includes(s)) throw new OptionError(400, `"${s}" is not an option for ${name} in Notion.`, 'Add that option in Notion first, or pick another one.');
      return { select: { name: s } };
    }
    case 'multi_select': {
      if (empty) return undefined;
      if (!Array.isArray(raw) || raw.length > 40) throw new HttpError(400, `Bad value for ${name}.`);
      for (const s of raw) {
        if (typeof s !== 'string' || !(def.options || []).includes(s)) {
          throw new OptionError(400, `"${s}" is not an option for ${name} in Notion.`, 'Add that option in Notion first, or pick another one.');
        }
      }
      return { multi_select: raw.map(name2 => ({ name: name2 })) };
    }
    case 'number': {
      if (empty) return undefined;
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0 || n > 1e9) throw new HttpError(400, `${name} must be a positive number.`);
      return { number: n };
    }
    case 'date': {
      if (empty) return undefined;
      if (!DATE_RE.test(String(raw))) throw new HttpError(400, `${name} must be a date like 2026-10-13.`);
      return { date: { start: String(raw) } };
    }
    case 'url': {
      if (empty) return undefined;
      const s = String(raw).trim();
      let ok = s.length <= 1900;
      try { const u = new URL(s); ok = ok && /^https?:$/.test(u.protocol); } catch (e) { ok = false; }
      if (!ok) throw new HttpError(400, `${name} must be a full web link starting with http:// or https://.`);
      return { url: s };
    }
    case 'files': {
      if (empty) return undefined;
      const s = String(raw).trim();
      const up = /^upload:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(s);
      if (up) return { files: [{ name: 'photo.jpg', type: 'file_upload', file_upload: { id: up[1] } }] };   // uploaded through /api/wardrobe-photo
      let ok = s.length <= 1900;
      try { ok = ok && new URL(s).protocol === 'https:'; } catch (e) { ok = false; }
      if (!ok) throw new HttpError(400, `${name} must be an image link starting with https://.`);
      return { files: [{ name: 'photo', type: 'external', external: { url: s } }] };
    }
    default:
      throw new HttpError(400, `${name} cannot be set from the widget.`);
  }
}

function buildProperties(spec, schema, values) {
  const out = {};
  for (const [name, raw] of Object.entries(values || {})) {
    if (!Object.prototype.hasOwnProperty.call(spec, name)) {
      throw new HttpError(400, `"${name}" is not a field the widget can set.`);
    }
    const def = schema[name];
    if (!def) throw new HttpError(400, `The database has no property called "${name}".`, 'Rename it back in Notion, or open /api/wardrobe-health to see what is missing.');
    if (def.type !== spec[name]) throw new HttpError(400, `Property "${name}" should be type ${spec[name]} but is ${def.type}.`);
    const v = convert(name, def, raw);
    if (v !== undefined) out[name] = v;
  }
  return out;
}

async function createRow(dbId, spec, titleProp, values) {
  if (!values || typeof values !== 'object' || Array.isArray(values)) throw new HttpError(400, 'Nothing to save.');
  let schema = await schemaOf(dbId);
  let props;
  try {
    props = buildProperties(spec, schema, values);
  } catch (e) {
    if (!(e instanceof OptionError)) throw e;
    schema = await schemaOf(dbId, true);          // an option may have been added in Notion a moment ago
    props = buildProperties(spec, schema, values);
  }
  if (!props[titleProp]) throw new HttpError(400, 'Give it a name first.');
  const page = await notion('/pages', { method: 'POST', body: { parent: { database_id: dbId }, properties: props } });
  return { ok: true, id: page.id };
}

/* ---------- reading ---------- */
function readers(page) {
  const P = page.properties || {};
  const has = (n, k) => P[n] && P[n][k];
  return {
    title: n => (has(n, 'title') ? P[n].title.map(t => t.plain_text).join('').trim() : ''),
    text:  n => (has(n, 'rich_text') ? P[n].rich_text.map(t => t.plain_text).join('').trim() : ''),
    sel:   n => (P[n] && P[n].select ? P[n].select.name : null),
    multi: n => (has(n, 'multi_select') ? P[n].multi_select.map(o => o.name) : []),
    num:   n => (P[n] && typeof P[n].number === 'number' ? P[n].number : null),
    date:  n => (P[n] && P[n].date && P[n].date.start ? P[n].date.start.slice(0, 10) : null),
    url:   n => (P[n] && P[n].url) || '',
    rel:   n => (has(n, 'relation') ? P[n].relation.map(r => r.id) : []),
    photo: n => {
      const f = P[n] && P[n].files && P[n].files[0];
      if (!f) return { url: '', external: false };
      if (f.type === 'external') return { url: (f.external && f.external.url) || '', external: true };
      return { url: (f.file && f.file.url) || '', external: false };
    },
  };
}

function slimItem(page) {
  const r = readers(page);
  const name = r.title('Name');
  if (!name) return null;                                  // skips the blank template rows
  return {
    id: page.id, name, cat: r.sel('Item Category'), sub: r.multi('Item Subcategory'),
    color: r.sel('Primary Color'), color2: r.multi('Secondary Colors'),
    brand: r.text('Brand'), size: r.text('Size'), price: r.num('Price'),
    acq: r.date('Date Acquired'), status: r.multi('Item Status'), loc: r.sel('Location'),
    season: r.multi('Season'), n: r.num('Wear Count') || 0, last: r.date('Last Worn'),
    photo: r.photo('Photo').url,
  };
}
function slimOutfit(page) {
  const r = readers(page);
  const name = r.title('Outfit Name');
  if (!name) return null;
  return {
    id: page.id, name, items: r.rel('Items'), n: r.num('Times Worn') || 0, last: r.date('Last Worn'),
    status: r.sel('Outfit Status'), season: r.multi('Season'), occasion: r.multi('Occasion'),
    photo: r.photo('Photo').url, created: page.created_time || null,
  };
}
function slimWish(page) {
  const r = readers(page);
  const name = r.title('Item Name');
  if (!name) return null;
  return {
    id: page.id, name, cat: r.multi('Category'), brand: r.text('Brand'), price: r.num('Estimated Price'),
    priority: r.sel('Wishlist Priority'), status: r.sel('Wishlist Status'), link: r.url('Link'),
    reason: r.text('Reason / Gap Filled'), added: r.date('Date Added'), photo: r.photo('Photo').url,
  };
}

const load = (dbId, max, slim) => queryAll(dbId, {}, max).then(pages => ({ rows: pages.map(slim).filter(Boolean) }));

const settle = p => p.then(
  data => data,
  e => ({ error: e.message || 'Failed', hint: e.hint }),
);

/* ---------- actions ---------- */
async function mapLimit(list, limit, fn) {
  const out = [];
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, list.length) }, async () => {
    while (i < list.length) { const k = i++; out[k] = await fn(list[k]); }
  });
  await Promise.all(workers);
  return out;
}

async function bump(page, countProp, today) {
  const r = readers(page);
  const prevCount = r.num(countProp);
  const prevLast = r.date('Last Worn');
  const count = (prevCount || 0) + 1;
  await notion(`/pages/${page.id}`, {
    method: 'PATCH',
    body: { properties: { [countProp]: { number: count }, 'Last Worn': { date: { start: today } } } },
  });
  return { id: page.id, prevCount, prevLast, count };
}

async function wear(kind, id, today) {
  if (kind === 'item') {
    const page = await getAllowedPage(id, [DB.items]);
    return { ok: true, changes: [await bump(page, 'Wear Count', today)] };
  }
  if (kind === 'outfit') {
    const page = await getAllowedPage(id, [DB.outfits]);
    const changes = [await bump(page, 'Times Worn', today)];
    const ids = readers(page).rel('Items').slice(0, 25);
    const done = await mapLimit(ids, 3, async itemId => {
      let ip;
      try { ip = await getAllowedPage(itemId, [DB.items]); }
      catch (e) { if (e instanceof HttpError) return null; throw e; }   // deleted or foreign page: skip it
      return bump(ip, 'Wear Count', today);
    });
    changes.push(...done.filter(Boolean));
    return { ok: true, changes };
  }
  throw new HttpError(400, 'Unknown kind.');
}

async function wearRestore(changes) {
  if (!Array.isArray(changes) || !changes.length || changes.length > 40) throw new HttpError(400, 'Nothing to undo.');
  for (const c of changes) {
    const okCount = c && (c.prevCount === null || (Number.isFinite(c.prevCount) && c.prevCount >= 0 && c.prevCount <= 100000));
    const okLast = c && (c.prevLast === null || DATE_RE.test(String(c.prevLast)));
    if (!okCount || !okLast) throw new HttpError(400, 'Bad undo data.');
  }
  await mapLimit(changes, 3, async c => {
    const page = await getAllowedPage(c.id, [DB.items, DB.outfits]);
    const prop = norm(page.parent && page.parent.database_id) === DB.items ? 'Wear Count' : 'Times Worn';
    await notion(`/pages/${c.id}`, {
      method: 'PATCH',
      body: { properties: {
        [prop]: { number: c.prevCount },
        'Last Worn': { date: c.prevLast ? { start: c.prevLast } : null },
      } },
    });
  });
  return { ok: true };
}

async function wishStatus(id, status) {
  const page = await getAllowedPage(id, [DB.wishes]);
  const schema = await schemaOf(DB.wishes);
  const opts = (schema['Wishlist Status'] && schema['Wishlist Status'].options) || [];
  if (status !== null && !opts.includes(status)) throw new HttpError(400, `"${status}" is not a Wishlist Status in Notion.`);
  const prev = readers(page).sel('Wishlist Status');
  await notion(`/pages/${id}`, {
    method: 'PATCH',
    body: { properties: { 'Wishlist Status': { select: status === null ? null : { name: status } } } },
  });
  return { ok: true, prev };
}

async function wishToItem(id, today) {
  const page = await getAllowedPage(id, [DB.wishes]);
  const r = readers(page);
  const schema = await schemaOf(DB.items);
  const values = { 'Name': r.title('Item Name'), 'Item Status': ['Active'], 'Date Acquired': today, 'Wear Count': 0 };
  const cats = (schema['Item Category'] && schema['Item Category'].options) || [];
  const cat = r.multi('Category').find(c => cats.includes(c));
  if (cat) values['Item Category'] = cat;
  if (r.num('Estimated Price') !== null) values.Price = r.num('Estimated Price');
  const note = [r.text('Reason / Gap Filled'), r.text('Notes')].filter(Boolean).join(' - ');
  if (note) values.Notes = 'From wishlist: ' + note;
  const ph = r.photo('Photo');
  if (ph.external && /^https:/.test(ph.url)) values.Photo = ph.url;     // Notion-hosted links expire, so only copy external ones
  const made = await createRow(DB.items, ITEM_SPEC, 'Name', values);
  try {
    const res = await wishStatus(id, 'Purchased');
    return { ok: true, itemId: made.id, prev: res.prev };
  } catch (e) {
    throw new HttpError(502, `The piece was added to your wardrobe, but the wish could not be marked Purchased: ${e.message}`, e.hint);
  }
}

/* ---------- outfits ---------- */
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/* What counts as a top / bottom. Dresses and jumpsuits cover both; sets and swimsuits too;
   and activewear/loungewear/sleepwear are judged by what the piece is (leggings = bottom, sports bra = top). */
const TOP_SUBS = ['Sports bra', 'Workout top', 'Hoodie', 'Sweatshirt', 'Camisole', 'Bikini top'];
const BOTTOM_SUBS = ['Leggings', 'Workout leggings', 'Yoga pants', 'Joggers', 'Sweatpants', 'Bike shorts', 'Running shorts', 'Bikini bottom'];
const BOTH_SUBS = ['Lounge set', 'Pajama set', 'One-piece swimsuit'];
function roleOf(cat, subs) {
  if (cat === 'Tops') return { top: true, bottom: false };
  if (cat === 'Bottoms') return { top: false, bottom: true };
  if (cat === 'Dresses' || cat === 'Jumpsuits & Rompers') return { top: true, bottom: true };
  const both = subs.some(s => BOTH_SUBS.includes(s));
  return { top: both || subs.some(s => TOP_SUBS.includes(s)), bottom: both || subs.some(s => BOTTOM_SUBS.includes(s)) };
}

async function outfitCreate(b, today) {
  const ids = Array.isArray(b.items) ? [...new Set(b.items.map(String))] : [];
  if (ids.length < 1 || ids.length > 25) throw new HttpError(400, 'Pick the pieces you wore (up to 25).');
  const pages = [];
  for (const id of ids) pages.push(await getAllowedPage(id, [DB.items]));    // also proves each one is a Wardrobe piece
  const roles = pages.map(p => { const r = readers(p); return roleOf(r.sel('Item Category'), r.multi('Item Subcategory')); });
  if (!(roles.some(x => x.top) && roles.some(x => x.bottom))) throw new HttpError(400, 'An outfit needs at least one top and one bottom (or a dress or jumpsuit).');
  const d = new Date(today + 'T00:00:00Z');
  const name = clip(String(b.name || '').trim(), 120) || `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} outfit`;
  const schema = await schemaOf(DB.outfits);
  const props = {
    'Outfit Name': { title: [{ type: 'text', text: { content: name } }] },
    'Items': { relation: ids.map(id => ({ id })) },
    'Times Worn': { number: 1 },
    'Last Worn': { date: { start: today } },
  };
  const st = schema['Outfit Status'];
  if (st && st.options && st.options.includes('Active')) props['Outfit Status'] = { select: { name: 'Active' } };
  const made = await notion('/pages', { method: 'POST', body: { parent: { database_id: DB.outfits }, properties: props } });
  // a piece worn twice in one day still counts once
  const fresh = pages.filter(p => readers(p).date('Last Worn') !== today);
  try {
    const changes = await mapLimit(fresh, 3, p => bump(p, 'Wear Count', today));
    return { ok: true, id: made.id, name, changes };
  } catch (e) {
    throw new HttpError(502, `The outfit was saved, but some pieces could not be marked worn: ${e.message}`, e.hint);
  }
}

async function outfitUndo(id, changes) {
  await getAllowedPage(id, [DB.outfits]);
  await notion(`/pages/${id}`, { method: 'PATCH', body: { archived: true } });
  if (Array.isArray(changes) && changes.length) await wearRestore(changes);
  return { ok: true };
}

async function outfitStatus(id, status) {
  const page = await getAllowedPage(id, [DB.outfits]);
  const schema = await schemaOf(DB.outfits);
  const opts = (schema['Outfit Status'] && schema['Outfit Status'].options) || [];
  if (!['Active', 'Favorite'].includes(status) || !opts.includes(status)) throw new HttpError(400, `"${status}" is not an Outfit Status in Notion.`);
  const prev = readers(page).sel('Outfit Status');
  await notion(`/pages/${id}`, { method: 'PATCH', body: { properties: { 'Outfit Status': { select: { name: status } } } } });
  return { ok: true, prev };
}

/* ---------- handler ---------- */
const handler = wrap(async (req, res) => {
  const today = todayStr();

  if (req.method === 'GET') {
    const q = new URL(req.url, 'http://local').searchParams;
    const need = new Set((q.get('need') || 'items').split(',').map(s => s.trim()).filter(Boolean));
    const out = { today, generatedAt: new Date().toISOString() };
    const jobs = [];
    if (need.has('items'))   jobs.push(settle(load(DB.items, MAX_ITEMS, slimItem)).then(v => { out.items = v; }));
    if (need.has('outfits')) jobs.push(settle(load(DB.outfits, MAX_OUTFITS, slimOutfit)).then(v => { out.outfits = v; }));
    if (need.has('wishes'))  jobs.push(settle(load(DB.wishes, MAX_WISHES, slimWish)).then(v => { out.wishes = v; }));
    if (need.has('schema')) {
      jobs.push(settle(Promise.all([schemaOf(DB.items, true), schemaOf(DB.wishes, true)])
        .then(([i, w]) => ({ item: clientSchema(ITEM_SPEC, i), wish: clientSchema(WISH_SPEC, w) }))).then(v => { out.schema = v; }));
    }
    await Promise.all(jobs);
    return res.status(200).json(out);
  }

  if (req.method === 'POST') {
    const b = readBody(req);
    switch (b.action) {
      case 'item-create':  return res.status(200).json(await createRow(DB.items, ITEM_SPEC, 'Name', b.values));
      case 'wish-create':  return res.status(200).json(await createRow(DB.wishes, WISH_SPEC, 'Item Name', b.values));
      case 'wear':         return res.status(200).json(await wear(String(b.kind || ''), b.id, today));
      case 'wear-restore': return res.status(200).json(await wearRestore(b.changes));
      case 'wish-status':  return res.status(200).json(await wishStatus(b.id, b.status === null ? null : String(b.status || '')));
      case 'wish-to-item': return res.status(200).json(await wishToItem(b.id, today));
      case 'outfit-create': return res.status(200).json(await outfitCreate(b, today));
      case 'outfit-undo':   return res.status(200).json(await outfitUndo(b.id, b.changes));
      case 'outfit-status': return res.status(200).json(await outfitStatus(b.id, String(b.status || '')));
      default: throw new HttpError(400, 'Unknown action.');
    }
  }

  res.setHeader('Allow', 'GET, POST');
  throw new HttpError(405, 'Method not allowed.');
});

module.exports = handler;
module.exports.DB = DB;
module.exports.SPECS = SPECS;
module.exports.schemaOf = schemaOf;
