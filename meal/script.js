'use strict';
/* Meal widgets: one page, many pieces.
   /meal/index.html?key=KEY&w=plate      -> just that widget
   w = ring | plate | streak | week | heat | habits | skipped | plan   (comma-separate to combine, or all)

   The plan has 5 meals of the day, each with its own foods. A day is ticked food by food;
   a meal is "full" when every required food is eaten, a day "counts" at 80% of its required foods.
   Optional foods (rice, if available) can be ticked too, but they never count against you.
   The Plan widget writes straight back to the Meals and Foods databases. */
(() => {
  const API = '/api/meal';
  const params = new URLSearchParams(location.search);
  const KEY = params.get('key') || '';
  const GOAL = 0.8;                 // a day "counts" when this share of its required foods is done
  const SKIP_WINDOW = 28;           // days used by the skipped widget
  const HABIT_WINDOW = 28;          // days used by the meal-by-meal widget
  const NEEDS = { ring: 7, plate: 1, streak: 35, week: 7, heat: 35, habits: 28, skipped: 28, plan: 1 };
  const WIDGETS = Object.keys(NEEDS);
  const keyQ = sep => (KEY ? `${sep}key=${encodeURIComponent(KEY)}` : '');
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const errMsg = e => `${e.message}${e.hint ? ' ' + e.hint : ''}`;

  /* ---------- background: Notion dark by default; &bg=transparent or &bg=HEX to change ---------- */
  const bgParam = params.get('bg');
  if (bgParam) {
    const v = bgParam === 'transparent' ? 'transparent' : /^[0-9a-f]{3,8}$/i.test(bgParam) ? '#' + bgParam : null;
    if (v) { document.documentElement.style.background = v; document.body.style.background = v; }
  }

  /* ---------- which widgets? ---------- */
  const asked = (params.get('w') || 'all').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
  const wantAll = asked.includes('all');
  const shown = wantAll ? WIDGETS : asked.filter(w => NEEDS[w]);
  const unknown = asked.filter(w => w !== 'all' && !NEEDS[w]);
  document.querySelectorAll('.card[data-w]').forEach(c => { c.hidden = !shown.includes(c.dataset.w); });
  document.body.dataset.mode = shown.length === 1 ? 'single' : 'multi';
  if (unknown.length || !shown.length) {
    const b = $('bad'); b.hidden = false;
    b.innerHTML = `<h2>Unknown widget</h2><p class="muted">Use w=${WIDGETS.join(', ')} or all.</p>`;
  }
  const has = w => shown.includes(w);
  const DAYS = Math.max(7, ...shown.map(w => NEEDS[w]));

  const state = { today: null, meals: [], rows: [], pending: 0, first: true, loadedAt: 0, starting: false };

  /* ---------- dates ---------- */
  const addDays = (d, n) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
  const monday = d => addDays(d, -((new Date(d + 'T00:00:00Z').getUTCDay() + 6) % 7));
  const fmtDate = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  const wkShort = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });

  const CHECK = '<svg viewBox="0 0 12 12" fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 6.3l2.4 2.4 4.6-5"/></svg>';

  /* ---------- the plan, as the widgets see it ---------- */
  const activeMeals = () => state.meals
    .filter(m => m.active)
    .map(m => ({ ...m, foods: m.foods.filter(f => f.active) }));

  const logOn = (date, mealId) => state.rows.find(r => r.date === date && r.mealId === mealId) || null;
  const eatenOn = (date, mealId) => new Set((logOn(date, mealId) || {}).eaten || []);
  const hasLog = date => state.rows.some(r => r.date === date);

  /* The meals of one day. Today follows the live plan; past days use the Planned snapshot.
     fill=true adds meals that were never started as empty, so a half-logged day cannot read as a perfect one. */
  function planFor(date, fill) {
    const live = activeMeals();
    if (date === state.today) {
      return live.map(m => ({
        id: m.id, name: m.name, order: m.order, time: (m.time || '').replace(/\s+/g, ' '), purpose: m.purpose,
        foods: m.foods.map(f => ({ id: f.id, name: f.name, optional: f.optional, quantity: f.quantity })),
        started: !!logOn(date, m.id), missing: false,
      }));
    }
    const rows = state.rows.filter(r => r.date === date);
    const out = rows.map(r => {
      const meal = state.meals.find(m => m.id === r.mealId);
      return {
        id: r.mealId, name: r.name || (meal && meal.name) || 'Meal',
        order: meal ? meal.order : 99, time: (meal && meal.time) || '', purpose: (meal && meal.purpose) || '',
        foods: (r.planned || []).map(n => ({ name: n, optional: false })),
        started: true, missing: false,
      };
    });
    if (fill) for (const m of live) {
      if (rows.some(r => r.mealId === m.id)) continue;
      out.push({
        id: m.id, name: m.name, order: m.order, time: '', purpose: '',
        foods: m.foods.filter(f => !f.optional).map(f => ({ name: f.name, optional: false })),
        started: false, missing: true,
      });
    }
    out.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
    return out;
  }

  /* One day, in numbers. Required foods only: optional foods never count against you. */
  function dayStats(date) {
    const plan = planFor(date, true);
    let total = 0, done = 0, meals = 0, full = 0;
    for (const m of plan) {
      const req = m.foods.filter(f => !f.optional);
      if (!req.length) continue;
      const eaten = eatenOn(date, m.id);
      const d = req.filter(f => eaten.has(f.name)).length;
      total += req.length; done += d; meals++;
      if (d === req.length) full++;
    }
    return { total, done, meals, full, logged: hasLog(date), pct: total ? done / total : 0 };
  }

  /* ---------- maths for streaks and levels ---------- */
  const level = p => (p >= GOAL ? 3 : p >= 0.5 ? 2 : 1);
  function streak() {
    const hit = d => { const s = dayStats(d); return s.logged && s.pct >= GOAL; };
    let d = state.today; if (!hit(d)) d = addDays(d, -1);        // today still in progress doesn't break the run
    let current = 0; while (hit(d)) { current++; d = addDays(d, -1); }
    let best = 0, run = 0;
    for (let i = 34; i >= 0; i--) { if (hit(addDays(state.today, -i))) { run++; best = Math.max(best, run); } else run = 0; }
    return { current, best };
  }

  /* ---------- ring: one step per required food, grouped by meal ---------- */
  const pt = (r, a) => [(100 + r * Math.cos(a)).toFixed(2), (100 + r * Math.sin(a)).toFixed(2)];
  function arc(a0, a1, r0, r1) {
    const [x0, y0] = pt(r1, a0), [x1, y1] = pt(r1, a1), [x2, y2] = pt(r0, a1), [x3, y3] = pt(r0, a0);
    const big = a1 - a0 > Math.PI ? 1 : 0;
    return `M${x0} ${y0}A${r1} ${r1} 0 ${big} 1 ${x1} ${y1}L${x2} ${y2}A${r0} ${r0} 0 ${big} 0 ${x3} ${y3}Z`;
  }
  const annulus = (r0, r1) => `M100 ${100 - r1}A${r1} ${r1} 0 1 1 100 ${100 + r1}A${r1} ${r1} 0 1 1 100 ${100 - r1}ZM100 ${100 - r0}A${r0} ${r0} 0 1 0 100 ${100 + r0}A${r0} ${r0} 0 1 0 100 ${100 - r0}Z`;

  function ringItems() {
    const out = [];
    for (const m of planFor(state.today)) {
      const eaten = eatenOn(state.today, m.id);
      for (const f of m.foods) if (!f.optional) out.push({ label: f.name, meal: m.name, group: m.id, done: eaten.has(f.name) });
    }
    return out;
  }
  function renderRing() {
    const items = ringItems(), n = items.length, first = state.first, gap = n > 18 ? 0.035 : 0.06;
    let svg = '<circle class="rail" cx="100" cy="100" r="97"/><circle class="rail" cx="100" cy="100" r="50"/>';
    if (n === 1) {
      svg += `<path class="step${items[0].done ? ' done' : ''}" fill-rule="evenodd" d="${annulus(56, 92)}"><title>${esc(items[0].label)}</title></path>`;
    } else if (n > 1) {
      const span = (2 * Math.PI) / n;
      let cursor = -Math.PI / 2;
      const parts = items.map((it, i) => {
        const g0 = i === 0 ? gap / 2 : items[i - 1].group !== it.group ? gap : gap / 2;
        const g1 = i === n - 1 ? gap / 2 : items[i + 1].group !== it.group ? gap : gap / 2;
        const a0 = cursor + g0, a1 = cursor + span - g1;
        cursor += span;
        return `<path class="step${it.done ? ' done' : ''}" d="${arc(a0, a1, 56, 92)}"${first ? ` style="transition-delay:${i * 40}ms"` : ''}><title>${esc(it.meal + ' · ' + it.label)}</title></path>`;
      });
      svg += parts.join('');
    }
    $('ring').innerHTML = svg;
    if (first) setTimeout(() => $('ring').querySelectorAll('.step').forEach(s => { s.style.transitionDelay = ''; }), 1500);

    const s = dayStats(state.today), plan = planFor(state.today);
    $('ringDone').textContent = plan.length ? s.done : '–';
    $('ringOf').textContent = plan.length ? `of ${s.total}` : 'no meal plan';
    $('dateLine').textContent = fmtDate(state.today);
    let line;
    if (!plan.length) line = 'No meals in the plan yet. Add them in the Plan widget.';
    else if (!s.total) line = 'Your meals have no required foods yet. Add foods in the Plan widget.';
    else if (!s.logged) line = `${plan.length} meals lined up. Tick a food to start the day.`;
    else if (s.full === s.meals) line = 'Every meal done. Perfect day.';
    else line = `${s.full} of ${s.meals} meals done, ${s.total - s.done} foods left.`;
    $('statusLine').textContent = line;
  }

  /* ---------- the other widgets ---------- */
  function renderStreak() {
    const st = streak();
    $('stNum').textContent = st.current;
    $('stUnit').textContent = st.current === 1 ? 'day' : 'days';
    $('stLine').textContent = st.current ? 'in a row at 80% or more of your meals' : 'No run going right now. Hit 80% today to start one.';
    $('stBest').textContent = `Best run in the last five weeks: ${st.best} ${st.best === 1 ? 'day' : 'days'}.`;
    $('stDots').innerHTML = Array.from({ length: 7 }, (_, i) => {
      const d = addDays(state.today, i - 6), s = dayStats(d);
      const cls = d > state.today ? 'future' : s.logged ? 'c' + level(s.pct) : '';
      return `<div class="dot ${cls}${d === state.today ? ' today' : ''}" title="${esc(fmtDate(d))}"><i></i><span>${wkShort(d).slice(0, 1)}</span></div>`;
    }).join('');
  }

  /* ---------- today's meals: the tick list ---------- */
  function chipHtml(meal, f, eaten) {
    const on = eaten.has(f.name);
    return `<button class="chip${f.optional ? ' opt' : ''}" type="button" data-m="${esc(meal.id)}" data-f="${esc(f.name)}" aria-pressed="${on}">` +
      `<span class="box">${CHECK}</span><span class="cf">${esc(f.name)}${f.quantity ? ` <span class="qty">${esc(f.quantity)}</span>` : ''}</span>` +
      `${f.optional ? '<span class="tag">opt</span>' : ''}</button>`;
  }
  function renderPlate() {
    const plan = planFor(state.today), el = $('meals');
    const s = dayStats(state.today);
    $('plateCount').textContent = plan.length ? `${s.done} of ${s.total}` : '';
    if (!plan.length) {
      el.innerHTML = '<p class="empty">No meals in the plan yet. Add your first meal in the Plan widget.</p>';
      return;
    }
    const start = !hasLog(state.today)
      ? `<div class="start"><p class="start-text">Nothing started today.</p>
         <button class="btn" id="startBtn" type="button"${state.starting ? ' disabled' : ''}>${state.starting ? 'Setting the table…' : "Start today's meals"}</button>
         <p class="muted">Starts a Daily Log row for every meal. Ticking a food starts that meal on its own, too.</p></div>`
      : '';
    el.innerHTML = start + plan.map((m, i) => {
      const eaten = eatenOn(state.today, m.id);
      const req = m.foods.filter(f => !f.optional);
      const done = req.filter(f => eaten.has(f.name)).length;
      const full = req.length > 0 && done === req.length;
      const meta = [m.time, m.purpose].filter(Boolean).join(' · ');
      return `<section class="meal${full ? ' done' : ''}" data-m="${esc(m.id)}">
        <div class="meal-head">
          <span class="mnum">${i + 1}</span>
          <div class="mt">
            <h3>${esc(m.name)}</h3>
            ${meta ? `<span class="mmeta">${esc(meta)}</span>` : ''}
          </div>
          <span class="mcount">${done} of ${req.length}</span>
          <button class="mall" type="button" data-m="${esc(m.id)}" data-act="meal-all" aria-pressed="${full}">All</button>
        </div>
        <div class="mbar" aria-hidden="true"><i style="width:${req.length ? Math.round((done / req.length) * 100) : 0}%"></i></div>
        <div class="chips">${m.foods.length ? m.foods.map(f => chipHtml(m, f, eaten)).join('') : '<p class="empty">No foods in this meal yet.</p>'}</div>
      </section>`;
    }).join('');
  }

  function renderWeek() {
    const start = monday(state.today);
    $('week').innerHTML = Array.from({ length: 7 }, (_, i) => {
      const d = addDays(start, i), s = dayStats(d), future = d > state.today, p = s.logged ? s.pct : 0;
      const cls = future ? 'bar future' : s.logged && p >= GOAL ? 'bar hit' : 'bar';
      return `<div class="day${d === state.today ? ' today' : ''}"><div class="${cls}" title="${esc(wkShort(d))}: ${s.logged ? Math.round(p * 100) + '%' : 'no log'}"><i style="height:${future || !s.logged ? 0 : Math.round(p * 100)}%"></i></div><span class="dlabel">${wkShort(d)}</span></div>`;
    }).join('');
  }

  function renderHeat() {
    const start = addDays(monday(state.today), -28);
    let html = ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(l => `<span class="hd">${l}</span>`).join('');
    for (let i = 0; i < 35; i++) {
      const d = addDays(start, i), s = dayStats(d), future = d > state.today;
      const cls = future ? 'future' : s.logged ? 'c' + level(s.pct) : '';
      html += `<div class="cell ${cls}${d === state.today ? ' today' : ''}" title="${esc(fmtDate(d))}${s.logged ? ': ' + Math.round(s.pct * 100) + '%' : ''}"></div>`;
    }
    $('heat').innerHTML = html;
  }

  /* ---------- meal by meal: where you do well, where you slip ---------- */
  function renderHabits() {
    const from = addDays(state.today, -(HABIT_WINDOW - 1));
    const dates = [...new Set(state.rows.filter(r => r.date >= from && r.date <= state.today).map(r => r.date))].sort();
    const meals = activeMeals();
    const stats = meals.map((m, i) => {
      let logged = 0, full = 0;
      for (const d of dates) {
        const row = logOn(d, m.id);
        if (!row) continue;
        logged++;
        const planned = row.planned || [], eaten = new Set(row.eaten || []);
        if (planned.length && planned.every(n => eaten.has(n))) full++;
      }
      return { name: m.name, order: i, logged, full, rate: logged ? full / logged : 0 };
    });
    const any = stats.some(x => x.logged);
    $('habitsNote').textContent = !meals.length ? ''
      : !any ? `No meals logged in the last four weeks yet.`
      : 'Last four weeks. A day counts for a meal when every food in it was eaten.';
    if (!stats.length) { $('habits').innerHTML = '<p class="empty">No meals in the plan yet.</p>'; return; }
    const ranked = [...stats].sort((a, b) => b.rate - a.rate || a.order - b.order);
    $('habits').innerHTML = ranked.map(x =>
      `<div class="hb${!x.logged ? ' quiet' : ''}"><span class="hbn">${esc(x.name)}</span>` +
      `<div class="track"><i style="width:${Math.round(x.rate * 100)}%"></i></div>` +
      `<span class="n">${x.logged ? `${x.full} of ${x.logged} days` : 'not logged'}</span></div>`).join('');
  }

  /* ---------- what gets skipped ---------- */
  function renderSkipped() {
    const from = addDays(state.today, -(SKIP_WINDOW - 1));
    const rows = state.rows.filter(r => r.date >= from && r.date <= state.today);
    const stats = new Map();
    for (const r of rows) for (const name of r.planned || []) {
      const s = stats.get(name) || { done: 0, days: 0, meal: r.name || 'Meal' };
      s.days++; if ((r.eaten || []).includes(name)) s.done++;
      stats.set(name, s);
    }
    const list = [...stats].map(([name, s]) => ({ name, ...s, rate: s.days ? s.done / s.days : 0 }))
      .sort((a, b) => a.rate - b.rate || a.name.localeCompare(b.name)).slice(0, 6);
    const days = new Set(rows.map(r => r.date)).size;
    $('skipNote').textContent = days ? `Lowest foods over the last ${days} logged ${days === 1 ? 'day' : 'days'}.` : '';
    $('skipped').innerHTML = list.length
      ? list.map(x => `<div class="sk"><span>${esc(x.name)}<em class="skm">${esc(x.meal)}</em></span><div class="track"><i style="width:${Math.round(x.rate * 100)}%"></i></div><span class="n">${x.done} of ${x.days} days</span></div>`).join('')
      : '<p class="empty">Log a few days and the foods you skip most will show up here.</p>';
  }

  /* ---------- the plan editor ---------- */
  function foodRow(f, dead) {
    return `<div class="pfood${dead ? ' dead' : ''}" data-f="${esc(f.id)}">
      <button class="iconbtn" type="button" data-act="food-up" data-f="${esc(f.id)}" title="Move up" aria-label="Move ${esc(f.name)} up">↑</button>
      <button class="iconbtn" type="button" data-act="food-down" data-f="${esc(f.id)}" title="Move down" aria-label="Move ${esc(f.name)} down">↓</button>
      <input class="pname" type="text" value="${esc(f.name)}" data-act="food-name" data-f="${esc(f.id)}" aria-label="Food name" maxlength="120">
      <input class="pqty" type="text" value="${esc(f.quantity || '')}" placeholder="qty" data-act="food-qty" data-f="${esc(f.id)}" aria-label="Quantity for ${esc(f.name)}" maxlength="40">
      <label class="popt" title="Optional foods never count against you"><input type="checkbox" data-act="food-opt" data-f="${esc(f.id)}"${f.optional ? ' checked' : ''}> optional</label>
      ${dead
        ? `<button class="pdrop" type="button" data-act="food-on" data-f="${esc(f.id)}">Restore</button>`
        : `<button class="pdrop" type="button" data-act="food-off" data-f="${esc(f.id)}" aria-label="Remove ${esc(f.name)}">Remove</button>`}
    </div>`;
  }
  function renderPlan() {
    const active = state.meals.filter(m => m.active);
    const gone = state.meals.filter(m => !m.active);
    let html = '';
    for (const m of active) {
      const live = m.foods.filter(f => f.active), dead = m.foods.filter(f => !f.active);
      html += `<section class="pmeal" data-m="${esc(m.id)}">
        <div class="phead">
          <button class="iconbtn" type="button" data-act="meal-up" data-m="${esc(m.id)}" title="Move up" aria-label="Move ${esc(m.name)} up">↑</button>
          <button class="iconbtn" type="button" data-act="meal-down" data-m="${esc(m.id)}" title="Move down" aria-label="Move ${esc(m.name)} down">↓</button>
          <input class="pname" type="text" value="${esc(m.name)}" data-act="meal-name" data-m="${esc(m.id)}" aria-label="Meal name" maxlength="120">
          <span class="pcount">${live.length} ${live.length === 1 ? 'food' : 'foods'}</span>
          <button class="pdrop" type="button" data-act="meal-off" data-m="${esc(m.id)}">Remove</button>
        </div>
        <div class="pfoods">
          ${live.length ? live.map(f => foodRow(f, false)).join('') : '<p class="empty">No foods in this meal yet.</p>'}
          ${dead.length ? `<details class="pdead"><summary>${dead.length} removed</summary>${dead.map(f => foodRow(f, true)).join('')}</details>` : ''}
        </div>
        <form class="padd" data-add="food" data-m="${esc(m.id)}">
          <input type="text" name="name" placeholder="Add a food to ${esc(m.name)}…" maxlength="120" aria-label="New food for ${esc(m.name)}">
          <button type="submit">Add</button>
        </form>
      </section>`;
    }
    if (!active.length) html += '<p class="empty">No meals in the plan. Add the first one below.</p>';
    html += `<form class="padd pmadd" data-add="meal"><input type="text" name="name" placeholder="Add a meal…" maxlength="120" aria-label="New meal"><button type="submit">Add meal</button></form>`;
    if (gone.length) {
      html += `<details class="pdead pmdead"><summary>Removed meals (${gone.length})</summary>${gone.map(m =>
        `<div class="phead"><span class="pgn">${esc(m.name)}</span><button class="pdrop" type="button" data-act="meal-on" data-m="${esc(m.id)}">Restore</button></div>`).join('')}</details>`;
    }
    $('plan').innerHTML = html;
  }

  function renderAll() {
    if (!state.today) return;
    if (has('ring')) renderRing();
    if (has('streak')) renderStreak();
    if (has('plate')) renderPlate();
    if (has('habits')) renderHabits();
    if (has('week')) renderWeek();
    if (has('heat')) renderHeat();
    if (has('skipped')) renderSkipped();
    if (has('plan')) renderPlan();
    state.first = false;
  }

  /* ---------- data ---------- */
  function toast(msg, ms) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), ms || 3000); }

  async function post(body) {
    // Writes authenticate with the x-widget-key header (same as the other widgets); ?key= only works for reads.
    const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-widget-key': KEY }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) { const e = new Error(j.error || `HTTP ${r.status}`); e.hint = j.hint; throw e; }
    return j;
  }

  async function load() {
    const r = await fetch(`${API}?days=${DAYS}${keyQ('&')}`, { cache: 'no-store' });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.error) { const e = new Error(d.error || `Could not load your meals (HTTP ${r.status}).`); e.hint = d.hint; throw e; }
    state.today = d.today;
    state.meals = d.meals || [];
    state.rows = d.rows || [];
    state.loadedAt = Date.now();
  }

  async function refresh() {
    if (state.pending || !shown.length) return;
    try { await load(); renderAll(); }
    catch (e) {
      if (state.today) return;          // keep what's on screen if a background refresh fails
      const b = $('bad'); b.hidden = false;
      b.innerHTML = `<h2>Couldn't load your meals</h2><p class="muted">${esc(e.message)}${e.hint ? ' ' + esc(e.hint) : ''}<br>Check the key in the link, then open /api/health to see what's wrong.</p>`;
    }
  }

  // Widgets in separate embeds stay in step through this channel (when the browser lets them share it).
  let bc = null; try { bc = new BroadcastChannel('meal-widgets'); bc.onmessage = () => setTimeout(refresh, 500); } catch (e) { /* not available in this sandbox */ }

  /* A row we can show before Notion answers; the server creates the real one. */
  function localRow(mealId) {
    let row = logOn(state.today, mealId);
    if (!row) {
      const m = activeMeals().find(x => x.id === mealId);
      row = { id: null, date: state.today, mealId, name: m ? m.name : '', planned: m ? m.foods.filter(f => !f.optional).map(f => f.name) : [], eaten: [] };
      state.rows.push(row);
    }
    return row;
  }
  const withName = (names, name, on) => (on ? [...new Set([...names, name])] : names.filter(x => x !== name));

  async function toggleFood(mealId, name) {
    const row = localRow(mealId), was = row.eaten.includes(name), before = row.eaten.slice();
    row.eaten = withName(row.eaten, name, !was);
    state.pending++; renderAll();
    try {
      await post({ action: 'toggle-food', date: state.today, mealId, name, value: !was });
      if (bc) bc.postMessage('changed');
    } catch (e) {
      console.error('Meal save failed:', e);
      row.eaten = before; renderAll();
      toast(`Couldn't save: ${errMsg(e)}`, 7000);
    } finally { state.pending--; }
  }

  async function toggleMeal(mealId, on) {
    const m = activeMeals().find(x => x.id === mealId);
    if (!m) return;
    const names = m.foods.filter(f => !f.optional).map(f => f.name);
    const row = localRow(mealId), before = row.eaten.slice();
    let next = row.eaten.slice();
    names.forEach(n => { next = withName(next, n, on); });
    row.eaten = next;
    state.pending++; renderAll();
    try {
      await post({ action: 'toggle-meal', date: state.today, mealId, value: on });
      if (bc) bc.postMessage('changed');
    } catch (e) {
      console.error('Meal save failed:', e);
      row.eaten = before; renderAll();
      toast(`Couldn't save: ${errMsg(e)}`, 7000);
    } finally { state.pending--; renderAll(); }
  }

  async function startDay() {
    if (state.starting || state.pending) return;
    state.starting = true; state.pending++; renderAll();
    try {
      await post({ action: 'start-day', date: state.today });
      if (bc) bc.postMessage('changed');
      await load();
    } catch (e) {
      console.error('Start day failed:', e);
      toast(`Couldn't start the day: ${errMsg(e)}`, 7000);
    } finally { state.starting = false; state.pending--; renderAll(); }
  }

  /* Every plan edit writes straight to Notion, then reloads so order and ids stay true. */
  async function planWrite(body, note) {
    state.pending++;
    try {
      await post(body);
      await load();
      if (bc) bc.postMessage('changed');
      if (note) toast(note);
    } catch (e) {
      console.error('Plan save failed:', e);
      toast(`Couldn't save: ${errMsg(e)}`, 7000);
      try { await load(); } catch (e2) { /* keep the screen as it is */ }
    } finally { state.pending--; renderAll(); }
  }

  if (has('plate')) {
    $('meals').addEventListener('click', e => {
      if (e.target.closest('#startBtn')) return startDay();
      const all = e.target.closest('[data-act="meal-all"]');
      if (all) {
        const id = all.dataset.m;
        const req = (activeMeals().find(m => m.id === id) || { foods: [] }).foods.filter(f => !f.optional);
        const eaten = eatenOn(state.today, id);
        return toggleMeal(id, !(req.length && req.every(f => eaten.has(f.name))));
      }
      const chip = e.target.closest('.chip');
      if (chip) toggleFood(chip.dataset.m, chip.dataset.f);
    });
  }

  if (has('plan')) {
    $('plan').addEventListener('click', e => {
      const b = e.target.closest('button[data-act]');
      if (!b) return;
      const act = b.dataset.act, m = b.dataset.m, f = b.dataset.f;
      if (act === 'meal-up') planWrite({ action: 'move-meal', mealId: m, dir: -1 });
      else if (act === 'meal-down') planWrite({ action: 'move-meal', mealId: m, dir: 1 });
      else if (act === 'meal-off') planWrite({ action: 'update-meal', mealId: m, active: false }, 'Meal removed from the plan.');
      else if (act === 'meal-on') planWrite({ action: 'update-meal', mealId: m, active: true }, 'Meal restored.');
      else if (act === 'food-up') planWrite({ action: 'move-food', foodId: f, dir: -1 });
      else if (act === 'food-down') planWrite({ action: 'move-food', foodId: f, dir: 1 });
      else if (act === 'food-off') planWrite({ action: 'update-food', foodId: f, active: false }, 'Food removed. It stays in past days.');
      else if (act === 'food-on') planWrite({ action: 'update-food', foodId: f, active: true }, 'Food restored.');
    });
    $('plan').addEventListener('change', e => {
      const el = e.target.closest('[data-act]');
      if (!el || el.tagName !== 'INPUT') return;
      const act = el.dataset.act;
      if (act === 'meal-name') {
        const v = el.value.trim();
        if (!v) { toast('A meal needs a name.'); return renderAll(); }
        planWrite({ action: 'update-meal', mealId: el.dataset.m, name: v }, 'Meal renamed.');
      } else if (act === 'food-name') {
        const v = el.value.trim();
        if (!v) { toast('A food needs a name.'); return renderAll(); }
        planWrite({ action: 'update-food', foodId: el.dataset.f, name: v }, 'Food renamed.');
      } else if (act === 'food-qty') {
        planWrite({ action: 'update-food', foodId: el.dataset.f, quantity: el.value.trim() });
      } else if (act === 'food-opt') {
        planWrite({ action: 'update-food', foodId: el.dataset.f, optional: el.checked },
          el.checked ? 'Now optional, it never counts against you.' : 'Now counts every day.');
      }
    });
    $('plan').addEventListener('submit', e => {
      const form = e.target.closest('[data-add]');
      if (!form) return;
      e.preventDefault();
      const input = form.querySelector('input[name="name"]');
      const name = input.value.trim();
      if (!name) return;
      if (form.dataset.add === 'meal') planWrite({ action: 'add-meal', name }, `Added ${name}.`);
      else planWrite({ action: 'add-food', mealId: form.dataset.m, name }, `Added ${name}.`);
    });
  }

  const stk = $('sticker');
  if (stk) { if (stk.complete && stk.naturalWidth) stk.hidden = false; else stk.addEventListener('load', e => { e.target.hidden = false; }); }

  refresh();
  setInterval(refresh, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  document.documentElement.addEventListener('pointerenter', () => { if (Date.now() - state.loadedAt > 8000) refresh(); });
})();
