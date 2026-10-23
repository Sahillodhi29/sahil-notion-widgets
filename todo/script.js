'use strict';
/* To-Do widgets: one page, many pieces.
   /todo/index.html?key=KEY&w=sweep   -> just that widget
   w = sweep | general | self | week | backlog | add | all  (comma-separate to combine) */
(() => {
  const API = '/api/todo';
  const params = new URLSearchParams(location.search);
  const KEY = params.get('key') || '';
  const WIDGETS = ['sweep', 'general', 'self', 'week', 'backlog', 'add'];
  const FALLBACK = { categories: ['Skill', 'Hobby', 'Personal', 'Work', 'Selfcare', 'Workout'], units: ['Days', 'Weeks', 'Months', 'Quaters', 'Years'] };
  const BACKLOG_SHOWN = 7;
  const keyQ = sep => (KEY ? `${sep}key=${encodeURIComponent(KEY)}` : '');
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const errMsg = e => `${e.message}${e.hint ? ' ' + e.hint : ''}`;

  /* ---------- background: Notion dark by default; &bg=transparent or &bg=HEX to change ---------- */
  const bgParam = params.get('bg');
  if (bgParam) {
    const v = bgParam === 'transparent' ? 'transparent' : /^[0-9a-f]{3,8}$/i.test(bgParam) ? '#' + bgParam : null;
    if (v) { document.documentElement.style.background = v; document.body.style.background = v; }
  }

  /* ---------- which widgets? ---------- */
  const asked = (params.get('w') || 'all').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
  const shown = asked.includes('all') ? WIDGETS : asked.filter(w => WIDGETS.includes(w));
  const unknown = asked.filter(w => w !== 'all' && !WIDGETS.includes(w));
  document.querySelectorAll('.card[data-w]').forEach(c => { c.hidden = !shown.includes(c.dataset.w); });
  document.body.dataset.mode = shown.length === 1 ? 'single' : 'multi';
  if (unknown.length || !shown.length) {
    const b = $('bad'); b.hidden = false;
    b.innerHTML = '<h2>Unknown widget</h2><p class="sub">Use w=sweep, general, self, week, backlog, add or all.</p>';
  }
  const has = w => shown.includes(w);

  const state = {
    today: null, label: '', items: [], done: [], upcoming: [], late: null,
    backlog: [], backlogTotal: 0, backlogHigh: 0, backlogCounts: {},
    pending: 0, first: true, loadedAt: 0, meta: null, adding: false,
    form: { list: 'general', priority: 'Medium', due: 'today' },
  };

  /* ---------- helpers ---------- */
  const addDays = (d, n) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
  const dt = d => new Date(d + 'T00:00:00Z');
  const wkShort = d => dt(d).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });
  const fmtDay = d => dt(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  const pc = p => 'p-' + (p === 'High' || p === 'Medium' || p === 'Low' ? p : 'None');
  const RANK = { High: 0, Medium: 1, Low: 2 };
  const sortItems = () => state.items.sort((a, b) =>
    ((RANK[a.priority] ?? 3) - (RANK[b.priority] ?? 3)) || (a.due || '9999').localeCompare(b.due || '9999') || a.title.localeCompare(b.title));
  const CHECK = '<svg viewBox="0 0 12 12"><path d="M2.5 6.3l2.4 2.4 4.6-5"/></svg>';
  const REPEAT = '<svg class="ic" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-label="Repeats"><path d="M13 8a5 5 0 1 1-1.6-3.7"/><path d="M13 2.5v3h-3"/></svg>';

  /* ---------- sweep: one stripe per task, teal on the left, pink on the right ---------- */
  function renderSweep() {
    const open = state.items, done = state.done, total = open.length + done.length;
    const late = open.filter(i => i.overdue).length;
    $('swDone').textContent = done.length;
    $('swOf').textContent = total ? `of ${total} done` : 'nothing due';
    $('swDate').textContent = state.label;
    $('swLine').textContent = !total ? 'Nothing due today. Enjoy the quiet.'
      : !open.length ? 'Clean sweep. Every stripe is teal.'
      : `${open.length} ${open.length === 1 ? 'stripe' : 'stripes'} still pink${late ? `, ${late} overdue` : ''}.`;
    const tray = $('swTray');
    tray.classList.toggle('intro', state.first);
    let h = '';
    if (!total) h = [0, 1, 2, 3, 4, 5].map(i => `<i class="st dc${i}" style="--i:${i}"></i>`).join('');
    else {
      done.forEach((d, i) => { h += `<i class="st done a${i % 2}" style="--i:${i}" title="${esc(d.title)}"></i>`; });
      open.forEach((o, i) => { h += `<i class="st ${pc(o.priority)}" style="--i:${done.length + i}" title="${esc(o.title)}"></i>`; });
    }
    tray.innerHTML = h;
  }

  /* ---------- the two lists ---------- */
  function rowHtml(it) {
    const meta = (it.overdue ? `<span class="late">${it.overdueDays}d late</span>` : '') + (it.recur ? REPEAT : '') + (it.category ? `<span class="cat">${esc(it.category)}</span>` : '');
    return `<button class="row ${pc(it.priority)}${it.finishing ? ' finishing' : ''}" type="button" data-act="complete" data-id="${esc(it.id)}" aria-label="Complete ${esc(it.title)}">` +
      `<span class="tick">${CHECK}</span><span class="rt">${esc(it.title)}</span><span class="meta">${meta}</span></button>`;
  }
  function doneHtml(d) {
    const meta = (d.rolledTo ? `${REPEAT}<span class="late">next ${esc(fmtDay(d.rolledTo))}</span>` : d.recur ? REPEAT : '') + (d.category ? `<span class="cat">${esc(d.category)}</span>` : '');
    const inner = `<span class="tick">${CHECK}</span><span class="rt">${esc(d.title)}</span><span class="meta">${meta}</span>`;
    return d.canUndo
      ? `<button class="row done" type="button" data-act="undo" data-id="${esc(d.id)}" title="Tap to undo" aria-label="Undo ${esc(d.title)}">${inner}</button>`
      : `<div class="row done">${inner}</div>`;
  }
  function renderList(key) {
    const open = state.items.filter(i => i.list === key), done = state.done.filter(i => i.list === key);
    document.querySelector(`[data-count="${key}"]`).textContent = open.length ? `${open.length} left` : done.length ? 'All done' : '';
    document.querySelector(`[data-rows="${key}"]`).innerHTML = open.length
      ? open.map(rowHtml).join('')
      : `<p class="empty">${done.length ? 'Every stripe is teal.' : 'Nothing due here. Clear skies.'}</p>`;
    document.querySelector(`[data-shelf="${key}"]`).innerHTML = done.length
      ? `<p class="shelf-h">Done today (${done.length})</p>` + done.map(doneHtml).join('') : '';
  }

  /* ---------- week ---------- */
  function renderWeek() {
    const cols = [];
    if (state.late && state.late.n) cols.push({ label: 'Late', b: state.late, cls: ' late' });
    state.upcoming.forEach((u, i) => cols.push({ label: i === 0 ? 'Today' : wkShort(u.date), b: u, cls: i === 0 ? ' today' : '' }));
    const max = Math.max(1, ...cols.map(c => c.b.n));
    $('wkTotal').textContent = `${cols.reduce((s, c) => s + c.b.n, 0)} open`;
    $('week').innerHTML = cols.map(c => {
      const blocks = ['High', 'Medium', 'Low', 'None'].map(p => `<i class="b ${pc(p)}"></i>`.repeat(c.b[p] || 0)).join('');
      return `<div class="wk${c.cls}"><span class="wn">${c.b.n || ''}</span><div class="col"><div class="stack" style="height:${(c.b.n / max) * 100}%">${blocks}</div></div><span class="wl">${esc(c.label)}</span></div>`;
    }).join('');
  }
  function adjustWeek(it, delta) {
    const b = it.overdue ? state.late : state.upcoming[0];
    if (!b) return;
    const k = it.priority in RANK ? it.priority : 'None';
    b.n = Math.max(0, b.n + delta); b[k] = Math.max(0, b[k] + delta);
  }

  /* ---------- backlog: undated tasks, read-only ---------- */
  function renderBacklog() {
    const total = state.backlogTotal, c = state.backlogCounts;
    $('bkNum').textContent = total;
    $('bkLine').textContent = total
      ? `No due date. ${state.backlogHigh} high priority. General ${c.general || 0}, Self ${c.self || 0}.`
      : 'Nothing is floating without a date.';
    const rows = state.backlog.slice(0, BACKLOG_SHOWN);
    $('bkRows').innerHTML = rows.map(b =>
      `<div class="row bk ${pc(b.priority)}"><span class="rt">${esc(b.title)}</span><span class="meta"><span class="lt">${b.list === 'self' ? 'S' : 'G'}</span><span class="age${b.age >= 30 ? ' stale' : ''}">${b.age}d</span></span></div>`).join('')
      + (total > rows.length ? `<p class="more">${total - rows.length} more in Notion.</p>` : '');
  }

  /* ---------- quick add ---------- */
  function fillSelect(el, first, list) { el.innerHTML = `<option value="">${first}</option>` + list.map(x => `<option>${esc(x)}</option>`).join(''); }
  function renderAddOptions() {
    const m = state.meta || FALLBACK, cat = $('adCat').value, unit = $('adUnit').value;
    fillSelect($('adCat'), 'No category', m.categories || FALLBACK.categories);
    fillSelect($('adUnit'), 'No repeat', m.units || FALLBACK.units);
    $('adCat').value = cat; $('adUnit').value = unit;
  }
  function initAdd() {
    renderAddOptions();
    document.querySelectorAll('.seg').forEach(seg => seg.addEventListener('click', e => {
      const b = e.target.closest('button[data-v]'); if (!b) return;
      seg.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      state.form[seg.dataset.f] = b.dataset.v;
      if (seg.dataset.f === 'due') { $('adDate').hidden = b.dataset.v !== 'pick'; if (b.dataset.v === 'pick') $('adDate').focus(); }
    }));
    $('adGo').addEventListener('click', submitAdd);
    $('adTitle').addEventListener('keydown', e => { if (e.key === 'Enter') submitAdd(); });
  }
  async function submitAdd() {
    if (state.adding) return;
    const titleEl = $('adTitle'), title = titleEl.value.trim();
    if (!title) { toast('Give the task a name.'); titleEl.focus(); return; }
    if (!state.today) { toast('Still loading. Try again in a second.'); return; }
    const f = state.form;
    const due = f.due === 'today' ? state.today : f.due === 'tomorrow' ? addDays(state.today, 1) : f.due === 'pick' ? $('adDate').value : null;
    if (f.due === 'pick' && !due) { toast('Pick a due date, or choose None.'); return; }
    const n = parseInt($('adInt').value, 10), unit = $('adUnit').value;
    const body = { action: 'add', list: f.list, title, priority: f.priority, category: $('adCat').value || null, due };
    if (n > 0 || unit) { body.interval = n > 0 ? n : 1; body.unit = unit || 'Days'; }

    state.adding = true; state.pending++;
    titleEl.value = ''; $('adGo').disabled = true; $('adGo').textContent = 'Adding…';      // optimistic: clear at once
    try {
      await api(body);
      toast(`Added "${title.length > 40 ? title.slice(0, 40) + '…' : title}"${due ? '' : ' to the backlog'}.`);
      if (bc) bc.postMessage('changed');
      state.pending--; state.adding = false;
      await refreshNow();
    } catch (e) {
      console.error('Add failed:', e);
      titleEl.value = title;                                                              // revert
      toast(`Couldn't add: ${errMsg(e)}`, 7000);
      state.pending--; state.adding = false;
    } finally { $('adGo').disabled = false; $('adGo').textContent = 'Add task'; }
  }

  function renderAll() {
    if (!state.today) return;
    if (has('sweep')) renderSweep();
    if (has('general')) renderList('general');
    if (has('self')) renderList('self');
    if (has('week')) renderWeek();
    if (has('backlog')) renderBacklog();
    state.first = false;
  }

  /* ---------- data ---------- */
  function toast(msg, ms) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), ms || 3000); }

  async function api(body) {
    // Writes authenticate with the x-widget-key header; ?key= only works for reads.
    const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-widget-key': KEY }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) { const e = new Error(j.error || `HTTP ${r.status}`); e.hint = j.hint; throw e; }
    return j;
  }

  async function load() {
    const r = await fetch(`${API}?v=1${keyQ('&')}`, { cache: 'no-store' });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.error) { const e = new Error(d.error || `Could not load your tasks (HTTP ${r.status}).`); e.hint = d.hint; throw e; }
    Object.assign(state, {
      today: d.today, label: d.label || '', items: d.items || [], done: d.done || [], upcoming: d.upcoming || [], late: d.late || null,
      backlog: d.backlog || [], backlogTotal: d.backlogTotal || 0, backlogHigh: d.backlogHigh || 0, backlogCounts: d.backlogCounts || {}, loadedAt: Date.now(),
    });
  }
  async function refreshNow() { try { await load(); renderAll(); } catch (e) { console.error(e); } }

  async function refresh() {
    if (state.pending || !shown.length) return;
    try { await load(); renderAll(); }
    catch (e) {
      if (state.today) return;          // keep what's on screen if a background refresh fails
      const b = $('bad'); b.hidden = false;
      b.innerHTML = `<h2>Couldn't load your tasks</h2><p class="sub">${esc(e.message)}${e.hint ? ' ' + esc(e.hint) : ''}<br>Check the key in the link, then open /api/health to see what's wrong.</p>`;
    }
  }
  async function loadMeta() {
    try {
      const r = await fetch(`${API}?meta=1${keyQ('&')}`, { cache: 'no-store' });
      const d = await r.json();
      if (r.ok && d.meta) { state.meta = d.meta; renderAddOptions(); }
    } catch (e) { /* the built-in option lists stay */ }
  }

  // Widgets in separate embeds stay in step through this channel (when the browser lets them share it).
  let bc = null; try { bc = new BroadcastChannel('todo-widgets'); bc.onmessage = () => setTimeout(refresh, 500); } catch (e) { /* not available in this sandbox */ }

  /* ---------- actions ---------- */
  async function complete(id) {
    const it = state.items.find(x => x.id === id);
    if (!it || it.busy) return;
    it.busy = true; it.finishing = true; state.pending++;
    render1();                                                   // optimistic: the teal wipe starts now
    try {
      const [j] = await Promise.all([api({ action: 'complete', id }), sleep(460)]);
      state.items = state.items.filter(x => x !== it);
      state.done.unshift({ id: it.id, list: it.list, title: it.title, priority: it.priority, category: it.category, recur: it.recur,
        rolledTo: j.rolled ? j.nextDue : null, canUndo: true, orig: it, prev: j.prev });
      adjustWeek(it, -1);
      if (bc) bc.postMessage('changed');
    } catch (e) {
      console.error('Complete failed:', e);
      it.busy = false; it.finishing = false;                     // revert
      toast(`Couldn't save: ${errMsg(e)}`, 7000);
    } finally { state.pending--; render1(); }
  }

  async function undo(id) {
    const d = state.done.find(x => x.id === id);
    if (!d || !d.canUndo || d.busy) return;
    d.busy = true; state.pending++;
    const idx = state.done.indexOf(d);
    state.done.splice(idx, 1);
    if (d.orig) { d.orig.busy = false; d.orig.finishing = false; state.items.push(d.orig); sortItems(); adjustWeek(d.orig, 1); }
    render1();                                                   // optimistic: the stripe turns pink again
    let ok = false;
    try {
      await api({ action: 'restore', id, prev: d.prev || { status: 'To-Do' } });
      ok = true;
      if (bc) bc.postMessage('changed');
    } catch (e) {
      console.error('Undo failed:', e);
      if (d.orig) { state.items = state.items.filter(x => x !== d.orig); adjustWeek(d.orig, -1); }
      d.busy = false; state.done.splice(idx, 0, d);              // revert
      toast(`Couldn't undo: ${errMsg(e)}`, 7000);
    } finally { state.pending--; render1(); }
    if (ok && !d.orig) refresh();                                // restored after a reload: pull the real row back in
  }
  const render1 = renderAll;

  document.addEventListener('click', e => {
    const a = e.target.closest('[data-act]'); if (!a) return;
    if (a.dataset.act === 'complete') complete(a.dataset.id);
    else if (a.dataset.act === 'undo') undo(a.dataset.id);
  });

  if (has('add')) { initAdd(); loadMeta(); }
  refresh();
  setInterval(refresh, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  document.documentElement.addEventListener('pointerenter', () => { if (Date.now() - state.loadedAt > 8000) refresh(); });
})();
