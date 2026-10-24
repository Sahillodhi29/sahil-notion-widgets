'use strict';
/* ============================================================
   /api/finance-health?key=YOUR_WIDGET_KEY
   Open in your browser after deploying. Tells you in plain words
   whether each finance database is shared with the integration and
   whether the property names and types match what the widgets expect.
   ============================================================ */
const { VERSION, TZ, notion, wrap, todayStr } = require('../lib/notion');
const { FIN } = require('./finance');

const EXPECT = {
  tx:       { Name: 'title', Date: 'date', Amount: 'number', Type: 'select', Category: 'select', Mode: 'select', Note: 'rich_text' },
  budgets:  { Category: 'title', 'Monthly Limit': 'number', Bucket: 'select' },
  glossary: { Term: 'title', Topic: 'select', Level: 'select', 'Plain Meaning': 'rich_text', 'Real Example': 'rich_text', Learned: 'checkbox' },
  roadmap:  { Step: 'title', Order: 'number', 'Why It Matters': 'rich_text', Done: 'checkbox' },
  goals:    { Goal: 'title', Target: 'number', Saved: 'number', 'Target Date': 'date', Status: 'select' },
};
const NEED_OPTIONS = {
  tx:    { Type: ['Expense', 'Income'] },
  goals: { Status: ['Active', 'Done'] },
};

async function inspect(key) {
  const out = { ok: false, problems: [] };
  let db;
  try {
    db = await notion(`/databases/${FIN[key]}`);
  } catch (e) {
    out.problems.push(e.message + (e.hint ? ` ${e.hint}` : ''));
    return out;
  }
  out.title = (db.title || []).map(t => t.plain_text).join('') || '(untitled)';
  const props = db.properties || {};
  for (const [name, type] of Object.entries(EXPECT[key])) {
    if (!props[name]) out.problems.push(`Missing property "${name}".`);
    else if (props[name].type !== type) out.problems.push(`Property "${name}" should be type ${type} but is ${props[name].type}.`);
  }
  for (const [name, needed] of Object.entries(NEED_OPTIONS[key] || {})) {
    const have = props[name] && props[name].select ? props[name].select.options.map(o => o.name) : [];
    for (const n of needed) if (props[name] && !have.includes(n)) out.problems.push(`"${name}" has no option named "${n}".`);
  }
  out.ok = out.problems.length === 0;
  return out;
}

module.exports = wrap(async (req, res) => {
  const keys = Object.keys(EXPECT);
  const results = await Promise.all(keys.map(inspect));
  const databases = {};
  keys.forEach((k, i) => { databases[k] = results[i]; });
  const ok = results.every(r => r.ok);
  res.status(200).json({
    ok,
    summary: ok
      ? 'Everything looks good. Your finance widgets can read and write these databases.'
      : 'Something needs fixing. See the problems listed under each database.',
    env: { NOTION_TOKEN: true, WIDGET_KEY: true, NOTION_VERSION: VERSION, timezone: TZ, today: todayStr() },
    databases,
  });
});
