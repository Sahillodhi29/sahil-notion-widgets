'use strict';
/* Learning widgets: one page, many pieces.
   /learning/index.html?key=KEY&w=today   -> just that widget
   w = today | focus | streak | topics | newtopic | newtask | all   (comma-separate to combine)
   Optional: &goal=20 (daily minutes goal for the streak widget), &sound=off (silent timer),
             &bg=transparent or &bg=HEX */
(() => {
  const API = '/api/learning';
  const params = new URLSearchParams(location.search);
  const KEY = params.get('key') || '';
  const GOAL = Math.max(1, parseInt(params.get('goal'), 10) || 20);
  const SOUND = (params.get('sound') || '').toLowerCase() !== 'off';
  const NEEDS = {
    today: ['tasks'], focus: ['topics', 'log'], streak: ['log'], topics: ['topics', 'log'],
    newtopic: ['topics', 'schema'], newtask: ['schema'],
  };
  const keyQ = sep => (KEY ? `${sep}key=${encodeURIComponent(KEY)}` : '');
  const $ = id => document.getElementById(id);
  const card = w => document.querySelector(`.card[data-w="${w}"]`);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

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
    b.innerHTML = '<div class="band"><h2>Unknown widget</h2></div><div class="body"><p class="dim">Use w=today, focus, streak, topics, newtopic, newtask or all.</p></div>';
  }
  const has = w => shown.includes(w);
  const need = [...new Set(shown.flatMap(w => NEEDS[w]))];

  const state = { today: null, topics: [], tasks: null, log: [], schema: null, err: {}, pending: 0, loadedAt: 0 };
  const ui = { tab: 'today', leaving: new Set(), open: null, tsort: 'recent' };

  /* ---------- helpers ---------- */
  const dayNum = d => Math.floor(Date.parse(d + 'T00:00:00Z') / 864e5);
  const addDay = (d, n) => new Date((dayNum(d) + n) * 864e5).toISOString().slice(0, 10);
  const since = d => (d && state.today ? dayNum(state.today) - dayNum(d) : Infinity);
  const ago = d => {
    if (!d) return 'not started';
    const n = since(d);
    if (n <= 0) return 'today';
    if (n === 1) return 'yesterday';
    if (n < 14) return `${n} days ago`;
    if (n < 60) return `${Math.round(n / 7)} weeks ago`;
    return `${Math.round(n / 30)} months ago`;
  };
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const fmtDate = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  const fmtShort = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  const fmtMin = m => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ' ' + (m % 60) + 'm' : ''}` : `${m}m`);
  const initial = s => (String(s).trim()[0] || '?').toUpperCase();
  const errText = e => e.message + (e.hint ? ' ' + e.hint : '');
  const monIdx = d => (new Date(d + 'T00:00:00Z').getUTCDay() + 6) % 7;      // Monday = 0
  const SVG = d => `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const CHECK = '<svg viewBox="0 0 12 12" fill="none" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 6.3l2.4 2.4 4.6-5"/></svg>';
  const ICON_BACK = SVG('<path d="M12 4l-6 6 6 6"/>');
  const shell = (w, title, extra = '') => { card(w).innerHTML = `<div class="band"><div><h2>${title}</h2><p class="sub" data-sub></p></div>${extra}</div><div class="body" data-body></div>`; };
  const body = w => card(w).querySelector('[data-body]');
  const setSub = (w, t) => { const e = card(w).querySelector('[data-sub]'); if (e) e.textContent = t; };

  /* Notion-hosted cover links expire after about an hour, so keep a working one for a while
     instead of swapping it (and flickering) on every refresh. */
  const picCache = new Map();
  function pic(r) {
    if (!r || !r.cover) return '';
    const stable = r.cover.split('?')[0], c = picCache.get(r.id);
    if (c && c.stable === stable && Date.now() - c.t < 40 * 60 * 1000) return c.url;
    picCache.set(r.id, { url: r.cover, stable, t: Date.now() });
    return r.cover;
  }
  document.addEventListener('error', e => {          // a cover that fails to load falls back to the initial
    const im = e.target;
    if (im && im.tagName === 'IMG' && im.dataset.ini) { const p = im.parentElement; im.remove(); if (p && !p.querySelector('.ini')) p.insertAdjacentHTML('afterbegin', `<span class="ini">${esc(im.dataset.ini)}</span>`); }
  }, true);

  /* ---------- feedback ---------- */
  function toast(msg, ms, action) {
    const t = $('toast');
    t.textContent = '';
    const s = document.createElement('span'); s.textContent = msg; t.append(s);
    t.classList.toggle('act', !!action);
    if (action) {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = action.label;
      b.addEventListener('click', () => { t.classList.remove('show'); action.fn(); });
      t.append(b);
    }
    t.classList.add('show');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => t.classList.remove('show'), ms || 3200);
  }

  /* ---------- network ---------- */
  async function post(bodyObj) {
    // Writes authenticate with the x-widget-key header (same as the Sail widget); ?key= only works for reads.
    const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-widget-key': KEY }, body: JSON.stringify(bodyObj) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) { const e = new Error(j.error || `HTTP ${r.status}`); e.hint = j.hint; throw e; }
    return j;
  }

  async function load() {
    const r = await fetch(`${API}?need=${need.join(',')}${keyQ('&')}`, { cache: 'no-store' });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || data.error) { const e = new Error(data.error || `Could not load the Learning Planner (HTTP ${r.status}).`); e.hint = data.hint; throw e; }
    state.today = data.today;
    if (data.topics) { if (data.topics.error) state.err.topics = data.topics; else { state.err.topics = null; state.topics = data.topics.rows; } }
    if (data.log) { if (data.log.error) state.err.log = data.log; else { state.err.log = null; state.log = data.log.rows; } }
    if (data.tasks) { if (data.tasks.error) state.err.tasks = data.tasks; else { state.err.tasks = null; state.tasks = data.tasks; } }
    if (data.schema) { if (data.schema.error) state.err.schema = data.schema; else { state.err.schema = null; state.schema = data.schema; } }
    state.loadedAt = Date.now();
  }

  function showBad(e) {
    const b = $('bad'); b.hidden = false;
    b.innerHTML = `<div class="band"><h2>Couldn't load</h2></div><div class="body"><p class="dim">${esc(e.message)}${e.hint ? ' ' + esc(e.hint) : ''}<br>Check the key in the link, then open /api/learning-health to see what's wrong.</p></div>`;
  }
  const secError = (k, what) => (state.err[k] ? `<p class="empty">Couldn't read ${what}: ${esc(state.err[k].error)}${state.err[k].hint ? ' ' + esc(state.err[k].hint) : ''}</p>` : '');

  async function refresh() {
    if (state.pending) return;
    try { await load(); renderAll(); }
    catch (e) { if (!state.today) showBad(e); }       // keep what's on screen if a background refresh fails
  }
  // Widgets in separate embeds stay in step through this channel (when the browser lets them share it).
  let bc = null; try { bc = new BroadcastChannel('learning-widgets'); bc.onmessage = () => setTimeout(refresh, 500); } catch (e) { /* not available in this sandbox */ }
  const announce = () => { if (bc) bc.postMessage('changed'); setTimeout(refresh, 800); };

  /* =========================================================
     STUDY SESSIONS (shared by Focus and Topics)
     ========================================================= */
  async function logSession(topicId, minutes, note) {
    const topic = state.topics.find(t => t.id === topicId);
    if (!topic) { toast('Pick a topic first.'); return false; }
    const tmp = { id: 'tmp-' + Date.now(), date: state.today, minutes, note: note || '', topic: topicId };
    state.log.push(tmp); state.pending++; renderLive();
    try {
      const res = await post({ action: 'session-log', topicId, minutes, note: note || undefined });
      tmp.id = res.id;
      toast(`Saved: ${topic.name}, ${minutes} min`, 8000, { label: 'Undo', fn: () => undoSession(res.id) });
      announce();
      return true;
    } catch (e) {
      const i = state.log.indexOf(tmp); if (i !== -1) state.log.splice(i, 1);
      renderLive(); toast(`Couldn't save: ${errText(e)}`, 8000);
      return false;
    } finally { state.pending--; }
  }
  async function undoSession(id) {
    const row = state.log.find(r => r.id === id);
    state.log = state.log.filter(r => r.id !== id); state.pending++; renderLive();
    try { await post({ action: 'session-delete', id }); announce(); }
    catch (e) { if (row) state.log.push(row); renderLive(); toast(`Couldn't undo: ${errText(e)}`, 8000); }
    finally { state.pending--; }
  }
  const minutesOn = d => state.log.filter(r => r.date === d).reduce((s, r) => s + r.minutes, 0);

  /* =========================================================
     TODAY'S STUDY
     ========================================================= */
  const dayLabel = d => { const n = dayNum(d) - dayNum(state.today); return n === 1 ? 'Tomorrow' : fmtShort(d); };

  function taskRow(t, kind) {
    const leaving = ui.leaving.has(t.id);
    const late = kind === 'today' && t.overdue ? `<span class="late">Overdue ${t.overdueDays}d</span>` : '';
    return `<div class="tk p-${esc(t.priority || 'none')}${leaving ? ' leaving' : ''}" data-id="${esc(t.id)}">
      <button type="button" class="chk" data-act="tick" aria-label="Mark done: ${esc(t.title)}">${CHECK}</button>
      <div><div class="tt">${esc(t.title)}</div><div class="tm">${t.category ? `<span class="cat">${esc(t.category)}</span>` : ''}${late}${t.recur ? '<span class="rep">Repeats</span>' : ''}</div></div>
      <span class="pri">${t.priority === 'High' ? 'High' : ''}</span></div>`;
  }

  function renderToday() {
    if (!has('today')) return;
    const root = card('today');
    if (!root.querySelector('[data-body]')) shell('today', "Today's study");
    const b = body('today');
    if (state.err.tasks) { b.innerHTML = secError('tasks', 'your tasks'); return; }
    const T = state.tasks;
    if (!T) return;
    setSub('today', state.today ? fmtDate(state.today) : '');
    const done = T.doneToday, total = T.total, C = 2 * Math.PI * 34;
    const frac = total ? Math.min(1, done / total) : 1;
    const head = !total ? 'Nothing due today' : done >= total ? 'All done. Nice.' : `${plural(total - done, 'task', 'tasks')} to go`;
    const list = ui.tab === 'today' ? T.items : ui.tab === 'week' ? T.week : T.someday;
    let rows;
    if (ui.tab === 'week') {
      const groups = new Map();
      list.forEach(t => { if (!groups.has(t.due)) groups.set(t.due, []); groups.get(t.due).push(t); });
      rows = list.length ? [...groups].map(([d, ts]) => `<div class="dayhead">${esc(dayLabel(d))}<span>${plural(ts.length, 'task', 'tasks')}</span></div>${ts.map(t => taskRow(t, 'week')).join('')}`).join('') : '<p class="empty">Nothing planned for the next 7 days.</p>';
    } else {
      rows = list.length ? list.map(t => taskRow(t, ui.tab)).join('') : `<p class="empty">${ui.tab === 'today' ? 'Nothing due. A good day to start something new.' : 'No undated tasks.'}</p>`;
    }
    const more = ui.tab === 'someday' && T.somedayTotal > T.someday.length ? `<p class="hint" style="margin-top:10px">Showing ${T.someday.length} of ${T.somedayTotal}.</p>` : '';
    b.innerHTML = `
      <div class="td-top"><div class="ring"><svg viewBox="0 0 84 84"><circle class="track" cx="42" cy="42" r="34"/><circle class="arc" cx="42" cy="42" r="34" style="stroke-dasharray:${C.toFixed(1)};stroke-dashoffset:${(C * (1 - frac)).toFixed(1)}"/></svg><div class="mid num">${done}</div></div>
        <div><div class="big">${done} of ${total} done</div><p class="hint">${esc(head)}</p></div></div>
      <div class="tabs" role="tablist">${[['today', 'Today', T.items.length], ['week', 'This week', T.week.length], ['someday', 'Someday', T.somedayTotal]].map(([k, l, n]) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${ui.tab === k}">${l}${n ? `<small>${n}</small>` : ''}</button>`).join('')}</div>
      <div>${rows}${more}</div>`;
  }

  function findTask(id) {
    const T = state.tasks;
    for (const k of ['items', 'week', 'someday']) { const t = T[k].find(x => x.id === id); if (t) return { t, k }; }
    return null;
  }
  async function tickTask(id) {
    const f = findTask(id);
    if (!f || ui.leaving.has(id)) return;
    const T = state.tasks, { t, k } = f;
    ui.leaving.add(id); renderToday();
    let removed = false;
    const timer = setTimeout(() => {
      removed = true; T[k] = T[k].filter(x => x.id !== id); T.doneToday++; if (k !== 'items') T.total++;
      ui.leaving.delete(id); renderToday();
    }, 450);
    state.pending++;
    try {
      const res = await post({ action: 'task-complete', id });
      toast(res.rolled ? `Done. Next one is due ${fmtShort(res.nextDue)}.` : `Done: ${t.title}`, 7000, { label: 'Undo', fn: () => undoTask(id, res.prev, t, k) });
      announce();
    } catch (e) {
      clearTimeout(timer);
      if (removed) { T[k].push(t); T[k].sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999')); T.doneToday--; if (k !== 'items') T.total--; }
      ui.leaving.delete(id); renderToday(); toast(`Couldn't save: ${errText(e)}`, 8000);
    } finally { state.pending--; }
  }
  async function undoTask(id, prev, t, k) {
    const T = state.tasks;
    if (!T[k].some(x => x.id === id)) { T[k].push(t); if (T.doneToday > 0) T.doneToday--; if (k !== 'items') T.total = Math.max(0, T.total - 1); }
    state.pending++; renderToday();
    try { await post({ action: 'task-restore', id, prev }); announce(); }
    catch (e) { toast(`Couldn't undo: ${errText(e)}`, 8000); }
    finally { state.pending--; }
  }

  /* =========================================================
     FOCUS TIMER
     ========================================================= */
  const FKEY = 'learn-focus-v1';
  const CIRC = 553;
  const fs = { topicId: null, minutes: 25, run: null };      // run: { topicId, minutes, endAt, pausedLeft }
  try { const s = JSON.parse(localStorage.getItem(FKEY) || 'null'); if (s) { fs.topicId = s.topicId || null; fs.minutes = s.minutes || 25; fs.run = s.run || null; } } catch (e) { /* storage not available here */ }
  const saveFs = () => { try { localStorage.setItem(FKEY, JSON.stringify(fs)); } catch (e) { /* storage not available here */ } };
  const remaining = () => (!fs.run ? 0 : fs.run.pausedLeft != null ? fs.run.pausedLeft : Math.max(0, fs.run.endAt - Date.now()));
  const mmss = ms => { const s = Math.ceil(ms / 1000); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
  let tickTimer = null;

  function chime() {
    if (!SOUND) return;
    try {
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      [660, 880].forEach((f, i) => {
        const o = ac.createOscillator(), g = ac.createGain(), t0 = ac.currentTime + i * .2;
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(.0001, t0); g.gain.exponentialRampToValueAtTime(.18, t0 + .03); g.gain.exponentialRampToValueAtTime(.0001, t0 + .55);
        o.connect(g); g.connect(ac.destination); o.start(t0); o.stop(t0 + .6);
      });
    } catch (e) { /* no audio here */ }
  }

  function renderFocus() {
    if (!has('focus')) return;
    const root = card('focus');
    if (!root.querySelector('[data-body]')) shell('focus', 'Focus');
    const b = body('focus');
    if (state.err.topics) { b.innerHTML = secError('topics', 'your topics'); return; }
    const run = fs.run, running = run && run.pausedLeft == null, paused = run && run.pausedLeft != null;
    const topic = state.topics.find(t => t.id === (run ? run.topicId : fs.topicId));
    setSub('focus', run ? (topic ? topic.name : 'Studying') : 'Pick a topic, start the clock');
    const total = run ? run.minutes : fs.minutes;
    const todayMin = minutesOn(state.today), todayN = state.log.filter(r => r.date === state.today).length;
    b.innerHTML = `<div class="fc-body">
      ${run ? '' : `<div class="opts scroll" role="group" aria-label="Topic">${state.topics.length ? state.topics.map(t => `<button type="button" class="opt" data-act="topic" data-id="${esc(t.id)}" aria-pressed="${t.id === fs.topicId}">${esc(t.name)}</button>`).join('') : '<span class="hint">Add a topic first, then come back.</span>'}</div>`}
      <div class="fc-ring${running ? ' run' : ''}"><svg viewBox="0 0 200 200"><circle class="track" cx="100" cy="100" r="88"/><circle class="arc" id="fcArc" cx="100" cy="100" r="88"/></svg>
        <div class="mid"><div class="fc-time num" id="fcTime">${mmss((run ? remaining() : total * 60000))}</div><div class="fc-of">${run ? (paused ? 'paused' : 'focusing') : 'of ' + total + ' min'}</div></div></div>
      ${run ? '' : `<div class="fc-dur"><button type="button" class="icon-btn" data-act="less" aria-label="5 minutes less">&minus;</button>${[15, 25, 45, 60].map(m => `<button type="button" class="opt" data-act="dur" data-m="${m}" aria-pressed="${m === fs.minutes}">${m}</button>`).join('')}<button type="button" class="icon-btn" data-act="more" aria-label="5 minutes more">+</button></div>`}
      <div class="fc-row">${!run ? '<button type="button" class="btn hot big" data-act="start">Start focus</button>'
        : `<button type="button" class="btn" data-act="${paused ? 'resume' : 'pause'}">${paused ? 'Resume' : 'Pause'}</button><button type="button" class="btn hot" data-act="finish">Finish and save</button><button type="button" class="link" data-act="cancel">Cancel</button>`}</div>
      <p class="fc-note">${todayMin ? `Today: <b>${fmtMin(todayMin)}</b> in ${plural(todayN, 'session', 'sessions')}` : 'No study logged yet today.'}</p></div>`;
    paintTimer();
    clearInterval(tickTimer);
    if (running) tickTimer = setInterval(tick, 250);
  }
  function paintTimer() {
    const arc = $('fcArc'), tm = $('fcTime');
    if (!arc || !tm) return;
    const total = fs.run ? fs.run.minutes * 60000 : fs.minutes * 60000;
    const left = fs.run ? remaining() : total;
    arc.style.strokeDashoffset = String(CIRC * (fs.run ? left / total : 1));
    tm.textContent = mmss(left);
    document.title = fs.run && fs.run.pausedLeft == null ? `${mmss(left)} Focus` : 'Learning widgets';
  }
  function tick() { if (!fs.run || fs.run.pausedLeft != null) return; if (remaining() <= 0) completeRun(); else paintTimer(); }

  async function completeRun() {
    const run = fs.run; if (!run) return;
    clearInterval(tickTimer); fs.run = null; saveFs(); chime(); document.title = 'Learning widgets';
    renderFocus();
    await logSession(run.topicId, run.minutes, '');
  }
  async function finishEarly() {
    const run = fs.run; if (!run) return;
    const elapsed = Math.floor((run.minutes * 60000 - remaining()) / 60000);
    clearInterval(tickTimer); fs.run = null; saveFs(); document.title = 'Learning widgets'; renderFocus();
    if (elapsed < 1) { toast('Less than a minute, so nothing was saved.'); return; }
    await logSession(run.topicId, elapsed, '');
  }
  function startRun() {
    if (!fs.topicId || !state.topics.some(t => t.id === fs.topicId)) { toast('Pick a topic first.'); return; }
    fs.run = { topicId: fs.topicId, minutes: fs.minutes, endAt: Date.now() + fs.minutes * 60000, pausedLeft: null };
    saveFs(); renderFocus();
  }
  function onFocusClick(e) {
    const t = e.target.closest('[data-act]'); if (!t) return;
    const a = t.dataset.act;
    if (a === 'topic') { fs.topicId = t.dataset.id; saveFs(); renderFocus(); }
    else if (a === 'dur') { fs.minutes = +t.dataset.m; saveFs(); renderFocus(); }
    else if (a === 'less') { fs.minutes = Math.max(5, fs.minutes - 5); saveFs(); renderFocus(); }
    else if (a === 'more') { fs.minutes = Math.min(180, fs.minutes + 5); saveFs(); renderFocus(); }
    else if (a === 'start') startRun();
    else if (a === 'pause') { fs.run.pausedLeft = remaining(); saveFs(); renderFocus(); }
    else if (a === 'resume') { fs.run.endAt = Date.now() + fs.run.pausedLeft; fs.run.pausedLeft = null; saveFs(); renderFocus(); }
    else if (a === 'finish') finishEarly();
    else if (a === 'cancel') { fs.run = null; saveFs(); document.title = 'Learning widgets'; renderFocus(); }
  }

  /* =========================================================
     STREAK
     ========================================================= */
  function renderStreak() {
    if (!has('streak')) return;
    const root = card('streak');
    if (!root.querySelector('[data-body]')) shell('streak', 'Streak');
    const b = body('streak');
    if (state.err.log) { b.innerHTML = secError('log', 'your study log'); return; }
    if (!state.today) return;
    const by = new Map();
    state.log.forEach(r => by.set(r.date, (by.get(r.date) || 0) + r.minutes));
    const has1 = d => (by.get(d) || 0) > 0;
    let d = state.today; if (!has1(d)) d = addDay(d, -1);
    let current = 0; while (has1(d)) { current++; d = addDay(d, -1); }
    let best = 0, run = 0;
    for (let i = 119; i >= 0; i--) { if (has1(addDay(state.today, -i))) { run++; best = Math.max(best, run); } else run = 0; }
    const weekStart = addDay(state.today, -monIdx(state.today));
    const week = Array.from({ length: 7 }, (_, i) => { const dd = addDay(weekStart, i); return { d: dd, m: dd > state.today ? 0 : by.get(dd) || 0, fut: dd > state.today }; });
    const weekTotal = week.reduce((s, x) => s + x.m, 0), goalDays = week.filter(x => x.m >= GOAL).length;
    const scale = Math.max(GOAL * 1.5, ...week.map(x => x.m), 1);
    const todayMin = by.get(state.today) || 0;
    setSub('streak', todayMin ? `${fmtMin(todayMin)} today` : 'Nothing yet today');
    const lvl = m => (m >= GOAL ? 'l3' : m >= GOAL / 2 ? 'l2' : m > 0 ? 'l1' : '');
    const start = addDay(weekStart, -7 * 11);
    const cells = Array.from({ length: 84 }, (_, i) => { const dd = addDay(start, i); const fut = dd > state.today; return `<i class="hc ${fut ? 'fut' : lvl(by.get(dd) || 0)}${dd === state.today ? ' today' : ''}" title="${esc(fmtShort(dd))}${fut ? '' : ': ' + (by.get(dd) || 0) + ' min'}"></i>`; }).join('');
    b.innerHTML = `
      <div class="st-top"><div class="st-big"><span class="big">${current}</span><span class="lab">${current === 1 ? 'day' : 'days'} in a row</span></div>
        <div class="st-facts"><span>Best <b class="num">${best}</b> ${best === 1 ? 'day' : 'days'}</span><span>This week <b class="num">${fmtMin(weekTotal)}</b></span><span>Goal days <b class="num">${goalDays}</b> of 7</span></div></div>
      <div class="wk">${week.map((x, i) => `<div class="col${x.d === state.today ? ' today' : ''}"><span class="bar ${x.m === 0 ? 'zero' : x.m < GOAL ? 'low' : ''}" style="height:${x.fut ? 0 : Math.max(4, Math.round(x.m / scale * 100))}%" title="${esc(fmtShort(x.d))}: ${x.m} min"></span><span class="d">${'MTWTFSS'[i]}</span></div>`).join('')}
        <div class="goal-line" style="bottom:${Math.round(GOAL / scale * 100) * 0.78 + 22}%"></div></div>
      <div class="heat" aria-label="Last 12 weeks">${cells}</div>
      <div class="legend"><span>Last 12 weeks. A streak counts any day you studied.</span><span class="keys">Less <i style="background:var(--plum)"></i><i style="background:var(--berry)"></i><i style="background:var(--orchid)"></i><i style="background:var(--fuch)"></i> Goal (${GOAL} min)</span></div>`;
  }

  /* =========================================================
     TOPICS
     ========================================================= */
  function topicStats(id) {
    const rows = state.log.filter(r => r.topic === id);
    const total = rows.reduce((s, r) => s + r.minutes, 0);
    const last = rows.reduce((m, r) => (r.date > m ? r.date : m), '');
    return { rows, total, sessions: rows.length, last: last || null };
  }
  function tileHtml(t) {
    const s = topicStats(t.id);
    const cover = t.cover ? `<img src="${esc(pic(t))}" alt="" loading="lazy" referrerpolicy="no-referrer" data-ini="${esc(initial(t.name))}">` : `<span class="ini">${esc(initial(t.name))}</span>`;
    const live = s.last && since(s.last) <= 7;
    return `<button type="button" class="tile" data-act="open" data-id="${esc(t.id)}">${cover}${t.tags[0] ? `<span class="tg">${esc(t.tags[0])}</span>` : ''}${live ? '<span class="live" title="Studied this week"></span>' : ''}
      <span class="tx"><span class="nm">${esc(t.name)}</span><span class="mt">${s.total ? esc(fmtMin(s.total)) + ', ' + esc(ago(s.last)) : 'Not started yet'}</span></span></button>`;
  }

  function renderTopics() {
    if (!has('topics')) return;
    const root = card('topics');
    if (!root.querySelector('[data-body]')) shell('topics', 'Topics');
    const b = body('topics');
    if (state.err.topics) { b.innerHTML = secError('topics', 'your topics'); return; }
    const open = ui.open && state.topics.find(t => t.id === ui.open);
    if (ui.open && !open) ui.open = null;
    if (document.activeElement && b.contains(document.activeElement) && /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) {   // don't rebuild while typing a note
      const sc = card('topics').querySelector('[data-sub]'); if (sc) setSub('topics', open ? 'Log a session' : plural(state.topics.length, 'thing', 'things') + ' to learn'); return;
    }
    if (open) return renderTopicDetail(b, open);
    setSub('topics', state.topics.length ? `${plural(state.topics.length, 'thing', 'things')} to learn` : 'Your list of skills');
    const list = state.topics.slice().sort(ui.tsort === 'az' ? (a, c) => a.name.localeCompare(c.name)
      : (a, c) => (topicStats(c.id).last || '').localeCompare(topicStats(a.id).last || '') || a.name.localeCompare(c.name));
    b.innerHTML = `<div class="tabs" role="tablist">${[['recent', 'Recent'], ['az', 'A to Z']].map(([k, l]) => `<button type="button" role="tab" data-act="sort" data-k="${k}" aria-selected="${ui.tsort === k}">${l}</button>`).join('')}<span class="key"><i></i>Studied this week</span></div>
      <div class="tgrid">${list.length ? list.map(tileHtml).join('') : '<p class="empty" style="grid-column:1/-1">No topics yet. Add one with the New topic widget.</p>'}</div>`;
  }

  function renderTopicDetail(b, t) {
    const s = topicStats(t.id);
    setSub('topics', 'Log a session');
    const cover = t.cover ? `<img src="${esc(pic(t))}" alt="" referrerpolicy="no-referrer" data-ini="${esc(initial(t.name))}">` : `<span class="ini">${esc(initial(t.name))}</span>`;
    const recent = s.rows.slice().sort((a, c) => c.date.localeCompare(a.date)).slice(0, 6);
    b.innerHTML = `<div class="td">
      <div class="back"><button type="button" class="icon-btn" data-act="back" aria-label="Back to topics">${ICON_BACK}</button>${t.tags.length ? `<div class="opts">${t.tags.map(g => `<span class="opt" style="pointer-events:none">${esc(g)}</span>`).join('')}</div>` : ''}</div>
      <div class="td-hero">${cover}<h3>${esc(t.name)}</h3></div>
      <div class="facts"><div><span class="num">${s.total ? esc(fmtMin(s.total)) : '0m'}</span><span class="lab">last 4 months</span></div><div><span class="num">${s.sessions}</span><span class="lab">${s.sessions === 1 ? 'session' : 'sessions'}</span></div><div><span class="num" style="font-size:20px;line-height:1.3">${esc(ago(s.last))}</span><span class="lab">last studied</span></div></div>
      <div class="logbox"><span class="lab">Log a session</span>
        <div class="row">${[10, 15, 25, 45].map(m => `<button type="button" class="opt" data-act="mins" data-m="${m}">${m}</button>`).join('')}<input class="field slim mins" type="number" min="1" max="720" inputmode="numeric" placeholder="min" data-mins aria-label="Minutes"></div>
        <input class="field slim" type="text" maxlength="300" placeholder="Note (optional)" data-note aria-label="Note">
        <div class="row"><button type="button" class="btn hot" data-act="save">Save session</button></div></div>
      ${recent.length ? `<div><span class="lab2">Recent sessions</span>${recent.map(r => `<div class="sess"><span class="d">${esc(fmtShort(r.date))}</span><span class="n">${esc(r.note || '')}</span><b>${r.minutes} min</b></div>`).join('')}</div>` : ''}</div>`;
  }

  function onTopicsClick(e) {
    const t = e.target.closest('[data-act]'); if (!t) return;
    const a = t.dataset.act;
    if (a === 'open') { ui.open = t.dataset.id; renderTopics(); body('topics').scrollTop = 0; }
    else if (a === 'back') { ui.open = null; renderTopics(); }
    else if (a === 'sort') { ui.tsort = t.dataset.k; renderTopics(); }
    else if (a === 'mins') { const i = body('topics').querySelector('[data-mins]'); i.value = t.dataset.m; body('topics').querySelectorAll('[data-act="mins"]').forEach(x => x.setAttribute('aria-pressed', x === t)); }
    else if (a === 'save') {
      const b = body('topics'), mins = parseInt(b.querySelector('[data-mins]').value, 10), note = b.querySelector('[data-note]').value.trim();
      if (!(mins >= 1 && mins <= 720)) { b.querySelector('[data-mins]').focus(); toast('How many minutes? Pick one or type it.'); return; }
      const id = ui.open;
      logSession(id, mins, note);
      b.querySelector('[data-mins]').value = ''; b.querySelector('[data-note]').value = '';
    }
  }

  /* =========================================================
     FORMS: New topic, New task (short steps)
     ========================================================= */
  const WZ = {};
  function buildWizard(w, cfg) {
    const root = card(w);
    root.classList.add('wiz');
    root.innerHTML = `<div class="band"><div><h2>${esc(cfg.title)}</h2><p class="sub" data-st></p></div><div class="prog" aria-hidden="true">${cfg.steps.map(() => '<i></i>').join('')}</div></div>
      <div class="body"><div class="wbody"></div><p class="fmsg" data-msg></p><div class="wfoot"><button type="button" class="link" data-back>Back</button><span class="grow"></span><button type="button" class="link" data-now>Save now</button><button type="button" class="btn hot" data-next>Next</button></div></div>`;
    const Z = { w, cfg, root, step: 0, vals: cfg.init(), session: 0 };
    WZ[w] = Z;
    wzRender(Z);
    root.addEventListener('click', e => {
      const t = e.target.closest('button'); if (!t || !root.contains(t)) return;
      if (t.matches('[data-next]')) return wzNext(Z);
      if (t.matches('[data-now]')) return wzSubmit(Z);
      if (t.matches('[data-back]')) { if (Z.step > 0) { Z.step--; wzRender(Z); } return; }
      cfg.click(Z, t);
    });
    root.addEventListener('input', e => cfg.input(Z, e.target));
    root.addEventListener('keydown', e => {
      if (e.key !== 'Enter' || !e.target.matches('input')) return;
      e.preventDefault();
      if (cfg.key && cfg.key(Z, e.target)) return;
      wzNext(Z);
    });
  }
  function wzRender(Z, animate = true) {
    const st = Z.cfg.steps[Z.step], b = Z.root.querySelector('.wbody');
    b.innerHTML = st.html(Z);
    if (animate) { b.classList.remove('swap'); void b.offsetWidth; b.classList.add('swap'); }
    Z.root.querySelector('[data-st]').textContent = st.title;
    Z.root.querySelectorAll('.prog i').forEach((el, i) => el.classList.toggle('on', i <= Z.step));
    wzFooter(Z);
    const f = b.querySelector('input.name-input'); if (f && Z.step === 0 && Z.session) f.focus();
  }
  function wzFooter(Z) {
    const last = Z.step === Z.cfg.steps.length - 1;
    Z.root.querySelector('[data-back]').hidden = Z.step === 0;
    Z.root.querySelector('[data-now]').hidden = Z.step === 0 || last || !Z.cfg.ready(Z);
    Z.root.querySelector('[data-next]').textContent = last ? Z.cfg.saveLabel : 'Next';
  }
  function wzMsg(Z, text, warn) { const m = Z.root.querySelector('[data-msg]'); m.textContent = text; m.classList.toggle('warn', !!warn); }
  function wzNext(Z) {
    if (!Z.cfg.ready(Z)) {
      if (Z.step !== 0) { Z.step = 0; wzRender(Z); }
      const f = Z.root.querySelector('.fld'); if (f) { f.classList.remove('bad'); void f.offsetWidth; f.classList.add('bad'); const i = f.querySelector('input'); if (i) i.focus(); }
      wzMsg(Z, 'Give it a name first.', true); return;
    }
    if (Z.step < Z.cfg.steps.length - 1) { Z.step++; wzRender(Z); } else wzSubmit(Z);
  }
  async function wzSubmit(Z) {
    if (!Z.cfg.ready(Z)) return wzNext(Z);
    const keep = Z.step, undo = Z.cfg.optimistic(Z);
    const snapshot = JSON.parse(JSON.stringify(Z.vals));
    Z.session++; Z.cfg.reset(Z); Z.step = 0; wzRender(Z); wzMsg(Z, `${Z.session} added this session`, false); renderLive();
    state.pending++;
    try { const msg = await Z.cfg.submit(snapshot); toast(msg); announce(); }
    catch (e) { undo(); Z.vals = snapshot; Z.session--; Z.step = keep; wzRender(Z); wzMsg(Z, '', false); renderLive(); toast(`Couldn't save: ${errText(e)}`, 8000); }
    finally { state.pending--; }
  }

  /* ----- New topic ----- */
  const knownTags = Z => {
    const s = new Set([...(state.schema && state.schema.topic && state.schema.topic.Tags ? state.schema.topic.Tags.options : []), ...state.topics.flatMap(t => t.tags), ...Z.vals.tags]);
    return [...s].sort((a, b) => a.localeCompare(b));
  };
  function checkCover(Z) {
    const c = Z.vals.cover, token = ++c.token, url = c.url.trim();
    const paintCover = () => {
      const pv = Z.root.querySelector('[data-pv]'), m = Z.root.querySelector('[data-pfmsg]'); if (!pv || !m) return;
      pv.classList.toggle('has', !!c.preview); pv.innerHTML = c.preview ? `<img src="${esc(c.preview)}" alt="">` : 'Paste an image link below';
      m.textContent = c.msg; m.className = 'pf-msg ' + c.cls;
    };
    c.preview = ''; c.cls = '';
    if (!url) { c.msg = ''; paintCover(); return; }
    if (!/^https:\/\//i.test(url)) { c.msg = 'The link has to start with https://'; c.cls = 'warn'; paintCover(); return; }
    c.msg = 'Checking the link...'; paintCover();
    const im = new Image(); im.referrerPolicy = 'no-referrer';
    im.onload = () => { if (c.token !== token) return; c.preview = url; c.msg = 'Looks good'; c.cls = 'ok'; paintCover(); };
    im.onerror = () => { if (c.token !== token) return; c.msg = "That link isn't a picture the widget can show. Paste the direct image address (right-click the photo, then Copy image address)."; c.cls = 'warn'; paintCover(); };
    im.src = url;
  }
  const topicCfg = {
    title: 'New topic', saveLabel: 'Save topic',
    init: () => ({ name: '', tags: [], cover: { url: '', preview: '', msg: '', cls: '', token: 0 } }),
    ready: Z => Z.vals.name.trim().length > 0,
    steps: [
      { title: 'The topic', html: Z => `<div class="fgrid"><div class="fld"><label class="lab" for="nt-name">What do you want to learn?</label><input id="nt-name" class="name-input" data-in="name" value="${esc(Z.vals.name)}" placeholder="e.g. Public speaking" maxlength="200" autocomplete="off"></div></div>` },
      { title: 'Tags', html: Z => { const k = knownTags(Z); return `<div class="fgrid"><div class="fld"><span class="lab">Tags (optional)</span><div class="opts">${k.length ? k.map(t => `<button type="button" class="opt" data-act="tag" data-t="${esc(t)}" aria-pressed="${Z.vals.tags.includes(t)}">${esc(t)}</button>`).join('') : '<span class="hint">No tags yet. Make the first one below.</span>'}</div></div>
        <div class="fld"><span class="lab">Make a new one</span><div class="addtag"><input class="field slim" data-tag-in placeholder="e.g. Creative" maxlength="40" aria-label="New tag"><button type="button" class="btn sm hot" data-act="addtag">Add</button></div></div></div>`; } },
      { title: 'Cover', html: Z => { const c = Z.vals.cover; return `<div class="fgrid"><div class="fld"><span class="lab">Cover image (optional)</span><div class="pv${c.preview ? ' has' : ''}" data-pv>${c.preview ? `<img src="${esc(c.preview)}" alt="">` : 'Paste an image link below'}</div>
        <input class="field slim" type="url" data-cover placeholder="https://..." value="${esc(c.url)}" maxlength="1900" autocomplete="off" aria-label="Cover image link"><p class="pf-msg ${c.cls}" data-pfmsg>${esc(c.msg)}</p></div></div>`; } },
    ],
    click(Z, t) {
      if (t.dataset.act === 'tag') { const g = t.dataset.t, i = Z.vals.tags.indexOf(g); if (i === -1) Z.vals.tags.push(g); else Z.vals.tags.splice(i, 1); t.setAttribute('aria-pressed', i === -1); }
      else if (t.dataset.act === 'addtag') topicCfg.key(Z, Z.root.querySelector('[data-tag-in]'));
    },
    key(Z, input) {
      if (!input.matches('[data-tag-in]')) return false;
      const v = input.value.trim().replace(/,/g, ' ').slice(0, 40);
      if (v && !Z.vals.tags.some(x => x.toLowerCase() === v.toLowerCase()) && Z.vals.tags.length < 8) Z.vals.tags.push(v);
      wzRender(Z, false); const n = Z.root.querySelector('[data-tag-in]'); if (n) n.focus();
      return true;
    },
    input(Z, el) {
      if (el.dataset.in === 'name') {
        Z.vals.name = el.value; const f = el.closest('.fld'); if (f) f.classList.remove('bad');
        const dup = state.topics.find(t => t.name.toLowerCase() === el.value.trim().toLowerCase());
        wzMsg(Z, dup ? `You already have "${dup.name}".` : Z.session ? `${Z.session} added this session` : '', !!dup); wzFooter(Z);
      } else if (el.dataset.cover !== undefined) {
        Z.vals.cover.url = el.value; clearTimeout(checkCover.t); checkCover.t = setTimeout(() => checkCover(Z), 450);
      }
    },
    optimistic(Z) {
      const tmp = { id: 'tmp-' + Date.now(), name: Z.vals.name.trim(), tags: Z.vals.tags.slice(), cover: Z.vals.cover.preview || '', created: new Date().toISOString() };
      state.topics.push(tmp);
      return () => { const i = state.topics.indexOf(tmp); if (i !== -1) state.topics.splice(i, 1); };
    },
    reset(Z) { Z.vals = { name: '', tags: [], cover: { url: '', preview: '', msg: '', cls: '', token: Z.vals.cover.token + 1 } }; },
    async submit(v) {
      const cover = /^https:\/\//i.test(v.cover.url.trim()) ? v.cover.url.trim() : undefined;
      await post({ action: 'topic-create', name: v.name.trim(), tags: v.tags, cover });
      return `Topic added: ${v.name.trim()}`;
    },
  };

  /* ----- New task ----- */
  const unitLabel = u => (u === 'Quaters' ? 'Quarters' : u);
  const taskOpts = k => (state.schema && state.schema.task && state.schema.task[k] ? state.schema.task[k].options : []);
  const taskCfg = {
    title: 'New task', saveLabel: 'Save task',
    init: () => ({ name: '', category: taskOpts('Category').includes('Skill') ? 'Skill' : '', priority: taskOpts('Priority').includes('Medium') ? 'Medium' : '', dueDate: state.today || '', repeat: 'none', interval: 1, unit: '' }),
    ready: Z => Z.vals.name.trim().length > 0,
    steps: [
      { title: 'The task', html: Z => `<div class="fgrid"><div class="fld"><label class="lab" for="nk-name">What needs doing?</label><input id="nk-name" class="name-input" data-in="name" value="${esc(Z.vals.name)}" placeholder="e.g. Practise 15 minutes" maxlength="200" autocomplete="off"></div>
        <div class="fld"><span class="lab">Category</span><div class="opts scroll" role="group" aria-label="Category">${taskOpts('Category').map(o => `<button type="button" class="opt" data-act="cat" data-o="${esc(o)}" aria-pressed="${Z.vals.category === o}">${esc(o)}</button>`).join('')}</div></div></div>` },
      { title: 'When', html: Z => {
        const q = [['Today', 0], ['Tomorrow', 1], ['In 3 days', 3], ['Next week', 7]].map(([l, n]) => [l, addDay(state.today, n)]);
        return `<div class="fgrid"><div class="fld"><span class="lab">Due</span><div class="opts" role="group" aria-label="Due">${q.map(([l, d]) => `<button type="button" class="opt" data-act="due" data-d="${d}" aria-pressed="${Z.vals.dueDate === d}">${l}</button>`).join('')}<button type="button" class="opt" data-act="due" data-d="" aria-pressed="${Z.vals.dueDate === ''}">No date</button></div>
          <input class="field slim" type="date" data-in="dueDate" value="${esc(Z.vals.dueDate)}" aria-label="Pick a date"></div>
          <div class="fld"><span class="lab">Priority</span><div class="opts" role="group" aria-label="Priority">${taskOpts('Priority').map(o => `<button type="button" class="opt" data-act="pri" data-o="${esc(o)}" aria-pressed="${Z.vals.priority === o}">${esc(o)}</button>`).join('')}</div></div></div>`; } },
      { title: 'Repeat', html: Z => {
        const units = taskOpts('Recur Unit');
        const base = [['none', 'No repeat', true], ['day', 'Every day', units.includes('Days')], ['week', 'Every week', units.includes('Weeks')], ['month', 'Every month', units.includes('Months')], ['custom', 'Custom', units.length > 0]].filter(x => x[2]);
        return `<div class="fgrid"><div class="fld"><span class="lab">Repeat</span><div class="opts" role="group" aria-label="Repeat">${base.map(([k, l]) => `<button type="button" class="opt" data-act="rep" data-k="${k}" aria-pressed="${Z.vals.repeat === k}">${l}</button>`).join('')}</div></div>
          ${Z.vals.repeat === 'custom' ? `<div class="fld"><span class="lab">Every</span><input class="field slim" style="max-width:120px" type="number" min="1" max="365" data-in="interval" value="${esc(Z.vals.interval)}" aria-label="Repeat every"><div class="opts" role="group" aria-label="Unit">${units.map(u => `<button type="button" class="opt" data-act="unit" data-o="${esc(u)}" aria-pressed="${Z.vals.unit === u}">${esc(unitLabel(u))}</button>`).join('')}</div></div>` : ''}
          ${Z.vals.repeat !== 'none' ? '<p class="hint">A repeating task needs a due date, so it will start today if you chose no date.</p>' : ''}</div>`; } },
    ],
    click(Z, t) {
      const a = t.dataset.act, v = Z.vals;
      if (a === 'cat') { v.category = v.category === t.dataset.o ? '' : t.dataset.o; wzRender(Z, false); }
      else if (a === 'due') { v.dueDate = t.dataset.d; wzRender(Z, false); }
      else if (a === 'pri') { v.priority = v.priority === t.dataset.o ? '' : t.dataset.o; wzRender(Z, false); }
      else if (a === 'rep') { v.repeat = t.dataset.k; if (v.repeat === 'custom' && !v.unit) v.unit = taskOpts('Recur Unit').includes('Days') ? 'Days' : taskOpts('Recur Unit')[0]; wzRender(Z, false); }
      else if (a === 'unit') { v.unit = t.dataset.o; wzRender(Z, false); }
    },
    input(Z, el) {
      if (el.dataset.in === 'name') { Z.vals.name = el.value; const f = el.closest('.fld'); if (f) f.classList.remove('bad'); wzFooter(Z); }
      else if (el.dataset.in === 'dueDate') { Z.vals.dueDate = el.value; el.closest('.fld').querySelectorAll('[data-act="due"]').forEach(b => b.setAttribute('aria-pressed', b.dataset.d === el.value)); }
      else if (el.dataset.in === 'interval') Z.vals.interval = el.value;
    },
    payload(v) {
      const p = { action: 'task-create', name: v.name.trim(), category: v.category || undefined, priority: v.priority || undefined, due: v.dueDate || undefined };
      const map = { day: [1, 'Days'], week: [1, 'Weeks'], month: [1, 'Months'] };
      if (v.repeat === 'custom') { p.interval = parseInt(v.interval, 10) || 1; p.unit = v.unit; }
      else if (map[v.repeat]) { p.interval = map[v.repeat][0]; p.unit = map[v.repeat][1]; }
      if (p.interval && !p.due) p.due = state.today;
      return p;
    },
    optimistic(Z) {
      const p = taskCfg.payload(Z.vals), T = state.tasks;
      if (!T) return () => {};
      const t = { id: 'tmp-' + Date.now(), title: p.name, due: p.due || null, priority: p.priority || null, category: p.category || null, recur: !!p.interval };
      let k;
      if (!t.due) k = 'someday'; else if (t.due <= state.today) { k = 'items'; t.overdue = t.due < state.today; t.overdueDays = t.overdue ? dayNum(state.today) - dayNum(t.due) : 0; } else if (t.due <= addDay(state.today, 7)) k = 'week'; else k = null;
      if (k) { T[k].push(t); if (k === 'items') T.total++; if (k === 'someday') T.somedayTotal++; }
      return () => { if (k) { const i = T[k].indexOf(t); if (i !== -1) T[k].splice(i, 1); if (k === 'items') T.total--; if (k === 'someday') T.somedayTotal--; } };
    },
    reset(Z) { const v = Z.vals; Z.vals = { name: '', category: v.category, priority: v.priority, dueDate: state.today || '', repeat: 'none', interval: 1, unit: v.unit }; },
    async submit(v) { await post(taskCfg.payload(v)); return `Task added: ${v.name.trim()}`; },
  };

  /* ---------- wiring ---------- */
  if (has('today')) card('today').addEventListener('click', e => {
    const tab = e.target.closest('[data-tab]'); if (tab) { ui.tab = tab.dataset.tab; renderToday(); return; }
    const tick_ = e.target.closest('[data-act="tick"]'); if (tick_) tickTask(tick_.closest('.tk').dataset.id);
  });
  if (has('focus')) card('focus').addEventListener('click', onFocusClick);
  if (has('topics')) card('topics').addEventListener('click', onTopicsClick);

  /* ---------- render ---------- */
  function renderLive() {
    renderToday(); renderFocus(); renderStreak(); renderTopics();
  }
  function renderAll() {
    [['newtopic', topicCfg], ['newtask', taskCfg]].forEach(([w, cfg]) => {
      if (!has(w)) return;
      if (!WZ[w]) {
        if (state.err.schema && w === 'newtask') card(w).innerHTML = `<div class="band"><h2>${esc(cfg.title)}</h2></div><div class="body"><p class="dim">Couldn't read the database options: ${esc(state.err.schema.error)}${state.err.schema.hint ? ' ' + esc(state.err.schema.hint) : ''}</p></div>`;
        else buildWizard(w, cfg);
      }
    });
    renderLive();
  }

  refresh().then(() => {
    // a timer that finished while the page was closed: save it (if it ended in the last 6 hours)
    if (has('focus') && fs.run && fs.run.pausedLeft == null && fs.run.endAt <= Date.now()) {
      if (Date.now() - fs.run.endAt < 6 * 3600e3) completeRun(); else { fs.run = null; saveFs(); renderFocus(); }
    }
  });
  setInterval(refresh, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { refresh(); if (fs.run) tick(); } });
  document.documentElement.addEventListener('pointerenter', () => { if (Date.now() - state.loadedAt > 8000) refresh(); });
})();
