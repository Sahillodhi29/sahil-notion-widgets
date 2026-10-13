'use strict';
/* Meal widgets: one page, many pieces.
   /meal/index.html?key=KEY&w=ring      -> just that widget
   w = ring | streak | plate | week | heat | skipped | all  (comma-separate to combine) */
(() => {
  const API = '/api/meal';
  const params = new URLSearchParams(location.search);
  const KEY = params.get('key') || '';
  const GOAL = 0.8;          // a day "counts" when this share of items is done
  const SKIP_WINDOW = 28;
  const NEEDS = { ring: 7, plate: 7, week: 7, streak: 35, heat: 35, skipped: 28 };   // days of history each widget needs
  const keyQ = sep => (KEY ? `${sep}key=${encodeURIComponent(KEY)}` : '');
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- background: Notion dark by default; &bg=transparent or &bg=HEX to change ---------- */
  const bgParam = params.get('bg');
  if (bgParam) {
    const v = bgParam === 'transparent' ? 'transparent' : /^[0-9a-f]{3,8}$/i.test(bgParam) ? '#' + bgParam : null;
    if (v) { document.documentElement.style.background = v; document.body.style.background = v; }
  }

  /* ---------- which widgets? ---------- */
  const asked = (params.get('w') || 'all').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
  const wantAll = asked.includes('all');
  const shown = wantAll ? Object.keys(NEEDS) : asked.filter(w => NEEDS[w]);
  const unknown = asked.filter(w => w !== 'all' && !NEEDS[w]);
  document.querySelectorAll('.card[data-w]').forEach(c => { c.hidden = !shown.includes(c.dataset.w); });
  document.body.dataset.mode = shown.length === 1 ? 'single' : 'multi';
  if (unknown.length || !shown.length) {
    const b = $('bad'); b.hidden = false;
    b.innerHTML = `<h2>Unknown widget</h2><p class="muted">Use w=ring, streak, plate, week, heat, skipped or all.</p>`;
  }
  const has = w => shown.includes(w);
  const DAYS = Math.max(7, ...shown.map(w => NEEDS[w]));

  const state = { today: null, rows: [], todayRow: null, pending: 0, first: true, loadedAt: 0 };

  /* ---------- dates ---------- */
  const addDays = (d, n) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
  const monday = d => addDays(d, -((new Date(d + 'T00:00:00Z').getUTCDay() + 6) % 7));
  const fmtDate = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  const wkShort = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });

  /* ---------- maths ---------- */
  const counts = r => ({ done: r.items.filter(i => i.done).length, total: r.items.length });
  const pct = r => { const c = counts(r); return c.total ? c.done / c.total : 0; };
  const byDate = () => new Map(state.rows.map(r => [r.date, r]));
  const level = p => (p >= GOAL ? 3 : p >= 0.5 ? 2 : 1);

  function streak() {
    const map = byDate();
    const hit = d => { const r = map.get(d); return !!r && pct(r) >= GOAL; };
    let d = state.today; if (!hit(d)) d = addDays(d, -1);   // today still in progress doesn't break the run
    let current = 0; while (hit(d)) { current++; d = addDays(d, -1); }
    let best = 0, run = 0;
    for (let i = 34; i >= 0; i--) { if (hit(addDays(state.today, -i))) { run++; best = Math.max(best, run); } else run = 0; }
    return { current, best };
  }

  /* ---------- ring: a spiral staircase, one step per item ---------- */
  function wedge(i, n, r0, r1, gap) {
    const a0 = (i / n) * 2 * Math.PI - Math.PI / 2 + gap / 2;
    const a1 = ((i + 1) / n) * 2 * Math.PI - Math.PI / 2 - gap / 2;
    const p = (r, a) => [(100 + r * Math.cos(a)).toFixed(2), (100 + r * Math.sin(a)).toFixed(2)];
    const [x0, y0] = p(r1, a0), [x1, y1] = p(r1, a1), [x2, y2] = p(r0, a1), [x3, y3] = p(r0, a0);
    return `M${x0} ${y0}A${r1} ${r1} 0 0 1 ${x1} ${y1}L${x2} ${y2}A${r0} ${r0} 0 0 0 ${x3} ${y3}Z`;
  }
  function ringItems() {
    if (state.todayRow) return state.todayRow.items;
    const last = state.rows[state.rows.length - 1];
    return last ? last.items.map(i => ({ ...i, done: false })) : Array.from({ length: 12 }, (_, i) => ({ label: String(i), done: false }));
  }
  function renderRing() {
    const items = ringItems(), n = items.length, gap = n > 18 ? 0.04 : 0.07, first = state.first;
    $('ring').innerHTML =
      `<circle class="rail" cx="100" cy="100" r="97"/><circle class="rail" cx="100" cy="100" r="50"/>` +
      items.map((it, i) => `<path class="step${it.done ? ' done' : ''}" d="${wedge(i, n, 56, 92, gap)}"${first ? ` style="transition-delay:${i * 45}ms"` : ''}><title>${esc(it.label)}</title></path>`).join('');
    if (first) setTimeout(() => $('ring').querySelectorAll('.step').forEach(s => { s.style.transitionDelay = ''; }), 1400);
    const c = state.todayRow ? counts(state.todayRow) : { done: 0, total: n };
    $('ringDone').textContent = state.todayRow ? c.done : '–';
    $('ringOf').textContent = state.todayRow ? `of ${c.total}` : 'no log yet';
    $('dateLine').textContent = fmtDate(state.today);
    if (!state.todayRow) $('statusLine').textContent = 'No log for today yet. Press New Day in Notion to start.';
    else { const left = c.total - c.done; $('statusLine').textContent = left === 0 ? 'Everything on the plate is done.' : `${c.done} done, ${left} still to go.`; }
  }

  /* ---------- the other widgets ---------- */
  function renderStreak() {
    const s = streak(), map = byDate();
    $('stNum').textContent = s.current;
    $('stUnit').textContent = s.current === 1 ? 'day' : 'days';
    $('stLine').textContent = s.current ? 'in a row at 80% or more' : 'No run going right now. Hit 80% today to start one.';
    $('stBest').textContent = `Best run in the last five weeks: ${s.best} ${s.best === 1 ? 'day' : 'days'}.`;
    $('stDots').innerHTML = Array.from({ length: 7 }, (_, i) => {
      const d = addDays(state.today, i - 6), r = map.get(d);
      const cls = d > state.today ? 'future' : r ? 'c' + level(pct(r)) : '';
      return `<div class="dot ${cls}${d === state.today ? ' today' : ''}"><i></i><span>${wkShort(d).slice(0, 1)}</span></div>`;
    }).join('');
  }

  const CHECK = '<svg viewBox="0 0 12 12" fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 6.3l2.4 2.4 4.6-5"/></svg>';
  function renderPlate() {
    const el = $('chips');
    if (!state.todayRow) { $('plateCount').textContent = ''; el.innerHTML = '<p class="empty">Nothing to tick yet. Today\'s log appears here once you press New Day in Notion.</p>'; return; }
    const c = counts(state.todayRow);
    $('plateCount').textContent = `${c.done} of ${c.total}`;
    el.innerHTML = state.todayRow.items.map(it =>
      `<button class="chip" type="button" data-key="${esc(it.key)}" aria-pressed="${it.done}"><span class="box">${CHECK}</span><span>${esc(it.label)}</span></button>`).join('');
  }

  function renderWeek() {
    const map = byDate(), start = monday(state.today);
    $('week').innerHTML = Array.from({ length: 7 }, (_, i) => {
      const d = addDays(start, i), r = map.get(d), future = d > state.today, p = r ? pct(r) : 0;
      const cls = future ? 'bar future' : p >= GOAL ? 'bar hit' : 'bar';
      return `<div class="day${d === state.today ? ' today' : ''}"><div class="${cls}" title="${esc(wkShort(d))}: ${Math.round(p * 100)}%"><i style="height:${future ? 0 : Math.round(p * 100)}%"></i></div><span class="dlabel">${wkShort(d)}</span></div>`;
    }).join('');
  }

  function renderHeat() {
    const map = byDate(), start = addDays(monday(state.today), -28);
    let html = ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(l => `<span class="hd">${l}</span>`).join('');
    for (let i = 0; i < 35; i++) {
      const d = addDays(start, i), r = map.get(d), future = d > state.today;
      const cls = future ? 'future' : r ? 'c' + level(pct(r)) : '';
      html += `<div class="cell ${cls}${d === state.today ? ' today' : ''}" title="${esc(fmtDate(d))}${r ? ': ' + Math.round(pct(r) * 100) + '%' : ''}"></div>`;
    }
    $('heat').innerHTML = html;
  }

  function renderSkipped() {
    const from = addDays(state.today, -(SKIP_WINDOW - 1));
    const rows = state.rows.filter(r => r.date >= from && r.date <= state.today);
    const stats = new Map();
    rows.forEach(r => r.items.forEach(it => { const s = stats.get(it.label) || { done: 0, days: 0 }; s.days++; if (it.done) s.done++; stats.set(it.label, s); }));
    const list = [...stats].map(([label, s]) => ({ label, ...s, rate: s.done / s.days })).sort((a, b) => a.rate - b.rate || a.label.localeCompare(b.label)).slice(0, 5);
    $('skipNote').textContent = rows.length ? `Lowest five over the last ${rows.length} logged ${rows.length === 1 ? 'day' : 'days'}.` : '';
    $('skipped').innerHTML = list.length
      ? list.map(x => `<div class="sk"><span>${esc(x.label)}</span><div class="track"><i style="width:${Math.round(x.rate * 100)}%"></i></div><span class="n">${x.done} of ${x.days} days</span></div>`).join('')
      : '<p class="empty">Log a few days and the items you skip most will show up here.</p>';
  }

  function renderAll() {
    if (has('ring')) renderRing();
    if (has('streak')) renderStreak();
    if (has('plate')) renderPlate();
    if (has('week')) renderWeek();
    if (has('heat')) renderHeat();
    if (has('skipped')) renderSkipped();
    state.first = false;
  }

  /* ---------- data ---------- */
  function toast(msg, ms) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), ms || 3000); }

  async function load() {
    const r = await fetch(`${API}?days=${DAYS}${keyQ('&')}`, { cache: 'no-store' });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || data.error) { const e = new Error(data.error || `Could not load the Meal Log (HTTP ${r.status}).`); e.hint = data.hint; throw e; }
    state.today = data.today; state.rows = data.rows || [];
    state.todayRow = state.rows.find(x => x.date === state.today) || null;
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

  async function toggle(key) {
    const it = state.todayRow && state.todayRow.items.find(i => i.key === key);
    if (!it) return;
    const next = !it.done; it.done = next; state.pending++; renderAll();
    try {
      // Writes authenticate with the x-widget-key header (same as the Sail widget); ?key= only works for reads.
      const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-widget-key': KEY },
        body: JSON.stringify({ action: 'toggle', pageId: state.todayRow.id, prop: key, value: next }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) { const e = new Error(j.error || `HTTP ${r.status}`); e.hint = j.hint; throw e; }
      if (bc) bc.postMessage('changed');
    } catch (e) {
      console.error('Meal save failed:', e);
      it.done = !next; renderAll();
      toast(`Couldn't save: ${e.message}${e.hint ? ' ' + e.hint : ''}`, 7000);
    } finally { state.pending--; }
  }

  if (has('plate')) $('chips').addEventListener('click', e => { const b = e.target.closest('.chip'); if (b) toggle(b.dataset.key); });
  $('sticker').addEventListener('load', e => { e.target.hidden = false; });

  refresh();
  setInterval(refresh, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  document.documentElement.addEventListener('pointerenter', () => { if (Date.now() - state.loadedAt > 8000) refresh(); });
})();
