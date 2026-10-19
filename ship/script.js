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
    workout:  { name: 'Workout Planner',        g: '104 214 134', url: 'https://app.notion.com/p/Workout-Planner-3e7fa221698780908ad1d249532cd932',        tip: [334, 150] },
    finance:  { name: 'Finance & Investing',    g: '255 168 202', url: 'https://app.notion.com/p/Finance-Investing-3e7fa221698780d09d1fe5b1ab6c4ce0',      tip: [668, 232] },
    learning: { name: 'Learning Planner',       g: '198 144 240', url: 'https://app.notion.com/p/Learning-Planner-f76fa221698783db8e2681ce2394c6a7',       tip: [596, 372] },
    meal:     { name: 'Meal Planner',           g: '255 120 150', url: 'https://app.notion.com/p/Meal-Planner-3eefa221698780818e5fc99b43a74a87',           tip: [538, 304] },
    wardrobe: { name: 'Wardrobe',               g: '127 166 255', url: 'https://app.notion.com/p/Wardrobe-Organizer-305fa22169878363870b8121ff54b768',     tip: [848, 160] },
    bank:     { name: 'Bank Officer in Making', g: '255 200 97',  url: 'https://app.notion.com/p/Bank-Officer-in-Making-3f0fa22169878133a416e22d1592203b', tip: [838, 392] },
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
    morning: pal([112,168,214],[176,212,226],[250,226,192],[92,170,204],[40,110,162],[255,244,236],.85,0,0,[255,255,255]),
    day:     pal([66,148,224],[122,190,236],[196,228,242],[62,152,208],[28,96,162],[255,255,255],.9,0,0,[255,255,255]),
    golden:  pal([96,150,204],[248,208,142],[255,172,112],[104,170,192],[40,108,150],[255,218,176],.85,0,0,[255,240,210]),
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
    const out = {};

    /* ----- rudder wheel + wardrobe dome pedestal (behind the stern) ----- */
    out.rear = `<path d="M752,240L804,240Q798,272 788,304L768,304Q758,272 752,240Z" fill="#c3c4d6" ${OUT}/><path d="M760,246Q764,274 772,300" stroke="rgb(255 255 255 / .45)" stroke-width="4" fill="none"/>
      <ellipse cx="803" cy="295" rx="26" ry="35" fill="#a8743a" ${OUT}/>
      <ellipse cx="803" cy="295" rx="19" ry="27" fill="none" stroke="#7d5127" stroke-width="2"/>
      <ellipse cx="803" cy="295" rx="12" ry="18" fill="none" stroke="#7d5127" stroke-width="2"/>
      <ellipse cx="803" cy="295" rx="5" ry="8" fill="#7d5127"/>`;

    /* ----- wardrobe dome ----- */
    out.wdome = `<g class="spot" data-key="wardrobe"><g class="house"><g transform="translate(777 229) scale(1.08) translate(-777 -229)">${dome(777, 229)}</g>
      <path d="M754,177h46" stroke="#fff6e4" stroke-width="3" stroke-linecap="round"/>
      <rect x="806" y="170" width="9" height="20" rx="2" fill="#2b2f3d"/><path d="M804,170h13l-6.5,-9z" fill="#2b2f3d"/><rect x="808" y="174" width="5" height="9" fill="#ffd978" opacity=".9"/>
      </g></g>`;

    /* ----- mizzen mast + sails (behind the cabin) ----- */
    out.mizzen = `<path d="M739,70C754,70 762,88 757,108C764,128 754,148 746,162L728,154C737,130 729,104 735,86Z" fill="#b3364d" ${OUT}/>
      <path d="M745,80C750,100 752,125 744,150" stroke="rgb(255 255 255 / .22)" stroke-width="3" fill="none"/>
      ${mast(726, 244, 736, 50, 11)}
      ${sail([666, 52], [788, 90], 24, 3)}${yard([662, 47], [790, 86])}
      <path d="M737,52C752,45 770,48 788,40L778,52L790,64C770,62 752,60 737,60Z" fill="#252b3e" ${OUT}/>
      <g transform="translate(763 52)" fill="#f5e8c7" stroke="#f5e8c7" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
        <path d="M-8,5L8,-5M-8,-5L8,5" fill="none" stroke-width="2"/>
        <path d="M-5,-1C-7,-7 -2,-10 2,-7L5,-3L3,3L-3,4Z"/>
        <circle cx="-1.8" cy="-3" r="1" fill="#252b3e" stroke="none"/><circle cx="2.5" cy="-3" r="1" fill="#252b3e" stroke="none"/>
        <path d="M-2,0L2,0L0,2Z" fill="#252b3e" stroke="none"/>
      </g>`;

    /* ----- far rails (beyond the lawn) ----- */
    out.far = rail([373, 371], [418, 351], 7, 14) + rail([500, 328], [578, 307], 9, 14);

    /* ----- lawn ----- */
    {
      const L = [[372,372],[420,346],[500,332],[578,314],[612,298],[644,310],[664,334],[698,372],[600,432],[560,444],[484,452],[446,420],[404,402]];
      let beds = '';
      // dark grid lines of the garden beds (left half of the lawn)
      for (let i = 0; i < 8; i++) { const a = mix([436, 352 + i * 4], [492, 366 + i * 4], 0); beds += `<line x1="${430 + i * 7}" y1="${350 + i * 11}" x2="${520 + i * 6}" y2="${392 + i * 10}" stroke="${COL.lawnD}" stroke-width="2.2" opacity=".6"/>`; }
      for (let j = 0; j < 7; j++) beds += `<line x1="${436 + j * 13}" y1="${350 - j * 1 + 2}" x2="${430 + j * 19}" y2="${446}" stroke="${COL.lawnD}" stroke-width="2.2" opacity=".55"/>`;
      out.lawn = `<clipPath id="cLawn"><polygon points="${pts(L)}"/></clipPath>
        <polygon points="${pts(L)}" fill="url(#gLawn)"/>
        <g clip-path="url(#cLawn)">
          <ellipse cx="620" cy="372" rx="70" ry="30" fill="rgb(220 255 170 / .22)"/>
          <ellipse cx="500" cy="420" rx="60" ry="24" fill="rgb(220 255 170 / .12)"/>
          <g clip-path="polygon(0 0)"></g>
          ${beds}
        </g>
        <polygon points="${pts(L)}" fill="none" stroke="rgb(40 90 40 / .35)" stroke-width="1.4"/>`;
    }

    /* ----- stern cabin: cream wall with the arched doors (Finance & Investing) ----- */
    {
      out.stern = `
      <path d="M700,256C704,250 740,244 756,246C772,250 774,274 772,292L706,320Z" fill="url(#gRed)" ${OUT}/>
      <path d="M706,320L772,292L773,304L707,332Z" fill="${COL.redD}"/>
      ${[[714, 297], [730, 290], [746, 281], [760, 272]].map(([x, y]) => `<path d="${arch(x - 6, y - 20, 12, 22)}" fill="${COL.cream}" ${OUT}/><path d="${arch(x - 4, y - 18, 8, 19)}" fill="#8fd0c0"/>` + (LIGHTS.push(`<path d="${arch(x - 4, y - 18, 8, 19)}" fill="#ffd978"/>`) && '')).join('')}
      <path d="M674,252L720,238L760,240L772,252L722,276Z" fill="#e0586d" ${OUT}/>
      <path d="M674,252L722,276L722,282L674,258Z" fill="${COL.redD}"/>
      <path d="M722,282L772,258L772,264L722,288Z" fill="#f6e3b8" ${OUT}/>
      ${rail([690, 262], [760, 246], 11, 8, 1.3)}
      <polygon points="704,252 676,254 642,266 646,306 706,322" fill="${COL.cream}" ${OUT}/>
      <polygon points="704,252 676,254 642,266 642,274 676,262 704,260" fill="#f2e3c0"/>
      <g class="spot" data-key="finance"><g class="house">
        <polygon points="704,252 676,254 642,266 646,306 706,322" fill="${COL.cream}"/>
        ${door(648, 272, 15, 30)}${door(668, 270, 15, 31)}${door(688, 274, 15, 33)}
      </g></g>
      <ellipse cx="722" cy="236" rx="10" ry="7" fill="#5aa84d"/><circle cx="715" cy="231" r="6" fill="#74c15f"/><circle cx="728" cy="233" r="5" fill="#68b857"/>`;
    }

    /* ----- stern deck, stair, learning wall + trees ----- */
    {
      out.deck = `
      <polygon points="684,320 750,296 782,282 788,332 746,350 702,356" fill="url(#gWood)" ${OUT}/>
      ${[0, 1, 2, 3, 4, 5, 6].map(i => `<line x1="${692 + i * 13}" y1="${338 - i * 8}" x2="${700 + i * 13}" y2="${360 - i * 8}" stroke="rgb(90 55 25 / .3)" stroke-width="1.2"/>`).join('')}
      <path d="M742,302C768,296 786,284 788,296L790,338" fill="none" stroke="#fffaf0" stroke-width="3.6" stroke-linecap="round"/>
      <path d="M742,312C768,306 786,294 788,306L790,346" fill="none" stroke="#f0d9a6" stroke-width="3" stroke-linecap="round"/>
      ${Array.from({ length: 8 }, (_, i) => { const t = i / 7, x = 746 + t * 42, y = 306 - Math.sin(t * Math.PI) * 6 + t * 20; return `<line x1="${f1(x)}" y1="${f1(y)}" x2="${f1(x - 1)}" y2="${f1(y - 11)}" stroke="#fff6e4" stroke-width="1.7" stroke-linecap="round"/>`; }).join('')}
      <polygon points="624,372 696,312 722,326 664,388" fill="url(#gWood)" ${OUT}/>
      ${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => `<line x1="${630 + i * 7.6}" y1="${372 - i * 6.4}" x2="${662 + i * 7.6}" y2="${392 - i * 6.4}" stroke="rgb(90 55 25 / .45)" stroke-width="1.3"/>`).join('')}
      <path d="M640,372L694,320L698,330L646,382Z" fill="rgb(255 255 255 / .18)"/>
      <path d="M622,368L694,306" stroke="#fffaf0" stroke-width="3.4" stroke-linecap="round"/>
      <path d="M664,390L726,330" stroke="#fffaf0" stroke-width="3.4" stroke-linecap="round"/>
      ${rail([622, 366], [694, 304], 8, 13, 1.5)}${rail([664, 388], [726, 328], 7, 13, 1.5)}`;
      out.learn = `
      <g class="spot" data-key="learning"><g class="house">
        <polygon points="616,300 690,296 692,326 656,352 618,334" fill="${COL.cream}" ${OUT}/>
        <polygon points="616,300 690,296 691,304 616,308" fill="#f4e6c5"/>
        ${door(630, 303, 14, 24)}${door(657, 311, 13, 24)}
        <path d="${sparkle(651, 301, 4)}" fill="#fff" opacity=".0"/>
      </g></g>
      ${[[[620, 300], 40, 15], [[660, 326], 28, 11]].map(([b, h, w]) => `<g class="tree"><rect x="${b[0] - 2}" y="${b[1] + 6}" width="4" height="9" fill="#7a4f27"/>
        <path d="M${b[0]},${b[1] + 8 - h}L${b[0] + w},${b[1] + 8}H${b[0] - w}Z" fill="#2f8b4f" ${OUT}/>
        <path d="M${b[0]},${b[1] + 8 - h * .65}L${b[0] + w * .85},${b[1] + 6 - h * .1}H${b[0] - w * .85}Z" fill="#43a860"/></g>`).join('')}`;
    }

    /* ----- main mast + sails ----- */
    out.main = `${mast(607, 352, 609, 64, 13)}
      <ellipse cx="607" cy="352" rx="16" ry="6" fill="#4d3322"/>
      ${band(608, 266, 15)}${band(608, 214, 15)}
      ${sail([535, 79], [776, 167], 46, 4)}${yard([530, 75], [778, 164])}
      ${sail([540, 185], [684, 250], 36, 3)}${yard([535, 181], [688, 247])}
      ${rope([608, 70], [530, 76])}${rope([608, 70], [776, 164])}`;

    /* ----- thatched pavilion (Meal Planner) ----- */
    out.pav = `<g class="spot" data-key="meal"><g class="house">
      <polygon points="498,360 566,378 568,400 500,392" fill="#b98c55" ${OUT}/>
      ${[0, 1, 2, 3, 4, 5].map(i => `<line x1="${506 + i * 11}" y1="${362 + i * 3}" x2="${506 + i * 11}" y2="${394 + i * 1.6}" stroke="rgb(90 55 25 / .3)" stroke-width="1.2"/>`).join('')}
      <rect x="512" y="370" width="28" height="15" rx="2" fill="${COL.glass}" ${OUT}/>
      <rect x="548" y="376" width="14" height="22" rx="2" fill="#7d5127" ${OUT}/>
      <rect x="497" y="358" width="6" height="40" fill="#7d5127"/><rect x="564" y="374" width="6" height="30" fill="#7d5127"/>
      <polygon points="484,316 528,318 602,356 552,384 520,392" fill="url(#gThatch)" ${OUT}/>
      <polygon points="484,316 528,318 520,392" fill="rgb(255 255 255 / .14)"/>
      ${[0, 1, 2, 3, 4, 5, 6, 7].map(i => `<line x1="${492 + i * 5.5}" y1="${322 + i * 8.6}" x2="${530 + i * 9}" y2="${332 + i * 6.4}" stroke="rgb(140 100 30 / .3)" stroke-width="1.3"/>`).join('')}
      <polygon points="520,392 552,384 602,356 602,361 552,390 520,398" fill="#a67f32" ${OUT}/>
      <path d="M484,316L528,318L602,356" fill="none" stroke="#fff3c8" stroke-width="2"/>
      </g></g>`;
    LIGHTS.push(`<rect x="514" y="372" width="28" height="14" fill="#ffd978"/>`);

    /* ----- fore mast, ratlines, sails, dome (Workout Planner) ----- */
    {
      let net = '';
      for (let i = 0; i <= 5; i++) { const t = i / 5; net += `<line x1="${f1(lerp(412, 394, t))}" y1="${f1(lerp(300, 380, t))}" x2="${f1(lerp(430, 438, t))}" y2="${f1(lerp(300, 380, t))}" stroke="#6e4a2a" stroke-width="1.1" opacity=".55"/>`; }
      net += `<line x1="412" y1="300" x2="394" y2="380" stroke="#6e4a2a" stroke-width="1.2" opacity=".6"/><line x1="428" y1="300" x2="436" y2="380" stroke="#6e4a2a" stroke-width="1.2" opacity=".6"/>`;
      for (let i = 0; i < 6; i++) { const y = 300 + i * 16; net += `<line x1="${f1(lerp(412, 394, (y - 300) / 80))}" y1="${y}" x2="${f1(lerp(430, 438, (y - 300) / 80))}" y2="${y}" stroke="#6e4a2a" stroke-width="1" opacity=".5"/>`; }
      out.fore = `<g opacity=".95">${net}</g>
        ${mast(431, 392, 420, 196, 13)}
        <ellipse cx="431" cy="391" rx="15" ry="5.5" fill="#4d3322"/>
        ${band(427, 360, 15)}${band(424, 300, 15)}
        ${sail([362, 246], [494, 336], 38, 3)}${yard([358, 242], [492, 340])}
        ${sail([358, 166], [505, 258], 42, 3)}${yard([352, 162], [508, 259])}
        <ellipse cx="418" cy="226" rx="19" ry="10" transform="rotate(35 418 226)" fill="#f1a86a" ${OUT}/>
        <path d="${sparkle(418, 226, 7)}" fill="#fff3c8"/>
        <line x1="418" y1="96" x2="418" y2="134" stroke="#6e4a2a" stroke-width="3.5" stroke-linecap="round"/>
        <g class="spot" data-key="workout"><g class="house">
          <g class="domeG"><g transform="translate(418 194) scale(1.14) translate(-418 -194)">${dome(418, 194)}</g></g>
        </g></g>
        <path d="M420,98C440,90 456,94 474,104L458,114L470,128C448,122 434,124 420,128Z" fill="#252b3e" ${OUT}/>
        <g transform="translate(445 110)" fill="#f5e8c7" stroke="#f5e8c7" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M-8,5L8,-5M-8,-5L8,5" fill="none" stroke-width="2"/>
          <path d="M-5,-1C-7,-7 -2,-10 2,-7L5,-3L3,3L-3,4Z"/>
          <circle cx="-1.8" cy="-3" r="1" fill="#252b3e" stroke="none"/><circle cx="2.5" cy="-3" r="1" fill="#252b3e" stroke="none"/>
          <path d="M-2,0L2,0L0,2Z" fill="#252b3e" stroke="none"/>
        </g>`;
    }

    /* ----- bow: forecastle deck, red walls ----- */
    out.bow = `
      <polygon points="264,398 326,352 372,356 380,396 340,378 284,410" fill="url(#gRed)" ${OUT}/>
      <path d="M262,402C292,370 322,352 358,332" stroke="${COL.cream}" stroke-width="8" stroke-linecap="round" fill="none"/>
      <path d="M264,398C292,368 322,350 358,331" stroke="#fffdf4" stroke-width="2.4" stroke-linecap="round" fill="none"/>
      ${curl(358, 324, 13)}
      <polygon points="266,404 326,372 360,374 404,404 408,430 272,422" fill="#e9c98c" ${OUT}/>
      ${[0, 1, 2, 3, 4, 5, 6, 7].map(i => `<line x1="${274 + i * 18}" y1="${418 - i * 3}" x2="${304 + i * 17}" y2="${380 + i * 4}" stroke="rgb(140 95 45 / .4)" stroke-width="1.3"/>`).join('')}
      <path d="M268,418L404,430" stroke="rgb(120 80 35 / .35)" stroke-width="5" fill="none"/>
      <g transform="translate(330 398)"><path d="M-16,4C-16,-8 -8,-14 0,-12C8,-14 16,-8 14,4C10,10 -10,10 -16,4Z" fill="#a8bcd0" ${OUT}/><path d="M-9,-2L9,-2M-7,3L11,3" stroke="#e6f0f8" stroke-width="2"/><rect x="-3" y="-17" width="6" height="7" rx="2" fill="#7c8da8"/></g>
      ${rail([362, 374], [410, 408], 6, 13, 1.5)}
      <polygon points="404,402 440,398 456,406 410,414" fill="url(#gWood)" ${OUT}/>`;

    /* ----- near rail along the lawn ----- */
    out.nrail = rail([484, 454], [684, 378], 16, 19, 2);

    /* ----- near hull ----- */
    {
      const T = 'M445,402C452,438 470,460 506,466L578,466L602,452';
      const Lw = 'M408,452C430,484 470,504 516,512C552,508 574,498 592,490';
      out.hull = `
      <path d="M262,548C300,558 380,558 440,551C500,546 560,527 590,506L640,497C690,478 730,452 760,420C774,396 776,370 772,344L748,340L700,412L640,444L580,466L500,468L440,430L406,430L276,420Z" fill="url(#gHull)" ${OUT}/>
      <path d="M270,548C320,556 430,554 500,540C540,530 570,515 592,500L592,512C560,530 520,552 440,556C380,560 300,560 262,552Z" fill="rgb(40 20 12 / .35)"/>
      <path d="M690,478C730,452 760,420 768,392L770,420C756,446 722,474 690,490Z" fill="rgb(30 20 40 / .4)"/>
      <path d="M740,380L748,372L752,430L738,440Z" fill="#232a3d"/>
      ${[0, 1, 2, 3].map(i => `<path d="M${420 + i * 4},${520 + i * 7}Q520,${512 + i * 8} 590,${498 + i * 8}" fill="none" stroke="rgb(60 30 12 / .34)" stroke-width="1.7"/>`).join('')}
      <!-- the red band along the dip -->
      <path d="${T}L${602},470C580,486 560,494 516,512C470,504 430,484 408,452L408,430L440,430Z" fill="url(#gRed)"/>
      <path d="${T}" fill="none" stroke="${COL.cream}" stroke-width="9" stroke-linecap="round"/>
      <path d="${Lw}" fill="none" stroke="${COL.cream}" stroke-width="4.5" stroke-linecap="round"/>
      <path d="${T}" fill="none" stroke="#fffdf4" stroke-width="2.2" stroke-linecap="round" transform="translate(0 -1.5)"/>
      ${porthole(440, 450, 8)}${porthole(473, 484, 9)}${porthole(530, 488, 9)}
      ${curl(452, 394, 14)}
      <!-- stern wall -->
      <path d="M748,303C742,335 730,372 708,404C690,426 664,440 644,448L650,476C690,462 726,436 748,404C760,382 756,350 752,330Z" fill="url(#gRed)" ${OUT}/>
      <path d="M748,303C742,335 730,372 708,404C690,426 664,440 644,448" fill="none" stroke="${COL.cream}" stroke-width="11" stroke-linecap="round"/>
      <path d="M748,303C742,335 730,372 708,404C690,426 664,440 644,448" fill="none" stroke="#fffdf4" stroke-width="3.2" stroke-linecap="round" transform="translate(-2.5 0)"/>
      ${porthole(728, 358, 7)}${porthole(707, 397, 8)}${porthole(731, 397, 6.5)}${porthole(750, 386, 6)}${porthole(676, 430, 8)}`;
      /* bank cabin: little gallery at the stern */
      out.bankc = `<g class="spot" data-key="bank"><g class="house">
        <polygon points="738,322 782,308 786,356 744,376" fill="${COL.cream}" ${OUT}/>
        <polygon points="738,322 782,308 783,316 739,330" fill="${COL.red}"/>
        <polygon points="738,322 782,308 783,316 739,330" fill="none" ${OUT}/>
        ${win(742, 338, 8, 14)}${win(768, 328, 8, 14)}
        ${door(754, 334, 13, 26)}
        <path d="M730,380L748,374L788,360" stroke="#f0d9a6" stroke-width="3.4" fill="none" stroke-linecap="round"/>
        ${rail([730, 378], [788, 360], 9, 10, 1.4)}
      </g></g>`;
    }

    /* ----- paddle-wheel tyre ----- */
    out.tyre = `<g transform="rotate(-22 612 462)"><ellipse cx="612" cy="462" rx="44" ry="54" fill="#262c3c" ${OUT}/>
      <ellipse cx="612" cy="462" rx="36" ry="46" fill="#3c4458"/>
      <ellipse cx="610" cy="462" rx="27" ry="37" fill="#d9a85f" ${OUT}/>
      <path d="${sparkle(610, 462, 16)}" fill="#cf4a5f"/></g>`;

    /* ----- bow: red panel, figurehead ----- */
    out.front = `
      <path d="M276,420L408,432L408,522C390,534 360,544 330,548C300,548 280,530 266,500C260,470 266,440 276,420Z" fill="url(#gRed)" ${OUT}/>
      <path d="M266,418L410,430" stroke="${COL.cream}" stroke-width="7.5" stroke-linecap="round" fill="none"/>
      <path d="M266,416L410,428" stroke="#fffdf4" stroke-width="2.4" stroke-linecap="round" fill="none"/>
      <path d="M408,430L408,520C395,532 380,538 360,542" stroke="${COL.cream}" stroke-width="5" stroke-linecap="round" fill="none"/>
      <path d="M274,490C320,500 370,516 404,528" stroke="${COL.cream}" stroke-width="6" stroke-linecap="round" fill="none"/>
      <circle cx="352" cy="468" r="31" fill="${COL.cream}" ${OUT}/>
      <circle cx="352" cy="468" r="24" fill="#f6dc8c"/>
      <path d="${sparkle(352, 468, 17)}" fill="${COL.red}"/>
      <circle cx="322" cy="546" r="13" fill="${COL.cream}" ${OUT}/><circle cx="322" cy="546" r="7" fill="${COL.creamD}"/>
      <!-- figurehead: a golden compass-star with a cheerful face -->
      <g class="fig">
        <path d="M262,392C232,396 210,420 210,452C212,500 238,536 270,546L282,420Z" fill="#ead9a6" ${OUT}/>
        <path d="M262,400C238,406 226,428 226,452C228,494 244,520 268,534" fill="none" stroke="#c8b27a" stroke-width="3"/>
        <circle cx="244" cy="406" r="3.5" fill="#c8b27a"/><circle cx="238" cy="470" r="3.5" fill="#c8b27a"/><circle cx="252" cy="520" r="3.5" fill="#c8b27a"/>
        <g transform="translate(204 452) scale(1.22)">
          <!-- cheerful lion-like figurehead: orange sunburst mane, cream face and tiny muzzle -->
          <path d="M0,-54L10,-36L25,-49L28,-29L48,-34L39,-15L56,-4L38,7L47,26L26,27L19,48L3,34L-11,51L-18,30L-40,35L-35,14L-55,3L-37,-10L-45,-29L-24,-30L-15,-49L-2,-34Z" fill="#f28b38" ${OUT}/>
          <path d="M-2,-43L7,-30L20,-39L21,-23L38,-25L29,-10L43,-3L28,7L35,20L18,20L12,37L0,25L-11,39L-14,20L-32,23L-27,7L-41,2L-27,-8L-33,-22L-16,-22L-10,-38Z" fill="#ffb24e"/>
          <ellipse cx="0" cy="0" rx="30" ry="32" fill="#f8df9a" ${OUT}/>
          <ellipse cx="-17" cy="-17" rx="10" ry="13" fill="#f7c66f" stroke="#8a5a2d" stroke-width="1.5"/>
          <ellipse cx="17" cy="-17" rx="10" ry="13" fill="#f7c66f" stroke="#8a5a2d" stroke-width="1.5"/>
          <ellipse cx="-10" cy="-5" rx="4.1" ry="5.1" fill="#34251f"/><ellipse cx="10" cy="-5" rx="4.1" ry="5.1" fill="#34251f"/>
          <circle cx="-11" cy="-6.5" r="1.3" fill="#fff"/><circle cx="9" cy="-6.5" r="1.3" fill="#fff"/>
          <ellipse cx="-18" cy="7" rx="5.5" ry="3.4" fill="#f58d83" opacity=".72"/><ellipse cx="18" cy="7" rx="5.5" ry="3.4" fill="#f58d83" opacity=".72"/>
          <ellipse cx="0" cy="11" rx="13" ry="10" fill="#fff0c5" stroke="#c6a66a" stroke-width="1.2"/>
          <path d="M-4,7Q0,3 4,7Q2,12 0,12Q-2,12 -4,7Z" fill="#7b4934"/>
          <path d="M0,12Q-1,18 -8,18M0,12Q1,18 8,18" stroke="#75452f" stroke-width="2" fill="none" stroke-linecap="round"/>
        </g>
      </g>
      <g stroke="#fffaf0" stroke-width="2" fill="none" opacity=".0"></g>`;
    return out;
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
      workout:  '<rect x="372" y="124" width="92" height="96" rx="30"/>',
      wardrobe: '<rect x="731" y="162" width="92" height="96" rx="30"/>',
      finance:  `<polygon points="${pts([[642, 258], [704, 246], [706, 316], [646, 304]])}"/>`,
      learning: `<polygon points="${pts([[614, 296], [692, 292], [694, 328], [656, 354], [616, 336]])}"/>`,
      meal:     `<polygon points="${pts([[488, 316], [528, 320], [594, 354], [550, 394], [504, 392]])}"/>`,
      bank:     '<rect x="732" y="314" width="50" height="60" rx="6"/>',
    };
    const hitG = KEYS.map(k => `<g class="hit" data-key="${k}" tabindex="0" role="link" aria-label="Open ${PAGES[k].name}">${hits[k]}</g>`).join('');

    const stickers = KEYS.map(k => {
      const pos = { workout: [472, 120], wardrobe: [826, 140], finance: [660, 188], learning: [570, 262], meal: [530, 274], bank: [790, 322] }[k];
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
    <g class="dim isles">
      <path d="M26,226C44,196 58,170 82,142C96,128 106,138 118,150C130,162 146,170 164,174C178,178 196,184 206,200L206,230Z" fill="#6f9a72"/>
      <path d="M82,142C70,170 60,198 40,222L64,226C74,196 92,166 82,142Z" fill="#8cb48a" opacity=".7"/>
      <path d="M170,190C200,164 240,148 292,150C320,150 330,156 330,158L330,190Z" fill="#7da589" opacity=".75"/>
      <path d="M780,160C820,128 870,112 910,126C930,132 946,146 956,158L956,170Z" fill="#79a88e" opacity=".85"/>
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
        ${o.rear}${o.wdome}${o.mizzen}${o.far}${o.lawn}${o.stern}${o.deck}${o.learn}${o.main}${o.pav}${o.fore}${o.bow}${o.nrail}${o.hull}${o.bankc}${o.tyre}${o.front}
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
