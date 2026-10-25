'use strict';
/* ============================================================
   /api/learning  : data + actions for the Learning Planner widgets

   GET  /api/learning?need=topics,tasks,log,schema
        -> { today, topics, tasks, log, schema }
           each section is { rows } / the tasks object (or { error, hint } if that one failed)

   POST /api/learning  { action: ... }
        task-complete  { id }                  tick a task (recurring tasks roll forward, like the Sail widget)
        task-restore   { id, prev }            undo a tick
        task-create    { name, category?, priority?, due?, interval?, unit? }
        topic-create   { name, tags?, cover? }
        session-log    { topicId, minutes, note?, date? }   one row in the Study Log
        session-delete { id }                  undo a logged session

   Same rules as /api/sail and /api/wardrobe: reads take ?key=, writes need the
   x-widget-key header. Every write is locked to the three Learning Planner databases.

   Optional env overrides: DB_LEARNINGS, DB_LEARN_TODO, DB_STUDY_LOG
   ============================================================ */
const {
  HttpError, notion, queryAll, wrap, readBody, getAllowedPage, norm,
  todayStr, startOfDayISO, addInterval, daysBetween, addDays,
} = require('../lib/notion');

const DB = {
  topics: norm(process.env.DB_LEARNINGS  || 'd7cfa221698783d7914381ff5834297a'),
  tasks:  norm(process.env.DB_LEARN_TODO || '3eefa221698780798f2efcd4a98fbf24'),
  log:    norm(process.env.DB_STUDY_LOG  || '07ea2d8c531049bca7c62c75cc1af492'),
};

/* What the health page checks. */
const SPECS = {
  topics: { 'Name': 'title', 'Tags': 'multi_select' },
  tasks: {
    'Name': 'title', 'Status': 'status', 'Due Date': 'date', 'Priority': 'select', 'Category': 'select',
    'Recur Interval': 'number', 'Recur Unit': 'select',
  },
  log: { 'Name': 'title', 'Date': 'date', 'Topic': 'relation', 'Minutes': 'number', 'Note': 'rich_text' },
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}(T[0-9:.+\-Z]+)?$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const PRIORITY_RANK = { High: 0, Medium: 1, Low: 2 };
const LOG_DAYS = 120;

class OptionError extends HttpError {}

/* ---------- live option lists, cached for 5 minutes ---------- */
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
    if (p.type === 'status') o.options = (p.status.options || []).map(x => x.name);
    props[name] = o;
  }
  schemaCache.set(dbId, { t: Date.now(), props });
  return props;
}

/* ---------- reading ---------- */
function readers(page) {
  const P = page.properties || {};
  const has = (n, k) => P[n] && P[n][k];
  return {
    title:  n => (has(n, 'title') ? P[n].title.map(t => t.plain_text).join('').trim() : ''),
    text:   n => (has(n, 'rich_text') ? P[n].rich_text.map(t => t.plain_text).join('').trim() : ''),
    sel:    n => (P[n] && P[n].select ? P[n].select.name : null),
    status: n => (P[n] && P[n].status ? P[n].status.name : null),
    multi:  n => (has(n, 'multi_select') ? P[n].multi_select.map(o => o.name) : []),
    num:    n => (P[n] && typeof P[n].number === 'number' ? P[n].number : null),
    date:   n => (P[n] && P[n].date && P[n].date.start ? P[n].date.start.slice(0, 10) : null),
    rel:    n => (has(n, 'relation') ? P[n].relation.map(r => r.id) : []),
  };
}

function slimTopic(page) {
  const r = readers(page);
  const name = r.title('Name');
  if (!name) return null;                                   // skips blank rows
  const c = page.cover;
  const cover = c ? (c.type === 'external' ? (c.external && c.external.url) : (c.file && c.file.url)) || '' : '';
  return { id: page.id, name, tags: r.multi('Tags'), cover, created: page.created_time || null };
}

function taskFrom(page) {
  const r = readers(page);
  const P = page.properties || {};
  const interval = r.num('Recur Interval');
  const unit = r.sel('Recur Unit');
  const dueObj = P['Due Date'] && P['Due Date'].date;
  return {
    id: page.id,
    title: r.title('Name') || 'Untitled',
    status: r.status('Status'),
    due: dueObj && dueObj.start ? dueObj.start.slice(0, 10) : null,
    dueObj: dueObj || null,
    priority: r.sel('Priority'),
    category: r.sel('Category'),
    recur: Number.isFinite(interval) && interval > 0 && !!unit,
    interval, unit,
  };
}

function sortTasks(a, b) {
  const pa = PRIORITY_RANK[a.priority] ?? 3;
  const pb = PRIORITY_RANK[b.priority] ?? 3;
  if (pa !== pb) return pa - pb;
  if (a.due !== b.due) return (a.due || '9999').localeCompare(b.due || '9999');
  return a.title.localeCompare(b.title);
}

async function loadTasks(today) {
  const start = startOfDayISO(today);
  const startMs = Date.parse(start);
  const [open, edited] = await Promise.all([
    queryAll(DB.tasks, { filter: { property: 'Status', status: { does_not_equal: 'Done' } } }, 400),
    queryAll(DB.tasks, { filter: { timestamp: 'last_edited_time', last_edited_time: { on_or_after: start } } }, 150),
  ]);
  const weekEnd = addDays(today, 7);
  const items = [], week = [], someday = [];
  for (const page of open) {
    if (!readers(page).title('Name')) continue;                // blank template rows are ignored
    const t = taskFrom(page);
    const base = { id: t.id, title: t.title, due: t.due, priority: t.priority, category: t.category, recur: t.recur };
    if (!t.due) someday.push(base);
    else if (t.due <= today) items.push({ ...base, overdue: t.due < today, overdueDays: t.due < today ? daysBetween(t.due, today) : 0 });
    else if (t.due <= weekEnd) week.push(base);
  }
  let doneToday = 0;
  for (const page of edited) {
    if (!readers(page).title('Name')) continue;
    const t = taskFrom(page);
    const existedBefore = Date.parse(page.created_time || '') < startMs;
    // finished today: marked Done, or a recurring task that was rolled forward today
    if (t.status === 'Done' || (t.recur && t.due && t.due > today && existedBefore)) doneToday++;
  }
  items.sort(sortTasks); week.sort(sortTasks); someday.sort(sortTasks);
  return { items, week, someday: someday.slice(0, 80), somedayTotal: someday.length, doneToday, total: items.length + doneToday };
}

async function loadLog(today) {
  const from = addDays(today, -(LOG_DAYS - 1));
  const pages = await queryAll(DB.log, {
    filter: { and: [
      { property: 'Date', date: { on_or_after: from } },
      { property: 'Date', date: { on_or_before: today } },
    ] },
    sorts: [{ property: 'Date', direction: 'ascending' }],
  }, 600);
  const rows = [];
  for (const p of pages) {
    const r = readers(p);
    const date = r.date('Date');
    const minutes = r.num('Minutes');
    if (!date || !minutes) continue;
    rows.push({ id: p.id, date, minutes, note: r.text('Note'), topic: r.rel('Topic')[0] || null });
  }
  rows.sort((a, b) => a.date.localeCompare(b.date));
  return { rows };
}

const settle = p => p.then(
  data => data,
  e => ({ error: e.message || 'Failed', hint: e.hint }),
);

/* ---------- tasks: tick, undo ---------- */
async function taskComplete(id, today) {
  const page = await getAllowedPage(id, [DB.tasks]);
  const t = taskFrom(page);
  const prev = { status: t.status, due: t.dueObj ? { start: t.dueObj.start, end: t.dueObj.end || null } : null };

  if (t.recur) {
    // Recurring: roll the due date forward instead of finishing the task.
    const base = t.due && t.due > today ? t.due : today;
    const next = addInterval(base, t.interval, t.unit);
    if (next) {
      const old = t.dueObj || {};
      const timePart = old.start && old.start.length > 10 ? old.start.slice(10) : '';
      const date = { start: next + timePart };
      if (old.end) {
        const shift = daysBetween((old.start || base).slice(0, 10), next);
        date.end = addDays(old.end.slice(0, 10), shift) + (old.end.length > 10 ? old.end.slice(10) : '');
      }
      const properties = { 'Due Date': { date } };
      if (t.status && t.status !== 'To-Do') properties.Status = { status: { name: 'To-Do' } };
      await notion(`/pages/${id}`, { method: 'PATCH', body: { properties } });
      return { ok: true, rolled: true, nextDue: next, prev };
    }
  }
  await notion(`/pages/${id}`, { method: 'PATCH', body: { properties: { Status: { status: { name: 'Done' } } } } });
  return { ok: true, done: true, prev };
}

async function taskRestore(id, prev) {
  await getAllowedPage(id, [DB.tasks]);
  const properties = {};
  if (prev && typeof prev.status === 'string' && prev.status.length < 80) properties.Status = { status: { name: prev.status } };
  if (prev && prev.due && DATE_RE.test(String(prev.due.start || ''))) {
    const date = { start: prev.due.start };
    if (prev.due.end && DATE_RE.test(String(prev.due.end))) date.end = prev.due.end;
    properties['Due Date'] = { date };
  } else if (prev && prev.due === null) properties['Due Date'] = { date: null };
  if (!Object.keys(properties).length) throw new HttpError(400, 'Nothing to restore.');
  await notion(`/pages/${id}`, { method: 'PATCH', body: { properties } });
  return { ok: true };
}

/* ---------- creating things ---------- */
const clip = (s, n) => String(s == null ? '' : s).trim().slice(0, n);

function pickOption(schema, prop, value) {
  if (value === undefined || value === null || value === '') return undefined;
  const def = schema[prop];
  if (!def) throw new HttpError(400, `The database has no property called "${prop}".`, 'Open /api/learning-health to see what is missing.');
  if (!(def.options || []).includes(String(value))) {
    throw new OptionError(400, `"${value}" is not an option for ${prop} in Notion.`, 'Add that option in Notion first, or pick another one.');
  }
  return String(value);
}

function buildTask(b, schema) {
  const name = clip(b.name, 200);
  if (!name) throw new HttpError(400, 'Give the task a name first.');
  const props = { Name: { title: [{ type: 'text', text: { content: name } }] }, Status: { status: { name: 'To-Do' } } };
  const category = pickOption(schema, 'Category', b.category);
  if (category) props.Category = { select: { name: category } };
  const priority = pickOption(schema, 'Priority', b.priority);
  if (priority) props.Priority = { select: { name: priority } };
  if (b.due) {
    if (!DAY_RE.test(String(b.due))) throw new HttpError(400, 'The due date must look like 2026-10-24.');
    props['Due Date'] = { date: { start: String(b.due) } };
  }
  if (b.interval) {
    const n = Number(b.interval);
    if (!Number.isInteger(n) || n < 1 || n > 365) throw new HttpError(400, 'Repeat every must be a whole number from 1 to 365.');
    const unit = pickOption(schema, 'Recur Unit', b.unit);
    if (!unit) throw new HttpError(400, 'Pick how often it repeats (days, weeks, months...).');
    if (!b.due) throw new HttpError(400, 'A repeating task needs a first due date.');
    props['Recur Interval'] = { number: n };
    props['Recur Unit'] = { select: { name: unit } };
  }
  return props;
}

async function taskCreate(b) {
  let schema = await schemaOf(DB.tasks);
  let properties;
  try { properties = buildTask(b, schema); }
  catch (e) {
    if (!(e instanceof OptionError)) throw e;
    schema = await schemaOf(DB.tasks, true);                 // an option may have been added in Notion a moment ago
    properties = buildTask(b, schema);
  }
  const page = await notion('/pages', { method: 'POST', body: { parent: { database_id: DB.tasks }, properties } });
  return { ok: true, id: page.id };
}

async function topicCreate(b) {
  const name = clip(b.name, 200);
  if (!name) throw new HttpError(400, 'Give the topic a name first.');
  const tags = [];
  for (const t of Array.isArray(b.tags) ? b.tags : []) {
    const s = clip(String(t).replace(/,/g, ' '), 40);
    if (s && !tags.some(x => x.toLowerCase() === s.toLowerCase())) tags.push(s);
  }
  if (tags.length > 8) throw new HttpError(400, 'Use at most 8 tags.');
  const properties = { Name: { title: [{ type: 'text', text: { content: name } }] } };
  if (tags.length) properties.Tags = { multi_select: tags.map(n => ({ name: n })) };
  const body = { parent: { database_id: DB.topics }, properties };
  if (b.cover) {
    const url = clip(b.cover, 1900);
    let ok = false;
    try { ok = new URL(url).protocol === 'https:'; } catch (e) { ok = false; }
    if (!ok) throw new HttpError(400, 'The cover must be an image link starting with https://.');
    body.cover = { type: 'external', external: { url } };
  }
  const page = await notion('/pages', { method: 'POST', body });
  return { ok: true, id: page.id };
}

/* ---------- study sessions ---------- */
async function sessionLog(b, today) {
  const minutes = Math.round(Number(b.minutes));
  if (!Number.isFinite(minutes) || minutes < 1 || minutes > 720) throw new HttpError(400, 'Minutes must be between 1 and 720.');
  const topicPage = await getAllowedPage(b.topicId, [DB.topics]);
  const topicName = readers(topicPage).title('Name') || 'Study';
  const date = DAY_RE.test(String(b.date || '')) && String(b.date) <= today ? String(b.date) : today;
  const properties = {
    Name: { title: [{ type: 'text', text: { content: `${topicName}, ${minutes} min` } }] },
    Date: { date: { start: date } },
    Topic: { relation: [{ id: topicPage.id }] },
    Minutes: { number: minutes },
  };
  const note = clip(b.note, 1900);
  if (note) properties.Note = { rich_text: [{ type: 'text', text: { content: note } }] };
  const page = await notion('/pages', { method: 'POST', body: { parent: { database_id: DB.log }, properties } });
  return { ok: true, id: page.id, date, minutes };
}

async function sessionDelete(id) {
  await getAllowedPage(id, [DB.log]);
  await notion(`/pages/${id}`, { method: 'PATCH', body: { archived: true } });
  return { ok: true };
}

/* ---------- handler ---------- */
const handler = wrap(async (req, res) => {
  const today = todayStr();

  if (req.method === 'GET') {
    const q = new URL(req.url, 'http://local').searchParams;
    const need = new Set((q.get('need') || 'tasks').split(',').map(s => s.trim()).filter(Boolean));
    const out = { today, generatedAt: new Date().toISOString() };
    const jobs = [];
    if (need.has('topics')) jobs.push(settle(queryAll(DB.topics, {}, 300).then(p => ({ rows: p.map(slimTopic).filter(Boolean) }))).then(v => { out.topics = v; }));
    if (need.has('tasks'))  jobs.push(settle(loadTasks(today)).then(v => { out.tasks = v; }));
    if (need.has('log'))    jobs.push(settle(loadLog(today)).then(v => { out.log = v; }));
    if (need.has('schema')) {
      jobs.push(settle(Promise.all([schemaOf(DB.tasks, true), schemaOf(DB.topics, true)]).then(([t, l]) => {
        const pick = (src, names) => Object.fromEntries(names.filter(n => src[n]).map(n => [n, { type: src[n].type, options: src[n].options || [] }]));
        return { task: pick(t, ['Category', 'Priority', 'Recur Unit']), topic: pick(l, ['Tags']) };
      })).then(v => { out.schema = v; }));
    }
    await Promise.all(jobs);
    return res.status(200).json(out);
  }

  if (req.method === 'POST') {
    const b = readBody(req);
    switch (b.action) {
      case 'task-complete':  return res.status(200).json(await taskComplete(b.id, today));
      case 'task-restore':   return res.status(200).json(await taskRestore(b.id, b.prev));
      case 'task-create':    return res.status(200).json(await taskCreate(b));
      case 'topic-create':   return res.status(200).json(await topicCreate(b));
      case 'session-log':    return res.status(200).json(await sessionLog(b, today));
      case 'session-delete': return res.status(200).json(await sessionDelete(b.id));
      default: throw new HttpError(400, 'Unknown action.');
    }
  }

  res.setHeader('Allow', 'GET, POST');
  throw new HttpError(405, 'Method not allowed.');
});

module.exports = handler;
module.exports.DB = DB;
module.exports.SPECS = SPECS;
