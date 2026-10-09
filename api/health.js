'use strict';
/* ============================================================
   /api/health?key=YOUR_WIDGET_KEY
   Open this in your browser after deploying. It tells you in plain
   words whether the token works, whether each database is shared with
   the integration, and whether the property names match.
   ============================================================ */
const { DBS, TZ, VERSION, notion, wrap, todayStr } = require('../lib/notion');

const EXPECT_TODO = {
  Name: 'title', Status: 'status', 'Due Date': 'date', Priority: 'select',
  'Recur Interval': 'number', 'Recur Unit': 'select',
};

async function inspect(id, kind) {
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

  if (kind === 'todo') {
    for (const [name, type] of Object.entries(EXPECT_TODO)) {
      if (!props[name]) out.problems.push(`Missing property "${name}".`);
      else if (props[name].type !== type) out.problems.push(`Property "${name}" should be type ${type} but is ${props[name].type}.`);
    }
    const opts = props.Status && props.Status.status ? props.Status.status.options.map(o => o.name) : [];
    for (const need of ['Done', 'To-Do']) {
      if (props.Status && !opts.includes(need)) out.problems.push(`Status has no option named "${need}".`);
    }
  } else {
    if (!props.Name || props.Name.type !== 'title') out.problems.push('Missing title property "Name".');
    if (!props.Date || props.Date.type !== 'date') out.problems.push('Missing date property "Date".');
    out.checkboxes = Object.keys(props).filter(k => props[k].type === 'checkbox').map(k => k.trim());
    if (!out.checkboxes.length) out.problems.push('No checkbox properties found.');
  }
  out.ok = out.problems.length === 0;
  return out;
}

module.exports = wrap(async (req, res) => {
  const [mustdo, general, self] = await Promise.all([
    inspect(DBS.mustdo, 'must'),
    inspect(DBS.todoGeneral, 'todo'),
    inspect(DBS.todoSelf, 'todo'),
  ]);
  const databases = { mustdo, todoGeneral: general, todoSelf: self };
  const ok = Object.values(databases).every(d => d.ok);
  res.status(200).json({
    ok,
    summary: ok
      ? 'Everything looks good. Your widgets can read and write these databases.'
      : 'Something needs fixing. See the problems listed under each database.',
    env: { NOTION_TOKEN: true, WIDGET_KEY: true, NOTION_VERSION: VERSION, timezone: TZ, today: todayStr() },
    databases,
  });
});
