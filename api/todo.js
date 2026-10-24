'use strict';
/* ============================================================
   /api/todo : data + actions for the "Today's To-Do" widgets

   GET  /api/todo            -> today's + overdue tasks (both lists), tasks done today,
                                the next 7 days' load, and the undated backlog
   GET  /api/todo?meta=1     -> the live option lists (categories, units, priorities)
   POST /api/todo            -> { action: 'complete', id }
                                { action: 'restore',  id, prev }
                                { action: 'add', list, title, priority?, category?, due?, interval?, unit? }

   Same rules as /api/sail and /api/meal: reads take ?key=, writes need the
   x-widget-key header. Writes can only touch pages inside the two To-Do
   databases, and "add" can only create pages in those two databases.
   ============================================================ */
const {
  DBS, HttpError, notion, queryAll, wrap, readBody, getAllowedPage,
  todayStr, startOfDayISO, addInterval, daysBetween, addDays,
} = require('../lib/notion');

const LISTS = { general: DBS.todoGeneral, self: DBS.todoSelf };
const TODO_IDS = Object.values(LISTS);

const PRIORITY_RANK = { High: 0, Medium: 1, Low: 2 };
const DATE_RE = /^\d{4}-\d{2}-\d{2}(T[0-9:.+\-Z]+)?$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const WEEK_DAYS = 7;
const BACKLOG_MAX = 40;

/* ---------- reading ---------- */
function titleOf(page) {
  for (const k of Object.keys(page.properties || {})) {
    const p = page.properties[k];
    if (p.type === 'title') return (p.title || []).map(t => t.plain_text).join('').trim();
  }
  return '';
}

function taskFrom(page, list) {
  const p = page.properties || {};
  const interval = p['Recur Interval'] && p['Recur Interval'].number;
  const unit = p['Recur Unit'] && p['Recur Unit'].select && p['Recur Unit'].select.name;
  const dueObj = p['Due Date'] && p['Due Date'].date;
  return {
    id: page.id,
    list,
    title: titleOf(page) || 'Untitled',
    status: p.Status && p.Status.status ? p.Status.status.name : null,
    due: dueObj && dueObj.start ? dueObj.start.slice(0, 10) : null,
    dueObj: dueObj || null,
    priority: p.Priority && p.Priority.select ? p.Priority.select.name : null,
    category: p.Category && p.Category.select ? p.Category.select.name : null,
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

function shapeItem(t, today) {
  return {
    id: t.id, list: t.list, title: t.title, due: t.due, priority: t.priority,
    category: t.category, recur: t.recur,
    overdue: !!t.due && t.due < today,
    overdueDays: t.due && t.due < today ? daysBetween(t.due, today) : 0,
  };
}

const bucket = () => ({ n: 0, High: 0, Medium: 0, Low: 0, None: 0 });
function bump(b, priority) {
  b.n++;
  b[priority in PRIORITY_RANK ? priority : 'None']++;
}

async function loadAll(today) {
  const start = startOfDayISO(today);
  const startMs = Date.parse(start);

  const perList = await Promise.all(Object.entries(LISTS).map(async ([key, id]) => {
    const [open, edited] = await Promise.all([
      queryAll(id, { filter: { property: 'Status', status: { does_not_equal: 'Done' } } }),
      queryAll(id, { filter: { timestamp: 'last_edited_time', last_edited_time: { on_or_after: start } } }, 100),
    ]);
    return { key, open, edited };
  }));

  const items = [];
  const done = [];
  const backlogAll = [];
  const late = bucket();
  const upcoming = Array.from({ length: WEEK_DAYS }, (_, i) => ({ date: addDays(today, i), ...bucket() }));

  for (const { key, open, edited } of perList) {
    for (const page of open) {
      const t = taskFrom(page, key);
      if (!t.due) {
        const created = (page.created_time || '').slice(0, 10);
        backlogAll.push({
          id: t.id, list: key, title: t.title, priority: t.priority, category: t.category,
          age: created ? Math.max(0, daysBetween(created, today)) : 0,
        });
        continue;
      }
      if (t.due <= today) {
        items.push(shapeItem(t, today));
        bump(t.due < today ? late : upcoming[0], t.priority);
      } else {
        const i = daysBetween(today, t.due);
        if (i < WEEK_DAYS) bump(upcoming[i], t.priority);
      }
    }
    for (const page of edited) {
      const t = taskFrom(page, key);
      const existedBefore = Date.parse(page.created_time || '') < startMs;
      const base = { id: t.id, list: key, title: t.title, priority: t.priority, category: t.category, recur: t.recur };
      if (t.status === 'Done') {
        done.push({ ...base, rolledTo: null, canUndo: true });
      } else if (t.recur && t.due && t.due > today && existedBefore) {
        // a recurring task that was rolled forward today: counts as done, can't be un-rolled after a reload
        done.push({ ...base, rolledTo: t.due, canUndo: false });
      }
    }
  }

  items.sort(sortTasks);
  backlogAll.sort((a, b) => ((PRIORITY_RANK[a.priority] ?? 3) - (PRIORITY_RANK[b.priority] ?? 3)) || (b.age - a.age) || a.title.localeCompare(b.title));
  const backlogCounts = { general: 0, self: 0 };
  backlogAll.forEach(b => { backlogCounts[b.list]++; });

  return {
    items, done, upcoming, late,
    backlog: backlogAll.slice(0, BACKLOG_MAX),
    backlogTotal: backlogAll.length,
    backlogHigh: backlogAll.filter(b => b.priority === 'High').length,
    backlogCounts,
  };
}

const selectOptions = (db, name) =>
  ((db.properties && db.properties[name] && db.properties[name].select && db.properties[name].select.options) || []).map(o => o.name);

async function loadMeta() {
  const db = await notion(`/databases/${LISTS.general}`);
  return {
    categories: selectOptions(db, 'Category'),
    units: selectOptions(db, 'Recur Unit'),
    priorities: selectOptions(db, 'Priority'),
  };
}

/* ---------- actions ---------- */
async function complete(id, today) {
  const page = await getAllowedPage(id, TODO_IDS);
  const t = taskFrom(page, 'x');
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

async function restore(id, prev) {
  await getAllowedPage(id, TODO_IDS);
  const properties = {};
  if (prev && typeof prev.status === 'string' && prev.status.length < 80) {
    properties.Status = { status: { name: prev.status } };
  }
  if (prev && prev.due && DATE_RE.test(String(prev.due.start || ''))) {
    const date = { start: prev.due.start };
    if (prev.due.end && DATE_RE.test(String(prev.due.end))) date.end = prev.due.end;
    properties['Due Date'] = { date };
  }
  if (!Object.keys(properties).length) throw new HttpError(400, 'Nothing to restore.');
  await notion(`/pages/${id}`, { method: 'PATCH', body: { properties } });
  return { ok: true };
}

async function addTask(b, today) {
  const listKey = String(b.list || '');
  const dbId = LISTS[listKey];
  if (!dbId) throw new HttpError(400, 'Pick General or Self Improvement.');

  const title = String(b.title || '').replace(/\s+/g, ' ').trim();
  if (!title) throw new HttpError(400, 'Give the task a name.');
  if (title.length > 200) throw new HttpError(400, 'That title is too long (200 characters max).');

  // Validate every choice against the live database options, so a typo can never create a new select option.
  const db = await notion(`/databases/${dbId}`);
  const titleProp = Object.keys(db.properties || {}).find(k => db.properties[k].type === 'title') || 'Name';
  const properties = { [titleProp]: { title: [{ type: 'text', text: { content: title } }] } };

  if (b.priority) {
    if (!selectOptions(db, 'Priority').includes(b.priority)) throw new HttpError(400, `"${b.priority}" is not a Priority option.`);
    properties.Priority = { select: { name: b.priority } };
  }
  if (b.category) {
    if (!selectOptions(db, 'Category').includes(b.category)) throw new HttpError(400, `"${b.category}" is not a Category option.`);
    properties.Category = { select: { name: b.category } };
  }
  if (b.due) {
    const due = String(b.due);
    if (!DAY_RE.test(due) || Number.isNaN(Date.parse(due + 'T00:00:00Z'))) throw new HttpError(400, 'That due date is not valid.');
    properties['Due Date'] = { date: { start: due } };
  }
  if (b.interval || b.unit) {
    const n = Number(b.interval);
    if (!Number.isInteger(n) || n < 1 || n > 365) throw new HttpError(400, 'Repeat interval must be a whole number from 1 to 365.');
    if (!selectOptions(db, 'Recur Unit').includes(b.unit)) throw new HttpError(400, `"${b.unit}" is not a Recur Unit option.`);
    properties['Recur Interval'] = { number: n };
    properties['Recur Unit'] = { select: { name: b.unit } };
  }

  const page = await notion('/pages', { method: 'POST', body: { parent: { database_id: dbId }, properties } });
  return { ok: true, task: shapeItem(taskFrom(page, listKey), today) };
}

/* ---------- handler ---------- */
module.exports = wrap(async (req, res) => {
  const today = todayStr();

  if (req.method === 'GET') {
    const q = new URL(req.url, 'http://local').searchParams;
    if (q.get('meta')) return res.status(200).json({ meta: await loadMeta() });
    const data = await loadAll(today);
    const label = new Date(today + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
    return res.status(200).json({ today, label, ...data, generatedAt: new Date().toISOString() });
  }

  if (req.method === 'POST') {
    const b = readBody(req);
    switch (b.action) {
      case 'complete': return res.status(200).json(await complete(b.id, today));
      case 'restore':  return res.status(200).json(await restore(b.id, b.prev));
      case 'add':      return res.status(200).json(await addTask(b, today));
      default: throw new HttpError(400, 'Unknown action.');
    }
  }

  res.setHeader('Allow', 'GET, POST');
  throw new HttpError(405, 'Method not allowed.');
});
