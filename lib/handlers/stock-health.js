'use strict';
/* ============================================================
   /api/stock-health?key=YOUR_WIDGET_KEY
   Open this in your browser after deploying the Stock & Resources widgets.
   It says in plain words whether the Stock database is shared with the
   integration and whether the property names and types match.
   ============================================================ */
const { notion, wrap, todayStr, TZ, VERSION } = require('../notion');
const { DB, SPEC } = require('./stock');

async function inspect(id, spec) {
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
  const cats = props.Category && props.Category.select ? props.Category.select.options.map(o => o.name) : [];
  if (!cats.length) out.problems.push('The Category property has no options yet. Add at least one in Notion.');
  out.categories = cats;
  out.ok = out.problems.length === 0;
  return out;
}

module.exports = wrap(async (req, res) => {
  const stock = await inspect(DB.stock, SPEC);
  res.status(200).json({
    ok: stock.ok,
    summary: stock.ok
      ? 'Everything looks good. The Stock & Resources widgets can read and write this database.'
      : 'Something needs fixing. See the problems listed under the database.',
    env: { NOTION_TOKEN: true, WIDGET_KEY: true, NOTION_VERSION: VERSION, timezone: TZ, today: todayStr() },
    databases: { stock },
  });
});
