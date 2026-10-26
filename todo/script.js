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
  const FIT = !asked.includes('all') && params.get('natural') !== '1';                         // an embed: the card fills its frame, lists page instead of scrolling
  if (FIT) { document.body.dataset.fit = 'fill'; document.documentElement.style.height = '100%'; }   // html must be 100% tall for the card to fill the frame
  if (unknown.length || !shown.length) {
    const b = $('bad'); b.hidden = false;
    b.innerHTML = '<h2>Unknown widget</h2><p class="sub">Use w=sweep, general, self, week, backlog, add or all.</p>';
  }
  const has = w => shown.includes(w);

  const state = {
    today: null, label: '', items: [], done: [], upcoming: [], late: null,
    backlog: [], backlogTotal: 0, backlogHigh: 0, backlogCounts: {},
    pending: 0, first: true, loadedAt: 0, meta: null, adding: false, page: { general: 0, self: 0 },
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

  /* ---------- sweep: one colour chip per task. Swept (done) chips go empty on the left, open ones stay raspberry ---------- */
  function renderSweep() {
    const open = state.items, done = state.done, total = open.length + done.length;
    const late = open.filter(i => i.overdue).length;
    $('swDone').textContent = done.length;
    $('swOf').textContent = total ? `of ${total} done` : 'nothing due';
    $('swDate').textContent = state.label;
    $('swLine').textContent = !total ? 'Nothing due today. Enjoy the quiet.'
      : !open.length ? 'Clean sweep. Everything is done.'
      : `${open.length} ${open.length === 1 ? 'task' : 'tasks'} still open${late ? `, ${late} overdue` : ''}.`;
    const tray = $('swTray');
    tray.classList.toggle('intro', state.first);
    let h = '';
    if (!total) h = [0, 1, 2, 3, 4, 5].map(i => `<i class="st dc${i}" style="--i:${i}"></i>`).join('');
    else {
      done.forEach((d, i) => { h += `<i class="st done" style="--i:${i}" title="${esc(d.title)}">${CHECK}</i>`; });
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
    const seq = open.length ? open.map(rowHtml)
      : [`<p class="empty">${done.length ? 'Everything here is swept.' : 'Nothing due here.'}<small>${done.length ? 'Lovely work today.' : 'Clear skies.'}</small></p>`];
    if (done.length) { seq.push(`<p class="shelf-h">Done today (${done.length})</p>`); done.forEach(d => seq.push(doneHtml(d))); }
    document.querySelector(`[data-rows="${key}"]`).innerHTML = seq.join('');
    document.querySelector(`.card[data-w="${key}"]`).classList.toggle('is-empty', !open.length && !done.length);
    paginate(key);
  }

  /* A list never scrolls inside an embed. It packs as many rows as the frame allows and pages the rest. */
  function paginate(key) {
    const box = document.querySelector(`[data-rows="${key}"]`), pager = document.querySelector(`[data-pager="${key}"]`);
    if (!box || !pager) return;
    const kids = [...box.children];
    kids.forEach(k => { k.hidden = false; });
    pager.hidden = true; pager.innerHTML = '';
    if (!FIT || kids.length < 2) return;
    const fits = () => box.scrollHeight <= box.clientHeight + 1;
    if (fits()) return;
    pager.hidden = false; pager.innerHTML = '<button type="button">&lsaquo;</button><span>1 / 1</span><button type="button">&rsaquo;</button>';   // it takes room, so measure with it in place
    const avail = box.clientHeight, gap = parseFloat(getComputedStyle(box).rowGap) || 0;
    const pages = []; let cur = [], used = 0;
    kids.forEach((k, idx) => {
      const h = k.offsetHeight, add = (cur.length ? gap : 0) + h;
      if (cur.length && used + add > avail) { pages.push(cur); cur = []; used = 0; }
      used += (cur.length ? gap : 0) + h; cur.push(idx);
    });
    if (cur.length) pages.push(cur);
    for (let p = 0; p < pages.length - 1; p++) {          // never leave a "Done today" heading stranded at the foot of a page
      const last = pages[p][pages[p].length - 1];
      if (kids[last].classList.contains('shelf-h') && pages[p].length > 1) pages[p + 1].unshift(pages[p].pop());
    }
    state.page[key] = Math.max(0, Math.min(state.page[key], pages.length - 1));
    const pg = state.page[key];
    kids.forEach((k, idx) => { k.hidden = !pages[pg].includes(idx); });
    pager.innerHTML = `<button type="button" data-pg="prev" aria-label="Previous page"${pg === 0 ? ' disabled' : ''}>&lsaquo;</button><span>${pg + 1} / ${pages.length}</span><button type="button" data-pg="next" aria-label="Next page"${pg >= pages.length - 1 ? ' disabled' : ''}>&rsaquo;</button>`;
  }

  /* ---------- week ---------- */
  function renderWeek() {
    const cols = [];
    if (state.late && state.late.n) cols.push({ label: 'Late', b: state.late, cls: ' late' });
    state.upcoming.forEach((u, i) => cols.push({ label: i === 0 ? 'Today' : wkShort(u.date), b: u, cls: i === 0 ? ' today' : '' }));
    const max = Math.max(1, ...cols.map(c => c.b.n));
    $('wkTotal').textContent = `${cols.reduce((s, c) => s + c.b.n, 0)} open`;
    const wkEl = $('week'); const anyOpen = cols.some(c => c.b.n > 0);
    wkEl.classList.toggle('is-empty', !anyOpen);
    if (!anyOpen) { wkEl.innerHTML = '<p class="empty">A clear week ahead.<small>Nothing is scheduled.</small></p>'; return; }
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
    document.querySelector('.card[data-w="backlog"]').classList.toggle('is-empty', !total);
    $('bkLine').textContent = total
      ? `No due date. ${state.backlogHigh} high priority. General ${c.general || 0}, Self ${c.self || 0}.`
      : 'Nothing is floating without a date.';
    const rows = state.backlog.slice(0, FIT ? 20 : BACKLOG_SHOWN);
    $('bkRows').innerHTML = rows.map(b =>
      `<div class="row bk ${pc(b.priority)}"><span class="rt">${esc(b.title)}</span><span class="meta"><span class="lt">${b.list === 'self' ? 'S' : 'G'}</span><span class="age${b.age >= 30 ? ' stale' : ''}">${b.age}d</span></span></div>`).join('')
      + (total > rows.length ? `<p class="more">${total - rows.length} more in Notion.</p>` : '');
    fitBacklog(total);
  }
  /* in an embed, show only the rows that fit and say how many more are waiting in Notion */
  function fitBacklog(total) {
    const box = $('bkRows'); if (!FIT) return;
    const kids = [...box.querySelectorAll('.row')], more = box.querySelector('.more');
    kids.forEach(k => { k.hidden = false; });
    if (more) more.hidden = true;
    const gap = parseFloat(getComputedStyle(box).rowGap) || 0, avail = box.clientHeight;
    let used = 0, shownN = 0;
    kids.forEach(k => { const h = k.offsetHeight + (shownN ? gap : 0); const reserve = (shownN + 1 < total) ? 30 : 0; if (used + h + reserve <= avail || shownN === 0 && avail === 0) { used += h; shownN++; } });
    kids.forEach((k, idx) => { k.hidden = idx >= shownN; });
    if (total > shownN) {
      let m = more; if (!m) { m = document.createElement('p'); m.className = 'more'; box.append(m); }
      m.hidden = false; m.textContent = `${total - shownN} more in Notion.`;
    } else if (more) more.hidden = true;
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
    const pgb = e.target.closest('[data-pg]');
    if (pgb) { const key = pgb.closest('[data-pager]').dataset.pager; state.page[key] += pgb.dataset.pg === 'next' ? 1 : -1; renderList(key); return; }
    const a = e.target.closest('[data-act]'); if (!a) return;
    if (a.dataset.act === 'complete') complete(a.dataset.id);
    else if (a.dataset.act === 'undo') undo(a.dataset.id);
  });

  if (typeof ResizeObserver === 'function' && FIT) {
    const ro = new ResizeObserver(() => { clearTimeout(ro.t); ro.t = setTimeout(() => { if (state.today) renderAll(); }, 120); });
    document.querySelectorAll('.card').forEach(c => ro.observe(c));
  }
  /* size guide (Sweep, Next 7 days and Quick add have a fixed natural height): inside the embed, it says how far to drag the bottom edge */
  if (FIT && shown.length === 1 && ['sweep', 'week', 'add'].includes(shown[0]) && params.get('guide') !== '0') (() => {
    const chip = document.createElement('div'); chip.id = 'fitchip'; chip.hidden = true; document.body.append(chip);
    let last = '', timer = null;
    const need = () => { const f = document.body.dataset.fit; document.body.dataset.fit = ''; const h = Math.ceil($('stage').getBoundingClientRect().height); if (f) document.body.dataset.fit = f; return h; };
    const check = () => {
      if (!state.today || document.hidden) return;
      const n = need(), have = window.innerHeight, d = have - n;
      const key = d < -6 ? 'short' : d > 60 ? 'tall' : 'ok';
      const sig = key + ':' + (key === 'ok' ? '' : d);
      if (sig === last) return;
      last = sig; clearTimeout(timer);
      chip.className = key; chip.hidden = false;
      chip.textContent = key === 'short' ? `Drag the bottom edge down about ${-d}px` : key === 'tall' ? `Drag the bottom edge up about ${d}px` : 'Perfect size';
      if (key === 'ok') timer = setTimeout(() => { chip.hidden = true; }, 3500);
    };
    window.addEventListener('resize', check); setInterval(check, 1500); setTimeout(check, 1400);
  })();
  if (has('add')) { initAdd(); loadMeta(); }
  refresh();
  setInterval(refresh, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  document.documentElement.addEventListener('pointerenter', () => { if (Date.now() - state.loadedAt > 8000) refresh(); });
})();
