'use strict';
/* ============================================================
   /api/wardrobe-health?key=YOUR_WIDGET_KEY
   Open this in your browser after deploying the Wardrobe widgets.
   It says in plain words whether each Wardrobe database is shared with
   the integration and whether the property names and types match.
   (The older /api/health page is untouched and only covers the other pages.)
   ============================================================ */
const { notion, wrap, todayStr, TZ, VERSION } = require('../notion');
const { DB, SPECS } = require('./wardrobe');

const NEEDS_OPTION = {
  items:   [['Item Status', 'Active'], ['Item Category', 'Tops']],
  outfits: [],
  wishes:  [['Wishlist Status', 'Purchased']],
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
    const list = p && (p.select || p.multi_select) ? (p.select || p.multi_select).options.map(o => o.name) : [];
    if (p && !list.includes(option)) out.problems.push(`"${name}" has no option named "${option}".`);
  }
  out.ok = out.problems.length === 0;
  return out;
}

module.exports = wrap(async (req, res) => {
  const [items, outfits, wishes] = await Promise.all([
    inspect(DB.items, SPECS.items, NEEDS_OPTION.items),
    inspect(DB.outfits, SPECS.outfits, NEEDS_OPTION.outfits),
    inspect(DB.wishes, SPECS.wishes, NEEDS_OPTION.wishes),
  ]);
  const databases = { wardrobeContents: items, outfits, wishlist: wishes };
  const ok = Object.values(databases).every(d => d.ok);
  res.status(200).json({
    ok,
    summary: ok
      ? 'Everything looks good. The Wardrobe widgets can read and write these databases.'
      : 'Something needs fixing. See the problems listed under each database.',
    env: { NOTION_TOKEN: true, WIDGET_KEY: true, NOTION_VERSION: VERSION, timezone: TZ, today: todayStr() },
    databases,
  });
});
