/* ============================================================
   Ship Navigation
   A cute ship seen from above at a 3/4 angle. Six spots on it open
   your six Notion pages. Hover a spot: it lights up and its name
   appears. Click: the camera pushes in on that spot, then the page
   opens in a new tab. Sky and sea follow the time of day.

   URL options:
     ?time=18:30              preview the sky at a time of day
     ?lat= &lon=              sky location (default Gwalior)
     ?zoom=0                  skip the push-in animation
     ?workoutLink=URL         send a spot somewhere else
                              (workout, learning, meal, wardrobe, bank, finance)
     ?workout=assets/x.gif    use a different sticker for one spot
   Stickers: drop assets/workout.png (or .gif / .webp), learning, meal,
   wardrobe, bank, finance into the assets folder. No code changes.
   ============================================================ */
(() => {
  'use strict';
  const q = new URLSearchParams(location.search);
  const $ = id => document.getElementById(id);
  const root = document.documentElement;
  const REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- the six pages ---------- */
  const PAGES = {
    workout:  { name: 'Workout Planner',        g: '104 214 134', url: 'https://app.notion.com/p/Workout-Planner-3e7fa221698780908ad1d249532cd932',        tip: [418, 78] },
    finance:  { name: 'Finance & Investing',    g: '255 168 202', url: 'https://app.notion.com/p/Finance-Investing-3e7fa221698780d09d1fe5b1ab6c4ce0',      tip: [661, 276] },
    learning: { name: 'Learning Planner',       g: '198 144 240', url: 'https://app.notion.com/p/Learning-Planner-f76fa221698783db8e2681ce2394c6a7',       tip: [620, 292] },
    meal:     { name: 'Meal Planner',           g: '255 120 150', url: 'https://app.notion.com/p/Meal-Planner-3eefa221698780818e5fc99b43a74a87',           tip: [540, 300] },
    wardrobe: { name: 'Wardrobe',               g: '127 166 255', url: 'https://app.notion.com/p/Wardrobe-Organizer-305fa22169878363870b8121ff54b768',     tip: [776, 150] },
    bank:     { name: 'Bank Officer in Making', g: '255 200 97',  url: 'https://app.notion.com/p/Bank-Officer-in-Making-3f0fa22169878133a416e22d1592203b', tip: [764, 316] },
  };
  const KEYS = Object.keys(PAGES);
  const linkOf = k => q.get(k + 'Link') || PAGES[k].url;

  /* ============================================================
     Time-synced sky (same palette + curve as your other widgets)
     ============================================================ */
  const num = (k, d) => { const v = parseFloat(q.get(k)); return Number.isFinite(v) ? v : d; };
  const LAT = num('lat', 26.2183), LON = num('lon', 78.1828);
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = t => t * t * (3 - 2 * t);
  const mixC = (a, b, t) => a.map((v, i) => lerp(v, b[i], t));
  const rgb = c => c.map(v => Math.round(clamp(v, 0, 255))).join(' ');
  const pal = (top, mid, bot, seaTop, seaBot, cloud, cloudA, stars, aurora, spark) => ({ top, mid, bot, seaTop, seaBot, cloud, cloudA, stars, aurora, spark });
  const P = {
    night:   pal([9,24,64],[14,52,112],[28,92,158],[20,72,150],[8,30,92],[70,110,165],.5,1,.9,[210,240,255]),
    dawn:    pal([70,76,140],[196,134,166],[252,190,150],[128,150,196],[52,80,142],[255,205,195],.8,.22,.15,[255,235,220]),
    morning: pal([112,168,214],[176,212,226],[250,226,192],[84,140,200],[32,80,146],[255,244,236],.85,0,0,[255,255,255]),
    day:     pal([66,148,224],[122,190,236],[196,228,242],[58,122,196],[20,66,138],[255,255,255],.9,0,0,[255,255,255]),
    golden:  pal([96,150,204],[248,208,142],[255,172,112],[92,142,188],[34,84,138],[255,218,176],.85,0,0,[255,240,210]),
    sunset:  pal([112,160,172],[250,192,110],[238,102,62],[66,172,172],[20,120,132],[206,92,92],.75,0,0,[255,236,190]),
    dusk:    pal([42,52,112],[122,72,132],[232,112,102],[62,72,142],[22,42,102],[156,92,134],.65,.5,.35,[255,225,215]),
  };
  const blend = (a, b, t) => { const o = {}; for (const k in a) o[k] = Array.isArray(a[k]) ? mixC(a[k], b[k], t) : lerp(a[k], b[k], t); return o; };
  function skyAt(h, sr, ss) {
    const ks = [[0,P.night],[sr-1.5,P.night],[sr-.35,P.dawn],[sr+1.6,P.morning],[sr+4.2,P.day],[ss-3,P.day],[ss-1.2,P.golden],[ss-.05,P.sunset],[ss+.9,P.dusk],[ss+2.1,P.night],[24,P.night]];
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
    const t = q.get('time'); if (!t) return null;
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
    set('--spark', rgb(k.spark)); set('--stars', k.stars.toFixed(3)); set('--aurora', k.aurora.toFixed(3));
    set('--cloud', rgb(k.cloud)); set('--cloud-a', k.cloudA.toFixed(3));
    placeSunMoon(h);
  }
  async function fetchSun() {
    try {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 8000);
      const res = await fetch('https://api.open-meteo.com/v1/forecast?latitude=' + LAT + '&longitude=' + LON + '&daily=sunrise,sunset&timezone=auto&forecast_days=1', { signal: ctl.signal });
      clearTimeout(t); if (!res.ok) return;
      const data = await res.json();
      const parse = s => { const m = /T(\d\d):(\d\d)/.exec(s || ''); return m ? +m[1] + +m[2] / 60 : null; };
      const sr = parse(data.daily && data.daily.sunrise && data.daily.sunrise[0]);
      const ss = parse(data.daily && data.daily.sunset && data.daily.sunset[0]);
      if (sr && ss && ss > sr) { SR = sr; SS = ss; applySky(); }
    } catch { /* the offline estimate is good enough */ }
  }

  /* ============================================================
     Drawing helpers. viewBox is 1000 x 609, the same frame as the
     reference picture, so every coordinate below is a point on it.
     ============================================================ */
  const f1 = n => +n.toFixed(1);
  const seeded = seed => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pts = a => a.map(p => p.join(',')).join(' ');
  const poly = (a, fill, extra = '') => `<polygon points="${pts(a)}" fill="${fill}" ${extra}/>`;
  const sparkle = (cx, cy, r) => `M${cx},${cy - r}Q${cx + r * .16},${cy - r * .16} ${cx + r},${cy}Q${cx + r * .16},${cy + r * .16} ${cx},${cy + r}Q${cx - r * .16},${cy + r * .16} ${cx - r},${cy}Q${cx - r * .16},${cy - r * .16} ${cx},${cy - r}Z`;
  const arch = (x, y, w, h) => { const r = w / 2; return `M${x},${y + h}V${y + r}A${r},${r} 0 0 1 ${x + w},${y + r}V${y + h}Z`; };
  const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
  const OUT = 'stroke="rgb(86 50 30 / .55)" stroke-width="1.4" stroke-linejoin="round"';

  const COL = { red: '#cf4a5f', redD: '#a43048', redL: '#e8768a', cream: '#fbf0d8', creamD: '#e8d3ab', wood: '#c99b5e', woodD: '#8f6538', woodL: '#e5be82',
    lawn: '#78c35f', lawnD: '#58a84b', thatch: '#ebcb74', thatchD: '#cfa84b', yel: '#f6d65e', glass: '#a9d8ef' };

  const LIGHTS = [];   // warm lamp circles that show only at night

  /* a hanging, scalloped sail: yard from A to B, drapes hang below */
  function sail(A, B, depth, n) {
    let s = '';
    for (let i = 0; i < n; i++) {
      const p0 = mix(A, B, i / n), p1 = mix(A, B, (i + 1) / n), m = mix(p0, p1, .5);
      const d = depth * (.85 + ((i * 37) % 7) / 24);
      s += `<path d="M${f1(p0[0])},${f1(p0[1])}L${f1(p1[0])},${f1(p1[1])}C${f1(p1[0] + 7)},${f1(p1[1] + d * 1.2)} ${f1(p0[0] - 7)},${f1(p0[1] + d * 1.3)} ${f1(p0[0])},${f1(p0[1])}Z" fill="${i % 2 ? '#f6ead2' : '#fffaf0'}" ${OUT}/>`;
      s += `<path d="M${f1(p0[0] + 5)},${f1(p0[1] + d * .55)}Q${f1(m[0])},${f1(m[1] + d * .95)} ${f1(p1[0] - 5)},${f1(p1[1] + d * .55)}" stroke="rgb(190 150 105 / .35)" stroke-width="1.4" fill="none" stroke-linecap="round"/>`;
    }
    return `<g class="sailg">${s}</g>`;
  }
  const yard = (A, B) => `<line x1="${A[0]}" y1="${A[1]}" x2="${B[0]}" y2="${B[1]}" stroke="#6e4a2a" stroke-width="8.5" stroke-linecap="round"/>
      <line x1="${A[0]}" y1="${A[1] - 1}" x2="${B[0]}" y2="${B[1] - 1}" stroke="#b78852" stroke-width="5.2" stroke-linecap="round"/>
      <line x1="${A[0] + 4}" y1="${A[1] - 2.2}" x2="${B[0] - 4}" y2="${B[1] - 2.2}" stroke="#e3bb7d" stroke-width="1.6" stroke-linecap="round" opacity=".9"/>`;
  const rope = (a, b) => `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="#7a5430" stroke-width="1.2" opacity=".6"/>`;
  function mast(x0, y0, x1, y1, w) {
    const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy), nx = -dy / L * w / 2, ny = dx / L * w / 2;
    return `<polygon points="${f1(x0 + nx)},${f1(y0 + ny)} ${f1(x0 - nx)},${f1(y0 - ny)} ${f1(x1 - nx * 1.2)},${f1(y1 - ny * 1.2)} ${f1(x1 + nx * 1.2)},${f1(y1 + ny * 1.2)}" fill="url(#gMast)" ${OUT}/>`;
  }
  const band = (x, y, w) => `<rect x="${x - w / 2 - 1}" y="${y}" width="${w + 2}" height="7" rx="3" fill="#4d3322"/>`;

  /* an arched wooden door whose leaf swings open on hover */
  function door(x, y, w, h) {
    const r = w / 2, bx = x + r;
    return `<g class="dr">
      <path d="${arch(x - 2.4, y - 2.4, w + 4.8, h + 2.4)}" fill="${COL.cream}" ${OUT}/>
      <path class="inside" d="${arch(x, y, w, h)}" fill="url(#gInside)"/>
      <g class="leaf"><path d="${arch(x, y, w, h)}" fill="#c58a4e" stroke="rgb(86 50 30 / .6)" stroke-width="1"/>
        <path d="M${bx},${y + 2}V${y + h}" stroke="rgb(70 36 12 / .35)" stroke-width="1"/>
        <circle cx="${f1(bx)}" cy="${f1(y + r + 1)}" r="${f1(Math.max(2.2, w * .17))}" fill="${COL.glass}" stroke="${COL.cream}" stroke-width="1.2"/>
        <circle cx="${f1(x + w - 3)}" cy="${f1(y + h * .66)}" r="1.4" fill="#f3dc9a"/></g></g>`;
  }
  function win(x, y, w, h, lit = true) {
    if (lit) LIGHTS.push(`<path d="${arch(x, y, w, h)}" fill="#ffd978"/>`);
    return `<path d="${arch(x - 1.6, y - 1.6, w + 3.2, h + 1.6)}" fill="${COL.cream}"/><path d="${arch(x, y, w, h)}" fill="${COL.glass}"/>`;
  }
  const porthole = (x, y, r = 8) => {
    LIGHTS.push(`<circle cx="${x}" cy="${y}" r="${r * .55}" fill="#ffd978"/>`);
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="${COL.cream}" ${OUT}/><circle cx="${x}" cy="${y}" r="${r * .66}" fill="#7c8da8"/><circle cx="${x}" cy="${y}" r="${r * .42}" fill="${COL.glass}"/>`;
  };
  function rail(a, b, n, h, w = 1.8) {
    let s = '';
    for (let i = 0; i <= n; i++) { const p = mix(a, b, i / n); s += `<line x1="${f1(p[0])}" y1="${f1(p[1])}" x2="${f1(p[0])}" y2="${f1(p[1] - h)}"/>`; }
    return `<g stroke="#fff6e4" stroke-width="${w}" stroke-linecap="round">${s}</g>
      <line x1="${a[0]}" y1="${a[1] - h}" x2="${b[0]}" y2="${b[1] - h}" stroke="#fffaf0" stroke-width="3.4" stroke-linecap="round"/>
      <line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="${COL.creamD}" stroke-width="2.4" stroke-linecap="round"/>`;
  }
  const curl = (x, y, r) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${COL.cream}" ${OUT}/>
      <path d="M${x - r * .1},${y + r * .1} a${r * .35},${r * .35} 0 1 1 ${r * .3},${r * .2} a${r * .6},${r * .6} 0 1 1 ${-r * .6},${-r * .5}" fill="none" stroke="#c8b48a" stroke-width="1.6" stroke-linecap="round"/>`;

  /* striped observation dome on a round platform (cx,cy = platform centre) */
  function dome(cx, cy, lampy) {
    const top = cy - 60, edge = [-39, -23, -8, 8, 23, 39], cols = [COL.yel, COL.red, COL.yel, COL.red, COL.yel];
    let wedges = '';
    for (let i = 0; i < 5; i++) {
      const a = i === 0 ? -110 : edge[i] * 1.15, b = i === 4 ? 110 : edge[i + 1] * 1.15;
      wedges += `<polygon points="${cx},${top - 2} ${i === 0 ? `${cx - 110},${top + 4} ` : ''}${cx + a},${cy - 6} ${cx + b},${cy - 6}${i === 4 ? ` ${cx + 110},${top + 4}` : ''}" fill="${cols[i]}"/>`;
    }
    let ws = '';
    for (let i = 0; i < 7; i++) { const x = cx - 33 + i * 11; ws += `<rect x="${x}" y="${cy - 13}" width="6" height="8" rx="1.6" fill="${COL.glass}"/>`; LIGHTS.push(`<rect x="${x}" y="${cy - 13}" width="6" height="8" rx="1.6" fill="#ffd978"/>`); }
    LIGHTS.push(`<path d="${arch(cx - 21, cy - 48, 13, 20)}" fill="#ffd978"/>`);
    return `<g class="domebody">
      <path d="M${cx - 31},${cy + 3}Q${cx},${cy + 38} ${cx + 31},${cy + 3}Z" fill="#cfd0de" ${OUT}/>
      <ellipse cx="${cx}" cy="${cy + 1}" rx="46" ry="11.5" fill="#d9b476" ${OUT}/>
      <ellipse cx="${cx}" cy="${cy - 1.5}" rx="44" ry="9" fill="#f1d9a2"/>
      <path d="M${cx - 38},${cy - 3}V${cy - 17}H${cx + 38}V${cy - 3}Q${cx},${cy + 8} ${cx - 38},${cy - 3}Z" fill="${COL.cream}" ${OUT}/>
      ${ws}
      <clipPath id="cD${cx}"><path d="M${cx - 40},${cy - 14}C${cx - 41},${cy - 52} ${cx - 18},${cy - 62} ${cx},${cy - 62}C${cx + 18},${cy - 62} ${cx + 41},${cy - 52} ${cx + 40},${cy - 14}Q${cx},${cy - 6} ${cx - 40},${cy - 14}Z"/></clipPath>
      <g clip-path="url(#cD${cx})">${wedges}<ellipse cx="${cx - 14}" cy="${cy - 44}" rx="9" ry="14" fill="rgb(255 255 255 / .22)"/></g>
      <path d="M${cx - 40},${cy - 14}C${cx - 41},${cy - 52} ${cx - 18},${cy - 62} ${cx},${cy - 62}C${cx + 18},${cy - 62} ${cx + 41},${cy - 52} ${cx + 40},${cy - 14}Q${cx},${cy - 6} ${cx - 40},${cy - 14}Z" fill="none" ${OUT}/>
      <path d="${arch(cx - 22, cy - 49, 14, 22)}" fill="${COL.cream}" ${OUT}/><path d="${arch(cx - 20, cy - 47, 10, 19)}" fill="${COL.glass}"/>
      <path d="${arch(cx + 8, cy - 49, 14, 22)}" fill="${COL.cream}" ${OUT}/><path d="${arch(cx + 10, cy - 47, 10, 19)}" fill="${COL.glass}"/>
      <ellipse cx="${cx}" cy="${cy - 61}" rx="10" ry="3.4" fill="${COL.redD}"/>
      ${lampy ? '' : ''}
    </g>`;
  }

  /* ============================================================
     The ship
     ============================================================ */
  function buildShip() {
    const seg = P => { let d = ''; for (let i = 0; i < P.length - 1; i++) { const a = P[i - 1] || P[i], b = P[i], c = P[i + 1], e = P[i + 2] || c;
      d += `C${f1(b[0] + (c[0] - a[0]) / 6)},${f1(b[1] + (c[1] - a[1]) / 6)} ${f1(c[0] - (e[0] - b[0]) / 6)},${f1(c[1] - (e[1] - b[1]) / 6)} ${c}`; } return d; };
    const sh = (P, dy) => P.map(p => [p[0], p[1] + dy]);
    const G = [[270, 392], [340, 405], [405, 422], [450, 426], [520, 452], [600, 431], [680, 393], [745, 326], [772, 300]];
    const W = [[772, 392], [745, 432], [690, 470], [590, 507], [500, 537], [400, 553], [320, 555], [272, 520], [256, 470]];
    const F = [[272, 388], [300, 366], [338, 348], [430, 350], [520, 343], [640, 332], [745, 312], [772, 300]];
    const hull = `M${G[0]}${seg(G)}L${W[0]}${seg(W)}Z`;
    const GR = G.slice(3), GB = sh(GR, 50), bandP = `M${GR[0]}${seg(GR)}L${GB[GB.length - 1]}${seg(GB.slice().reverse())}Z`;
    const spot = (k, art) => `<g class="spot" data-key="${k}"><g class="house">${art}</g></g>`;
    let o = '';
    /* far rail, rudder wheel, stern pedestal */
    o += rail([336, 350], [430, 352], 6, 13);
    o += `<path d="M752,240L804,240Q798,272 788,304L768,304Q758,272 752,240Z" fill="#c3c4d6" ${OUT}/>
      <ellipse cx="806" cy="305" rx="25" ry="35" fill="#a8743a" ${OUT}/><ellipse cx="806" cy="305" rx="18" ry="27" fill="none" stroke="#7d5127" stroke-width="2"/><ellipse cx="806" cy="305" rx="5" ry="8" fill="#7d5127"/>`;
    /* wardrobe dome (right) */
    o += `<g class="spot" data-key="wardrobe"><g class="house"><g transform="translate(777 232) scale(1.06) translate(-777 -232)">${dome(777, 232)}</g>
      <rect x="808" y="172" width="9" height="20" rx="2" fill="#2b2f3d"/><path d="M806,172h13l-6.5,-9z" fill="#2b2f3d"/></g></g>`;
    /* masts: mizzen + furled red sail, main, fore */
    o += mast(722, 250, 722, 70, 7) + `<path d="M716,92C696,120 700,170 716,214L730,214C722,170 728,120 730,92Z" fill="#b83a50" ${OUT}/>` + yard([664, 50], [790, 92]) + sail([670, 56], [786, 94], 22, 3);
    o += `<path d="M742,50L742,30" stroke="#4d3322" stroke-width="2"/><path d="M742,32Q760,24 774,34L768,46Q756,40 742,46Z" fill="#26262e"/><circle cx="757" cy="37" r="3.4" fill="#fff"/>`;
    o += mast(606, 352, 606, 60, 12) + band(606, 120, 12) + band(606, 232, 12) + mast(430, 372, 418, 190, 11) + band(424, 290, 11);
    /* stern castle */
    o += `<polygon points="640,268 768,262 772,338 700,382 640,364" fill="${COL.cream}" ${OUT}/>
      <path d="M634,268Q640,226 700,226Q762,226 772,266Q700,282 634,268Z" fill="url(#gRed)" ${OUT}/><path d="M650,262Q700,240 756,258" stroke="#fffaf0" stroke-width="3" fill="none" stroke-linecap="round"/>`;
    for (let i = 0; i < 5; i++) o += win(652 + i * 22, 272, 12, 22);
    o += `<path d="M772,300L790,296L792,366L752,410L748,384Z" fill="${COL.cream}" ${OUT}/><path d="M748,360L792,352L792,366L752,410Z" fill="url(#gRed)" ${OUT}/>`;
    /* deck: planks + lawn */
    o += `<path d="M${F[0]}${seg(F)}L${G[8]}${seg(G.slice().reverse())}Z" fill="url(#gWood)" ${OUT}/>`;
    for (let i = 0; i < 5; i++) o += `<path d="M${300 + i * 22},${368 + i * 11}L${330 + i * 24},${352 + i * 14}" stroke="${COL.woodD}" stroke-width="1.2" opacity=".5"/>`;
    const Lt = [[406, 384], [438, 355], [520, 348], [600, 348], [660, 360], [692, 384]], Lb = [[650, 410], [600, 431], [520, 449], [452, 429]];
    const lawn = `M${Lt[0]}${seg(Lt)}L${Lb[0]}${seg(Lb)}Z`;
    o += `<clipPath id="cLawn"><path d="${lawn}"/></clipPath><path d="${lawn}" fill="url(#gLawn)" ${OUT}/><g clip-path="url(#cLawn)" stroke="${COL.lawnD}" stroke-width="1.6" opacity=".6">`;
    for (let i = 0; i < 9; i++) o += `<path d="M${420 + i * 34},440L${470 + i * 34},348"/>`;
    for (let i = 0; i < 4; i++) o += `<path d="M410,${372 + i * 16}L700,${356 + i * 16}"/>`;
    o += `</g>`;
    const tree = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})"><rect x="-2" y="-4" width="4" height="9" fill="#7a5430"/><polygon points="0,-44 14,-6 -14,-6" fill="#3f8f4b" ${OUT}/><polygon points="0,-34 11,-14 -11,-14" fill="#56ad5c"/></g>`;
    o += tree(630, 342, .9) + tree(662, 352, .8) + tree(718, 262, .5);
    /* stairs */
    o += `<polygon points="650,378 694,334 722,346 676,396" fill="${COL.woodL}" ${OUT}/>`;
    for (let i = 1; i < 6; i++) o += `<path d="M${650 + i * 8},${378 - i * 7.4}L${676 + i * 8},${396 - i * 8.4}" stroke="${COL.woodD}" stroke-width="1.3" opacity=".6"/>`;
    o += rail([652, 378], [696, 334], 5, 14);
    /* learning house + meal pavilion */
    o += `<polygon points="592,322 650,322 650,368 592,368" fill="${COL.cream}" ${OUT}/><polygon points="586,322 621,296 656,322" fill="url(#gRed)" ${OUT}/>`;
    o += `<g class="spot" data-key="meal"><g class="house"><polygon points="500,352 504,392 512,392 510,358" fill="${COL.woodD}"/><polygon points="566,384 570,418 578,418 574,388" fill="${COL.woodD}"/>
      <polygon points="506,360 566,384 570,342" fill="rgb(40 28 20 / .35)"/>
      <polygon points="486,338 538,318 596,362 568,392 512,372" fill="url(#gThatch)" ${OUT}/><path d="M498,342L546,324M512,352L560,336M528,364L574,352M544,374L584,368" stroke="${COL.thatchD}" stroke-width="1.6" opacity=".8"/>
      <path d="${arch(524, 372, 16, 20)}" fill="url(#gInside)" ${OUT}/></g></g>`;
    /* hull */
    o += `<clipPath id="cHull"><path d="${hull}"/></clipPath><path d="${hull}" fill="url(#gHull)" ${OUT}/><g clip-path="url(#cHull)">
      <path d="${bandP}" fill="url(#gRed)"/><path d="M${GB[0]}${seg(GB)}" stroke="${COL.cream}" stroke-width="5" fill="none"/>
      <path d="M${sh(GR, 74)[0]}${seg(sh(GR, 74))}" stroke="${COL.woodD}" stroke-width="1.6" fill="none" opacity=".5"/><path d="M${sh(GR, 100)[0]}${seg(sh(GR, 100))}" stroke="${COL.woodD}" stroke-width="1.6" fill="none" opacity=".4"/>
      <path d="M268,396L340,408L405,426L405,524L336,556L286,530L258,470Z" fill="url(#gRed)"/></g>
      <path d="M${G[0]}${seg(G)}" stroke="${COL.cream}" stroke-width="7" fill="none" stroke-linecap="round"/>`;
    o += rail([456, 428], [520, 452], 6, 12) + rail([524, 451], [600, 431], 7, 12) + rail([604, 430], [680, 393], 7, 12);
    o += `<path d="M268,500Q340,510 404,528" stroke="${COL.cream}" stroke-width="6" fill="none" stroke-linecap="round"/><path d="M406,424L406,520Q392,534 360,546" stroke="${COL.cream}" stroke-width="5" fill="none" stroke-linecap="round"/>
      <ellipse cx="352" cy="466" rx="30" ry="33" fill="${COL.cream}" ${OUT}/><ellipse cx="352" cy="466" rx="23" ry="26" fill="#f1d9a2"/>`;
    [[452, 462], [496, 480], [540, 478], [690, 408], [722, 380]].forEach(p => { o += porthole(p[0], p[1], 8); });
    o += curl(447, 400, 17) + curl(350, 328, 14);
    o += `<g transform="rotate(-22 612 458)"><ellipse cx="612" cy="458" rx="44" ry="53" fill="#262c3c" ${OUT}/><ellipse cx="612" cy="458" rx="36" ry="45" fill="#3c4458"/><ellipse cx="610" cy="458" rx="27" ry="36" fill="#d9a85f" ${OUT}/><path d="${sparkle(610, 458, 16)}" fill="${COL.red}"/></g>`;
    /* figurehead: sun-lion on a cream ring, crossed bones */
    o += `<path d="M236,372L262,386L276,404" stroke="${COL.cream}" stroke-width="9" stroke-linecap="round" fill="none"/><path d="M200,514L240,500L268,486" stroke="${COL.cream}" stroke-width="9" stroke-linecap="round" fill="none"/>
      <ellipse cx="244" cy="446" rx="34" ry="64" fill="#e8d6a2" ${OUT}/><ellipse cx="244" cy="446" rx="25" ry="54" fill="#f3e6bd" stroke="#c8b27a" stroke-width="2"/>`;
    [-44, -22, 0, 22, 44].forEach(y => { o += `<circle cx="262" cy="${446 + y}" r="3" fill="#c8b27a"/>`; });
    o += `<g transform="translate(186 428)"><path d="M-8,-46L2,-26L18,-48L20,-24L40,-30L30,-12L48,0L30,12L40,30L20,26L18,48L2,28L-8,46L-12,26L-32,36L-26,14L-46,6L-30,-6L-44,-18L-24,-20L-30,-40L-12,-28Z" fill="#f08a3c" ${OUT}/>
      <circle r="31" fill="#f6e36a" ${OUT}/><circle cx="-4" cy="-8" r="22" fill="#fbf08a" opacity=".6"/><ellipse cx="-24" cy="8" rx="13" ry="10" fill="#fbf4dc" ${OUT}/><circle cx="-31" cy="4" r="3.6" fill="#3a2a22"/>
      <circle cx="-2" cy="-8" r="4.6" fill="#3a2a22"/><circle cx="-3.4" cy="-9.4" r="1.5" fill="#fff"/><circle cx="14" cy="-8" r="4.6" fill="#3a2a22"/><circle cx="12.6" cy="-9.4" r="1.5" fill="#fff"/><path d="M-22,16Q-12,22 -4,15" stroke="#3a2a22" stroke-width="2" fill="none" stroke-linecap="round"/></g>`;
    /* sails */
    o += yard([352, 165], [500, 262]) + sail([356, 170], [496, 260], 46, 5) + `<circle cx="414" cy="228" r="13" fill="#f2923c" ${OUT}/><path d="${sparkle(414, 228, 9)}" fill="#ffe08a"/>`;
    o += yard([366, 246], [484, 342]) + sail([370, 250], [480, 340], 44, 4);
    o += yard([530, 76], [776, 170]) + sail([534, 82], [772, 168], 58, 6);
    o += yard([540, 184], [676, 252]) + sail([544, 188], [672, 250], 42, 4);
    o += rope([418, 190], [372, 352]) + rope([418, 190], [468, 360]) + rope([606, 62], [540, 90]);
    /* workout dome + flag */
    o += `<path d="M418,130L418,86" stroke="#4d3322" stroke-width="2.4"/><path d="M420,88Q448,78 478,92L466,104L470,120Q446,112 420,120Z" fill="#26262e"/><circle cx="448" cy="102" r="4.4" fill="#fff"/>
      <g class="spot" data-key="workout"><g class="house">${dome(418, 192)}</g></g>`;
    /* doors */
    o += spot('finance', door(652, 300, 17, 30));
    o += spot('learning', door(612, 330, 17, 30));
    o += spot('bank', door(756, 330, 15, 26));
    return { all: o };
  }

  /* ============================================================
     Whole scene
     ============================================================ */
  function build() {
    const svg = $('scene');
    LIGHTS.length = 0;
    const o = buildShip();
    const r = seeded(7);

    let stars = '';
    for (let i = 0; i < 40; i++) stars += `<circle class="star" cx="${f1(10 + r() * 980)}" cy="${f1(6 + r() * 120)}" r="${r() > .85 ? 1.8 : 1.1}" style="--o:${(.45 + r() * .55).toFixed(2)};--d:${(2 + r() * 3).toFixed(1)}s;--dl:${(-r() * 4).toFixed(1)}s"/>`;
    const cloud = (x, y, s, d, dl) => `<g class="cld" style="--d:${d}s;--dl:${dl}s"><g transform="translate(${x} ${y}) scale(${s})">
        <path d="M8,34a14,14 0 0 1 2,-26a22,22 0 0 1 40,-8a24,24 0 0 1 42,12a15,15 0 0 1 4,22z"/></g></g>`;
    let clouds = cloud(30, 22, 1.3, 190, -60) + cloud(60, 70, .85, 240, -150) + cloud(10, 4, .9, 210, -20) + cloud(40, 100, .7, 260, -200);

    // wave strokes on the sea: more, and longer, toward the viewer
    let waves = '';
    for (let i = 0; i < 190; i++) {
      const y = 142 + Math.pow(r(), 1.2) * 466, k = (y - 140) / 470, len = 26 + k * 90 + r() * 40;
      const x = -60 + r() * 1080, hi = r() > .42, sw = (1.4 + k * 2.2 * r()).toFixed(1);
      waves += `<path class="wv ${hi ? 'hi' : 'lo'}" d="M${f1(x)},${f1(y)}q${f1(len * .25)},${f1(-5 - k * 8)} ${f1(len * .5)},0t${f1(len * .5)},0" style="stroke-width:${sw};--d:${(6 + r() * 7).toFixed(1)}s;--dl:${(-r() * 9).toFixed(1)}s"/>`;
    }
    // long painted swirls, like the reference sea
    for (let i = 0; i < 34; i++) {
      const y = 150 + r() * 450, k = (y - 140) / 470, x = -80 + r() * 1000, L = 120 + k * 260 + r() * 120, a = 8 + k * 26, hi = r() > .5;
      waves += `<path class="wv ${hi ? 'hi' : 'lo'}" d="M${f1(x)},${f1(y)}c${f1(L * .25)},${f1(-a)} ${f1(L * .55)},${f1(-a)} ${f1(L * .75)},${f1(a * .3)}s${f1(L * .2)},${f1(a * .7)} ${f1(L * .3)},${f1(a * .2)}" style="stroke-width:${(2 + k * 5 * r()).toFixed(1)};opacity:${hi ? .26 : .5};--d:${(9 + r() * 8).toFixed(1)}s;--dl:${(-r() * 9).toFixed(1)}s"/>`;
    }
    let swells = '';
    for (let i = 0; i < 9; i++) { const y = 170 + i * 52 + r() * 20; swells += `<ellipse cx="${f1(r() * 1000)}" cy="${f1(y)}" rx="${f1(160 + r() * 140)}" ry="${f1(10 + i * 3)}" fill="rgb(var(--${i % 2 ? 'spark' : 'sea-bot'}) / ${i % 2 ? .06 : .16})"/>`; }
    // streaky brush clouds high in the sky
    const streak = (x, y, w, d, dl) => `<g class="cld" style="--d:${d}s;--dl:${dl}s"><path d="M${x},${y}q${w * .25},-9 ${w * .5},-3t${w * .5},-1q-${w * .2},9 -${w * .5},7t-${w * .5},-3z" opacity=".75"/></g>`;
    clouds += streak(0, 46, 260, 260, -90) + streak(0, 92, 190, 300, -220) + streak(0, 20, 220, 280, -10);
    const gull = (y, d, dl, s) => `<g class="gull" style="--d:${d}s;--dl:${dl}s"><path transform="translate(0 ${y}) scale(${s})" d="M0,0q6,-7 12,0q6,-7 12,0"/></g>`;

    // tooltips (shown only on hover)
    const tips = KEYS.map(k => {
      const p = PAGES[k], [x, y] = p.tip, w = Math.round(p.name.length * 7.4 + 30);
      return `<g class="tip" data-key="${k}" style="--g:${p.g}"><rect x="${x - w / 2}" y="${y - 13}" width="${w}" height="26" rx="13"/>
        <circle cx="${x - w / 2 + 14}" cy="${y}" r="4" fill="rgb(${p.g})"/><text x="${x - w / 2 + 25}" y="${y + 4.6}">${p.name}</text></g>`;
    }).join('');

    // invisible hit areas on top of everything, so sails never block a click
    const hits = {
      workout:  '<rect x="376" y="128" width="84" height="80" rx="30"/>',
      wardrobe: '<rect x="735" y="168" width="84" height="80" rx="30"/>',
      finance:  '<rect x="644" y="294" width="34" height="42" rx="8"/>',
      learning: '<rect x="604" y="324" width="34" height="42" rx="8"/>',
      meal:     `<polygon points="${pts([[486, 338], [538, 318], [596, 362], [570, 420], [506, 392]])}"/>`,
      bank:     '<rect x="748" y="322" width="32" height="42" rx="8"/>',
    };
    const hitG = KEYS.map(k => `<g class="hit" data-key="${k}" tabindex="0" role="link" aria-label="Open ${PAGES[k].name}">${hits[k]}</g>`).join('');

    const stickers = KEYS.map(k => {
      const pos = { workout: [440, 134], wardrobe: [796, 176], finance: [654, 250], learning: [590, 276], meal: [520, 296], bank: [768, 286] }[k];
      return `<g class="stkg" data-key="${k}" style="--g:${PAGES[k].g}"><image class="stk" x="${pos[0]}" y="${pos[1]}" width="46" height="46" preserveAspectRatio="xMidYMax meet" style="display:none"/></g>`;
    }).join('');

    svg.innerHTML = `
    <defs>
      <linearGradient id="gHull" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c8985a"/><stop offset=".6" stop-color="#a87238"/><stop offset="1" stop-color="#6f4824"/></linearGradient>
      <linearGradient id="gRed" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d95469"/><stop offset="1" stop-color="#a73049"/></linearGradient>
      <linearGradient id="gWood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e2b373"/><stop offset="1" stop-color="#b98748"/></linearGradient>
      <linearGradient id="gMast" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8a5a2d"/><stop offset=".4" stop-color="#c8955a"/><stop offset=".65" stop-color="#d7a86e"/><stop offset="1" stop-color="#8a5a2d"/></linearGradient>
      <linearGradient id="gLawn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6fbf5c"/><stop offset="1" stop-color="#4f9e47"/></linearGradient>
      <linearGradient id="gThatch" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f1d780"/><stop offset="1" stop-color="#d4ae52"/></linearGradient>
      <linearGradient id="gInside" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3c6"/><stop offset="1" stop-color="#ffc864"/></linearGradient>
      <radialGradient id="gSun"><stop offset="0" stop-color="#fff6d0" stop-opacity=".95"/><stop offset=".35" stop-color="#ffe8a0" stop-opacity=".45"/><stop offset="1" stop-color="#ffd890" stop-opacity="0"/></radialGradient>
      <radialGradient id="gMoon"><stop offset="0" stop-color="#eaf0ff" stop-opacity=".5"/><stop offset="1" stop-color="#cfdcff" stop-opacity="0"/></radialGradient>
      <clipPath id="cSky"><rect x="-200" y="-200" width="1400" height="338"/></clipPath>
    </defs>

    <g clip-path="url(#cSky)">
      <g class="stars">${stars}</g>
      <g class="sunmoon" id="sun"><circle r="80" fill="url(#gSun)"/><circle r="22" fill="#fff6d0"/></g>
      <g class="sunmoon" id="moon"><circle r="50" fill="url(#gMoon)"/><circle r="15" fill="#eef3ff"/><circle cx="-4" cy="-3" r="3" fill="#cfd8f0"/><circle cx="5" cy="4" r="2.2" fill="#cfd8f0"/></g>
      ${clouds}${gull(60, 70, -10, 1)}${gull(104, 95, -50, .8)}
    </g>
    <g class="swells">${swells}</g><g class="sea">${waves}</g>

    <g class="bob">
      <g class="foamg">
        <ellipse class="foam" cx="268" cy="556" rx="34" ry="8" fill="#fff" opacity=".7"/>
        <ellipse class="foam" cx="190" cy="568" rx="40" ry="7" fill="#fff" opacity=".4" style="animation-delay:-1.4s"/>
        <path class="foam" d="M280,560Q420,574 560,540T690,498" stroke="#fff" stroke-width="5" fill="none" opacity=".55" stroke-linecap="round" style="animation-delay:-.7s"/>
        <ellipse class="foam" cx="770" cy="452" rx="22" ry="5" fill="#fff" opacity=".6" style="animation-delay:-2s"/>
        <path class="foam" d="M776,456Q820,462 850,478" stroke="#fff" stroke-width="3" fill="none" opacity=".4" stroke-linecap="round" style="animation-delay:-1s"/>
      </g>
      <g class="dim">
        ${o.all}
      </g>
      <g class="stickers">${stickers}</g>
      <g class="lights lit">${LIGHTS.join('')}</g>
      <g class="tips">${tips}</g>
      <g class="hits">${hitG}</g>
    </g>`;
  }

  /* sun and moon travel across the sky with the real clock */
  function placeSunMoon(h) {
    const sun = $('sun'), moon = $('moon'); if (!sun || !moon) return;
    const day = SS - SR;
    const t = (h - SR) / day;
    const pos = tt => `translate(${f1(120 + 760 * tt)} ${f1(150 - Math.sin(Math.PI * tt) * 118)})`;
    if (t >= -.04 && t <= 1.04) { sun.setAttribute('transform', pos(clamp(t))); sun.style.opacity = 1; } else sun.style.opacity = 0;
    const nightLen = 24 - day;
    const tn = h >= SS ? (h - SS) / nightLen : h < SR ? (h + 24 - SS) / nightLen : -1;
    if (tn >= 0 && tn <= 1) { moon.setAttribute('transform', pos(tn)); moon.style.opacity = 1; } else moon.style.opacity = 0;
  }

  /* ============================================================
     Stickers
     ============================================================ */
  function loadStickers() {
    KEYS.forEach(k => {
      const g = document.querySelector(`.stkg[data-key="${k}"]`); if (!g) return;
      const img = g.querySelector('image');
      const custom = q.get(k);
      const tries = custom ? [custom] : [`assets/${k}.png`, `assets/${k}.gif`, `assets/${k}.webp`];
      const next = () => {
        const src = tries.shift(); if (!src) return;
        const probe = new Image();
        probe.onload = () => { img.setAttribute('href', src); img.style.display = ''; };
        probe.onerror = next;
        probe.src = src;
      };
      next();
    });
  }

  /* ============================================================
     Hover + the camera push-in
     ============================================================ */
  const stage = $('stage'), world = $('world'), flash = $('flash'), fallback = $('fallback');
  let busy = false;

  function openUrl(url, name) {
    const w = window.open(url, '_blank');
    if (w) { try { w.opener = null; } catch { /* ignore */ } return true; }
    fallback.href = url; fallback.textContent = `Open ${name} ↗`; fallback.hidden = false;
    return false;
  }
  function reset(key) {
    stage.classList.add('back'); stage.classList.remove('flashing');
    world.style.transform = '';
    setTimeout(() => {
      stage.classList.remove('zooming', 'back'); fallback.hidden = true; busy = false; world.style.transformOrigin = '';
      hot(key, false);
    }, 950);
  }
  const hot = (key, on) => document.querySelectorAll(`[data-key="${key}"].spot, [data-key="${key}"].tip`).forEach(n => n.classList.toggle('hot', on));

  function enter(key) {
    if (busy) return;
    const art = document.querySelector(`.spot[data-key="${key}"] .house`); if (!art) return;
    const url = linkOf(key), name = PAGES[key].name;
    hot(key, true);
    if (REDUCED || q.get('zoom') === '0') { busy = true; openUrl(url, name); setTimeout(() => { busy = false; }, 600); return; }
    busy = true;
    const sr = stage.getBoundingClientRect();
    const dr = art.getBoundingClientRect();
    const ox = dr.left + dr.width / 2 - sr.left, oy = dr.top + dr.height / 2 - sr.top;
    const S = Math.min(9, Math.max(3.2, (sr.height * .62) / Math.max(10, dr.height)));
    flash.style.setProperty('--fx0', (ox / sr.width * 100).toFixed(1) + '%');
    flash.style.setProperty('--fy0', (oy / sr.height * 100).toFixed(1) + '%');
    stage.classList.add('zooming');
    world.style.transformOrigin = `${ox}px ${oy}px`;
    requestAnimationFrame(() => {
      world.style.transform = `translate(${sr.width / 2 - ox}px, ${sr.height / 2 - oy}px) scale(${S})`;
      flash.style.setProperty('--fx0', '50%'); flash.style.setProperty('--fy0', '50%');
    });
    setTimeout(() => stage.classList.add('flashing'), 800);
    setTimeout(() => {
      const ok = openUrl(url, name);
      setTimeout(() => reset(key), ok ? 700 : 9000);
    }, 1080);
  }

  function wire() {
    KEYS.forEach(k => {
      const h = document.querySelector(`.hit[data-key="${k}"]`);
      h.addEventListener('pointerenter', () => { if (!busy) hot(k, true); });
      h.addEventListener('pointerleave', () => { if (!busy) hot(k, false); });
      h.addEventListener('click', e => { e.preventDefault(); enter(k); });
      h.addEventListener('focus', () => hot(k, true));
      h.addEventListener('blur', () => { if (!busy) hot(k, false); });
      h.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); enter(k); } });
    });
    const demo = q.get('hot'); if (demo && PAGES[demo]) hot(demo, true);
    window.addEventListener('pageshow', () => { if (stage.classList.contains('zooming')) reset(); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden && stage.classList.contains('zooming')) reset(); });
  }

  /* plain links for small screens */
  function buildList() {
    const nav = $('list');
    KEYS.forEach(k => {
      const a = document.createElement('a');
      a.href = linkOf(k); a.target = '_blank'; a.rel = 'noopener'; a.textContent = PAGES[k].name;
      a.style.setProperty('--g', PAGES[k].g);
      nav.appendChild(a);
    });
  }

  build();
  loadStickers();
  wire();
  buildList();
  applySky();
  if (PREVIEW == null) { setInterval(applySky, 30000); fetchSun(); }
})();
