'use strict';
/* ============================================================
   Must Do's widgets

   /mustdo/index.html?key=KEY&w=check        -> just that widget
   w = check | week | month | manage | all   (comma-separate to combine)
   Optional: &theme=classic|shanks &toggle=1 &bg=transparent|HEX

   One row in the Notion "Must Do's" database per day; one checkbox
   property per must-do. Ticking a box writes to today's row, so the
   week chart and the month heatmap are simply that history.
   ============================================================ */
(() => {
  const API = '/api/mustdo';
  const params = new URLSearchParams(location.search);
  const KEY = params.get('key') || '';
  const WIDGETS = ['check', 'week', 'month', 'manage'];
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- background ---------- */
  const bgParam = params.get('bg');
  if (bgParam) {
    const v = bgParam === 'transparent' ? 'transparent' : /^[0-9a-f]{3,8}$/i.test(bgParam) ? '#' + bgParam : null;
    if (v) { document.documentElement.style.background = v; document.body.style.background = v; }
  }

  /* ---------- which widgets? ---------- */
  const asked = (params.get('w') || 'all').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
  const wantAll = asked.includes('all');
  const shown = wantAll ? WIDGETS.slice() : asked.filter(w => WIDGETS.includes(w));
  const unknown = asked.filter(w => w !== 'all' && !WIDGETS.includes(w));
  document.querySelectorAll('.card[data-w]').forEach(c => { c.hidden = !shown.includes(c.dataset.w); });
  document.body.dataset.mode = shown.length === 1 ? 'single' : 'multi';
  const has = w => shown.includes(w);
  if (unknown.length || !shown.length) {
    const b = $('bad'); b.hidden = false;
    b.innerHTML = '<h2>Unknown widget</h2><p class="small">Use w=check, week, month, manage or all.</p>';
  }

  /* ---------- state ---------- */
  const state = {
    today: null, habits: [], rows: new Map(), checks: {}, todayRowId: null,
    loaded: false, busy: new Set(), pending: 0,
  };

  /* ---------- dates ---------- */
  const iso = d => d.toISOString().slice(0, 10);
  const parse = s => new Date(s + 'T00:00:00Z');
  const shift = (s, n) => { const d = parse(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const longDate = s => { const d = parse(s); return `${DOW[d.getUTCDay()]}, ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`; };
  const monthDate = s => { const d = parse(s); return `${d.getUTCDate()} ${MON[d.getUTCMonth()]}`; };

  /* ---------- toast ---------- */
  function toast(msg, ms) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), ms || 2800); }
  const errText = e => `${e.message}${e.hint ? ' ' + e.hint : ''}`;

  /* ---------- data ---------- */
  function pctOf(date) {
    const r = state.rows.get(date);
    const total = state.habits.length || (r && r.total) || 0;
    if (!r || !total) return null;
    return Math.max(0, Math.min(1, r.done / total));
  }
  async function post(body) {
    const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-widget-key': KEY }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) { const e = new Error(j.error || `HTTP ${r.status}`); e.hint = j.hint; throw e; }
    return j;
  }
  async function load() {
    const r = await fetch(`${API}?days=35${KEY ? '&key=' + encodeURIComponent(KEY) : ''}`, { cache: 'no-store' });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.error) { const e = new Error(d.error || `Could not load your must do's (HTTP ${r.status}).`); e.hint = d.hint; throw e; }
    state.today = d.today;
    state.habits = Array.isArray(d.habits) ? d.habits : [];
    state.checks = d.checks || {};
    state.todayRowId = d.todayRowId || null;
    state.rows = new Map((d.rows || []).map(x => [x.date, x]));
    state.loaded = true;
  }

  /* ---------- ticking ---------- */
  async function toggleHabit(key) {
    if (state.busy.has(key)) return;
    const before = !!state.checks[key];
    state.checks[key] = !before;
    state.busy.add(key);
    state.pending++;
    paintToday();
    try {
      if (!state.todayRowId) {
        const made = await post({ action: 'ensure' });
        state.todayRowId = made.id;
        state.rows.set(made.date, { id: made.id, date: made.date, done: made.done || 0, total: made.total || state.habits.length });
      }
      await post({ action: 'toggle', pageId: state.todayRowId, prop: key, value: !before });
      recalcToday();
      if (bc) bc.postMessage('changed');
    } catch (e) {
      state.checks[key] = before;
      console.error('Tick failed:', e);
      toast(`Couldn't save: ${errText(e)}`, 6000);
    } finally {
      state.busy.delete(key);
      state.pending--;
      renderAll();
    }
  }
  function recalcToday() {
    const done = state.habits.filter(h => state.checks[h.key]).length;
    const row = state.rows.get(state.today);
    if (row) { row.done = done; row.total = state.habits.length; }
    else state.rows.set(state.today, { id: state.todayRowId, date: state.today, done, total: state.habits.length });
  }

  /* ---------- widget: tick them off ---------- */
  function paintToday() {
    const n = state.habits.filter(h => state.checks[h.key]).length;
    const total = state.habits.length;
    if ($('checkCount')) $('checkCount').textContent = total ? `${n} / ${total}` : '–';
    if ($('checkMeter')) $('checkMeter').style.width = total ? Math.round(n / total * 100) + '%' : '0%';
    document.querySelectorAll('#checkList .item').forEach(li => {
      const on = !!state.checks[li.dataset.k];
      li.classList.toggle('done', on);
      li.classList.toggle('busy', state.busy.has(li.dataset.k));
      const t = li.querySelector('.tick');
      if (t) t.setAttribute('aria-pressed', String(on));
    });
  }
  function renderCheck() {
    $('checkDate').textContent = state.today ? longDate(state.today) : '';
    const box = $('checkList');
    if (!state.habits.length) { box.innerHTML = '<li class="empty">No must do\'s yet. Add some in “Your must do\'s”.</li>'; paintToday(); return; }
    box.innerHTML = state.habits.map(h => {
      const on = !!state.checks[h.key];
      return `<li class="item${on ? ' done' : ''}" data-k="${esc(h.key)}">
        <button type="button" class="tick" aria-pressed="${on}" aria-label="${esc(h.label)}" data-k="${esc(h.key)}"></button>
        <span class="name">${esc(h.label)}</span>
      </li>`;
    }).join('');
    paintToday();
  }

  /* ---------- widget: the week ---------- */
  function renderWeek() {
    if (!state.today) return;
    const days = [];
    for (let i = 6; i >= 0; i--) days.push(shift(state.today, -i));
    const seen = days.map(d => pctOf(d)).filter(p => p !== null);
    const avg = seen.length ? seen.reduce((a, b) => a + b, 0) / seen.length : 0;
    $('weekAvg').textContent = Math.round(avg * 100) + '%';
    $('weekNote').textContent = seen.length ? `last 7 days · ${seen.length} logged` : 'nothing logged yet';
    $('weekChart').innerHTML = days.map(d => {
      const p = pctOf(d);
      const v = p === null ? 0 : Math.round(p * 100);
      const cls = ['bcol'];
      if (d === state.today) cls.push('today');
      if (p === null) cls.push('none');
      else if (p >= 0.999) cls.push('full');
      return `<div class="${cls.join(' ')}" title="${esc(longDate(d))}">
        <span class="bval">${p === null ? '–' : v + '%'}</span>
        <span class="bbar"><i style="height:${p === null ? 0 : Math.max(3, v)}%"></i></span>
        <span class="blab">${DOW[parse(d).getUTCDay()]}</span>
      </div>`;
    }).join('');
    const full = seen.filter(p => p >= 0.999).length;
    $('weekFoot').textContent = full ? `${full} perfect ${full === 1 ? 'day' : 'days'} this week.` : 'Every tick counts — start with the first one.';
  }

  /* ---------- widget: the month ---------- */
  function level(p) {
    if (p === null) return 0;
    if (p <= 0) return 0;
    if (p < 0.4) return 1;
    if (p < 0.7) return 2;
    if (p < 0.999) return 3;
    return 4;
  }
  function renderMonth() {
    if (!state.today) return;
    const span = 34;
    const first = shift(state.today, -span);
    let lead = (parse(first).getUTCDay() + 6) % 7;          // Monday-first grid
    const cells = [];
    for (let i = 0; i < lead; i++) cells.push('<i class="blank"></i>');
    let logged = 0, sum = 0;
    for (let i = 0; i <= span; i++) {
      const d = shift(first, i);
      const p = pctOf(d);
      if (p !== null) { logged++; sum += p; }
      const l = level(p);
      cells.push(`<i class="l${l}${d === state.today ? ' today' : ''}" title="${esc(longDate(d))} · ${p === null ? 'not logged' : Math.round(p * 100) + '%'}"></i>`);
    }
    $('monthGrid').innerHTML = cells.join('');
    const avg = logged ? Math.round(sum / logged * 100) : 0;
    $('monthNote').textContent = logged ? `${monthDate(first)} – ${monthDate(state.today)} · ${avg}% average` : 'no days logged yet';

    // streak: full days in a row, ending today or yesterday
    let streak = 0, cursor = state.today;
    if ((pctOf(cursor) || 0) < 0.999) cursor = shift(cursor, -1);
    while ((pctOf(cursor) || 0) >= 0.999) { streak++; cursor = shift(cursor, -1); }
    $('monthStreak').textContent = streak ? `${streak}-day streak` : '';
  }

  /* ---------- widget: manage ---------- */
  function renderManage() {
    $('manageNote').textContent = state.habits.length ? `${state.habits.length} on the list` : 'nothing on the list yet';
    $('manageList').innerHTML = state.habits.map(h =>
      `<li class="item" data-k="${esc(h.key)}">
        <span class="name">${esc(h.label)}</span>
        <button type="button" class="del" data-k="${esc(h.key)}" aria-label="Remove ${esc(h.label)}" title="Remove">×</button>
      </li>`
    ).join('') || '<li class="empty">Add your first must do above.</li>';
    $('addBtn').disabled = !($('newName').value || '').trim();
  }
  async function addHabit() {
    const input = $('newName');
    const label = (input.value || '').trim();
    if (!label) return;
    $('addBtn').disabled = true;
    try {
      await post({ action: 'habit-add', label });
      input.value = '';
      await load(); renderAll();
      if (bc) bc.postMessage('changed');
      toast(`“${label}” added.`, 2600);
    } catch (e) {
      console.error('Add failed:', e);
      toast(`Couldn't add: ${errText(e)}`, 7000);
    } finally { $('addBtn').disabled = !(input.value || '').trim(); }
  }
  async function removeHabit(key, label) {
    if (!confirm(`Remove “${label}” from your must do's?\n\nIt disappears from every day, including the ones already ticked.`)) return;
    try {
      await post({ action: 'habit-remove', key });
      await load(); renderAll();
      if (bc) bc.postMessage('changed');
      toast(`“${label}” removed.`, 2600);
    } catch (e) {
      console.error('Remove failed:', e);
      toast(`Couldn't remove: ${errText(e)}`, 7000);
    }
  }

  /* ---------- render ---------- */
  function renderAll() {
    if (!state.loaded) return;
    if (has('check')) renderCheck();
    if (has('week')) renderWeek();
    if (has('month')) renderMonth();
    if (has('manage')) renderManage();
  }
  async function refresh() {
    if (state.pending || !shown.length) return;
    try { await load(); renderAll(); }
    catch (e) {
      if (state.loaded) return;
      const b = $('bad'); b.hidden = false;
      b.innerHTML = `<h2>Couldn't load your must do's</h2><p class="small">${esc(e.message)}${e.hint ? ' ' + esc(e.hint) : ''}<br>Check the key in the link.</p>`;
    }
  }

  let bc = null;
  try { bc = new BroadcastChannel('mustdo-widgets'); bc.onmessage = () => setTimeout(refresh, 400); } catch (e) { /* not available */ }

  /* ---------- events ---------- */
  document.addEventListener('click', e => {
    const tick = e.target.closest('#checkList .item, #checkList .tick');
    if (tick) { const li = tick.closest('.item'); if (li) return toggleHabit(li.dataset.k); }
    const del = e.target.closest('.del');
    if (del) {
      const h = state.habits.find(x => x.key === del.dataset.k);
      return removeHabit(del.dataset.k, h ? h.label : del.dataset.k);
    }
    if (e.target.closest('#addBtn')) return addHabit();
  });
  if (has('manage')) {
    $('newName').addEventListener('input', () => { $('addBtn').disabled = !($('newName').value || '').trim(); });
    $('newName').addEventListener('keydown', ev => { if (ev.key === 'Enter') addHabit(); });
  }

  renderAll();
  refresh();
  setInterval(refresh, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
})();
