'use strict';
/* Workout widgets: one page, many pieces.
   /workout/index.html?key=KEY&w=ripple     -> just that widget
   w = ripple | session | week | streak | mosaic | balance | fuel | program | all  (comma-separate to combine)
   program is the editor for your own exercises, days and target. It is never part of "all",
   and &demo runs it entirely in this browser (nothing is written to Notion).

   Day types come from the schedule in /api/workout (Mon/Wed/Fri = workout, Sun = bonus, Tue/Thu/Sat = rest):
   - workout / bonus day: counts as done when 85% of the exercises are ticked (6 of 7). Snacks don't count.
   - rest day: only the two snack boxes matter, and the day is done when both are ticked. */
(() => {
  const API = '/api/workout';
  const params = new URLSearchParams(location.search);
  const KEY = params.get('key') || '';
  const DONE_SHARE = 0.85;     // share of exercises that makes a training day "done"
  const WINDOW = 28;           // days used by the balance and fuel widgets
  const NEEDS = { ripple: 7, session: 7, week: 14, streak: 56, mosaic: 35, balance: 28, fuel: 28, program: 0 };   // days of history each widget needs
  const EDITOR = ['program'];   // an editor is only shown when it is asked for by name
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
  const shown = wantAll ? Object.keys(NEEDS).filter(w => !EDITOR.includes(w)) : asked.filter(w => w in NEEDS);
  const unknown = asked.filter(w => w !== 'all' && !(w in NEEDS));
  document.querySelectorAll('.card[data-w]').forEach(c => { c.hidden = !shown.includes(c.dataset.w); });
  document.body.dataset.mode = shown.length === 1 ? 'single' : 'multi';
  if (unknown.length || !shown.length) {
    const b = $('bad'); b.hidden = false;
    b.innerHTML = '<h2>Unknown widget</h2><p class="muted">Use w=ripple, session, week, streak, mosaic, balance, fuel, program or all.</p>';
  }
  const has = w => shown.includes(w);
  const DAYS = Math.max(14, ...shown.map(w => NEEDS[w]));

  const state = { today: null, rows: [], schedule: {}, time: '5:00 PM', todayRow: null, pending: 0, first: true, loadedAt: 0, starting: false, pulse: null,
    program: null, draft: null, dirty: false, saving: false, progRendered: false, progSavedNote: '', dayPick: null, tab: '' };

  /* ---------- dates ---------- */
  const addDays = (d, n) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
  const dow = d => new Date(d + 'T00:00:00Z').getUTCDay();
  const monday = d => addDays(d, -((dow(d) + 6) % 7));
  const fmtDate = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  const wkShort = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });
  const wkLong = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' });
  // A day type (push, chest, upper…) counts as a training day; only rest and bonus are special.
  const kindOn = d => {
    const v = state.schedule[dow(d)] || 'workout';
    return v === 'rest' ? 'rest' : v === 'bonus' ? 'bonus' : 'workout';
  };

  /* ---------- maths ---------- */
  const isFuel = i => !!i.fuel;
  const catsOf = () => (state.program && state.program.categories) || [];
  const catById = id => catsOf().find(c => c.id === id) || null;
  const catNameOf = id => (catById(id) || {}).name || '';
  const dayValueOn = d => state.schedule[dow(d)] || 'workout';
  // A day either names one of your day types, or it is a rest / bonus / workout day.
  const dayCatOn = d => { const v = dayValueOn(d); return catById(v) ? v : null; };
  const toneOf = id => { const i = catsOf().findIndex(c => c.id === id); return i < 0 ? 0 : i; };
  const need = n => Math.max(1, Math.ceil(n * DONE_SHARE - 1e-9));
  // What counts on a given day: the snacks on a rest day, the exercises otherwise.
  // What counts on a day: that day type's exercises, or the snacks on a rest day.
  function stats(r) {
    const kind = kindOn(r.date);
    const rest = kind === 'rest';
    const cat = rest ? null : dayCatOn(r.date);
    const it = rest ? r.items.filter(isFuel)
      : cat ? r.items.filter(i => i.cat === cat)
      : r.items.filter(i => !isFuel(i));
    const total = it.length, done = it.filter(i => i.done).length;
    // The program widget can change "done" from 85% to whatever number the user picks.
    const goal = Math.min(total, (state.program && state.program.need) || need(total));
    const hit = rest ? (total === 0 || done === total) : total > 0 && done >= goal;
    return { rest, cat, done, total, pct: total ? done / total : 0, hit };
  }
  const byDate = () => new Map(state.rows.map(r => [r.date, r]));
  const firstDate = () => (state.rows.length ? state.rows[0].date : null);
  // A day is "settled" once it has passed, or today once it is done: used so a half-finished today never counts as skipped.
  const settled = r => r.date < state.today || (r.date === state.today && stats(r).hit);

  function sessions() {
    // Training days from the first log until today. Rest days are skipped; a bonus day only appears when it was completed.
    const map = byDate(), first = firstDate(), out = [];
    if (!first) return out;
    for (let d = first; d <= state.today; d = addDays(d, 1)) {
      const k = kindOn(d), r = map.get(d), s = r ? stats(r) : null;
      if (k === 'workout') out.push({ date: d, row: r || null, s, hit: !!(s && s.hit) });
      else if (k === 'bonus' && s && s.hit) out.push({ date: d, row: r, s, hit: true });
    }
    return out;
  }
  function streak() {
    const list = sessions();
    let i = list.length - 1;
    if (i >= 0 && list[i].date === state.today && !list[i].hit) i--;      // today still in progress doesn't break the run
    let current = 0; while (i >= 0 && list[i].hit) { current++; i--; }
    let best = 0, run = 0;
    list.forEach(x => { if (x.hit) { run++; best = Math.max(best, run); } else if (x.date !== state.today) run = 0; });
    return { current, best, list };
  }

  /* ---------- labels ---------- */
  const HINT = { 'goated leg': '69 reps', 'pre-workout snack': 'Channa, peanuts or fruit', 'post-workout snack': 'Eggs, oats or dal chawal' };
  const REST_NAME = { 'pre-workout snack': 'Evening snack', 'post-workout snack': 'Refuel meal' };
  const REST_HINT = { 'pre-workout snack': 'Channa, peanuts or fruit', 'post-workout snack': 'Eggs, oats or dal chawal' };
  const GROUP_NAME = { push: 'Push', pull: 'Pull', legs: 'Legs', other: 'Other', fuel: 'Fuel' };
  const GROUP_NOTE = { push: '2 sets each', pull: '2 sets each', legs: '69 reps' };
  const nameKey = it => it.name.toLowerCase();
  const setsOf = it => { const m = /x(\d+)$/i.exec(it.label); return m ? `${m[1]} sets` : ''; };
  function tileText(it, rest) {
    const k = nameKey(it);
    if (rest) return { nm: REST_NAME[k] || it.name, hn: REST_HINT[k] || it.hint || '' };
    return { nm: it.name, hn: it.hint || HINT[k] || setsOf(it) };   // your own sets/reps win
  }

  /* ---------- ripple: concentric rain rings, one segment per exercise ---------- */
  const FALLBACK = [['Wide Pushups', 'push'], ['Incline Pushups', 'push'], ['Diamond Pushups', 'push'], ['Wide Pullups', 'pull'], ['Close Pullups', 'pull'],
    ['Chin ups', 'pull'], ['Goated Leg', 'legs'], ['Pre-Workout Snack', 'fuel'], ['Post-Workout Snack', 'fuel']]
    .map(([n, g]) => ({ key: n, label: n, name: n, cat: g, fuel: g === 'fuel', done: false }));
  function ripplesItems() {
    if (state.todayRow) return state.todayRow.items;
    const last = [...state.rows].reverse().find(r => r.date <= state.today);
    return last ? last.items.map(i => ({ ...i, done: false })) : FALLBACK;
  }
  function wedge(i, n, r0, r1, gap) {
    const a0 = (i / n) * 2 * Math.PI - Math.PI / 2 + gap / 2;
    const a1 = ((i + 1) / n) * 2 * Math.PI - Math.PI / 2 - gap / 2;
    const p = (r, a) => [(100 + r * Math.cos(a)).toFixed(2), (100 + r * Math.sin(a)).toFixed(2)];
    const [x0, y0] = p(r1, a0), [x1, y1] = p(r1, a1), [x2, y2] = p(r0, a1), [x3, y3] = p(r0, a0);
    const big = a1 - a0 > Math.PI ? 1 : 0;
    return `M${x0} ${y0}A${r1} ${r1} 0 ${big} 1 ${x1} ${y1}L${x2} ${y2}A${r0} ${r0} 0 ${big} 0 ${x3} ${y3}Z`;
  }
  const annulus = (r0, r1) => `M100 ${100 - r1}A${r1} ${r1} 0 1 1 100 ${100 + r1}A${r1} ${r1} 0 1 1 100 ${100 - r1}ZM100 ${100 - r0}A${r0} ${r0} 0 1 0 100 ${100 + r0}A${r0} ${r0} 0 1 0 100 ${100 - r0}Z`;
  function ringsOf(date, kind, items) {
    if (kind === 'rest') return items.filter(isFuel).map(it => ({ cls: 'fuel', tone: it.cat ? toneOf(it.cat) : 0, items: [it] }));
    const cat = dayCatOn(date);
    if (cat) return [{ cls: cat, tone: toneOf(cat), items: items.filter(i => i.cat === cat) }].filter(r => r.items.length);
    return catsOf().filter(c => !isFuelCat(c)).map(c => ({ cls: c.id, tone: toneOf(c.id), items: items.filter(i => i.cat === c.id && !isFuel(i)) })).filter(r => r.items.length);
  }

  function dayTitle(kind, catName) {
    if (kind === 'rest') return 'Rest day';
    if (kind === 'bonus') return 'Bonus session';
    return catName ? `${catName} day` : "Today's session";
  }

  function renderRing() {
    const kind = kindOn(state.today), items = ripplesItems(), rings = ringsOf(state.today, kind, items), first = state.first;
    const N = Math.max(1, rings.length), inner = N >= 3 ? 34 : 44, gap = 5, th = (94 - inner - gap * (N - 1)) / N;
    let svg = '<circle class="rail" cx="100" cy="100" r="98"/>' + `<circle class="rail" cx="100" cy="100" r="${inner - 4}"/>`;
    let idx = 0, pulseR = null;
    rings.forEach((ring, ri) => {
      const r1 = 94 - ri * (th + gap), r0 = r1 - th, n = ring.items.length;
      ring.items.forEach((it, i) => {
        const d = n === 1 ? annulus(r0, r1) : wedge(i, n, r0, r1, 0.1);
        svg += `<path class="step tone-${ring.tone}${it.done ? ' done' : ''}" fill-rule="evenodd" d="${d}"${first ? ` style="transition-delay:${idx * 55}ms"` : ''}><title>${esc(it.name)}</title></path>`;
        idx++;
        if (state.pulse === it.key) pulseR = (r0 + r1) / 2;
      });
    });
    if (pulseR != null) svg += `<circle class="pulse" cx="100" cy="100" r="${pulseR.toFixed(1)}"/>`;
    state.pulse = null;
    $('ring').innerHTML = svg;
    if (first) setTimeout(() => $('ring').querySelectorAll('.step').forEach(s => { s.style.transitionDelay = ''; }), 1600);

    const row = state.todayRow, s = row ? stats(row) : null;
    const total = s ? s.total : rings.reduce((a, r) => a + r.items.length, 0);
    $('ringDone').textContent = row ? s.done : '–';
    $('ringOf').textContent = row ? `of ${total}` : 'no log yet';
    $('rTitle').textContent = dayTitle(kind, catNameOf(dayCatOn(state.today)));
    $('dateLine').textContent = fmtDate(state.today);
    let line;
    if (!row) line = kind === 'rest' ? 'Rest day. Start it to log your snacks.' : kind === 'bonus' ? 'Bonus day. Optional, start one if you feel like it.' : 'No log for today yet. Start today\'s session.';
    else if (s.hit) line = kind === 'rest' ? 'Rest day done. Well recovered.' : s.done === s.total ? 'Every exercise done. Strong session.' : `Session done with ${s.total - s.done} to spare.`;
    else line = kind === 'rest' ? `${s.done} of ${s.total} snacks logged.` : `${s.done} done, ${s.total - s.done} still to go.`;
    $('statusLine').textContent = line;
  }

  /* ---------- session: tappable tiles + Start button ---------- */
  const CHECK = '<svg viewBox="0 0 12 12" fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 6.3l2.4 2.4 4.6-5"/></svg>';
  function tileHtml(it, rest) {
    const t = tileText(it, rest);
    return `<button class="tile${rest ? ' rest' : ''}" type="button" data-key="${esc(it.key)}" data-tone="${toneOf(it.cat)}" aria-pressed="${it.done}"><span class="box">${CHECK}</span><span class="tx"><span class="nm">${esc(t.nm)}</span>${t.hn ? `<span class="hn">${esc(t.hn)}</span>` : ''}</span></button>`;
  }
  function nextWorkout() {
    for (let i = 1; i <= 7; i++) {
      const d = addDays(state.today, i);
      if (kindOn(d) === 'workout') return { d, i, cat: catNameOf(dayCatOn(d)) };
    }
    return null;
  }
  function renderSession() {
    const kind = kindOn(state.today), rest = kind === 'rest', row = state.todayRow, el = $('tiles');
    $('sTitle').textContent = dayTitle(kind, catNameOf(dayCatOn(state.today)));
    $('sFoot').textContent = '';
    if (!row) {
      $('sCount').textContent = '';
      const label = rest ? 'Start rest day' : kind === 'bonus' ? 'Start a bonus session' : 'Start today\'s session';
      const note = rest ? 'Adds today\'s row for your evening snack and refuel meal. Tick both to finish the day.'
        : kind === 'bonus' ? 'Adds today\'s row. Bonus days never break your streak.' : 'Adds today\'s row to your Workout Log.';
      el.innerHTML = `<div class="start-wrap"><button class="start" type="button" id="startBtn"${state.starting ? ' disabled' : ''}>${state.starting ? 'Starting…' : label}</button><p class="muted">${note}</p></div>`;
    } else {
      const s = stats(row);
      $('sCount').textContent = `${s.done} of ${s.total}`;
      const items = rest ? row.items.filter(isFuel) : row.items;
      const cats = catsOf();
      const fuelCat = cats.find(isFuelCat);
      const dayCat = dayCatOn(state.today);
      // a Push day shows Push; a full-body day shows everything; every day shows the fuel group
      const order = rest ? (fuelCat ? [fuelCat.id] : [])
        : dayCat ? [dayCat].concat(fuelCat && fuelCat.id !== dayCat ? [fuelCat.id] : [])
        : cats.filter(c => !isFuelCat(c)).map(c => c.id).concat(fuelCat ? [fuelCat.id] : []);
      el.innerHTML = order.map(g => {
        const list = items.filter(i => i.cat === g);
        if (!list.length) return '';
        const done = list.filter(i => i.done).length;
        const name = catNameOf(g) || 'Other';
        const note = rest || (state.program && state.program.exists) ? '' : GROUP_NOTE[g] || '';
        const head = rest ? '' : `<div class="thead"><span>${esc(name)}</span><span class="muted">${esc(note ? note + ', ' : '')}${done} of ${list.length}</span></div>`;
        return `<div class="tgroup" data-g="${g}" data-tone="${toneOf(g)}">${head}<div class="trow" style="--n:${Math.min(list.length, 3)}">${list.map(i => tileHtml(i, rest)).join('')}</div></div>`;
      }).join('');
    }
    if (rest) {
      const nx = state.todayRow && stats(state.todayRow).hit ? 'Rest day done. ' : '';
      const n = nextWorkout();
      $('sFoot').textContent = n ? `${nx}Next workout: ${n.i === 1 ? 'tomorrow' : wkLong(n.d)} at ${state.time}.` : nx.trim();
    }
  }

  /* ---------- week strip ---------- */
  const X = '<svg viewBox="0 0 16 16"><path d="M4 4l8 8M12 4l-8 8"/></svg>';
  const TICK = '<svg viewBox="0 0 16 16"><path d="M3.5 8.4l3 3 6-6.6"/></svg>';
  function renderWeek() {
    const map = byDate(), start = monday(state.today), first = firstDate();
    let hits = 0, planned = 0, bonus = 0;
    $('week').innerHTML = Array.from({ length: 7 }, (_, i) => {
      const d = addDays(start, i), r = map.get(d), k = kindOn(d), future = d > state.today, isToday = d === state.today, s = r ? stats(r) : null;
      if (k === 'workout') planned++;
      if (s && s.hit) { if (k === 'workout') hits++; else if (k === 'bonus') bonus++; }
      const missed = !s && !future && !isToday && k === 'workout' && first && d >= first;
      const cls = [k, s && s.hit ? 'hit' : '', future ? 'future' : '', missed ? 'miss' : '', isToday ? 'today' : ''].filter(Boolean).join(' ');
      const dv = dayValueOn(d);
      const label = dv === 'rest' ? 'Rest' : dv === 'bonus' ? 'Bonus' : dv === 'workout' ? 'Train' : (catNameOf(dv) || 'Train');
      const fill = s && !future ? Math.round(s.pct * 100) : 0;
      const status = s ? (s.hit ? 'done' : `${s.done} of ${s.total}`) : missed ? 'missed' : future ? 'upcoming' : 'no log';
      return `<div class="wd ${cls}"><span class="wk" title="${esc(label)}">${esc(label)}</span><div class="wtile" title="${esc(wkLong(d))}: ${status}"><i style="height:${fill}%"></i>${s && s.hit ? TICK : missed ? X : ''}</div><span class="dlabel">${wkShort(d)}</span></div>`;
    }).join('');
    $('weekNote').textContent = `${hits} of ${planned} training days done${bonus ? ', plus a bonus session' : ''}.`;
  }

  /* ---------- streak ---------- */
  function renderStreak() {
    const st = streak(), recent = st.list.slice(-7);
    $('stNum').textContent = st.current;
    $('stUnit').textContent = st.current === 1 ? 'session' : 'sessions';
    const todayItems = ripplesItems();
    const todayCat = dayCatOn(state.today);
    const per = (todayCat ? todayItems.filter(i => i.cat === todayCat) : todayItems.filter(i => !isFuel(i))).length || 7;
    $('stLine').textContent = st.current ? 'in a row. Rest days never break it.' : `No run going right now. Finish ${need(per)} of ${per} exercises to start one.`;
    $('stBest').textContent = `Best run in the last eight weeks: ${st.best} ${st.best === 1 ? 'session' : 'sessions'}.`;
    $('stDots').innerHTML = recent.length ? recent.map(x => {
      const cls = x.s ? (x.hit ? 'c3' : x.s.pct >= 0.5 ? 'c2' : 'c1') : 'miss';
      return `<div class="dot ${cls}${x.date === state.today ? ' today' : ''}" title="${esc(fmtDate(x.date))}"><i></i><span>${wkShort(x.date).slice(0, 3)}</span></div>`;
    }).join('') : '<p class="empty">Your last sessions will show up here.</p>';
  }

  /* ---------- mosaic ---------- */
  function renderMosaic() {
    const map = byDate(), start = addDays(monday(state.today), -28);
    let html = ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(l => `<span class="hd">${l}</span>`).join('');
    for (let i = 0; i < 35; i++) {
      const d = addDays(start, i), r = map.get(d), future = d > state.today, k = kindOn(d), s = r ? stats(r) : null;
      let cls = future ? 'future' : s ? (s.hit ? (s.rest ? 'cr' : 'c3') : s.pct >= 0.5 ? 'c2' : 'c1') : k === 'rest' ? 'rest' : '';
      const tip = s ? `${fmtDate(d)}: ${s.done} of ${s.total}${s.rest ? ' snacks' : ''}` : fmtDate(d);
      html += `<div class="cell ${cls}${d === state.today ? ' today' : ''}" title="${esc(tip)}"></div>`;
    }
    $('mosaic').innerHTML = html;
  }

  /* ---------- balance: push / pull / legs ---------- */
  const rowsInWindow = () => { const from = addDays(state.today, -(WINDOW - 1)); return state.rows.filter(r => r.date >= from && r.date <= state.today && settled(r)); };
  const bar = (cls, label, done, total) => {
    const p = total ? Math.round((done / total) * 100) : 0;
    return `<div class="bar-row ${cls}"><span>${esc(label)}</span><div class="track"><i style="width:${p}%"></i></div><span class="n"><b>${p}%</b> ${done} of ${total}</span></div>`;
  };
  function renderBalance() {
    const rows = rowsInWindow().filter(r => kindOn(r.date) !== 'rest');
    $('balNote').textContent = rows.length ? `From ${rows.length} logged ${rows.length === 1 ? 'session' : 'sessions'} in the last four weeks.` : '';
    const cats = catsOf().filter(c => !isFuelCat(c));
    const g = new Map(cats.map(c => [c.id, [0, 0]]));
    const ex = new Map();
    rows.forEach(r => r.items.forEach(it => {
      if (isFuel(it)) return;
      if (r.cat && it.cat !== r.cat) return;   // count a day against its own day type
      const slot = g.get(it.cat);
      if (slot) { slot[1]++; if (it.done) slot[0]++; }
      const e = ex.get(it.name) || { done: 0, days: 0, cat: it.cat };
      e.days++; if (it.done) e.done++;
      ex.set(it.name, e);
    }));
    const shown = cats.filter(c => g.get(c.id)[1]);
    $('groups').innerHTML = rows.length && shown.length
      ? shown.map(c => bar('tone-' + toneOf(c.id), c.name, g.get(c.id)[0], g.get(c.id)[1])).join('')
      : '<p class="empty">Finish a session and your balance shows up here.</p>';
    const head = document.querySelector('.card[data-w="balance"] h2');
    if (head && state.program && state.program.exists && shown.length) head.textContent = shown.map(c => c.name).join(', ');
    const list = [...ex].map(([name, e]) => ({ name, ...e })).sort((a, b) => a.done / a.days - b.done / b.days || a.name.localeCompare(b.name)).slice(0, 5);
    $('skipHead').hidden = !list.length;
    $('skipped').innerHTML = list.map(x => bar('tone-' + toneOf(x.cat), x.name, x.done, x.days)).join('');
  }

  /* ---------- fuel check ---------- */
  function renderFuel() {
    const rows = rowsInWindow();
    const train = rows.filter(r => kindOn(r.date) !== 'rest'), rest = rows.filter(r => kindOn(r.date) === 'rest');
    const pick = (r, re) => r.items.find(i => isFuel(i) && re.test(i.name));
    const rate = (list, re) => { let d = 0, t = 0; list.forEach(r => { const it = pick(r, re); if (it) { t++; if (it.done) d++; } }); return [d, t]; };
    const [pre, preT] = rate(train, /pre/i), [post, postT] = rate(train, /post/i);
    const restHit = rest.filter(r => stats(r).hit).length;
    $('fuelNote').textContent = rows.length ? 'Last four weeks of logged days.' : '';
    $('fuel').innerHTML = rows.length
      ? bar('', 'Before training', pre, preT) + bar('pull', 'After training', post, postT) + bar('rest', 'Rest days, both', restHit, rest.length)
      : '<p class="empty">Log a few days and your snack habits show up here.</p>';
    const row = state.todayRow;
    if (!row) { $('fuelToday').textContent = 'Today: no log yet.'; return; }
    const isRest = kindOn(state.today) === 'rest';
    const f = row.items.filter(isFuel);
    $('fuelToday').textContent = 'Today: ' + (f.length ? f.map(i => `${(isRest ? tileText(i, true).nm : i.name).toLowerCase()} ${i.done ? 'done' : 'pending'}`).join(', ') : 'no snack boxes in the log') + '.';
  }

  function renderAll() {
    if (!state.today) return;
    if (has('ripple')) renderRing();
    if (has('session')) renderSession();
    if (has('week')) renderWeek();
    if (has('streak')) renderStreak();
    if (has('mosaic')) renderMosaic();
    if (has('balance')) renderBalance();
    if (has('fuel')) renderFuel();
    if (has('program') && (!state.dirty || !state.progRendered)) renderProgram();
    state.first = false;
  }

  /* ============================================================
     PROGRAM (w=program): choose a split, then build it.
       full      one session covers everything   days: Train / Rest / Bonus
       ppl       Push / Pull / Legs              days: Push / Pull / Legs / Rest
       bodypart  Chest / Back / Legs / Shoulders / Arms
       custom    your own split name and your own day types
     Every split is the same machine underneath: day types, exercises
     inside them, and a day type on each weekday. Saved to Notion
     through /api/workout ('program-save').
     ============================================================ */
  const DEMO = params.has('demo');
  const DEMO_KEY = 'workout-program-demo';
  const MAX_CATS = 8;
  const SPLITS = [
    { id: 'full', name: 'Full Body', note: 'Every session covers everything, in one go.', days: 'Train · Rest · Bonus days' },
    { id: 'ppl', name: 'Push · Pull · Legs', note: 'Push one day, pull the next, legs after that.', days: 'Push · Pull · Legs · Rest days' },
    { id: 'bodypart', name: 'Body Part', note: 'One part a day: chest, back, legs, shoulders, arms.', days: 'Chest · Back · Legs · Shoulders · Arms · Other · Rest' },
    { id: 'custom', name: 'Other — build your own', note: 'Name your split and invent the day types yourself.', days: 'Whatever you make, plus Rest' },
  ];
  const CAT_PRESETS = {
    full: [['push', 'Push'], ['pull', 'Pull'], ['legs', 'Legs'], ['other', 'Other'], ['fuel', 'Fuel']],
    ppl: [['push', 'Push'], ['pull', 'Pull'], ['legs', 'Legs'], ['fuel', 'Fuel']],
    bodypart: [['chest', 'Chest'], ['back', 'Back'], ['legs', 'Legs'], ['shoulders', 'Shoulders'], ['arms', 'Arms'], ['other', 'Other'], ['fuel', 'Fuel']],
  };
  const DEFAULT_SCHEDULE = { 0: 'bonus', 1: 'workout', 2: 'rest', 3: 'workout', 4: 'rest', 5: 'workout', 6: 'rest' };
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MON_FIRST = [1, 2, 3, 4, 5, 6, 0];
  const ICO = {
    up: '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9.6V2.9M3.3 5.6L6 2.8l2.7 2.8"/></svg>',
    down: '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 2.4v6.7M3.3 6.4L6 9.2l2.7-2.8"/></svg>',
    hide: '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="M3.2 3.2l5.6 5.6M8.8 3.2l-5.6 5.6"/></svg>',
  };
  const slugify = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'day';
  const presetCats = split => (CAT_PRESETS[split] || CAT_PRESETS.full).map(([id, name]) => ({ id, name }));
  const isFuelName = n => /fuel|snack|meal|food/i.test(String(n || ''));
  const isFuelCat = c => !!c && (c.id === 'fuel' || isFuelName(c.name));
  const groupOfName = n => {
    const l = String(n || '').toLowerCase();
    if (/snack|meal|fuel/.test(l)) return 'fuel';
    if (/leg|squat|lunge/.test(l)) return 'legs';
    if (/pull|chin/.test(l)) return 'pull';
    if (/push|dip/.test(l)) return 'push';
    return 'other';
  };

  const DEMO_ITEMS = [
    { prop: 'Wide Pushups x2', name: 'Wide pushups', cat: 'push', hint: '3 sets' },
    { prop: 'Incline Pushups x2', name: 'Incline pushups', cat: 'push', hint: '3 sets' },
    { prop: 'Diamond Pushups x2', name: 'Diamond pushups', cat: 'push', hint: '2 sets' },
    { prop: 'Wide Pullups x2', name: 'Wide pullups', cat: 'pull', hint: '3 sets' },
    { prop: 'Close Pullups x2', name: 'Close pullups', cat: 'pull', hint: '2 sets' },
    { prop: 'Chin ups x2', name: 'Chin ups', cat: 'pull', hint: '2 sets' },
    { prop: 'Goated Leg x2', name: 'Goated leg', cat: 'legs', hint: '69 reps' },
    { prop: 'Pre-Workout Snack', name: 'Pre-workout snack', cat: 'fuel', hint: 'Channa or fruit' },
    { prop: 'Post-Workout Snack', name: 'Post-workout snack', cat: 'fuel', hint: 'Eggs, oats or dal' },
  ];

  function defaultDays(split, cats) {
    if (split === 'full') return { ...DEFAULT_SCHEDULE };
    const out = {};
    for (let d = 0; d < 7; d++) out[String(d)] = 'rest';
    const pool = cats.filter(c => !isFuelCat(c));
    [1, 3, 5].forEach((d, i) => { if (pool.length) out[String(d)] = pool[i % pool.length].id; });
    return out;
  }

  // One shape everywhere: what the server sends, what we edit, what we save.
  function shapeProgram(src) {
    const p = src || {};
    const split = SPLITS.some(s => s.id === p.split) ? p.split : 'full';
    let cats = (Array.isArray(p.categories) && p.categories.length ? p.categories : presetCats(split))
      .map(c => ({ id: String((c && c.id) || slugify(c && c.name)), name: String((c && c.name) || '').trim() }))
      .filter(c => c.name)
      .slice(0, MAX_CATS);
    if (!cats.length) cats = presetCats('full');
    const ids = new Set(cats.map(c => c.id));
    const items = (Array.isArray(p.items) ? p.items : []).map(i => ({
      prop: i && i.prop ? String(i.prop) : null,
      name: String((i && i.name) || '').trim(),
      cat: ids.has(i && i.cat) ? i.cat : cats[0].id,
      hint: String((i && i.hint) || ''),
      hidden: !!(i && i.hidden),
    })).filter(i => i.name);
    let days;
    if (p.days && Object.keys(p.days).length) {
      days = {};
      for (let d = 0; d < 7; d++) {
        const v = p.days[String(d)];
        if (v === 'rest') days[String(d)] = 'rest';
        else if (split === 'full') days[String(d)] = v === 'bonus' ? 'bonus' : 'workout';
        else days[String(d)] = ids.has(v) ? v : 'rest';
      }
    } else days = defaultDays(split, cats);
    const visible = items.filter(i => !i.hidden).length;
    let nd = parseInt(p.need, 10);
    if (!Number.isFinite(nd) || nd < 1) nd = Math.ceil(visible * 0.85);
    return {
      exists: !!p.exists,
      split,
      name: split === 'custom' ? String(p.name || '') : '',
      categories: cats,
      days,
      need: Math.min(Math.max(1, nd), Math.max(1, visible)),
      items,
    };
  }

  function demoProgram() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(DEMO_KEY) || 'null'); } catch (e) { saved = null; }
    return shapeProgram(saved || {
      exists: true, split: 'full', categories: presetCats('full'),
      days: DEFAULT_SCHEDULE, need: 6, items: DEMO_ITEMS,
    });
  }

  // &demo: three weeks of plausible days so the other widgets have something to draw.
  function demoRows(program) {
    const today = new Date().toISOString().slice(0, 10);
    const out = [];
    for (let back = 20; back >= 0; back--) {
      const date = addDays(today, -back);
      const v = program.days[String(dow(date))];
      const cat = program.categories.some(c => c.id === v) ? v : null;
      const kind = v === 'rest' ? 'rest' : v === 'bonus' ? 'bonus' : 'workout';
      const items = program.items.filter(it => !it.hidden).map((it, idx) => {
        const fuel = isFuelCat(program.categories.find(c => c.id === it.cat));
        let done = false;
        if (kind === 'rest') done = fuel && idx % 4 !== 3;
        else if (cat) done = it.cat === cat || (fuel && idx % 3 !== 2);
        else done = fuel ? idx % 3 !== 1 : idx % 6 !== 5;
        return { key: it.prop || it.name, label: it.name, name: it.name, cat: it.cat, fuel, hint: it.hint, done };
      });
      out.push({ id: 'demo-' + date, date, kind, cat, catName: cat ? (program.categories.find(c => c.id === cat) || {}).name : null, items });
    }
    return out;
  }

  const progVisible = () => (state.draft ? state.draft.items.filter(i => !i.hidden) : []);
  const catIndexIn = (cats, id) => { const i = cats.findIndex(c => c.id === id); return i < 0 ? 0 : i; };

  function dayOptions(p) {
    if (p.split === 'full') return [{ v: 'workout', label: 'Train' }, { v: 'rest', label: 'Rest' }, { v: 'bonus', label: 'Bonus' }];
    return p.categories.map(c => ({ v: c.id, label: c.name })).concat([{ v: 'rest', label: 'Rest' }]);
  }
  function dayLabel(v, p) {
    if (v === 'rest') return 'Rest';
    if (v === 'bonus') return 'Bonus';
    if (v === 'workout') return 'Train';
    const c = p.categories.find(x => x.id === v);
    return c ? c.name : 'Rest';
  }
  const dayIsRest = v => v === 'rest';

  function progDirty(on) {
    if (on !== undefined) state.dirty = on;
    const note = $('progNote'), btn = $('progSave');
    if (note) {
      note.classList.toggle('dirty', state.dirty);
      note.textContent = state.dirty ? 'Unsaved changes' : (state.progSavedNote || '');
    }
    if (btn) { btn.textContent = state.saving ? 'Saving…' : 'Save program'; btn.disabled = !state.dirty || state.saving; }
    if ($('progReset')) $('progReset').disabled = !state.dirty || state.saving;
  }

  function exRow(it, i, k, n, tone) {
    return `<div class="ex${it.prop ? '' : ' is-new'}" data-i="${i}" data-tone="${tone}">
      <div class="ex-fields">
        <input class="ex-name" type="text" maxlength="60" value="${esc(it.name)}" aria-label="Exercise name" placeholder="Exercise name">
        <div class="ex-sub">
          <input class="ex-hint" type="text" maxlength="24" value="${esc(it.hint)}" aria-label="Sets or reps for ${esc(it.name)}" placeholder="sets or reps">
          <select class="ex-group" aria-label="Day type for ${esc(it.name)}">${state.draft.categories.map(c => `<option value="${esc(c.id)}"${c.id === it.cat ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
        </div>
      </div>
      <div class="ex-acts">
        <button type="button" data-act="up" aria-label="Move ${esc(it.name)} up"${k === 0 ? ' disabled' : ''}>${ICO.up}</button>
        <button type="button" data-act="down" aria-label="Move ${esc(it.name)} down"${k === n - 1 ? ' disabled' : ''}>${ICO.down}</button>
        <button type="button" data-act="hide" aria-label="Take ${esc(it.name)} out of the program" title="Take out of the program (its history stays in Notion)">${ICO.hide}</button>
      </div>
    </div>`;
  }

  function renderProgram() {
    if (!state.draft) state.draft = shapeProgram(state.program || { items: [] });
    const p = state.draft, vis = p.items.filter(i => !i.hidden), hid = p.items.filter(i => i.hidden);
    const used = p.categories.filter(c => vis.some(i => i.cat === c.id));
    $('progSub').textContent = vis.length
      ? `${vis.length} ${vis.length === 1 ? 'exercise' : 'exercises'}${used.length ? ' · ' + used.map(c => c.name).join(', ') : ''}`
      : 'No exercises yet — add your first one below.';

    let html = '';
    p.categories.forEach((c, ci) => {
      const rows = p.items.map((it, i) => ({ it, i })).filter(x => !x.it.hidden && x.it.cat === c.id);
      if (!rows.length) return;
      html += `<div class="pg" data-tone="${ci}"><div class="pg-head"><i aria-hidden="true"></i><b>${esc(c.name)}</b><span class="muted">${rows.length}</span></div>`
        + rows.map((x, k) => exRow(x.it, x.i, k, rows.length, ci)).join('') + '</div>';
    });
    $('progGroups').innerHTML = html || '<p class="empty">Start with one exercise — anything from your day types.</p>';

    const sel = $('progNewGroup');
    const keep = sel.value;
    sel.innerHTML = p.categories.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
    if (p.categories.some(c => c.id === keep)) sel.value = keep;

    $('progRestoreWrap').hidden = !hid.length;
    if (hid.length) {
      $('progRestoreLabel').textContent = `Not in your program (${hid.length})`;
      $('progRestore').innerHTML = hid.map(it => `<button type="button" class="chip" data-restore="${p.items.indexOf(it)}" title="Put ${esc(it.name)} back">${esc(it.name)}</button>`).join('');
    }
    renderSplitTab();
    renderDays();
    renderNeed();
    setTab(state.tab || (p.exists ? 'ex' : 'split'));
    progDirty();
    state.progRendered = true;
  }

  function renderSplitTab() {
    const p = state.draft;
    if (!p || !$('progSplits')) return;
    $('progSplits').innerHTML = SPLITS.map(s => {
      const on = p.split === s.id;
      return `<button type="button" class="split${on ? ' on' : ''}" role="radio" aria-checked="${on}" data-split="${s.id}">
        <span class="split-tick" aria-hidden="true">${on ? '&#10003;' : ''}</span>
        <span class="split-body">
          <b>${s.name}</b>
          <small>${s.note}</small>
          <em>${s.days}</em>
        </span>
      </button>`;
    }).join('');
    const custom = p.split === 'custom';
    $('progNameWrap').hidden = !custom;
    $('progSplitName').value = p.name || '';
    $('progCatsWrap').hidden = !custom;
    if (custom) {
      $('progCats').innerHTML = p.categories.map((c, i) => `<div class="cat-row" data-i="${i}">
        <span class="cat-dot" style="--tone: var(--tone-${i})" aria-hidden="true"></span>
        <input class="cat-name" type="text" maxlength="20" value="${esc(c.name)}" aria-label="Day type name">
        <button type="button" class="cat-del" data-del="${i}" aria-label="Remove ${esc(c.name)}">${ICO.hide}</button>
      </div>`).join('');
    }
    $('progSplitNote').textContent = custom
      ? 'Add the days you actually train. Call them Upper, Lower, Conditioning — anything you like.'
      : 'The day types come with the split. Your exercises and days follow them.';
  }

  function renderDays() {
    const p = state.draft;
    if (!p || !$('progWeek')) return;
    const todayDow = state.today ? dow(state.today) : -1;
    $('progWeek').innerHTML = MON_FIRST.map(d => {
      const v = p.days[String(d)];
      const label = dayLabel(v, p);
      const cls = v === 'rest' ? 'k-rest' : v === 'bonus' ? 'k-bonus' : v === 'workout' ? 'k-workout' : 'k-cat';
      const style = cls === 'k-cat' ? ` style="--k: var(--tone-${catIndexIn(p.categories, v)})"` : '';
      return `<button type="button" class="day ${cls}${d === todayDow ? ' today' : ''}${state.dayPick === d ? ' picking' : ''}" data-dow="${d}"
        aria-pressed="${state.dayPick === d}" aria-label="${DOW[d]} is ${esc(label)}. Choose what this day is."${style}>
        <span class="day-n">${DOW[d]}</span><span class="day-k">${esc(label)}</span><i class="day-bar" aria-hidden="true"></i></button>`;
    }).join('');

    const opts = dayOptions(p);
    const pick = state.dayPick;
    $('progDayPick').hidden = pick == null;
    if (pick != null) {
      $('progDayPickLabel').textContent = `${DOW[pick]} is`;
      $('progDayPickOpts').innerHTML = opts.map(o =>
        `<button type="button" class="chip${p.days[String(pick)] === o.v ? ' on' : ''}" data-day="${pick}" data-val="${esc(o.v)}">${esc(o.label)}</button>`).join('');
    }
    const train = MON_FIRST.filter(d => !dayIsRest(p.days[String(d)])).length;
    $('progDaysNote').textContent = `${train} session ${train === 1 ? 'day' : 'days'} a week. Tap a day, then pick what it is.`;
  }

  function renderNeed() {
    const p = state.draft;
    if (!p || !$('progNeedNum')) return;
    const total = progVisible().length;
    const n = Math.min(Math.max(1, p.need), Math.max(1, total));
    $('progNeedNum').textContent = `${n} ${n === 1 ? 'exercise' : 'exercises'}`;
    $('progNeedMinus').disabled = n <= 1;
    $('progNeedPlus').disabled = n >= total;
  }

  function setTab(t) {
    state.tab = t;
    const panes = { split: $('progSplit'), ex: $('progEx'), days: $('progDays') };
    Object.keys(panes).forEach(k => { if (panes[k]) panes[k].hidden = k !== t; });
    document.querySelectorAll('.prog-tabs button[data-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
  }

  /* ---------- split editing ---------- */
  function mapCat(oldCat, name, cats) {
    const ids = new Set(cats.map(c => c.id));
    if (ids.has(oldCat)) return oldCat;
    const g = groupOfName(name);
    if (ids.has(g)) return g;
    const alias = { push: 'chest', pull: 'back', legs: 'legs', other: 'other', fuel: 'fuel' };
    if (ids.has(alias[g])) return alias[g];
    const first = cats.find(c => !isFuelCat(c)) || cats[0];
    return first.id;
  }

  function applySplit(id) {
    const p = state.draft;
    if (!p || p.split === id) return;
    const next = id === 'custom' ? p.categories.map(c => ({ ...c })) : presetCats(id);
    const ids = new Set(next.map(c => c.id));
    // keep every exercise, moved to the closest day type
    p.items.forEach(it => { it.cat = mapCat(it.cat, it.name, next); });
    // keep the shape of the week: the days you train stay days you train
    const pool = next.filter(c => !isFuelCat(c));
    let k = 0;
    // a bonus day is optional, so it becomes rest rather than a fixed session
    const training = MON_FIRST.filter(d => { const v = p.days[String(d)]; return v !== 'rest' && v !== 'bonus'; });
    MON_FIRST.forEach(d => {
      if (!training.includes(d)) { p.days[String(d)] = 'rest'; return; }
      if (id === 'full') p.days[String(d)] = 'workout';
      else p.days[String(d)] = (pool[k++ % Math.max(1, pool.length)] || next[0]).id;
    });
    if (!MON_FIRST.some(d => !dayIsRest(p.days[String(d)]))) p.days['1'] = (pool[0] || next[0]).id;
    p.split = id;
    p.categories = next;
    p.name = id === 'custom' ? (p.name || 'My split') : '';
    p.need = Math.min(Math.max(1, p.need), Math.max(1, progVisible().length));
    if (!ids.size) return;
    state.dayPick = null;
    progDirty(true);
    renderProgram();
  }

  function addCategory(name) {
    const p = state.draft;
    const clean = String(name || '').replace(/\s+/g, ' ').trim();
    if (!clean) return;
    if (clean.length > 20) return toast('Keep a day type under 20 characters.');
    if (p.categories.length >= MAX_CATS) return toast(`That is ${MAX_CATS} day types — plenty for one split.`);
    if (p.categories.some(c => c.name.toLowerCase() === clean.toLowerCase())) return toast(`"${clean}" is already a day type.`);
    let id = slugify(clean);
    while (p.categories.some(c => c.id === id)) id += '-2';
    p.categories.push({ id, name: clean });
    progDirty(true);
    renderProgram();
    setTab('split');
  }

  function removeCategory(i) {
    const p = state.draft;
    const c = p.categories[i];
    if (!c) return;
    if (p.categories.length <= 1) return toast('Keep at least one day type.');
    const fallback = p.categories.find(x => x !== c);
    p.items.forEach(it => { if (it.cat === c.id) it.cat = fallback.id; });
    MON_FIRST.forEach(d => { if (p.days[String(d)] === c.id) p.days[String(d)] = 'rest'; });
    p.categories.splice(i, 1);
    if (!MON_FIRST.some(d => !dayIsRest(p.days[String(d)]))) p.days['1'] = fallback.id;
    if (state.dayPick === undefined) state.dayPick = null;
    progDirty(true);
    renderProgram();
  }

  /* ---------- save / reset ---------- */
  function finishSave(msg) {
    state.draft = shapeProgram(state.program || { items: [] });
    state.dirty = false;
    state.progSavedNote = msg;
    renderProgram();
  }

  function resetDraft() {
    if (!state.dirty) return;
    state.draft = shapeProgram(state.program || { items: [] });
    state.dirty = false;
    state.progSavedNote = '';
    state.dayPick = null;
    renderProgram();
  }

  async function saveProgram() {
    if (state.saving || !state.draft) return;
    const p = state.draft;
    if (!progVisible().length) return toast('Keep at least one exercise in your program.');
    if (!p.categories.length) return toast('Give your split at least one day type.');
    const catNames = new Set();
    for (const c of p.categories) {
      if (!c.name.trim()) return toast('Every day type needs a name.');
      const low = c.name.trim().toLowerCase();
      if (catNames.has(low)) return toast(`Two day types are called "${c.name.trim()}".`);
      catNames.add(low);
    }
    const ids = new Set(p.categories.map(c => c.id));
    if (p.items.some(i => !ids.has(i.cat))) return toast('One of your exercises lost its day type — move it to another.');
    const seen = new Set();
    for (const it of p.items) {
      const n = String(it.name || '').trim();
      if (!n) return toast('Every exercise needs a name.');
      if (n.length > 60) return toast(`"${n.slice(0, 24)}…" is too long — 60 characters is the limit.`);
      const k = n.toLowerCase();
      if (seen.has(k)) return toast(`"${n}" is in the list twice.`);
      seen.add(k);
    }
    if (!MON_FIRST.some(d => !dayIsRest(p.days[String(d)]))) return toast('Mark at least one day as a session.');

    const payload = {
      split: p.split,
      name: p.name,
      categories: p.categories.map(c => ({ id: c.id, name: c.name.trim() })),
      days: p.days,
      need: Math.min(Math.max(1, p.need), progVisible().length),
      items: p.items.map(i => ({ prop: i.prop, name: i.name.trim(), cat: i.cat, hint: i.hint.trim(), hidden: !!i.hidden })),
    };
    state.saving = true; progDirty(true);
    try {
      if (DEMO) {
        try { localStorage.setItem(DEMO_KEY, JSON.stringify({ exists: true, ...payload })); } catch (e) { /* storage blocked */ }
        state.program = shapeProgram({ exists: true, ...payload });
        state.schedule = state.program.days;
        finishSave('Saved in this browser (demo).');
        toast('Saved in this browser (demo).', 2600);
        return;
      }
      const j = await post({ action: 'program-save', program: payload });
      state.program = shapeProgram({ exists: true, ...(j.program || payload) });
      state.schedule = state.program.days;
      if (bc) bc.postMessage('changed');
      finishSave('Saved to Notion.');
      toast('Program saved.', 2600);
    } catch (e) {
      console.error('Program save failed:', e);
      toast(`Couldn't save: ${e.message}${e.hint ? ' ' + e.hint : ''}`, 7000);
    } finally {
      state.saving = false;
      progDirty(state.dirty);
    }
  }

  function wireProgram() {
    document.querySelector('.prog-tabs').addEventListener('click', e => {
      const b = e.target.closest('button[data-tab]');
      if (b) setTab(b.dataset.tab);
    });

    /* split */
    $('progSplits').addEventListener('click', e => {
      const b = e.target.closest('[data-split]');
      if (b) applySplit(b.dataset.split);
    });
    $('progSplitName').addEventListener('input', e => {
      state.draft.name = e.target.value;
      progDirty(true);
    });
    $('progCats').addEventListener('change', e => {
      if (!e.target.classList.contains('cat-name')) return;
      const i = parseInt(e.target.closest('.cat-row').dataset.i, 10);
      const c = state.draft.categories[i];
      if (!c) return;
      const name = e.target.value.replace(/\s+/g, ' ').trim();
      if (!name) { e.target.value = c.name; return; }
      if (state.draft.categories.some((x, xi) => xi !== i && x.name.toLowerCase() === name.toLowerCase())) {
        e.target.value = c.name;
        return toast(`"${name}" is already a day type.`);
      }
      c.name = name;
      progDirty(true);
      renderProgram();
      setTab('split');
    });
    $('progCats').addEventListener('click', e => {
      const b = e.target.closest('[data-del]');
      if (b) removeCategory(parseInt(b.dataset.del, 10));
    });
    $('progCatAdd').addEventListener('submit', e => {
      e.preventDefault();
      const input = $('progCatName'), name = input.value;
      if (!name.trim()) { input.focus(); return; }
      addCategory(name);
      input.value = '';
      input.focus();
    });

    /* exercises */
    // typing keeps the caret where it is: only the draft changes, no re-render
    $('progGroups').addEventListener('input', e => {
      const t = e.target;
      if (!t.classList.contains('ex-name') && !t.classList.contains('ex-hint')) return;
      const it = state.draft && state.draft.items[parseInt(t.closest('.ex').dataset.i, 10)];
      if (!it) return;
      if (t.classList.contains('ex-name')) it.name = t.value; else it.hint = t.value;
      progDirty(true);
    });

    $('progGroups').addEventListener('change', e => {
      const t = e.target;
      if (!t.classList.contains('ex-group')) return;
      const it = state.draft && state.draft.items[parseInt(t.closest('.ex').dataset.i, 10)];
      if (!it) return;
      it.cat = state.draft.categories.some(c => c.id === t.value) ? t.value : state.draft.categories[0].id;
      progDirty(true);
      renderProgram();
    });

    $('progGroups').addEventListener('click', e => {
      const btn = e.target.closest('button[data-act]');
      if (!btn) return;
      const i = parseInt(btn.closest('.ex').dataset.i, 10);
      const p = state.draft;
      const it = p && p.items[i];
      if (!it) return;
      if (btn.dataset.act === 'hide') {
        it.hidden = true;
        state.progSavedNote = '';
        progDirty(true);
        renderProgram();
        return;
      }
      const peers = p.items.map((x, idx) => ({ x, idx })).filter(o => !o.x.hidden && o.x.cat === it.cat);
      const at = peers.findIndex(o => o.idx === i);
      const to = btn.dataset.act === 'up' ? at - 1 : at + 1;
      if (to < 0 || to >= peers.length) return;
      const a = peers[at].idx, b = peers[to].idx;
      const keep = p.items[a]; p.items[a] = p.items[b]; p.items[b] = keep;
      progDirty(true);
      renderProgram();
    });

    $('progRestore').addEventListener('click', e => {
      const b = e.target.closest('[data-restore]');
      if (!b) return;
      const it = state.draft && state.draft.items[parseInt(b.dataset.restore, 10)];
      if (!it) return;
      it.hidden = false;
      progDirty(true);
      renderProgram();
    });

    $('progAdd').addEventListener('submit', e => {
      e.preventDefault();
      const nameEl = $('progNewName'), name = nameEl.value.trim();
      if (!name) { nameEl.focus(); return; }
      if (name.length > 60) return toast('Keep the name under 60 characters.');
      if (state.draft.items.some(i => i.name.trim().toLowerCase() === name.toLowerCase())) return toast(`"${name}" is already in your program.`);
      if (state.draft.items.length >= 40) return toast('That is 40 exercises — plenty for one program.');
      const cat = $('progNewGroup').value || state.draft.categories[0].id;
      state.draft.items.push({ prop: null, name, cat, hint: '', hidden: false });
      const idx = state.draft.items.length - 1;
      nameEl.value = '';
      progDirty(true);
      renderProgram();
      const row = document.querySelector('.ex[data-i="' + idx + '"]');
      if (row) row.scrollIntoView({ block: 'nearest' });
      nameEl.focus();
    });

    /* days */
    $('progWeek').addEventListener('click', e => {
      const b = e.target.closest('.day');
      if (!b) return;
      const d = parseInt(b.dataset.dow, 10);
      state.dayPick = state.dayPick === d ? null : d;
      renderDays();
    });
    $('progDayPickOpts').addEventListener('click', e => {
      const b = e.target.closest('[data-day]');
      if (!b) return;
      const p = state.draft;
      const d = parseInt(b.dataset.day, 10), v = b.dataset.val;
      const others = MON_FIRST.filter(x => x !== d && !dayIsRest(p.days[String(x)])).length;
      if (dayIsRest(v) && others === 0) return toast('Keep at least one session day in the week.');
      p.days[String(d)] = v;
      progDirty(true);
      renderDays();
    });

    $('progNeedMinus').addEventListener('click', () => {
      state.draft.need = Math.max(1, state.draft.need - 1);
      progDirty(true);
      renderNeed();
    });
    $('progNeedPlus').addEventListener('click', () => {
      state.draft.need = Math.min(progVisible().length, state.draft.need + 1);
      progDirty(true);
      renderNeed();
    });
    $('progSave').addEventListener('click', saveProgram);
    $('progReset').addEventListener('click', resetDraft);
  }

  /* ---------- data ---------- */
  function toast(msg, ms) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), ms || 3000); }
  async function post(body) {
    // Writes authenticate with the x-widget-key header (same as the Meal and Sail widgets); ?key= only works for reads.
    const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-widget-key': KEY }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) { const e = new Error(j.error || `HTTP ${r.status}`); e.hint = j.hint; throw e; }
    return j;
  }

  async function load() {
    const r = await fetch(`${API}?days=${DAYS}${keyQ('&')}`, { cache: 'no-store' });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || data.error) { const e = new Error(data.error || `Could not load the Workout Log (HTTP ${r.status}).`); e.hint = data.hint; throw e; }
    state.today = data.today; state.rows = data.rows || []; state.schedule = data.schedule || {}; state.time = data.time || state.time;
    state.program = data.program || null;
    state.todayRow = state.rows.find(x => x.date === state.today) || null;
    state.loadedAt = Date.now();
  }

  async function refresh() {
    if (state.pending || !shown.length) return;
    if (DEMO) {                                     // &demo: the editor runs on this browser alone
      state.today = state.today || new Date().toISOString().slice(0, 10);
      state.schedule = Object.keys(state.schedule || {}).length ? state.schedule : { ...DEFAULT_SCHEDULE };
      state.program = state.program || demoProgram();
      state.schedule = state.program.days;
      if (!state.dirty) state.draft = shapeProgram(state.program);
      if (!state.rows.length) state.rows = demoRows(state.program);
      state.todayRow = state.rows.find(r => r.date === state.today) || null;
      state.loadedAt = Date.now();
      renderAll();
      return;
    }
    try { await load(); if (!state.dirty) state.draft = shapeProgram(state.program || { items: [] }); renderAll(); }
    catch (e) {
      if (state.today) return;          // keep what's on screen if a background refresh fails
      const b = $('bad'); b.hidden = false;
      b.innerHTML = `<h2>Couldn't load your workouts</h2><p class="muted">${esc(e.message)}${e.hint ? ' ' + esc(e.hint) : ''}<br>Check the key in the link, then open /api/health to see what's wrong.</p>`;
    }
  }

  // Widgets in separate embeds stay in step through this channel (when the browser lets them share it).
  let bc = null; try { bc = new BroadcastChannel('workout-widgets'); bc.onmessage = () => setTimeout(refresh, 500); } catch (e) { /* not available in this sandbox */ }

  async function toggle(key) {
    const it = state.todayRow && state.todayRow.items.find(i => i.key === key);
    if (!it) return;
    const next = !it.done; it.done = next; state.pending++;
    if (next) state.pulse = key;
    renderAll();
    try {
      await post({ action: 'toggle', pageId: state.todayRow.id, prop: key, value: next });
      if (bc) bc.postMessage('changed');
    } catch (e) {
      console.error('Workout save failed:', e);
      it.done = !next; state.pulse = null; renderAll();
      toast(`Couldn't save: ${e.message}${e.hint ? ' ' + e.hint : ''}`, 7000);
    } finally { state.pending--; }
  }

  async function start() {
    if (state.starting || state.todayRow) return;
    state.starting = true; state.pending++; renderAll();
    try {
      const j = await post({ action: 'ensure' });
      const row = j.row;
      state.rows = state.rows.filter(x => x.id !== row.id && x.date !== row.date); state.rows.push(row);
      state.rows.sort((a, b) => a.date.localeCompare(b.date));
      state.todayRow = row;
      if (bc) bc.postMessage('changed');
    } catch (e) {
      console.error('Workout start failed:', e);
      toast(`Couldn't start today: ${e.message}${e.hint ? ' ' + e.hint : ''}`, 7000);
    } finally { state.starting = false; state.pending--; renderAll(); }
  }

  if (has('session')) $('tiles').addEventListener('click', e => {
    if (e.target.closest('#startBtn')) return start();
    const b = e.target.closest('.tile'); if (b) toggle(b.dataset.key);
  });
  const stk = $('sticker'); if (stk.complete && stk.naturalWidth) stk.hidden = false; else stk.addEventListener('load', e => { e.target.hidden = false; });
  if (has('program')) wireProgram();

  refresh();
  setInterval(refresh, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  document.documentElement.addEventListener('pointerenter', () => { if (Date.now() - state.loadedAt > 8000) refresh(); });
})();
