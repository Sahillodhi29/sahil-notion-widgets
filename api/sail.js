'use strict';
/* ============================================================
   /api/sail  : data + actions for the "Today's Sail" widget

   GET   -> today's to-dos (both databases) + today's Must Do's row
   POST  -> { action: 'todo-complete' | 'todo-restore' |
                      'mustdo-toggle' | 'mustdo-ensure', ... }

   Locked down: it can only touch pages inside your three databases.
   ============================================================ */
const {
  DBS, HttpError, notion, queryAll, wrap, readBody, getAllowedPage,
  todayStr, startOfDayISO, addInterval, daysBetween, addDays,
} = require('../lib/notion');

const TODO_LISTS = [
  { key: 'general', id: DBS.todoGeneral },
  { key: 'self',    id: DBS.todoSelf },
];
const TODO_IDS = TODO_LISTS.map(l => l.id);

const MUST_TITLE = 'Name';
const MUST_DATE = 'Date';

// Preferred order of the daily habits (matched ignoring case/spaces).
// Anything new you add later is shown after these.
const MUST_ORDER = [
  'wake up before 6 am', 'morning sunlight', 'morning quick routine', 'yoga & workout',
  'grooming & bathing', 'eggs & breakfast', 'seeds & peanuts', 'bank officer in making',
  'evening sunlight', 'night care begin at 9 pm', 'sleep before 11 pm',
];

const PRIORITY_RANK = { High: 0, Medium: 1, Low: 2 };
const DATE_RE = /^\d{4}-\d{2}-\d{2}(T[0-9:.+\-Z]+)?$/;

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

async function loadTodos(today) {
  const start = startOfDayISO(today);
  const startMs = Date.parse(start);

  const perList = await Promise.all(TODO_LISTS.map(async l => {
    const [open, edited] = await Promise.all([
      queryAll(l.id, { filter: { property: 'Status', status: { does_not_equal: 'Done' } } }),
      queryAll(l.id, { filter: { timestamp: 'last_edited_time', last_edited_time: { on_or_after: start } } }, 100),
    ]);
    return { l, open, edited };
  }));

  const items = [];
  let doneToday = 0;
  let backlog = 0;
  for (const { l, open, edited } of perList) {
    for (const page of open) {
      const t = taskFrom(page, l.key);
      if (!t.due) { backlog++; continue; }
      if (t.due <= today) {
        items.push({
          id: t.id, list: t.list, title: t.title, due: t.due, priority: t.priority,
          category: t.category, recur: t.recur, overdue: t.due < today,
          overdueDays: t.due < today ? daysBetween(t.due, today) : 0,
        });
      }
    }
    for (const page of edited) {
      const t = taskFrom(page, l.key);
      const existedBefore = Date.parse(page.created_time || '') < startMs;
      // finished today: marked Done, or a recurring task that was rolled forward today
      if (t.status === 'Done' || (t.recur && t.due && t.due > today && existedBefore)) doneToday++;
    }
  }
  items.sort(sortTasks);
  return { items, doneToday, total: items.length + doneToday, backlog };
}

function orderRank(label) {
  const i = MUST_ORDER.indexOf(label.toLowerCase().replace(/\s+/g, ' ').trim());
  return i === -1 ? 999 : i;
}

function mustFrom(page) {
  const items = [];
  let idx = 0;
  for (const key of Object.keys(page.properties || {})) {
    const p = page.properties[key];
    if (p.type === 'checkbox') {
      const label = key.trim();
      items.push({ key, label, done: !!p.checkbox, _o: idx++ });
    }
  }
  items.sort((a, b) => (orderRank(a.label) - orderRank(b.label)) || (a._o - b._o));
  items.forEach(i => { delete i._o; });
  return { pageId: page.id, items, missing: false };
}

function dayLabel(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()];
  const mo = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()];
  return `${wd}, ${d.getUTCDate()} ${mo}`;
}

async function findMustRow(today) {
  const rows = await queryAll(DBS.mustdo, { sorts: [{ property: MUST_DATE, direction: 'descending' }] }, 10);
  return rows.find(r => {
    const d = r.properties && r.properties[MUST_DATE] && r.properties[MUST_DATE].date;
    return d && d.start && d.start.slice(0, 10) === today;
  });
}

async function loadMust(today, create) {
  let row = await findMustRow(today);
  if (!row && create) {
    row = await notion('/pages', {
      method: 'POST',
      body: {
        parent: { database_id: DBS.mustdo },
        properties: {
          [MUST_TITLE]: { title: [{ type: 'text', text: { content: dayLabel(today) } }] },
          [MUST_DATE]: { date: { start: today } },
        },
      },
    });
  }
  if (!row) return { pageId: null, items: [], missing: true };
  return mustFrom(row);
}

/* ---------- actions ---------- */
async function todoComplete(id, today) {
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

async function todoRestore(id, prev) {
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

async function mustToggle(pageId, prop, value) {
  const page = await getAllowedPage(pageId, [DBS.mustdo]);
  const p = page.properties && page.properties[prop];
  if (!p || p.type !== 'checkbox') throw new HttpError(400, 'That is not a checkbox in Must Do\'s.');
  await notion(`/pages/${pageId}`, { method: 'PATCH', body: { properties: { [prop]: { checkbox: !!value } } } });
  return { ok: true };
}

/* ---------- handler ---------- */
const settle = p => p.then(
  data => data,
  e => ({ error: e.message || 'Failed', hint: e.hint }),
);

module.exports = wrap(async (req, res) => {
  const today = todayStr();

  if (req.method === 'GET') {
    const [todos, mustdo] = await Promise.all([settle(loadTodos(today)), settle(loadMust(today, false))]);
    return res.status(200).json({ today, label: dayLabel(today), todos, mustdo, generatedAt: new Date().toISOString() });
  }

  if (req.method === 'POST') {
    const b = readBody(req);
    switch (b.action) {
      case 'todo-complete': return res.status(200).json(await todoComplete(b.id, today));
      case 'todo-restore':  return res.status(200).json(await todoRestore(b.id, b.prev));
      case 'mustdo-toggle': return res.status(200).json(await mustToggle(b.pageId, String(b.prop || ''), b.value));
      case 'mustdo-ensure': return res.status(200).json(await loadMust(today, true));
      default: throw new HttpError(400, 'Unknown action.');
    }
  }

  res.setHeader('Allow', 'GET, POST');
  throw new HttpError(405, 'Method not allowed.');
});
