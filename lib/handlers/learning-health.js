'use strict';
/* ============================================================
   /api/learning-health?key=YOUR_WIDGET_KEY
   Open this in your browser after deploying the Learning Planner widgets.
   It says in plain words whether each database is shared with the
   integration and whether the property names and types match.
   ============================================================ */
const { notion, wrap, todayStr, TZ, VERSION } = require('../notion');
const { DB, SPECS } = require('./learning');

const NEEDS_OPTION = {
  topics: [],
  tasks: [['Status', 'Done'], ['Status', 'To-Do']],
  log: [],
};

async function inspect(id, spec, needs) {
  const out = { ok: false, problems: [] };
  let db;
  try {
    db = await notion(`/databases/${id}`);
  } catch (e) {
    out.problems.push(e.message + (e.hint ? ` ${e.hint}` : ''));
    return out;
  }
  out.title = (db.title || []).map(t => t.plain_text).join('') || '(untitled)';
  const props = db.properties || {};
  for (const [name, type] of Object.entries(spec)) {
    if (!props[name]) out.problems.push(`Missing property "${name}".`);
    else if (props[name].type !== type) out.problems.push(`Property "${name}" should be type ${type} but is ${props[name].type}.`);
  }
  for (const [name, option] of needs) {
    const p = props[name];
    const group = p && (p.status || p.select || p.multi_select);
    const list = group ? group.options.map(o => o.name) : [];
    if (p && !list.includes(option)) out.problems.push(`"${name}" has no option named "${option}".`);
  }
  out.ok = out.problems.length === 0;
  return out;
}

module.exports = wrap(async (req, res) => {
  const [topics, tasks, log] = await Promise.all([
    inspect(DB.topics, SPECS.topics, NEEDS_OPTION.topics),
    inspect(DB.tasks, SPECS.tasks, NEEDS_OPTION.tasks),
    inspect(DB.log, SPECS.log, NEEDS_OPTION.log),
  ]);
  const databases = { learnings: topics, todoList: tasks, studyLog: log };
  const ok = Object.values(databases).every(d => d.ok);
  res.status(200).json({
    ok,
    summary: ok
      ? 'Everything looks good. The Learning Planner widgets can read and write these databases.'
      : 'Something needs fixing. See the problems listed under each database.',
    env: { NOTION_TOKEN: true, WIDGET_KEY: true, NOTION_VERSION: VERSION, timezone: TZ, today: todayStr() },
    databases,
  });
});
