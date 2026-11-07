'use strict';
/* ============================================================
   /api/meal  : data + actions for the Meal Planner widgets

   The plan lives in two databases on the Meals page:
     Meals   one row per meal of the day   (Name, Order, Active, Purpose, Time)
     Foods   one row per food, related to its Meal
             (Name, Meal, Order, Active, Optional, Quantity, Note)

   Every logged day lives in the third database, Daily Log: one row per
   meal per day, with
     Planned  the required foods that were on the plan when the day started
              (built by the server, not typed by hand)
     Eaten    the foods you ticked off
   Keeping a snapshot means editing the plan tomorrow never rewrites the
   history the widgets read.

   GET  /api/meal?days=35
        -> { today, from, meals, rows, generatedAt }
           meals: the whole plan, inactive rows included (widgets filter)
           rows : Daily Log rows in the window

   POST /api/meal  (needs the x-widget-key header)
        { action: 'toggle-food', date?, mealId, name, value }
        { action: 'toggle-meal', date?, mealId, value }
        { action: 'start-day',   date? }
        { action: 'add-meal',    name, purpose?, time? }
        { action: 'update-meal', mealId, name?, purpose?, time?, active?, order? }
        { action: 'add-food',    mealId, name, quantity?, note?, optional? }
        { action: 'update-food', foodId, name?, quantity?, note?, optional?, active?, order?, mealId? }
        { action: 'move-meal',   mealId, dir: -1|1 }
        { action: 'move-food',   foodId, dir: -1|1 }

   Removal is always "Active off": the row and its history stay, and the
   widgets can put it back.
   ============================================================ */
const { DBS, HttpError, notion, queryAll, wrap, readBody, todayStr, addDays } = require('../notion');

const MEALS = DBS.meals;
const FOODS = DBS.mealFoods;
const LOG = DBS.mealLog;

const P = {
  title: 'Name', date: 'Date', planned: 'Planned', eaten: 'Eaten', meal: 'Meal',
  active: 'Active', order: 'Order', optional: 'Optional', quantity: 'Quantity',
  note: 'Note', purpose: 'Purpose', time: 'Time',
};
const MAX_DAYS = 60;
const MAX_FOODS = 40;
const MAX_NAME = 120;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/* ---------- reading Notion pages ---------- */
const propOf = (page, name) => (page && page.properties && page.properties[name]) || null;

function titleOf(page) {
  for (const p of Object.values((page && page.properties) || {})) {
    if (p && p.type === 'title') return (p.title || []).map(t => t.plain_text).join('').trim();
  }
  return '';
}
function textOf(page, name) {
  const p = propOf(page, name);
  if (!p) return '';
  if (p.type === 'rich_text') return (p.rich_text || []).map(t => t.plain_text).join('').trim();
  if (p.type === 'select') return (p.select && p.select.name) || '';
  if (p.type === 'number') return p.number == null ? '' : p.number;
  return '';
}
const numOf = (page, name) => { const v = textOf(page, name); return typeof v === 'number' ? v : parseFloat(v) || 0; };
const boolOf = (page, name) => !!((propOf(page, name) || {}).checkbox);
const relOf = (page, name) => (((propOf(page, name) || {}).relation) || []).map(r => r.id);
const multiOf = (page, name) => ((((propOf(page, name) || {}).multi_select)) || []).map(o => o.name);

const clean = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max || MAX_NAME);
const rich = s => (s ? [{ type: 'text', text: { content: s } }] : []);
const title = s => [{ type: 'text', text: { content: s } }];
const uniq = list => [...new Set(list.filter(Boolean))];

/* ---------- the plan ---------- */
async function loadPlan() {
  const [mealRows, foodRows] = await Promise.all([
    queryAll(MEALS, { sorts: [{ property: P.order, direction: 'ascending' }] }, 60),
    queryAll(FOODS, { sorts: [{ property: P.order, direction: 'ascending' }] }, 300),
  ]);
  const meals = mealRows.map(r => ({
    id: r.id,
    name: titleOf(r),
    order: numOf(r, P.order),
    active: boolOf(r, P.active),
    purpose: textOf(r, P.purpose),
    time: textOf(r, P.time),
    foods: [],
  }));
  const byId = new Map(meals.map(m => [m.id, m]));
  for (const r of foodRows) {
    const rel = relOf(r, P.meal);
    const meal = rel.length ? byId.get(rel[0]) : null;
    if (!meal) continue;                     // a food with no meal is not on the plan
    meal.foods.push({
      id: r.id,
      name: titleOf(r),
      order: numOf(r, P.order),
      active: boolOf(r, P.active),
      optional: boolOf(r, P.optional),
      quantity: String(textOf(r, P.quantity) || ''),
      note: textOf(r, P.note),
    });
  }
  meals.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  meals.forEach(m => m.foods.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)));
  return meals;
}
const liveFoods = meal => meal.foods.filter(f => f.active);
// Only required foods go into the Planned snapshot, so "optional" never counts against you.
const requiredNames = meal => uniq(liveFoods(meal).filter(f => !f.optional).map(f => f.name));

/* ---------- the daily log ---------- */
function shapeLog(r) {
  const d = (propOf(r, P.date) || {}).date;
  if (!d || !d.start) return null;
  const rel = relOf(r, P.meal);
  return {
    id: r.id,
    date: d.start.slice(0, 10),
    mealId: rel.length ? rel[0] : null,
    name: titleOf(r),
    planned: uniq(multiOf(r, P.planned)),
    eaten: uniq(multiOf(r, P.eaten)),
  };
}

async function findLog(date, mealId) {
  const rows = await queryAll(LOG, {
    filter: { and: [
      { property: P.date, date: { equals: date } },
      { property: P.meal, relation: { contains: mealId } },
    ] },
  }, 3);
  return rows[0] || null;
}

async function createLog(date, meal) {
  return notion('/pages', {
    method: 'POST',
    body: {
      parent: { database_id: LOG },
      properties: {
        [P.title]: { title: title(meal.name) },
        [P.date]: { date: { start: date } },
        [P.meal]: { relation: [{ id: meal.id }] },
        [P.planned]: { multi_select: requiredNames(meal).map(name => ({ name })) },
        [P.eaten]: { multi_select: [] },
      },
    },
  });
}

/* Today's row for that meal, created on demand. */
async function ensureLog(date, meal) {
  const found = await findLog(date, meal.id);
  if (found) return found;
  return createLog(date, meal);
}

async function writeEaten(pageId, names) {
  await notion(`/pages/${pageId}`, {
    method: 'PATCH',
    body: { properties: { [P.eaten]: { multi_select: uniq(names).map(name => ({ name })) } } },
  });
}

/* ---------- guards ---------- */
async function assertAllowed(pageId, allowed) {
  if (!/^[0-9a-f-]{32,36}$/i.test(String(pageId || ''))) throw new HttpError(400, 'Bad page id.');
  const page = await notion(`/pages/${pageId}`);
  if (page.archived || page.in_trash) throw new HttpError(404, 'That row was deleted.');
  const parent = String((page.parent && (page.parent.database_id || page.parent.data_source_id)) || '')
    .replace(/-/g, '').toLowerCase();
  if (!allowed.includes(parent)) throw new HttpError(403, 'That row is not part of the Meal Planner.');
  return page;
}

function readDate(v, today) {
  const s = String(v || '');
  const date = /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : today;
  if (date > today) throw new HttpError(400, 'You cannot log a day in the future.');
  return date;
}

/* ---------- reading ---------- */
async function read(today, query) {
  const days = Math.min(MAX_DAYS, Math.max(7, parseInt(query.get('days'), 10) || 35));
  const from = addDays(today, -(days - 1));
  const [meals, logs] = await Promise.all([
    loadPlan(),
    queryAll(LOG, {
      filter: { and: [
        { property: P.date, date: { on_or_after: from } },
        { property: P.date, date: { on_or_before: today } },
      ] },
      sorts: [{ property: P.date, direction: 'ascending' }],
    }, 400),
  ]);
  const rows = logs.map(shapeLog).filter(Boolean);
  return { today, from, days, meals, rows, generatedAt: new Date().toISOString() };
}

/* ---------- writing: the day ---------- */
async function toggleFood(b, today) {
  const date = readDate(b.date, today);
  const name = clean(b.name);
  if (!name) throw new HttpError(400, 'Pick a food first.');
  const meals = await loadPlan();
  const meal = meals.find(m => m.id === b.mealId);
  if (!meal) throw new HttpError(404, 'That meal is not in the plan any more. Reload the widget.');
  const page = await ensureLog(date, meal);
  const eaten = new Set(multiOf(page, P.eaten));
  if (b.value) eaten.add(name); else eaten.delete(name);
  await writeEaten(page.id, [...eaten]);
  return { ok: true, pageId: page.id, date, mealId: meal.id, eaten: [...eaten] };
}

async function toggleMeal(b, today) {
  const date = readDate(b.date, today);
  const meals = await loadPlan();
  const meal = meals.find(m => m.id === b.mealId);
  if (!meal) throw new HttpError(404, 'That meal is not in the plan any more. Reload the widget.');
  const page = await ensureLog(date, meal);
  const eaten = new Set(multiOf(page, P.eaten));
  for (const name of requiredNames(meal)) { if (b.value) eaten.add(name); else eaten.delete(name); }
  await writeEaten(page.id, [...eaten]);
  return { ok: true, pageId: page.id, date, mealId: meal.id, eaten: [...eaten] };
}

/* Creates the day's Daily Log rows (one per active meal) so the history is kept even if you tick nothing. */
async function startDay(b, today) {
  const date = readDate(b.date, today);
  const meals = (await loadPlan()).filter(m => m.active);
  let created = 0;
  for (const meal of meals) {
    if (await findLog(date, meal.id)) continue;
    await createLog(date, meal);
    created++;
  }
  return { ok: true, date, created, meals: meals.length };
}

/* ---------- writing: the plan ---------- */
async function addMeal(b) {
  const name = clean(b.name);
  if (!name) throw new HttpError(400, 'Give the meal a name.');
  const meals = await loadPlan();
  if (meals.some(m => m.name.toLowerCase() === name.toLowerCase())) {
    throw new HttpError(400, `You already have a meal called "${name}".`);
  }
  if (meals.length >= 12) throw new HttpError(400, 'Twelve meals is plenty for one day.');
  const order = meals.reduce((n, m) => Math.max(n, m.order), 0) + 1;
  const page = await notion('/pages', {
    method: 'POST',
    body: {
      parent: { database_id: MEALS },
      properties: {
        [P.title]: { title: title(name) },
        [P.order]: { number: order },
        [P.active]: { checkbox: true },
        ...(b.purpose ? { [P.purpose]: { rich_text: rich(clean(b.purpose, 300)) } } : {}),
        ...(b.time ? { [P.time]: { rich_text: rich(clean(b.time, 40)) } } : {}),
      },
    },
  });
  return { ok: true, id: page.id, name, order };
}

async function updateMeal(b) {
  await assertAllowed(b.mealId, [MEALS]);
  const props = {};
  if (b.name != null) {
    const name = clean(b.name);
    if (!name) throw new HttpError(400, 'A meal needs a name.');
    props[P.title] = { title: title(name) };
  }
  if (b.purpose != null) props[P.purpose] = { rich_text: rich(clean(b.purpose, 300)) };
  if (b.time != null) props[P.time] = { rich_text: rich(clean(b.time, 40)) };
  if (b.active != null) props[P.active] = { checkbox: !!b.active };
  if (b.order != null) props[P.order] = { number: Number(b.order) || 0 };
  if (!Object.keys(props).length) throw new HttpError(400, 'Nothing to change.');
  await notion(`/pages/${b.mealId}`, { method: 'PATCH', body: { properties: props } });
  return { ok: true, id: b.mealId };
}

async function addFood(b) {
  const name = clean(b.name);
  if (!name) throw new HttpError(400, 'Give the food a name.');
  const meals = await loadPlan();
  const meal = meals.find(m => m.id === b.mealId);
  if (!meal) throw new HttpError(404, 'That meal is not in the plan any more. Reload the widget.');
  if (meal.foods.some(f => f.name.toLowerCase() === name.toLowerCase())) {
    throw new HttpError(400, `"${name}" is already in ${meal.name}.`);
  }
  if (meal.foods.length >= MAX_FOODS) throw new HttpError(400, `${meal.name} already has ${MAX_FOODS} foods.`);
  const order = meal.foods.reduce((n, f) => Math.max(n, f.order), 0) + 1;
  const page = await notion('/pages', {
    method: 'POST',
    body: {
      parent: { database_id: FOODS },
      properties: {
        [P.title]: { title: title(name) },
        [P.meal]: { relation: [{ id: meal.id }] },
        [P.order]: { number: order },
        [P.active]: { checkbox: true },
        [P.optional]: { checkbox: !!b.optional },
        ...(b.quantity ? { [P.quantity]: { rich_text: rich(clean(b.quantity, 40)) } } : {}),
        ...(b.note ? { [P.note]: { rich_text: rich(clean(b.note, 300)) } } : {}),
      },
    },
  });
  return { ok: true, id: page.id, name, order };
}

async function updateFood(b) {
  await assertAllowed(b.foodId, [FOODS]);
  const props = {};
  if (b.name != null) {
    const name = clean(b.name);
    if (!name) throw new HttpError(400, 'A food needs a name.');
    props[P.title] = { title: title(name) };
  }
  if (b.optional != null) props[P.optional] = { checkbox: !!b.optional };
  if (b.active != null) props[P.active] = { checkbox: !!b.active };
  if (b.quantity != null) props[P.quantity] = { rich_text: rich(clean(b.quantity, 40)) };
  if (b.note != null) props[P.note] = { rich_text: rich(clean(b.note, 300)) };
  if (b.order != null) props[P.order] = { number: Number(b.order) || 0 };
  if (b.mealId != null) {
    const meals = await loadPlan();
    if (!meals.some(m => m.id === b.mealId)) throw new HttpError(404, 'That meal is not in the plan any more.');
    props[P.meal] = { relation: [{ id: b.mealId }] };
  }
  if (!Object.keys(props).length) throw new HttpError(400, 'Nothing to change.');
  await notion(`/pages/${b.foodId}`, { method: 'PATCH', body: { properties: props } });
  return { ok: true, id: b.foodId };
}

const step = dir => (dir === 'up' || dir === -1 ? -1 : 1);

/* Swap two rows' Order values, so the widget arrows reorder the real plan. */
async function swapOrder(a, b) {
  await notion(`/pages/${a.id}`, { method: 'PATCH', body: { properties: { [P.order]: { number: b.order } } } });
  await notion(`/pages/${b.id}`, { method: 'PATCH', body: { properties: { [P.order]: { number: a.order } } } });
}

async function moveMeal(b) {
  const meals = await loadPlan();
  const i = meals.findIndex(m => m.id === b.mealId);
  if (i < 0) throw new HttpError(404, 'That meal is not in the plan any more.');
  const j = i + step(b.dir);
  if (j < 0 || j >= meals.length) return { ok: true, unchanged: true };
  await swapOrder(meals[i], meals[j]);
  return { ok: true };
}

async function moveFood(b) {
  const meals = await loadPlan();
  const meal = meals.find(m => m.foods.some(f => f.id === b.foodId));
  if (!meal) throw new HttpError(404, 'That food is not in the plan any more.');
  const list = meal.foods;
  const i = list.findIndex(f => f.id === b.foodId);
  const j = i + step(b.dir);
  if (j < 0 || j >= list.length) return { ok: true, unchanged: true };
  await swapOrder(list[i], list[j]);
  return { ok: true };
}

/* ---------- routes ---------- */
module.exports = wrap(async (req, res) => {
  const today = todayStr();

  if (req.method === 'GET') {
    return res.status(200).json(await read(today, new URL(req.url, 'http://local').searchParams));
  }

  if (req.method === 'POST') {
    const b = readBody(req);
    switch (b.action) {
      case 'toggle-food': return res.status(200).json(await toggleFood(b, today));
      case 'toggle-meal': return res.status(200).json(await toggleMeal(b, today));
      case 'start-day':   return res.status(200).json(await startDay(b, today));
      case 'add-meal':    return res.status(200).json(await addMeal(b));
      case 'update-meal': return res.status(200).json(await updateMeal(b));
      case 'add-food':    return res.status(200).json(await addFood(b));
      case 'update-food': return res.status(200).json(await updateFood(b));
      case 'move-meal':   return res.status(200).json(await moveMeal(b));
      case 'move-food':   return res.status(200).json(await moveFood(b));
      default: throw new HttpError(400, `Unknown action: ${b.action || '(none)'}.`);
    }
  }

  res.setHeader('Allow', 'GET, POST');
  throw new HttpError(405, 'Method not allowed.');
});
