'use strict';
/* Today's Plate: reads /api/meal, draws everything client-side. */
(() => {
  const API = '/api/meal';
  const KEY = new URLSearchParams(location.search).get('key') || '';
  const GOAL = 0.8;          // a day "counts" when this share of items is done
  const SKIP_WINDOW = 28;    // days used for the "what gets skipped" list
  const keyQ = sep => (KEY ? `${sep}key=${encodeURIComponent(KEY)}` : '');

  const state = { today: null, rows: [], todayRow: null, pending: 0, first: true };
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

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
    const items = ringItems(), n = items.length, gap = n > 18 ? 0.04 : 0.07;
    const first = state.first;
    $('ring').innerHTML =
      `<circle class="rail" cx="100" cy="100" r="97"/><circle class="rail" cx="100" cy="100" r="50"/>` +
      items.map((it, i) => `<path class="step${it.done ? ' done' : ''}" d="${wedge(i, n, 56, 92, gap)}"${first ? ` style="transition-delay:${i * 45}ms"` : ''}><title>${esc(it.label)}</title></path>`).join('');
    if (first) setTimeout(() => $('ring').querySelectorAll('.step').forEach(s => { s.style.transitionDelay = ''; }), 1400);
    const c = state.todayRow ? counts(state.todayRow) : { done: 0, total: n };
    $('ringDone').textContent = state.todayRow ? c.done : '–';
    $('ringOf').textContent = state.todayRow ? `of ${c.total}` : 'no log yet';
  }

  /* ---------- sections ---------- */
  function renderHero() {
    $('dateLine').textContent = fmtDate(state.today);
    const s = streak();
    if (!state.todayRow) {
      $('statusLine').textContent = 'No log for today yet. Press New Day in Notion to start.';
    } else {
      const c = counts(state.todayRow), left = c.total - c.done;
      $('statusLine').textContent = left === 0 ? 'Everything on the plate is done.' : `${c.done} done, ${left} still to go.`;
    }
    $('streakLine').textContent = s.current
      ? `${s.current} ${s.current === 1 ? 'day' : 'days'} in a row at 80% or more. Best run: ${s.best}.`
      : `No run going right now. Best in the last five weeks: ${s.best} ${s.best === 1 ? 'day' : 'days'}.`;
  }

  const CHECK = '<svg viewBox="0 0 12 12" fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 6.3l2.4 2.4 4.6-5"/></svg>';
  function renderChips() {
    const el = $('chips');
    if (!state.todayRow) { el.innerHTML = '<p class="empty">Nothing to tick yet. Today\'s log appears here once you press New Day in Notion.</p>'; return; }
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
    rows.forEach(r => r.items.forEach(it => {
      const s = stats.get(it.label) || { done: 0, days: 0 }; s.days++; if (it.done) s.done++; stats.set(it.label, s);
    }));
    const list = [...stats].map(([label, s]) => ({ label, ...s, rate: s.done / s.days }))
      .sort((a, b) => a.rate - b.rate || a.label.localeCompare(b.label)).slice(0, 5);
    $('skipNote').textContent = rows.length ? `Lowest five over the last ${rows.length} logged ${rows.length === 1 ? 'day' : 'days'}.` : '';
    $('skipped').innerHTML = list.length
      ? list.map(x => `<div class="sk"><span>${esc(x.label)}</span><div class="track"><i style="width:${Math.round(x.rate * 100)}%"></i></div><span class="n">${x.done} of ${x.days} days</span></div>`).join('')
      : '<p class="empty">Log a few days and the items you skip most will show up here.</p>';
  }

  function renderAll() { renderRing(); renderHero(); renderChips(); renderWeek(); renderHeat(); renderSkipped(); state.first = false; }

  /* ---------- data ---------- */
  function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2600); }

  async function load() {
    const r = await fetch(`${API}?days=35${keyQ('&')}`, { cache: 'no-store' });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || data.error) { const e = new Error(data.error || 'Could not load the Meal Log.'); e.hint = data.hint; throw e; }
    state.today = data.today; state.rows = data.rows || [];
    state.todayRow = state.rows.find(x => x.date === state.today) || null;
  }

  async function refresh() {
    if (state.pending) return;
    try { await load(); renderAll(); }
    catch (e) {
      if (state.today) return;          // keep what's on screen if a background refresh fails
      $('app').innerHTML = `<div class="error"><strong>Couldn't load your meals.</strong><br>${esc(e.message)}${e.hint ? '<br>' + esc(e.hint) : ''}<br>Check the widget key in the link and open /api/health to see what's wrong.</div>`;
    }
  }

  async function toggle(key) {
    const it = state.todayRow && state.todayRow.items.find(i => i.key === key);
    if (!it) return;
    const next = !it.done; it.done = next; state.pending++; renderAll();
    try {
      const r = await fetch(`${API}${keyQ('?')}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'toggle', pageId: state.todayRow.id, prop: key, value: next }) });
      if (!r.ok) throw new Error('save failed');
    } catch (e) { it.done = !next; renderAll(); toast('Could not save that tick. Try again.'); }
    finally { state.pending--; }
  }

  $('chips').addEventListener('click', e => { const b = e.target.closest('.chip'); if (b) toggle(b.dataset.key); });
  $('sticker').addEventListener('load', e => { e.target.hidden = false; });

  refresh();
  setInterval(refresh, 90000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
})();
