'use strict';
/* ============================================================
   /api/finance  : data + actions for the Finance & Investing widgets

   GET  /api/finance?parts=tx,budgets,glossary,roadmap,goals&days=62
        -> only the parts a widget asks for (each part fails on its own)
   POST /api/finance  (x-widget-key header required)
        { action: 'tx-add', amount, type, category, mode?, note?, date? }
        { action: 'tx-undo', id }                      (moves the row to Notion's trash)
        { action: 'term-learned', id, value }
        { action: 'step-toggle', id, value }
        { action: 'goal-add', id, amount }             (amount may be negative to correct a mistake)

   Locked down: every write first checks the page lives in one of the
   five finance databases (getAllowedPage).

   Optional env overrides: DB_FIN_TX, DB_FIN_BUDGETS, DB_FIN_GLOSSARY,
   DB_FIN_ROADMAP, DB_FIN_GOALS, FIN_INCOME_CATEGORIES (comma list)
   ============================================================ */
const { HttpError, notion, queryAll, wrap, readBody, getAllowedPage, norm, todayStr, addDays } = require('../notion');

const FIN = {
  tx:       norm(process.env.DB_FIN_TX       || '1367cf61ee3f4b5aa2807e6f279ee0a4'),
  budgets:  norm(process.env.DB_FIN_BUDGETS  || '7e0f09ebc67e4744b09d94170eecd03d'),
  glossary: norm(process.env.DB_FIN_GLOSSARY || '94ce1921fdcc48a6a02dfc845c3d016b'),
  roadmap:  norm(process.env.DB_FIN_ROADMAP  || '13577eebd334414aafcf373d12568d79'),
  goals:    norm(process.env.DB_FIN_GOALS    || '9be4855f40cd4e60ab8e932bb4cc05eb'),
};
const INCOME_CATS = (process.env.FIN_INCOME_CATEGORIES || 'Pocket Money,Other Income').split(',').map(s => s.trim()).filter(Boolean);
const SAVINGS_CAT = 'Savings';
const MAX_DAYS = 190;
const MAX_AMOUNT = 1e7;
const BUCKET_RANK = { Needs: 0, Wants: 1, Savings: 2 };
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/* ---------- reading ---------- */
const text = p => (p && (p.title || p.rich_text) ? (p.title || p.rich_text).map(t => t.plain_text).join('').trim() : '');
const sel = p => (p && p.select ? p.select.name : null);
const num = p => (p && Number.isFinite(p.number) ? p.number : 0);

function shapeTx(page) {
  const p = page.properties || {};
  const d = p.Date && p.Date.date;
  if (!d || !d.start) return null;
  return {
    id: page.id, date: d.start.slice(0, 10), name: text(p.Name), amount: num(p.Amount),
    type: sel(p.Type), category: sel(p.Category), mode: sel(p.Mode), note: text(p.Note),
  };
}

async function loadTx(today, days) {
  const from = addDays(today, -(days - 1));
  const rows = await queryAll(FIN.tx, {
    filter: { and: [
      { property: 'Date', date: { on_or_after: from } },
      { property: 'Date', date: { on_or_before: today } },
    ] },
    sorts: [{ property: 'Date', direction: 'descending' }, { timestamp: 'created_time', direction: 'descending' }],
  }, 1000);
  return rows.map(shapeTx).filter(Boolean);
}

async function loadBudgets() {
  const rows = await queryAll(FIN.budgets, {}, 100);
  return rows.map(r => {
    const p = r.properties || {};
    return { category: text(p.Category), limit: num(p['Monthly Limit']), bucket: sel(p.Bucket) || 'Wants' };
  }).filter(b => b.category)
    .sort((a, b) => (BUCKET_RANK[a.bucket] ?? 3) - (BUCKET_RANK[b.bucket] ?? 3) || b.limit - a.limit);
}

async function loadGlossary() {
  const rows = await queryAll(FIN.glossary, { sorts: [{ timestamp: 'created_time', direction: 'ascending' }] }, 300);
  return rows.map(r => {
    const p = r.properties || {};
    return {
      id: r.id, term: text(p.Term), topic: sel(p.Topic), level: sel(p.Level),
      meaning: text(p['Plain Meaning']), example: text(p['Real Example']), learned: !!(p.Learned && p.Learned.checkbox),
    };
  }).filter(g => g.term);
}

async function loadRoadmap() {
  const rows = await queryAll(FIN.roadmap, { sorts: [{ property: 'Order', direction: 'ascending' }] }, 100);
  return rows.map(r => {
    const p = r.properties || {};
    return { id: r.id, step: text(p.Step), order: num(p.Order), why: text(p['Why It Matters']), done: !!(p.Done && p.Done.checkbox) };
  }).filter(s => s.step);
}

function shapeGoal(r) {
  const p = r.properties || {};
  const d = p['Target Date'] && p['Target Date'].date;
  return {
    id: r.id, goal: text(p.Goal), target: num(p.Target), saved: num(p.Saved),
    date: d && d.start ? d.start.slice(0, 10) : null, status: sel(p.Status) || 'Active',
  };
}
async function loadGoals() {
  const rows = await queryAll(FIN.goals, { sorts: [{ timestamp: 'created_time', direction: 'ascending' }] }, 50);
  return rows.map(shapeGoal).filter(g => g.goal);
}

/* Category / Mode options come from the database itself, so a new option you add in Notion just works. */
let schemaCache = { at: 0, data: null };
async function schema() {
  if (schemaCache.data && Date.now() - schemaCache.at < 5 * 60 * 1000) return schemaCache.data;
  const db = await notion(`/databases/${FIN.tx}`);
  const opts = name => ((db.properties && db.properties[name] && db.properties[name].select && db.properties[name].select.options) || []).map(o => o.name);
  const data = { categories: opts('Category'), modes: opts('Mode') };
  schemaCache = { at: Date.now(), data };
  return data;
}

/* ---------- actions ---------- */
async function txAdd(b, today) {
  const amount = Math.round(Number(b.amount) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) throw new HttpError(400, 'Amount must be a number above 0.');
  const type = b.type === 'Income' || b.type === 'Expense' ? b.type : null;
  if (!type) throw new HttpError(400, 'Type must be Expense or Income.');
  const sc = await schema();
  const category = String(b.category || '');
  if (!sc.categories.includes(category)) throw new HttpError(400, `"${category}" is not a category in Transactions.`);
  if (type === 'Expense' && INCOME_CATS.includes(category)) throw new HttpError(400, `"${category}" is an income category.`);
  if (type === 'Income' && !INCOME_CATS.includes(category)) throw new HttpError(400, `"${category}" is not an income category.`);
  const mode = b.mode ? String(b.mode) : '';
  if (mode && !sc.modes.includes(mode)) throw new HttpError(400, `"${mode}" is not a payment mode in Transactions.`);
  const date = b.date ? String(b.date) : today;
  if (!DATE_RE.test(date) || date > today || date < addDays(today, -60)) throw new HttpError(400, 'Date must be today or within the last 60 days.');
  const note = String(b.note || '').trim().slice(0, 200);
  const name = (note || category).slice(0, 100);

  const properties = {
    Name: { title: [{ type: 'text', text: { content: name } }] },
    Date: { date: { start: date } },
    Amount: { number: amount },
    Type: { select: { name: type } },
    Category: { select: { name: category } },
  };
  if (mode) properties.Mode = { select: { name: mode } };
  if (note) properties.Note = { rich_text: [{ type: 'text', text: { content: note } }] };
  const page = await notion('/pages', { method: 'POST', body: { parent: { database_id: FIN.tx }, properties } });
  return { ok: true, row: shapeTx(page) };
}

async function txUndo(id) {
  await getAllowedPage(id, [FIN.tx]);
  await notion(`/pages/${id}`, { method: 'PATCH', body: { archived: true } });
  return { ok: true };
}

async function checkbox(id, db, prop, value) {
  const page = await getAllowedPage(id, [db]);
  const p = page.properties && page.properties[prop];
  if (!p || p.type !== 'checkbox') throw new HttpError(400, `"${prop}" is not a checkbox in that database.`);
  await notion(`/pages/${id}`, { method: 'PATCH', body: { properties: { [prop]: { checkbox: !!value } } } });
  return { ok: true };
}

async function goalAdd(id, rawAmount) {
  const page = await getAllowedPage(id, [FIN.goals]);
  const delta = Math.round(Number(rawAmount) * 100) / 100;
  if (!Number.isFinite(delta) || delta === 0 || Math.abs(delta) > 1e6) throw new HttpError(400, 'Amount must be a non-zero number.');
  const g = shapeGoal(page);
  const saved = Math.max(0, Math.round((g.saved + delta) * 100) / 100);
  const status = g.target > 0 && saved >= g.target ? 'Done' : 'Active';
  await notion(`/pages/${id}`, { method: 'PATCH', body: { properties: { Saved: { number: saved }, Status: { select: { name: status } } } } });
  return { ok: true, saved, status };
}

/* ---------- handler ---------- */
const settle = p => p.then(
  data => data,
  e => ({ error: e.message || 'Failed', hint: e.hint }),
);

const LOADERS = {
  tx: (today, q) => loadTx(today, Math.min(MAX_DAYS, Math.max(14, parseInt(q.get('days'), 10) || 62))),
  budgets: () => loadBudgets(),
  glossary: () => loadGlossary(),
  roadmap: () => loadRoadmap(),
  goals: () => loadGoals(),
};

module.exports = wrap(async (req, res) => {
  const today = todayStr();

  if (req.method === 'GET') {
    const q = new URL(req.url, 'http://local').searchParams;
    const asked = (q.get('parts') || 'tx,budgets,glossary,roadmap,goals').split(',').map(s => s.trim()).filter(p => LOADERS[p]);
    const out = { today, generatedAt: new Date().toISOString() };
    const jobs = asked.map(async p => { out[p] = await settle(LOADERS[p](today, q)); });
    if (asked.includes('tx')) {
      jobs.push(settle(schema()).then(s => {
        out.meta = { categories: s.categories || [], modes: s.modes || [], incomeCategories: INCOME_CATS, savingsCategory: SAVINGS_CAT, error: s.error };
      }));
    }
    await Promise.all(jobs);
    return res.status(200).json(out);
  }

  if (req.method === 'POST') {
    const b = readBody(req);
    switch (b.action) {
      case 'tx-add':       return res.status(200).json(await txAdd(b, today));
      case 'tx-undo':      return res.status(200).json(await txUndo(b.id));
      case 'term-learned': return res.status(200).json(await checkbox(b.id, FIN.glossary, 'Learned', b.value));
      case 'step-toggle':  return res.status(200).json(await checkbox(b.id, FIN.roadmap, 'Done', b.value));
      case 'goal-add':     return res.status(200).json(await goalAdd(b.id, b.amount));
      default: throw new HttpError(400, 'Unknown action.');
    }
  }

  res.setHeader('Allow', 'GET, POST');
  throw new HttpError(405, 'Method not allowed.');
});

module.exports.FIN = FIN;
