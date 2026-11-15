'use strict';
/* ============================================================
   /api/workout  : data + actions for the Workout Planner widgets

   GET  /api/workout?days=56 -> Workout Log rows (with page ids) for the last
                                N days plus the next two weeks, the weekly
                                schedule, today's date and the program
                                (your own exercises, days and target).
   POST /api/workout         -> { action: 'toggle', pageId, prop, value }
                                { action: 'ensure' }              (create today's row)
                                { action: 'program-save', program } (save the program)

   Same rules as /api/meal and /api/sail: reads take ?key=, writes need the
   x-widget-key header, and writes can only touch pages inside the Workout Log.

   THE PROGRAM
   The weekly schedule and the exercise list used to live only in this file.
   Now the program widget edits both. They are stored as JSON in a code block
   on a "Workout Settings" page inside the Workout Log — that page has no Date,
   so no widget ever shows it.

   Exercises are still checkbox properties, one per exercise:
     - adding an exercise adds a checkbox property,
     - renaming one renames the property (its history comes along),
     - taking one out of the program only hides it; the property and its
       history stay in Notion, and the editor can put it back.
   With no saved program the widgets behave exactly as before (ORDER + groupOf),
   so existing logs light up untouched.
   ============================================================ */
const { HttpError, notion, queryAll, wrap, readBody, getAllowedPage, todayStr, addDays } = require('../notion');
const { LOGS } = require('./status');

const DATE_PROP = 'Date';
const MAX_DAYS = 120;
const AHEAD = 14;               // days of planned sessions to include after today
const WORKOUT_TIME = '5:00 PM'; // shown on rest days ("next workout ...")
const DONE_SHARE = 0.85;        // share of exercises that makes a training day "done" by default

// 0 = Sunday ... 6 = Saturday.  'workout' | 'bonus' (optional session) | 'rest'
const SCHEDULE = { 0: 'bonus', 1: 'workout', 2: 'rest', 3: 'workout', 4: 'rest', 5: 'workout', 6: 'rest' };
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Display order of the checkboxes when no program has been saved yet
// (matched ignoring case, spaces and the "x2" suffix).
const ORDER = [
  'wide pushups', 'incline pushups', 'diamond pushups',
  'wide pullups', 'close pullups', 'chin ups',
  'goated leg',
  'pre-workout snack', 'post-workout snack',
];

/* ---------- program constants ---------- */
const SETTINGS_TITLE = 'Workout Settings';
const PROGRAM_VERSION = 1;
const MAX_EXERCISES = 40;
const NAME_MAX = 60;
const HINT_MAX = 24;
const GROUPS = ['push', 'pull', 'legs', 'other', 'fuel'];
const KINDS = ['workout', 'rest', 'bonus'];

const norm = s => String(s).toLowerCase().replace(/\s*x\d+$/i, '').replace(/\s+/g, ' ').trim();
const clean = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

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
const scheduleOf = config => ({ ...SCHEDULE, ...((config && config.schedule) || {}) });
const kindOn = (d, config) => (scheduleOf(config)[weekdayOf(d)] || 'workout');

function rankOf(label) {
  const i = ORDER.indexOf(norm(label));
  return i === -1 ? 999 : i;
}

/* ---------- schema + program caches ---------- */
const cache = { schema: { t: 0, v: null }, program: { t: 0, v: null } };

async function dbSchema(fresh) {
  if (!fresh && cache.schema.v && Date.now() - cache.schema.t < 300000) return cache.schema.v;
  const db = await notion(`/databases/${LOGS.workout}`);
  const props = db.properties || {};
  const titleKey = Object.keys(props).find(k => props[k] && props[k].type === 'title') || 'Name';
  const v = { props, titleKey };
  cache.schema = { t: Date.now(), v };
  return v;
}

/* ---------- the settings page: a code block holding the program JSON ---------- */
const richOf = b => ((b && b[b.type] && b[b.type].rich_text) || []);
const textOf = b => richOf(b).map(t => t.plain_text || (t.text && t.text.content) || '').join('');

async function childrenOf(id) {
  const out = [];
  let cursor = null;
  do {
    const data = await notion(`/blocks/${id}/children?page_size=100${cursor ? `&start_cursor=${encodeURIComponent(cursor)}` : ''}`);
    out.push(...(data.results || []));
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor && out.length < 200);
  return out;
}

async function readConfigBlock(pageId) {
  const blocks = await childrenOf(pageId);
  for (const b of blocks) {
    const txt = textOf(b);
    if (!txt || txt.trim()[0] !== '{') continue;
    try { return { config: JSON.parse(txt), blockId: b.id, blockType: b.type }; }
    catch (e) { /* a half-edited block: keep looking */ }
  }
  return { config: null, blockId: null, blockType: null };
}

async function writeConfig(pageId, config) {
  const json = JSON.stringify(config);
  const chunks = [];
  for (let i = 0; i < json.length; i += 1800) chunks.push(json.slice(i, i + 1800));
  const rich = chunks.map(c => ({ type: 'text', text: { content: c } }));
  const found = await readConfigBlock(pageId);
  if (found.blockId) {
    const payload = found.blockType === 'code'
      ? { code: { language: 'json', rich_text: rich } }
      : { paragraph: { rich_text: rich } };
    await notion(`/blocks/${found.blockId}`, { method: 'PATCH', body: payload });
    return;
  }
  await notion(`/blocks/${pageId}/children`, {
    method: 'PATCH',
    body: { children: [{ object: 'block', type: 'code', code: { language: 'json', rich_text: rich } }] },
  });
}

async function readProgram(fresh) {
  if (!fresh && cache.program.v && Date.now() - cache.program.t < 60000) return cache.program.v;
  const db = await dbSchema(fresh);
  let page = null;
  try {
    const pages = await queryAll(LOGS.workout, {
      filter: { property: db.titleKey, title: { equals: SETTINGS_TITLE } },
    }, 5);
    page = pages.find(p => !p.archived && !p.in_trash) || null;
  } catch (e) {
    page = null;   // a renamed title property should not take the widgets down
  }
  const found = page ? await readConfigBlock(page.id) : { config: null };
  const v = { pageId: page ? page.id : null, config: found.config || null };
  cache.program = { t: Date.now(), v };
  return v;
}

/* ---------- exercises ---------- */
// Every checkbox in the database, in the pre-program default order.
function detectedItems(props) {
  const items = [];
  let idx = 0;
  for (const [key, p] of Object.entries(props)) {
    if (!p || p.type !== 'checkbox') continue;
    const label = clean(key);
    if (!label) continue;
    items.push({ prop: key, name: label, group: groupOf(label), hint: '', hidden: false, _o: idx++, _r: rankOf(label) });
  }
  items.sort((a, b) => (a._r - b._r) || (a._o - b._o) || a.name.localeCompare(b.name));
  return items.map(({ _o, _r, ...rest }) => rest);
}

function publicProgram(program, props) {
  const cfg = program && program.config;
  const items = cfg && Array.isArray(cfg.items) && cfg.items.length
    ? cfg.items.map(i => ({ prop: i.prop || null, name: i.name, group: GROUPS.includes(i.group) ? i.group : 'other', hint: i.hint || '', hidden: !!i.hidden }))
    : detectedItems(props || {});
  return {
    exists: !!(cfg && Array.isArray(cfg.items) && cfg.items.length),
    schedule: scheduleOf(cfg),
    need: cfg && cfg.need ? cfg.need : null,
    items,
  };
}

function shapeRow(r, config) {
  const props = r.properties || {};
  const d = props[DATE_PROP] && props[DATE_PROP].date;
  if (!d || !d.start) return null;
  const cfg = config && Array.isArray(config.items) && config.items.length ? config : null;
  const items = [];
  if (cfg) {
    const used = new Set();
    const put = new Set();     // taken out of the program: keep it out, even though Notion still has it
    cfg.items.forEach(c => {
      if (c.hidden) { if (c.prop) put.add(c.prop); if (c.name) put.add(c.name); return; }
      const key = props[c.prop] && props[c.prop].type === 'checkbox' ? c.prop
        : props[c.name] && props[c.name].type === 'checkbox' ? c.name : null;
      if (!key || used.has(key)) return;
      used.add(key);
      items.push({ key, label: c.name, name: c.name, group: GROUPS.includes(c.group) ? c.group : 'other', hint: c.hint || '', done: !!props[key].checkbox });
    });
    // checkboxes added straight in Notion after the program was saved still show, at the end
    for (const [key, p] of Object.entries(props)) {
      if (!p || p.type !== 'checkbox' || used.has(key) || put.has(key)) continue;
      const label = clean(key);
      items.push({ key, label, name: label.replace(/\s*x\d+$/i, ''), group: groupOf(label), hint: '', done: !!p.checkbox });
    }
  } else {
    let idx = 0;
    for (const [key, p] of Object.entries(props)) {
      if (p.type !== 'checkbox') continue;
      const label = key.trim();
      items.push({ key, label, name: label.replace(/\s*x\d+$/i, ''), group: groupOf(label), hint: '', done: !!p.checkbox, _o: idx++ });
    }
    items.sort((a, b) => (rankOf(a.label) - rankOf(b.label)) || (a._o - b._o) || a.label.localeCompare(b.label));
    items.forEach(i => { delete i._o; });
  }
  const date = d.start.slice(0, 10);
  return { id: r.id, date, kind: kindOn(date, cfg), items };
}

function shape(rows, from, to, config) {
  const out = [];
  for (const r of rows) {
    const s = shapeRow(r, config);
    if (s && s.date >= from && s.date <= to) out.push(s);
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

async function load(from, to, config) {
  // Ask for one extra day on each side, then trim by the date as written in your time zone.
  const rows = await queryAll(LOGS.workout, {
    filter: { and: [
      { property: DATE_PROP, date: { on_or_after: addDays(from, -1) } },
      { property: DATE_PROP, date: { on_or_before: addDays(to, 1) } },
    ] },
    sorts: [{ property: DATE_PROP, direction: 'ascending' }],
  }, 200);
  return shape(rows, from, to, config);
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
// the widgets decide what to show from the schedule, so a rest-day row only asks for the snacks.
async function ensure(today) {
  const { config } = await readProgram(false);
  const existing = (await load(today, today, config))[0];
  if (existing) return { ok: true, created: false, row: existing };

  const db = await dbSchema(false);
  if (!db.props[DATE_PROP]) throw new HttpError(500, 'The Workout Log needs a "Date" property.');

  const kind = kindOn(today, config);
  const title = `${WEEKDAYS[weekdayOf(today)]}'s ${kind === 'rest' ? 'Rest' : 'Workout'}`;
  const page = await notion('/pages', {
    method: 'POST',
    body: {
      parent: { database_id: LOGS.workout },
      properties: {
        [db.titleKey]: { title: [{ type: 'text', text: { content: title } }] },
        [DATE_PROP]: { date: { start: today } },
      },
    },
  });
  const row = shapeRow(page, config);
  if (!row) throw new HttpError(502, 'Notion created the row but it came back without a date.');
  return { ok: true, created: true, row };
}

/* Save the program: rename properties, add new ones, then store the JSON. */
async function saveProgram(input) {
  const raw = input && typeof input === 'object' ? input : {};
  const src = Array.isArray(raw.items) ? raw.items : [];
  if (!src.length) throw new HttpError(400, 'Keep at least one exercise in your program.');
  if (src.length > MAX_EXERCISES) throw new HttpError(400, `That is more than ${MAX_EXERCISES} exercises — trim the list first.`);

  const db = await dbSchema(true);
  const props = db.props;
  const reserved = new Set([DATE_PROP.toLowerCase(), String(db.titleKey).toLowerCase()]);

  /* 1. validate every row before touching Notion */
  const list = [];
  const seen = new Set();
  for (const it of src) {
    const name = clean(it && it.name);
    if (!name) throw new HttpError(400, 'Every exercise needs a name.');
    if (name.length > NAME_MAX) throw new HttpError(400, `"${name.slice(0, 24)}…" is too long — keep names under ${NAME_MAX} characters.`);
    const low = name.toLowerCase();
    if (seen.has(low)) throw new HttpError(400, `"${name}" appears twice.`);
    if (reserved.has(low)) throw new HttpError(400, `"${name}" is a reserved property name.`);
    seen.add(low);
    list.push({
      prop: clean(it && it.prop),
      name,
      group: GROUPS.includes(it && it.group) ? it.group : groupOf(name),
      hint: clean(it && it.hint).slice(0, HINT_MAX),
      hidden: !!(it && it.hidden),
    });
  }

  const visible = list.filter(i => !i.hidden).length;
  if (!visible) throw new HttpError(400, 'Keep at least one exercise in the program.');
  let need = parseInt(raw.need, 10);
  if (!Number.isFinite(need) || need < 1) need = Math.ceil(visible * DONE_SHARE);
  need = Math.min(Math.max(1, need), visible);

  const schedule = {};
  for (let d = 0; d < 7; d++) {
    const k = raw.schedule && raw.schedule[String(d)];
    schedule[d] = KINDS.includes(k) ? k : SCHEDULE[d];
  }
  if (!Object.values(schedule).includes('workout')) throw new HttpError(400, 'Mark at least one day as a training day.');

  /* 2. one database edit: renames and new checkboxes together */
  const renames = {};
  const adds = [];
  list.forEach(it => {
    if (it.prop && props[it.prop]) {
      if (props[it.prop].type !== 'checkbox') throw new HttpError(400, `"${it.prop}" is not an exercise property.`);
      if (it.prop !== it.name) renames[it.prop] = { name: it.name };
      return;
    }
    if (props[it.name]) {
      if (props[it.name].type !== 'checkbox') throw new HttpError(400, `"${it.name}" is already used by a non-exercise property.`);
      it.prop = it.name;                    // it is already there: adopt it
      return;
    }
    adds.push(it.name);
  });

  if (Object.keys(renames).length || adds.length) {
    const properties = {};
    Object.entries(renames).forEach(([from, v]) => { properties[from] = { name: v.name }; });
    adds.forEach(n => { properties[n] = { checkbox: {} }; });
    await notion(`/databases/${LOGS.workout}`, { method: 'PATCH', body: { properties } });
    cache.schema = { t: 0, v: null };
  }

  /* 3. the config, keyed by the property names Notion now has */
  const items = list.map(it => ({ prop: it.prop || it.name, name: it.name, group: it.group, hint: it.hint, hidden: it.hidden }));
  const config = { v: PROGRAM_VERSION, schedule, need, items };

  const current = await readProgram(true);
  let pageId = current.pageId;
  if (!pageId) {
    const page = await notion('/pages', {
      method: 'POST',
      body: {
        parent: { database_id: LOGS.workout },
        properties: { [db.titleKey]: { title: [{ type: 'text', text: { content: SETTINGS_TITLE } }] } },
      },
    });
    pageId = page.id;
  }
  await writeConfig(pageId, config);
  cache.program = { t: 0, v: null };

  const fresh = await readProgram(true);
  const schema = await dbSchema(true);
  return { ok: true, program: publicProgram(fresh, schema.props) };
}

module.exports = wrap(async (req, res) => {
  const today = todayStr();

  if (req.method === 'GET') {
    const q = new URL(req.url, 'http://local').searchParams;
    const days = Math.min(MAX_DAYS, Math.max(7, parseInt(q.get('days'), 10) || 56));
    const from = addDays(today, -(days - 1));
    const [program, schema] = await Promise.all([readProgram(false), dbSchema(false)]);
    const rows = await load(from, addDays(today, AHEAD), program.config);
    return res.status(200).json({
      today, from, rows,
      schedule: scheduleOf(program.config),
      time: WORKOUT_TIME,
      program: publicProgram(program, schema.props),
      generatedAt: new Date().toISOString(),
    });
  }

  if (req.method === 'POST') {
    const b = readBody(req);
    if (b.action === 'toggle') return res.status(200).json(await toggle(b.pageId, String(b.prop || ''), b.value));
    if (b.action === 'ensure') return res.status(200).json(await ensure(today));
    if (b.action === 'program-save') return res.status(200).json(await saveProgram(b.program));
    throw new HttpError(400, 'Unknown action.');
  }

  res.setHeader('Allow', 'GET, POST');
  throw new HttpError(405, 'Method not allowed.');
});
