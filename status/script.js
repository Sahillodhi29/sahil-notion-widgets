/* ============================================================
   Current Status
   Three wooden deck-plank log cards under a live Sky Banner slice:
     Must Do's  - daily completion + a habit-by-day grid + streaks
     Workout    - one column per session + which exercises you do
     Meals      - one column per logged day + most eaten / skipped
   Week = glass columns. Month = a smooth gradient wave.

   URL options:
     ?key=YOUR_WIDGET_KEY     required (same password as Today's Adventure)
     ?range=month             start on Month (default: week)
     ?demo=1                  sample data, nothing is read from Notion
     ?demo=empty              preview the "no logs yet" state
     ?time=18:30              preview the sky at a time of day
     ?lat= &lon=              sky location (default Gwalior)
     ?hat=../sail/assets/hat.png   the little hat on today's bar
   ============================================================ */
(() => {
  'use strict';
  const q = new URLSearchParams(location.search);
  const KEY = q.get('key') || '';
  const DEMO = q.get('demo');
  const isDemo = DEMO !== null;
  const HAT = q.get('hat') || '../sail/assets/hat.png';
  const NS = 'http://www.w3.org/2000/svg';
  const $ = id => document.getElementById(id);
  const root = document.documentElement;

  const KINDS = {
    mustdo:  { name: "Must Do's", c: '22 160 148',  c2: '74 218 198', icon: '<circle cx="12" cy="12" r="9"/><path d="M15.6 8.4l-2.1 5.1-5.1 2.1 2.1-5.1z"/>' },
    workout: { name: 'Workout',   c: '58 168 92',   c2: '150 218 104', icon: '<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/>' },
    meal:    { name: 'Meals',     c: '224 82 104',  c2: '255 148 120', icon: '<path d="M6 3v7a2 2 0 0 0 4 0V3M8 3v18M17 3c-2.2 1.800-3 4.500-3 8h3v10"/>' },
  };
  const ORDER = ['mustdo', 'workout', 'meal'];
  const HABIT_ORDER = ['Wake up before 6 am', 'Morning Sunlight', 'Morning quick routine', 'Yoga & Workout', 'Grooming & Bathing',
    'Eggs & Breakfast', 'Seeds & Peanuts', 'Bank Officer in Making', 'Evening Sunlight', 'Night Care Begin at 9 pm', 'Sleep before 11 pm'];

  /* ---------- date helpers (plain YYYY-MM-DD strings) ---------- */
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  const parseD = s => new Date(s + 'T00:00:00Z');
  const addDays = (s, n) => { const d = parseD(s); d.setUTCDate(d.getUTCDate() + n); return ymd(d); };
  const dowMon = s => (parseD(s).getUTCDay() + 6) % 7;
  const daysIn = s => new Date(Date.UTC(+s.slice(0, 4), +s.slice(5, 7), 0)).getUTCDate();
  const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const nice = s => `${WD[dowMon(s)]}, ${+s.slice(8)} ${MO[+s.slice(5, 7) - 1]}`;
  const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* Workout days: Mon, Wed, Fri, Sun. Change with ?wdays=mon,tue,thu  (a day that has a log row is always shown) */
  const SCHED = (() => {
    const names = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    const raw = (q.get('wdays') || 'mon,wed,fri,sun').toLowerCase().split(',').map(x => x.trim().slice(0, 3));
    const set = new Set(raw.map(x => names.indexOf(x)).filter(i => i >= 0));
    return set.size ? set : new Set([0, 2, 4, 6]);
  })();
  /* Which cards to show: ?cards=mustdo,workout  or  ?cards=meal  (to use two separate embeds) */
  const SHOW = (() => {
    const c = (q.get('cards') || '').split(',').map(x => x.trim());
    const list = ORDER.filter(k => c.includes(k));
    return list.length ? list : ORDER;
  })();

  let RANGE = q.get('range') === 'month' ? 'month' : 'week';
  let DATA = null;
  let animateNext = true;
  let lastSig = '';
  const COMPS = {};

  /* ============================================================
     Rows -> numbers
     ============================================================ */
  function period(today) {
    if (RANGE === 'week') return { start: addDays(today, -dowMon(today)), n: 7, label: 'this week' };
    return { start: today.slice(0, 8) + '01', n: daysIn(today), label: 'this month' };
  }
  const habitRank = l => { const i = HABIT_ORDER.indexOf(l); return i < 0 ? 99 : i; };

  function compute(kind, block, today) {
    if (!block) return null;
    if (block.error) return { error: block.error, hint: block.hint };
    const per = period(today);
    const byDate = new Map();
    (block.rows || []).forEach(r => {
      const prev = byDate.get(r.date);
      if (!prev || r.items.filter(i => i.done).length > prev.items.filter(i => i.done).length) byDate.set(r.date, r);
    });

    const days = [];
    let sum = 0, counted = 0, logged = 0, sessions = 0, planned = 0;
    const tally = new Map();
    const labels = new Set();
    for (let i = 0; i < per.n; i++) {
      const date = addDays(per.start, i);
      const row = byDate.get(date);
      const isFuture = date > today;
      const d = { date, i, k: i, dow: dowMon(date), state: 'future', pct: 0, done: 0, total: 0, missed: [], map: null, isToday: date === today };
      if (row) {
        d.map = new Map(row.items.map(x => [x.label, x.done]));
        d.total = row.items.length;
        d.done = row.items.filter(x => x.done).length;
        d.pct = d.total ? d.done / d.total : 0;
        d.missed = row.items.filter(x => !x.done).map(x => x.label);
        row.items.forEach(x => labels.add(x.label));
        if (isFuture) { d.state = 'plan'; planned++; }
        else {
          d.state = 'row'; logged++; sum += d.pct; counted++;
          if (d.done > 0) sessions++;
          row.items.forEach(x => tally.set(x.label, (tally.get(x.label) || 0) + (x.done ? 1 : 0)));
        }
      } else if (!isFuture) {
        if (kind === 'mustdo') { d.state = 'row'; d.noRow = true; counted++; }
        else d.state = 'missing';
      }
      days.push(d);
    }
    if (kind === 'workout') {
      const keep = days.filter(d => SCHED.has(d.dow) || d.map);
      days.length = 0; keep.forEach((d, idx) => { d.i = idx; days.push(d); });
    }
    const out = { per, days, avg: counted ? Math.round((sum / counted) * 100) : null, counted, logged, sessions, planned, tally, rowsUsed: logged };

    if (kind === 'mustdo') {
      // habit x day grid
      let hl = [...labels];
      if (!hl.length) (block.rows || []).forEach(r => r.items.forEach(x => { if (!hl.includes(x.label)) hl.push(x.label); }));
      hl.sort((a, b) => habitRank(a) - habitRank(b) || a.localeCompare(b));
      out.habits = hl.map(label => ({
        label,
        cells: days.map(d => d.state === 'future' || d.state === 'plan' ? 'future' : d.noRow ? 'none' : (d.map && d.map.get(label)) ? 'done' : 'miss'),
        n: days.filter(d => d.map && d.state === 'row' && d.map.get(label)).length,
      }));
      // current streaks (looks back past the period, up to 60 days)
      const all = new Map((block.rows || []).map(r => [r.date, new Map(r.items.map(x => [x.label, x.done]))]));
      let best = null;
      hl.forEach(label => {
        let n = 0;
        for (let k = 0; k < 60; k++) {
          const dt = addDays(today, -k);
          const m = all.get(dt);
          const done = m && m.get(label);
          if (done) n++;
          else if (k === 0) continue;
          else break;
        }
        if (n >= 2 && (!best || n > best.n)) best = { label, n };
      });
      out.streak = best;
    }
    return out;
  }

  /* ============================================================
     Drawing
     ============================================================ */
  const pctTxt = p => Math.round(p * 100) + '%';

  function headHTML(kind, comp) {
    const K = KINDS[kind];
    let sub = '';
    if (comp && !comp.error) {
      if (kind === 'mustdo') sub = `${comp.per.label} · ${comp.logged} of ${comp.counted} days logged`;
      else if (kind === 'workout') sub = `${comp.per.label} · ${comp.sessions} done${comp.planned ? ` · ${comp.planned} planned` : ''}`;
      else sub = `${comp.per.label} · ${comp.logged} day${comp.logged === 1 ? '' : 's'} logged`;
    }
    const avg = comp && !comp.error && comp.avg != null ? comp.avg + '%' : '–';
    return `<div class="card-head"><div class="ct"><span class="ico"><svg viewBox="0 0 24 24" aria-hidden="true">${K.icon}</svg></span>
      <div class="ttl2"><h2>${K.name}</h2><div class="sub2">${esc(sub)}</div></div></div>
      <div class="count" title="Average ${comp && comp.per ? comp.per.label : ''}"><small>avg</small> ${avg}</div></div>`;
  }

  /* week: glass columns with value pills (like the slider chart in your reference) */
  function columnsHTML(kind, comp) {
    let h = `<div class="cols" style="--n:${comp.days.length}">`;
    const long = comp.days.length < 7;
    comp.days.forEach(d => {
      const has = d.state === 'row' && !d.noRow;
      const p = has ? d.pct : 0;
      const cls = ['col', d.state, d.isToday ? 'today' : ''].join(' ');
      h += `<div class="${cls}"><div class="hit" data-k="${kind}" data-i="${d.i}"></div>
        <div class="trk"><div class="fl" style="--p:${p};--i:${d.i}"></div></div>
        ${has ? `<div class="pill" style="--p:${p}">${Math.round(p * 100)}</div>` : ''}
        ${d.state === 'plan' ? '<div class="pill ghost">plan</div>' : ''}
        ${d.isToday ? `<img class="hat" alt="" src="${HAT}" style="--p:${p}">` : ''}
        <div class="dn">${long ? WD[d.dow] : WD[d.dow][0]}</div></div>`;
    });
    return h + '</div>';
  }

  /* month: smooth gradient wave (like the area chart in your reference) */
  function waveHTML(kind, comp, gid) {
    const W = 520, H = 150, padX = 14, top = 22, base = 118;
    const n = comp.days.length;
    const x = i => padX + (i * (W - 2 * padX)) / Math.max(1, n - 1);
    const y = p => base - p * (base - top);
    const pts = comp.days.filter(d => d.state === 'row' && (kind === 'mustdo' || !d.noRow)).map(d => [x(d.i), y(d.pct), d]);
    let s = `<defs><linearGradient id="g-${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgb(var(--c) / .95)"/><stop offset="1" stop-color="rgb(var(--c2) / .08)"/></linearGradient>
      <linearGradient id="l-${gid}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="rgb(var(--c2))"/><stop offset="1" stop-color="rgb(255 255 255)"/></linearGradient></defs>`;
    [0.25, 0.5, 0.75, 1].forEach(p => { s += `<line class="gl" x1="${padX - 6}" x2="${W - padX + 6}" y1="${y(p).toFixed(1)}" y2="${y(p).toFixed(1)}"/>`; });
    s += `<line class="gl base" x1="${padX - 6}" x2="${W - padX + 6}" y1="${base}" y2="${base}"/>`;
    if (pts.length >= 2) {
      let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
      for (let k = 0; k < pts.length - 1; k++) {
        const p0 = pts[k - 1] || pts[k], p1 = pts[k], p2 = pts[k + 1], p3 = pts[k + 2] || p2;
        const t = 0.18;
        const c1x = p1[0] + (p2[0] - p0[0]) * t, c1y = Math.min(base, p1[1] + (p2[1] - p0[1]) * t);
        const c2x = p2[0] - (p3[0] - p1[0]) * t, c2y = Math.min(base, p2[1] - (p3[1] - p1[1]) * t);
        d += ` C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
      }
      const last = pts[pts.length - 1], first = pts[0];
      s += `<path class="area" d="${d} L${last[0].toFixed(1)} ${base} L${first[0].toFixed(1)} ${base} Z" fill="url(#g-${gid})"/>`;
      s += `<path class="line" d="${d}" stroke="url(#l-${gid})" pathLength="1"/>`;
    }
    pts.forEach(([px, py, d]) => {
      s += `<circle class="pt${d.isToday ? ' today' : ''}" cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${d.isToday ? 4.5 : 3}"/>`;
    });
    comp.days.forEach(d => {
      if (d.state === 'plan') s += `<circle class="planpt" cx="${x(d.i).toFixed(1)}" cy="${base - 5}" r="3.4"/>`;
    });
    comp.days.forEach(d => {
      const dn = +d.date.slice(8);
      if ((kind === 'workout' ? n <= 20 : (dn === 1 || dn % 5 === 0)) || d.isToday) s += `<text class="xl${d.isToday ? ' today' : ''}" x="${x(d.i).toFixed(1)}" y="${base + 18}">${dn}</text>`;
    });
    const today = comp.days.find(d => d.isToday);
    if (today) {
      const hasPt = today.state === 'row';
      const ty = hasPt ? y(today.pct) : base;
      s += `<image class="mk" href="${HAT}" x="${(x(today.i) - 12).toFixed(1)}" y="${(ty - 32).toFixed(1)}" width="24" height="24"/>`;
    }
    const slot = (W - 2 * padX) / Math.max(1, n - 1);
    comp.days.forEach(d => {
      s += `<rect class="hit" data-k="${kind}" data-i="${d.i}" x="${(x(d.i) - slot / 2).toFixed(1)}" y="0" width="${slot.toFixed(1)}" height="${H}" fill="transparent"/>`;
    });
    return `<svg class="wave" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">${s}</svg>`;
  }

  function chartHTML(kind, comp) {
    if (RANGE === 'week') return columnsHTML(kind, comp);
    return waveHTML(kind, comp, kind);
  }

  /* must do: habit-by-day grid */
  function gridHTML(comp) {
    const n = comp.days.length;
    let h = `<div class="hgrid${RANGE === 'month' ? ' m' : ''}" style="--n:${n}"><div class="hrow hh"><div class="hl"></div><div class="hd">`;
    comp.days.forEach(d => {
      const show = RANGE === 'week' || d.k === 0 || (d.k + 1) % 5 === 0 || d.isToday;
      h += `<span class="${d.isToday ? 'today' : ''}">${show ? (RANGE === 'week' ? WD[d.dow][0] : d.k + 1) : ''}</span>`;
    });
    h += '</div></div>';
    comp.habits.forEach((hb, hi) => {
      h += `<div class="hrow"><div class="hl" title="${esc(hb.label)}">${esc(hb.label)}</div><div class="hd">`;
      hb.cells.forEach((c, i) => {
        h += `<span class="dot ${c}${comp.days[i].isToday ? ' today' : ''}" style="--i:${hi * 2 + i}"><i class="hit" data-k="mustdo" data-i="${i}" data-h="${esc(hb.label)}" data-c="${c}"></i></span>`;
      });
      h += '</div></div>';
    });
    return h + '</div>';
  }

  /* workout / meals: horizontal item bars */
  function barsHTML(list, denom, unit, title) {
    if (!list.length) return '';
    let h = title ? `<div class="bt">${title}</div>` : '';
    list.forEach(([label, n], i) => {
      const p = denom ? n / denom : 0;
      h += `<div class="br"><div class="bl" title="${esc(label)}">${esc(label)}</div>
        <div class="bk"><div class="bf" style="--p:${p};--i:${i}"></div></div><div class="bn">${n}/${denom}</div></div>`;
    });
    return h;
  }

  function bodyHTML(kind, comp) {
    if (!comp) return '<div class="panel"><div class="note">Loading…</div></div>';
    if (comp.error) return `<div class="panel"><div class="note"><b>Could not load</b><br>${esc(comp.error)}${comp.hint ? '<br>' + esc(comp.hint) : ''}</div></div>`;
    const noLogs = comp.logged === 0 && kind !== 'mustdo';
    let h = `<div class="panel chart ${RANGE}">${chartHTML(kind, comp)}${noLogs ? `<div class="note over">No logs ${comp.per.label} yet</div>` : ''}</div>`;
    if (kind === 'meal') h = '<div class="two">' + h;
    const arr = [...comp.tally.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    if (kind === 'mustdo') {
      h += `<div class="streak">${comp.streak ? `<i class="sp"></i><span>Best streak</span> <b>${esc(comp.streak.label)}</b> <span>· ${comp.streak.n} days</span>` : '<i class="sp"></i><span>No streak yet. A few days in a row will light this up.</span>'}</div>`;
      if (comp.habits.length) h += `<div class="panel">${gridHTML(comp)}</div>`;
    } else if (kind === 'workout') {
      const b = barsHTML(arr, comp.rowsUsed, 'sessions', '');
      h += `<div class="panel bars"><div class="bh">What you do in a session</div>${b || '<div class="note">Exercises appear here once you log a session.</div>'}</div>`;
    } else {
      const top = arr.slice(0, 3);
      const low = arr.slice(-4).reverse().filter(x => !top.includes(x));
      const b = barsHTML(top, comp.rowsUsed, 'days', 'Most eaten') + barsHTML(low.slice(0, 3), comp.rowsUsed, 'days', 'Most skipped');
      h += `<div class="panel bars">${b || '<div class="note">Foods appear here once you log a day.</div>'}</div></div>`;
    }
    return h;
  }

  /* ---------- build / refresh ---------- */
  function build() {
    const wrap = $('cards');
    wrap.textContent = '';
    SHOW.forEach((kind, idx) => {
      const K = KINDS[kind];
      const card = document.createElement('section');
      card.className = 'card ' + kind;
      card.id = 'card-' + kind;
      card.style.cssText = `--c:${K.c};--c2:${K.c2}`;
      const inner = document.createElement('div');
      inner.className = 'inner'; inner.id = 'in-' + kind;
      card.appendChild(inner);
      wrap.appendChild(card);
    });
  }

  function draw() {
    const today = (DATA && DATA.today) || localToday();
    SHOW.forEach(kind => {
      const comp = DATA ? compute(kind, DATA[kind], today) : null;
      COMPS[kind] = comp;
      $('in-' + kind).innerHTML = headHTML(kind, comp) + bodyHTML(kind, comp);
      $('in-' + kind).querySelectorAll('.hat').forEach(im => im.addEventListener('error', () => im.remove(), { once: true }));
      $('in-' + kind).querySelectorAll('.mk').forEach(im => im.addEventListener('error', () => im.remove(), { once: true }));
    });
    $('cards').classList.toggle('anim', animateNext);
    $('cards').classList.toggle('one', SHOW.length === 1);
    animateNext = false;
    document.querySelectorAll('.seg button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.r === RANGE)));
    document.querySelector('.seg').dataset.r = RANGE;
    refit();
  }

  /* ---------- fit: scale the whole widget to the height of the Notion embed ---------- */
  /* So there is never a scrollbar inside the widget, whatever height you drag the embed to. */
  function fit() {
    const box = $('fitBox'), el = $('fit');
    el.style.transform = 'none'; el.style.width = ''; box.style.height = '';
    if (innerWidth < 760) return;                 // phones: just stack and scroll the page
    let z = 1;
    for (let k = 0; k < 8; k++) {
      const h = el.offsetHeight * z;               // height as currently drawn
      const nz = Math.max(0.55, Math.min(1, z * (innerHeight - 3) / Math.max(1, h)));
      if (Math.abs(nz - z) < 0.002) break;
      z = nz;
      el.style.width = `calc(100% / ${z})`;
      el.style.transform = `scale(${z})`;
    }
    box.style.height = Math.ceil(el.offsetHeight * z) + 'px';
  }
  const refit = () => requestAnimationFrame(fit);
  addEventListener('resize', refit);

  /* ---------- tooltip ---------- */
  const tip = $('tip');
  function showTip(el, ev) {
    const kind = el.dataset.k, comp = COMPS[kind];
    if (!comp || comp.error) return;
    const d = comp.days[+el.dataset.i];
    let html = `<b>${nice(d.date)}</b>`;
    if (el.dataset.h) {
      const c = el.dataset.c;
      html += `${esc(el.dataset.h)}<div class="m">${c === 'done' ? 'Done' : c === 'miss' ? 'Not done' : c === 'none' ? 'Nothing logged' : 'Still to come'}</div>`;
    } else {
      if (d.state === 'row' && d.noRow) html += 'Nothing logged this day · 0%';
      else if (d.state === 'row') html += `${d.done} of ${d.total} done · ${Math.round(d.pct * 100)}%`;
      else if (d.state === 'plan') html += `Planned · ${d.total} items`;
      else if (d.state === 'missing') html += 'Nothing logged';
      else html += 'Still to come';
      if ((d.state === 'row' || d.state === 'plan') && d.missed.length && !d.noRow) {
        const m = d.missed.slice(0, 4).join(', ') + (d.missed.length > 4 ? ` +${d.missed.length - 4} more` : '');
        html += `<div class="m">${d.state === 'plan' ? 'To do' : 'Missed'}: ${esc(m)}</div>`;
      }
    }
    tip.innerHTML = html;
    tip.classList.add('on');
    moveTip(ev);
  }
  function moveTip(ev) {
    const pad = 12;
    const r = tip.getBoundingClientRect();
    let x = ev.clientX + 14, y = ev.clientY - r.height - 10;
    if (x + r.width > innerWidth - pad) x = ev.clientX - r.width - 14;
    if (y < pad) y = ev.clientY + 18;
    tip.style.left = Math.max(pad, x) + 'px';
    tip.style.top = Math.max(pad, y) + 'px';
  }
  const onPtr = ev => {
    const el = ev.target.closest && ev.target.closest('.hit');
    if (el) showTip(el, ev); else tip.classList.remove('on');
  };
  document.addEventListener('pointermove', onPtr);
  document.addEventListener('pointerdown', onPtr);
  document.addEventListener('pointerleave', () => tip.classList.remove('on'));

  document.querySelectorAll('.seg button').forEach(b => b.addEventListener('click', () => {
    if (RANGE === b.dataset.r) return;
    RANGE = b.dataset.r; animateNext = true; draw();
  }));

  function message(title, text) {
    const m = $('msg');
    if (!title) { m.hidden = true; return; }
    $('msgT').textContent = title; $('msgS').textContent = text || '';
    m.hidden = false;
  }

  /* ============================================================
     Data: Notion through /api/status, or demo numbers
     ============================================================ */
  let loadTimer = null;
  async function load() {
    clearTimeout(loadTimer);
    try {
      const res = await fetch('/api/status', { headers: { 'x-widget-key': KEY }, cache: 'no-store' });
      let d = {};
      try { d = await res.json(); } catch { /* not json */ }
      if (!res.ok) {
        const e = new Error(d.error || `Request failed (${res.status})`); e.hint = d.hint; e.status = res.status; throw e;
      }
      const sig = JSON.stringify([d.today, d.mustdo, d.workout, d.meal]);
      const errs = ORDER.filter(k => d[k] && d[k].error);
      message(errs.length === 3 ? 'Could not read your logs' : '', errs.length === 3 ? (d[errs[0]].error + ' ' + (d[errs[0]].hint || '')) : '');
      if (sig !== lastSig) { lastSig = sig; DATA = d; draw(); }
    } catch (e) {
      if (!DATA) message(e.status === 401 ? 'Key not accepted' : "Couldn't reach the harbor", (e.message || '') + (e.hint ? ' ' + e.hint : ''));
    } finally {
      loadTimer = setTimeout(load, 60000);
    }
  }

  function demoData() {
    const today = localToday();
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const mk = (names, p) => names.map(label => ({ label, done: rnd() < p }));
    const habits = [...HABIT_ORDER];
    const ex = ['Pre-Workout Snack', 'Wide Pushups x2', 'Incline Pushups x2', 'Diamond Pushups x2', 'Wide Pullups x2', 'Close Pullups x2', 'Chin ups x2', 'Goated Leg', 'Post-Workout Snack'];
    const meals = ['10 Chapatis', '1–2 Bananas', '2 Cups Dal', '3 Eggs', '35–50g Peanuts', '50g Soy', 'Chia + Flax', 'Cooked Vegetable', 'Curd', 'Milk', 'Pumpkin + Sunflower Seeds', 'Salad', 'Sprouts', 'Vitamin-C Fruit'];
    const out = { today, mustdo: { rows: [] }, workout: { rows: [] }, meal: { rows: [] } };
    if (DEMO === 'empty') return out;
    for (let i = -34; i <= 0; i++) {
      const date = addDays(today, i);
      if (rnd() < .2) continue;
      out.mustdo.rows.push({ date, items: mk(habits, .35 + rnd() * .5) });
    }
    for (let i = -34; i <= 14; i++) {
      const date = addDays(today, i);
      const dw = dowMon(date);
      if (dw === 0 || dw === 2 || dw === 4 || dw === 6) out.workout.rows.push({ date, items: i > 0 ? ex.map(label => ({ label, done: false })) : mk(ex, .3 + rnd() * .5) });
      if (i <= 0 && rnd() < .6) out.meal.rows.push({ date, items: mk(meals, .2 + rnd() * .65) });
    }
    return out;
  }

  /* ============================================================
     Time-synced sky (same palette + curve as the sky banner)
     ============================================================ */
  const num = (k, d) => { const v = parseFloat(q.get(k)); return Number.isFinite(v) ? v : d; };
  const LAT = num('lat', 26.2183), LON = num('lon', 78.1828);
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = t => t * t * (3 - 2 * t);
  const mixC = (a, b, t) => a.map((v, i) => lerp(v, b[i], t));
  const rgb = c => c.map(v => Math.round(clamp(v, 0, 255))).join(' ');
  const pal = (top, mid, bot, seaTop, seaBot, cloud, cloudA, stars, aurora, shipB, shipS, spark) =>
    ({ top, mid, bot, seaTop, seaBot, cloud, cloudA, stars, aurora, shipB, shipS, spark });
  const P = {
    night:   pal([9,24,64],[14,52,112],[28,92,158],[20,72,150],[8,30,92],[70,110,165],.5,1,.9,.78,.9,[210,240,255]),
    dawn:    pal([70,76,140],[196,134,166],[252,190,150],[128,150,196],[52,80,142],[255,205,195],.8,.22,.15,.9,1,[255,235,220]),
    morning: pal([112,168,214],[176,212,226],[250,226,192],[92,170,204],[40,110,162],[255,244,236],.85,0,0,1,1,[255,255,255]),
    day:     pal([66,148,224],[122,190,236],[196,228,242],[62,152,208],[28,96,162],[255,255,255],.9,0,0,1,1,[255,255,255]),
    golden:  pal([96,150,204],[248,208,142],[255,172,112],[104,170,192],[40,108,150],[255,218,176],.85,0,0,.95,1.05,[255,240,210]),
    sunset:  pal([112,160,172],[250,192,110],[238,102,62],[66,172,172],[20,120,132],[206,92,92],.75,0,0,.8,1.1,[255,236,190]),
    dusk:    pal([42,52,112],[122,72,132],[232,112,102],[62,72,142],[22,42,102],[156,92,134],.65,.5,.35,.78,1,[255,225,215]),
  };
  function blend(a, b, t) {
    const o = {};
    for (const k in a) o[k] = Array.isArray(a[k]) ? mixC(a[k], b[k], t) : lerp(a[k], b[k], t);
    return o;
  }
  function skyAt(h, sr, ss) {
    const ks = [
      [0, P.night], [sr - 1.5, P.night], [sr - .35, P.dawn], [sr + 1.6, P.morning],
      [sr + 4.2, P.day], [ss - 3.0, P.day], [ss - 1.2, P.golden], [ss - .05, P.sunset],
      [ss + .9, P.dusk], [ss + 2.1, P.night], [24, P.night],
    ];
    for (let i = 0; i < ks.length - 1; i++) {
      const [h0, a] = ks[i], [h1, b] = ks[i + 1];
      if (h >= h0 && h <= h1) return blend(a, b, h1 === h0 ? 0 : smooth((h - h0) / (h1 - h0)));
    }
    return P.night;
  }
  let SR = 6.3, SS = 18.1;
  function estimateSun(d) {
    const rad = Math.PI / 180;
    const N = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 864e5);
    const decl = 23.44 * rad * Math.sin(2 * Math.PI * (284 + N) / 365);
    const phi = LAT * rad;
    const cosH = (Math.sin(-0.833 * rad) - Math.sin(phi) * Math.sin(decl)) / (Math.cos(phi) * Math.cos(decl));
    const H = Math.acos(clamp(cosH, -1, 1)) / rad / 15;
    const B = 2 * Math.PI * (N - 81) / 364;
    const E = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
    const noon = 12 + (-new Date().getTimezoneOffset() / 4 - LON) / 15 - E / 60;
    return { sr: noon - H, ss: noon + H };
  }
  { const s = estimateSun(new Date()); if (Number.isFinite(s.sr) && Number.isFinite(s.ss)) { SR = s.sr; SS = s.ss; } }
  const PREVIEW = (() => {
    const t = q.get('time');
    if (!t) return null;
    const m = /^(\d{1,2})(?::(\d{2}))?$/.exec(t.trim());
    return m ? clamp(+m[1] + (m[2] ? +m[2] / 60 : 0), 0, 23.99) : null;
  })();
  function applySky() {
    const d = new Date();
    const h = PREVIEW != null ? PREVIEW : d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
    const k = skyAt(h, SR, SS);
    const set = (n, v) => root.style.setProperty(n, v);
    set('--sky-top', rgb(k.top)); set('--sky-mid', rgb(k.mid)); set('--sky-bot', rgb(k.bot));
    set('--sea-top', rgb(k.seaTop)); set('--sea-bot', rgb(k.seaBot));
    set('--spark', rgb(k.spark)); set('--stars', k.stars.toFixed(3));
    set('--cloud', rgb(k.cloud)); set('--cloud-a', k.cloudA.toFixed(3));
    set('--wave-l', rgb(mixC(k.seaTop, [255, 255, 255], .35))); set('--wave-d', rgb(mixC(k.seaBot, [0, 6, 30], .35)));
  }
  async function fetchSun() {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 8000);
      const res = await fetch('https://api.open-meteo.com/v1/forecast?latitude=' + LAT + '&longitude=' + LON + '&daily=sunrise,sunset&timezone=auto&forecast_days=1', { signal: ctl.signal });
      clearTimeout(t);
      if (!res.ok) return;
      const data = await res.json();
      const p = s => { const m = /T(\d\d):(\d\d)/.exec(s || ''); return m ? +m[1] + +m[2] / 60 : null; };
      const sr = p(data.daily && data.daily.sunrise && data.daily.sunrise[0]);
      const ss = p(data.daily && data.daily.sunset && data.daily.sunset[0]);
      if (sr && ss && ss > sr) { SR = sr; SS = ss; applySky(); }
    } catch { /* offline estimate is good enough */ }
  }
  function seeded(seed) {
    return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  /* the header banner: live sky, drifting clouds, layered waves (same recipe as the Sky Banner) */
  function buildBanner() {
    const r = seeded(9);
    const stars = $('bStars');
    for (let i = 0; i < 26; i++) {
      const el = document.createElement('i'); el.className = 'star';
      el.style.cssText = `left:${r() * 100}%;top:${r() * 46}%;--d:${2 + r() * 3}s;--dl:${-r() * 4}s;--s:${1.5 + r() * 1.5}px`;
      stars.appendChild(el);
    }
    const CL = '<svg viewBox="0 0 200 80" aria-hidden="true"><g fill="currentColor"><ellipse cx="60" cy="52" rx="48" ry="22"/><ellipse cx="108" cy="38" rx="44" ry="28"/><ellipse cx="152" cy="54" rx="42" ry="20"/><ellipse cx="100" cy="58" rx="74" ry="20"/></g></svg>';
    [{ top: 8, w: 13, sp: 130, ph: .1 }, { top: 30, w: 9, sp: 170, ph: .42 }, { top: 12, w: 15, sp: 150, ph: .74 }, { top: 34, w: 8, sp: 190, ph: .9 }].forEach(c => {
      const el = document.createElement('div'); el.className = 'cld'; el.innerHTML = CL;
      el.style.cssText = `top:${c.top}%;width:${c.w}%;animation-duration:${c.sp}s;animation-delay:-${(c.ph * c.sp).toFixed(1)}s`;
      $('bClouds').appendChild(el);
    });
    const sea = $('bSea');
    const wave = (cls, top, height, half, amp, dur, rev) => {
      const wv = document.createElement('div'); wv.className = 'wv ' + cls;
      wv.style.cssText = `top:${top}%;height:${height}%;animation-duration:${dur}s;${rev ? 'animation-direction:reverse;' : ''}`;
      let d = `M0 30 q${half / 2} ${-amp} ${half} 0` + ` t${half} 0`.repeat(Math.round(2400 / half) - 1) + ' V60 H0 Z';
      wv.innerHTML = `<svg viewBox="0 0 2400 60" preserveAspectRatio="none"><path d="${d}"/></svg>`;
      sea.appendChild(wv);
    };
    wave('l', 0, 46, 120, 9, 34); wave('d', 22, 56, 170, 11, 26, true); wave('l', 48, 58, 230, 11, 19);
  }

  /* ---------- go ---------- */
  applySky();
  if (PREVIEW == null) { setInterval(applySky, 30000); fetchSun(); }
  buildBanner();
  build();
  draw();

  if (isDemo) { DATA = demoData(); draw(); }
  else if (!KEY) message('One more step', 'Add ?⁠key=⁠YOUR_WIDGET_KEY to the end of this widget\'s URL.');
  else {
    load();
    document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
  }
})();
