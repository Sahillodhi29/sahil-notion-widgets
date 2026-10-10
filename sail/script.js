/* ============================================================
   Today's Adventure
   Reads today's to-dos and Must Do's through /api/sail and lets you
   tick them off. Your straw hat rides the progress ribbon, and the
   cards wear the same live, time-synced sky as the sky banner.

   URL options:
     ?key=YOUR_WIDGET_KEY     required (the password set in Vercel)
     ?rows=3                  how many tasks to show per card (1-6)
     ?demo=1                  sample data, nothing is saved
     ?demo=alldone | calm     preview the "nothing left" states
     ?todoLink= ?mustLink=    where "Open full page" goes
     ?time=14:30              preview the sky at a time of day
     ?lat= &lon=              sky location (default Gwalior)
     ?hat=assets/hat.png      rider image (also ?hatTodo= ?hatMust=)
   ============================================================ */
(() => {
  'use strict';

  const q = new URLSearchParams(location.search);
  const KEY = q.get('key') || '';
  const DEMO = q.get('demo');
  const isDemo = DEMO !== null;
  const ROWS = Math.min(6, Math.max(1, parseInt(q.get('rows'), 10) || 3));
  const ENDPOINT = '/api/sail';
  const LINKS = {
    todo: q.get('todoLink') || 'https://app.notion.com/p/3e7fa221698780fc8fc2c467f60aeced',
    must: q.get('mustLink') || 'https://app.notion.com/p/3e7fa2216987802cb5dcdc99fee6184b',
  };
  const LIST_NAMES = { general: 'General', self: 'Self' };

  const $ = id => document.getElementById(id);
  document.documentElement.style.setProperty('--rows', ROWS);
  $('todoLink').href = LINKS.todo;
  $('mustLink').href = LINKS.must;

  const CARDS = {
    todo: { card: $('todoCard'), list: $('todoList'), empty: $('todoEmpty'), et: $('todoEt'), es: $('todoEs'),
            count: $('todoCount'), fill: $('todoFill'), bar: $('todoBar'), more: $('todoMore'), cheer: $('todoCheer'), prev: null },
    must: { card: $('mustCard'), list: $('mustList'), empty: $('mustEmpty'), et: $('mustEt'), es: $('mustEs'),
            count: $('mustCount'), fill: $('mustFill'), bar: $('mustBar'), more: $('mustMore'), cheer: $('mustCheer'), prev: null },
  };


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
    const set = (n, v) => document.documentElement.style.setProperty(n, v);
    set('--sky-top', rgb(k.top)); set('--sky-mid', rgb(k.mid)); set('--sky-bot', rgb(k.bot));
    set('--sea-top', rgb(k.seaTop)); set('--sea-bot', rgb(k.seaBot));
    set('--spark', rgb(k.spark)); set('--stars', k.stars.toFixed(3)); set('--aurora', k.aurora.toFixed(3));
    set('--cloud', rgb(k.cloud)); set('--cloud-a', k.cloudA.toFixed(3));
  }
  async function fetchSun() {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 8000);
      const res = await fetch('https://api.open-meteo.com/v1/forecast?latitude=' + LAT + '&longitude=' + LON +
        '&daily=sunrise,sunset&timezone=auto&forecast_days=1', { signal: ctl.signal });
      clearTimeout(t);
      if (!res.ok) return;
      const data = await res.json();
      const parse = s => { const m = /T(\d\d):(\d\d)/.exec(s || ''); return m ? +m[1] + +m[2] / 60 : null; };
      const sr = parse(data.daily && data.daily.sunrise && data.daily.sunrise[0]);
      const ss = parse(data.daily && data.daily.sunset && data.daily.sunset[0]);
      if (sr && ss && ss > sr) { SR = sr; SS = ss; applySky(); }
    } catch { /* the offline estimate is already good enough */ }
  }

  /* seeded little decorations inside each card */
  function seeded(seed) {
    return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function decorate(card, seed) {
    const r = seeded(seed);
    const deco = el('div', 'deco');
    deco.appendChild(el('i', 'aur'));
    for (let i = 0; i < 3; i++) {
      const c = el('i', 'cld');
      c.style.cssText = `top:${8 + r() * 42}%;left:0;--w:${90 + r() * 90}px;--h:${22 + r() * 22}px;--d:${55 + r() * 50}s;--dl:${-r() * 80}s`;
      deco.appendChild(c);
    }
    for (let i = 0; i < 22; i++) {
      const s = el('i', 'star');
      s.style.cssText = `left:${r() * 100}%;top:${r() * 62}%;--o:${.5 + r() * .5};--d:${2 + r() * 3}s;--dl:${-r() * 4}s`;
      if (r() > .8) { s.style.width = s.style.height = '3px'; }
      deco.appendChild(s);
    }
    for (let i = 0; i < 6; i++) {
      const s = el('i', 'spk');
      s.style.cssText = `left:${6 + r() * 88}%;top:${4 + r() * 50}%;--s:${4 + r() * 4}px;--d:${2.6 + r() * 2.6}s;--dl:${-r() * 4}s`;
      deco.appendChild(s);
    }
    card.insertBefore(deco, card.firstChild);

    const sea = el('div', 'sea');
    const wave = (cls, amp, off) => {
      const ns = 'http://www.w3.org/2000/svg';
      const sv = document.createElementNS(ns, 'svg');
      sv.setAttribute('viewBox', '0 0 800 60'); sv.setAttribute('preserveAspectRatio', 'none');
      let d = `M0 ${30 + off}`;
      for (let x = 0; x < 800; x += 100) d += ` q25 ${-amp} 50 0 t50 0`;
      d += ' V60 H0 Z';
      const p = document.createElementNS(ns, 'path');
      p.setAttribute('d', d);
      sv.setAttribute('class', cls);
      sv.appendChild(p);
      return sv;
    };
    sea.append(wave('w1', 16, 4), wave('w2', 12, 14));
    card.insertBefore(sea, deco.nextSibling);
  }
  /* the rider image: user's straw hat, with a tiny drawn fallback */
  const HAT_FALLBACK = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><ellipse cx="24" cy="31" rx="21" ry="8" fill="#f6c453"/>' +
    '<path d="M10 30c0-14 28-14 28 0z" fill="#fbd873"/><path d="M10.5 28.5c8 3 19 3 27 0l.5 3c-8 3.2-20 3.2-28 0z" fill="#e0262d"/></svg>');
  function setupHats() {
    ['todo', 'must'].forEach(k => {
      const img = CARDS[k].card.querySelector('.hat');
      const src = q.get(k === 'todo' ? 'hatTodo' : 'hatMust') || q.get('hat') || 'assets/hat.png';
      img.addEventListener('error', () => { if (img.src !== HAT_FALLBACK) img.src = HAT_FALLBACK; }, { once: true });
      img.src = src;
    });
  }
  function burst(kind, n) {
    const box = CARDS[kind].fill.querySelector('.burst');
    const cols = kind === 'must' ? ['#9ff5e0', '#ffffff', '#f6a8c8', '#5eead4'] : ['#ffe6a8', '#ffffff', '#ff9a8a', '#ffc27a'];
    for (let i = 0; i < n; i++) {
      const p = document.createElement('i');
      const a = (Math.PI * 2 * i) / n + Math.random() * .6;
      const dist = 26 + Math.random() * 30;
      p.style.cssText = `--dx:${Math.cos(a) * dist}px;--dy:${Math.sin(a) * dist - 10}px;--c:${cols[i % cols.length]};--s:${4 + Math.random() * 4}px;--t:${.7 + Math.random() * .4}s`;
      box.appendChild(p);
      setTimeout(() => p.remove(), 1200);
    }
  }

  /* ---------- state ----------
     item.state: 'open' | 'completing' (animating out) | 'gone' (finished) */
  const S = {
    today: '',
    todo: { items: [], total: 0, backlog: 0, error: null, hint: null, ready: false },
    must: { items: [], pageId: null, error: null, hint: null, ready: false, missing: false },
  };
  let inflight = 0;
  let loading = false;
  let ensuring = false;
  let timer = null;
  let failures = 0;

  /* ---------- small helpers ---------- */
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  const NS = 'http://www.w3.org/2000/svg';
  function svg(markup, cls) {
    const s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('aria-hidden', 'true');
    if (cls) s.setAttribute('class', cls);
    s.innerHTML = markup;     // markup is a fixed string from this file, never user data
    return s;
  }
  const CHECK = '<path d="M5 12.5l4.5 4.5L19 7.5"/>';
  const RECUR = '<path d="M20 11a8 8 0 0 0-14.5-4M4 13a8 8 0 0 0 14.5 4"/><path d="M5.5 3v4h4M18.5 21v-4h-4"/>';

  function localToday() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function fmtDay(s) {
    const d = new Date(s + 'T00:00:00Z');
    return `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()]}, ${d.getUTCDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]}`;
  }

  /* ---------- stats ---------- */
  function stats(kind) {
    if (kind === 'todo') {
      const open = S.todo.items.filter(i => i.state === 'open').length;
      const total = S.todo.total;
      return { done: Math.max(0, total - open), total, open };
    }
    const items = S.must.items;
    const open = items.filter(i => i.state === 'open').length;
    return { done: items.length - open, total: items.length, open };
  }
  function visible(kind) {
    const items = kind === 'todo' ? S.todo.items : S.must.items;
    return items.filter(i => i.state !== 'gone').slice(0, ROWS);
  }

  /* ---------- rendering ---------- */
  function makeRow(kind, it) {
    const li = el('li', 'row');
    li.dataset.id = it.id;
    const inner = el('div', 'rowin');
    const body = el('div', 'rowbody');
    body.setAttribute('role', 'button');
    body.tabIndex = 0;
    const check = el('button', 'check');
    check.type = 'button';
    check.tabIndex = -1;
    check.appendChild(svg(CHECK));
    const txt = el('div', 'txt');
    txt.appendChild(el('div', 'name'));
    txt.appendChild(el('div', 'meta'));
    body.append(check, txt);
    inner.appendChild(body);
    li.appendChild(inner);
    const act = () => complete(kind, it.id);
    body.addEventListener('click', act);
    body.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(); }
    });
    return li;
  }

  function fillRow(li, kind, it) {
    const body = li.querySelector('.rowbody');
    body.setAttribute('aria-label', `Mark done: ${it.title}`);
    li.querySelector('.name').textContent = it.title;
    const meta = li.querySelector('.meta');
    meta.textContent = '';
    if (kind !== 'todo') return;
    meta.appendChild(el('span', `chip ${it.list}`, LIST_NAMES[it.list] || it.list));
    if (it.overdue) meta.appendChild(el('span', 'due over', `Overdue · ${it.overdueDays}d`));
    else meta.appendChild(el('span', 'due today', 'Due today'));
    if (it.priority) {
      const p = el('span', `pri ${it.priority}`);
      p.title = `${it.priority} priority`;
      meta.appendChild(p);
    }
    if (it.recur) {
      const r = svg(RECUR, 'recur');
      r.setAttribute('aria-label', 'Repeats');
      meta.appendChild(r);
    }
  }

  function syncList(kind) {
    const c = CARDS[kind];
    const data = kind === 'todo' ? S.todo : S.must;
    if (!data.ready) return;

    // drop the skeleton the first time real content arrives
    if (c.list.querySelector('.sk')) c.list.textContent = '';

    const vis = data.error ? [] : visible(kind);
    const wanted = new Set(vis.map(i => i.id));

    [...c.list.children].forEach(li => {
      if (!wanted.has(li.dataset.id) && !li.classList.contains('leave')) {
        li.classList.add('leave');
        setTimeout(() => li.remove(), 380);
      }
    });

    const expected = vis.map(it => {
      let li = c.list.querySelector(`:scope > li[data-id="${CSS.escape(it.id)}"]:not(.leave)`);
      if (!li) { li = makeRow(kind, it); li.classList.add('enter'); }
      fillRow(li, kind, it);
      li.classList.toggle('done', it.state === 'completing');
      return li;
    });
    expected.forEach((li, i) => {
      const live = [...c.list.children].filter(n => !n.classList.contains('leave'));
      if (live[i] !== li) c.list.insertBefore(li, live[i] || null);
    });
  }

  function renderStats(kind) {
    const c = CARDS[kind];
    const data = kind === 'todo' ? S.todo : S.must;
    if (!data.ready) return;
    const { done, total, open } = stats(kind);
    const showStats = !data.error && total > 0;
    c.count.textContent = showStats ? `${done} / ${total}` : '–';
    const pct = showStats ? Math.round((done / total) * 100) : 0;
    c.fill.style.width = pct + '%';
    c.bar.setAttribute('aria-valuenow', String(pct));
    c.card.classList.toggle('complete', showStats && open === 0);
    c.card.classList.toggle('nostats', !showStats);

    // hat hops (and sparkles) when something just got ticked
    if (showStats && c.prev && c.prev.total === total && done > c.prev.done) {
      c.card.classList.remove('hop'); void c.card.offsetWidth; c.card.classList.add('hop');
      burst(kind, open === 0 ? 16 : 9);
      setTimeout(() => c.card.classList.remove('hop'), 1500);
    }
    c.prev = showStats ? { done, total } : null;

    // cheer line
    let cheer = '';
    if (showStats) {
      if (open === 0) cheer = "All done. Hats off, captain!";
      else if (done === 0) cheer = 'Hoist the sails. Let\'s go!';
      else if (done / total >= .75) cheer = open === 1 ? 'One more and you\'re there!' : `Almost there, ${open} to go!`;
      else cheer = `${open} more to go`;
    }
    c.cheer.textContent = cheer;

    // footer: how many more are waiting beyond the visible rows
    const hidden = Math.max(0, open - ROWS);
    const bits = [];
    if (!data.error && hidden > 0) bits.push(`+${hidden} more on deck`);
    if (kind === 'todo' && !data.error && S.todo.backlog > 0) bits.push(`${S.todo.backlog} without a date`);
    c.more.textContent = bits.join(' · ');
  }

  function renderEmpty(kind) {
    const c = CARDS[kind];
    const data = kind === 'todo' ? S.todo : S.must;
    if (!data.ready) return;
    const { total, open } = stats(kind);
    let show = false, et = '', es = '', err = false;
    if (data.error) {
      show = true; err = true;
      et = data.errTitle || "Couldn't reach the harbor";
      es = data.error + (data.hint ? ` ${data.hint}` : '');
    } else if (kind === 'must' && data.missing) {
      show = true; et = 'Setting sail…'; es = "Creating today's page in Must Do's.";
    } else if (visible(kind).length === 0 && open === 0) {
      show = true;
      if (kind === 'todo') {
        if (total === 0) { et = 'Calm seas today'; es = 'Nothing is due. Enjoy the quiet.'; }
        else { et = 'Nothing left for today'; es = 'Every task is done. Smooth sailing, captain.'; }
      } else {
        et = 'Nothing left for today'; es = "All your must-do's are checked off. Rest well.";
      }
    }
    c.empty.hidden = !show;
    c.empty.classList.toggle('error', err);
    if (show) { c.et.textContent = et; c.es.textContent = es; }
  }

  function render(kind) {
    if (kind) { syncList(kind); renderStats(kind); renderEmpty(kind); return; }
    ['todo', 'must'].forEach(render);
  }

  function skeleton() {
    ['todo', 'must'].forEach(k => {
      for (let i = 0; i < ROWS; i++) CARDS[k].list.appendChild(el('li', 'sk'));
    });
  }

  /* ---------- header / sync dot ---------- */
  function setSync(state, text, tip) {
    const s = $('sync');
    s.className = 'sync ' + state;
    $('syncText').textContent = text;
    s.title = tip || '';
  }
  const clock = () => new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  /* ---------- toast ---------- */
  let toastTimer = null;
  let toastUndo = null;
  function toast(text, undo, isErr) {
    clearTimeout(toastTimer);
    toastUndo = undo || null;
    $('toastText').textContent = text;
    $('toastBtn').hidden = !undo;
    $('toast').classList.toggle('err', !!isErr);
    $('toast').classList.add('show');
    toastTimer = setTimeout(() => $('toast').classList.remove('show'), undo ? 6000 : 4500);
  }
  $('toastBtn').addEventListener('click', () => {
    const fn = toastUndo;
    toastUndo = null;
    $('toast').classList.remove('show');
    if (fn) fn();
  });

  /* ---------- talking to the server ---------- */
  async function api(method, body) {
    const res = await fetch(ENDPOINT, {
      method,
      headers: { 'x-widget-key': KEY, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
    let data = {};
    try { data = await res.json(); } catch { /* not json */ }
    if (!res.ok) {
      const e = new Error(data.error || `Request failed (${res.status})`);
      e.hint = data.hint;
      e.status = res.status;
      throw e;
    }
    return data;
  }

  function applyServer(d) {
    S.today = d.today || localToday();
    $('sub').textContent = d.label || fmtDay(S.today);

    if (d.todos && d.todos.error) {
      S.todo = { ...S.todo, items: [], error: d.todos.error, hint: d.todos.hint, ready: true };
    } else {
      S.todo = {
        items: d.todos.items.map(i => ({ ...i, state: 'open' })),
        total: d.todos.total, backlog: d.todos.backlog, error: null, hint: null, ready: true,
      };
    }

    if (d.mustdo && d.mustdo.error) {
      S.must = { ...S.must, items: [], error: d.mustdo.error, hint: d.mustdo.hint, ready: true, missing: false };
    } else {
      S.must = {
        pageId: d.mustdo.pageId,
        items: d.mustdo.items.map(i => ({ id: i.key, key: i.key, title: i.label, state: i.done ? 'gone' : 'open' })),
        error: null, hint: null, ready: true, missing: !!d.mustdo.missing,
      };
    }
    render();

    if (S.must.missing && !ensuring) ensureMust();
  }

  async function ensureMust() {
    ensuring = true;
    try {
      if (isDemo) return;
      const m = await api('POST', { action: 'mustdo-ensure' });
      S.must.pageId = m.pageId;
      S.must.items = m.items.map(i => ({ id: i.key, key: i.key, title: i.label, state: i.done ? 'gone' : 'open' }));
      S.must.missing = false;
      render('must');
    } catch (e) {
      S.must.error = e.message; S.must.hint = e.hint; S.must.missing = false;
      render('must');
    } finally {
      ensuring = false;
    }
  }

  async function load() {
    if (isDemo || inflight > 0 || loading) return schedule();
    loading = true;
    $('sync').classList.add('busy');
    try {
      const d = await api('GET');
      failures = 0;
      applyServer(d);
      setSync('', `Synced ${clock()}`, 'Updates every 45 seconds and whenever you come back to this page.');
    } catch (e) {
      failures++;
      if (!S.todo.ready) {
        const errTitle = e.status === 401 ? 'Key not accepted' : undefined;
        S.todo = { ...S.todo, error: e.message, errTitle, hint: e.hint, ready: true };
        S.must = { ...S.must, error: e.message, errTitle, hint: e.hint, ready: true };
        render();
      }
      setSync('err', e.status === 401 ? 'Wrong key' : 'Offline', e.message);
    } finally {
      loading = false;
      schedule();
    }
  }
  function schedule() {
    clearTimeout(timer);
    if (isDemo) return;
    timer = setTimeout(load, failures ? 90000 : 45000);
  }

  /* ---------- ticking things off ---------- */
  async function complete(kind, id) {
    const data = kind === 'todo' ? S.todo : S.must;
    const it = data.items.find(i => i.id === id);
    if (!it || it.state !== 'open') return;

    it.state = 'completing';
    render(kind);
    const collapse = setTimeout(() => {
      if (it.state === 'completing') { it.state = 'gone'; render(kind); }
    }, 750);

    inflight++;
    try {
      let result = {};
      if (isDemo) {
        await new Promise(r => setTimeout(r, 250));
      } else if (kind === 'todo') {
        result = await api('POST', { action: 'todo-complete', id });
      } else {
        await api('POST', { action: 'mustdo-toggle', pageId: S.must.pageId, prop: it.key, value: true });
      }

      const undo = async () => {
        it.state = 'open';
        render(kind);
        if (isDemo) return;
        inflight++;
        try {
          if (kind === 'todo') await api('POST', { action: 'todo-restore', id, prev: result.prev });
          else await api('POST', { action: 'mustdo-toggle', pageId: S.must.pageId, prop: it.key, value: false });
        } catch (e) {
          toast("Couldn't undo: " + e.message, null, true);
        } finally {
          inflight--;
          load();
        }
      };

      if (kind === 'todo') {
        toast(result.rolled ? `Repeats: moved to ${fmtDay(result.nextDue)}` : 'Task completed ✓', undo);
      } else {
        toast('Checked off ✓', undo);
      }
    } catch (e) {
      clearTimeout(collapse);
      it.state = 'open';
      render(kind);
      toast("Couldn't save that: " + e.message, null, true);
    } finally {
      inflight--;
    }
  }

  /* ---------- demo data ---------- */
  function demoData() {
    const today = localToday();
    const mode = DEMO;
    const musts = ['Wake up before 6 am', 'Morning Sunlight', 'Morning quick routine', 'Yoga & Workout', 'Grooming & Bathing',
      'Eggs & Breakfast', 'Seeds & Peanuts', 'Bank Officer in Making', 'Evening Sunlight', 'Night Care Begin at 9 pm', 'Sleep before 11 pm'];
    const doneN = mode === 'alldone' ? musts.length : 4;
    const mustdo = { pageId: 'demo', missing: false, items: musts.map((l, i) => ({ key: l, label: l, done: i < doneN })) };

    let todos;
    if (mode === 'calm') todos = { items: [], doneToday: 0, total: 0, backlog: 0 };
    else if (mode === 'alldone') todos = { items: [], doneToday: 6, total: 6, backlog: 2 };
    else {
      todos = {
        items: [
          { id: 'd1', list: 'general', title: 'Call the bank about the account update', due: today, priority: 'High', recur: false, overdue: true, overdueDays: 2 },
          { id: 'd2', list: 'self', title: 'Solve 20 quant practice questions', due: today, priority: 'High', recur: true, overdue: false, overdueDays: 0 },
          { id: 'd3', list: 'general', title: 'Buy groceries', due: today, priority: 'Medium', recur: false, overdue: false, overdueDays: 0 },
          { id: 'd4', list: 'self', title: 'Read 10 pages', due: today, priority: 'Low', recur: true, overdue: false, overdueDays: 0 },
          { id: 'd5', list: 'general', title: 'Reply to emails', due: today, priority: null, recur: false, overdue: false, overdueDays: 0 },
        ],
        doneToday: 2, total: 7, backlog: 3,
      };
    }
    return { today, label: fmtDay(today), todos, mustdo };
  }

  /* ---------- go ---------- */
  function showSetupHelp() {
    const msg = 'Add ?\u2060key=\u2060YOUR_WIDGET_KEY to the end of this widget\'s URL.';
    S.todo = { ...S.todo, error: 'Missing key.', errTitle: 'One more step', hint: msg, ready: true };
    S.must = { ...S.must, error: 'Missing key.', errTitle: 'One more step', hint: msg, ready: true };
    setSync('err', 'Missing key', msg);
    render();
  }

  skeleton();
  setupHats();
  decorate(CARDS.todo.card, 7);
  decorate(CARDS.must.card, 19);
  applySky();
  if (PREVIEW == null) { setInterval(applySky, 30000); fetchSun(); }
  $('sub').textContent = fmtDay(localToday());

  if (isDemo) {
    setSync('demo', 'Demo mode', 'Sample data. Nothing is saved.');
    applyServer(demoData());
  } else if (!KEY) {
    showSetupHelp();
  } else {
    setSync('busy', 'Connecting');
    load();
    document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
    window.addEventListener('focus', () => load());
  }
})();
