/* ============================================================
   Sky Banner
   - The sky blends smoothly through night, dawn, morning, day,
     golden hour, sunset and dusk, tied to the real sunrise/sunset.
   - Weather (Open-Meteo, no API key) changes clouds, rain and mood.

   URL options (all optional), e.g.  /sky/?time=18:05&weather=rain
     time=HH:MM        freeze the clock for previewing a sky
     demo=60           play a whole day in 60 seconds
     weather=clear|partly|cloudy|fog|rain|storm|snow   preview weather
     temp=27           preview temperature
     lat=  lon=  city= change the weather location
     ship=assets/merry.png   sticker file
     shipx=58  shipy=5  shipsize=38   sticker position / size tuning
   ============================================================ */
(() => {
  'use strict';

  /* ---------- config ---------- */
  const q = new URLSearchParams(location.search);
  const num = (k, d) => { const v = parseFloat(q.get(k)); return Number.isFinite(v) ? v : d; };

  const CFG = {
    lat: num('lat', 26.2183),
    lon: num('lon', 78.1828),
    city: q.get('city') ?? 'Gwalior',
    ship: q.get('ship') || 'assets/merry.png',
    shipX: num('shipx', 58),
    shipY: num('shipy', 5),
    shipSize: num('shipsize', 30),
  };

  const root = document.documentElement;
  const $ = id => document.getElementById(id);
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = t => t * t * (3 - 2 * t);
  const mixC = (a, b, t) => a.map((v, i) => lerp(v, b[i], t));
  const rgb = c => c.map(v => Math.round(clamp(v, 0, 255))).join(' ');
  const lum = c => (0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]) / 255;
  const setVar = (k, v) => root.style.setProperty(k, v);

  function rng(seed) {
    return () => {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const R = rng(20261007);

  /* ---------- palettes ---------- */
  const pal = (top, mid, bot, seaTop, seaBot, cloud, cloudA, stars, aurora, shipB, shipS, spark) =>
    ({ top, mid, bot, seaTop, seaBot, cloud, cloudA, stars, aurora, shipB, shipS, spark });

  const P = {
    night:   pal([9, 24, 64],    [14, 52, 112],  [28, 92, 158],  [20, 72, 150],  [8, 30, 92],    [70, 110, 165],  .5,  1,   .9,  .78, .9,  [210, 240, 255]),
    dawn:    pal([70, 76, 140],  [196, 134, 166],[252, 190, 150],[128, 150, 196],[52, 80, 142],  [255, 205, 195], .8,  .22, .15, .9,  1,   [255, 235, 220]),
    morning: pal([112, 168, 214],[176, 212, 226],[250, 226, 192],[92, 170, 204], [40, 110, 162], [255, 244, 236], .85, 0,   0,   1,   1,   [255, 255, 255]),
    day:     pal([66, 148, 224], [122, 190, 236],[196, 228, 242],[62, 152, 208], [28, 96, 162],  [255, 255, 255], .9,  0,   0,   1,   1,   [255, 255, 255]),
    golden:  pal([96, 150, 204], [248, 208, 142],[255, 172, 112],[104, 170, 192],[40, 108, 150], [255, 218, 176], .85, 0,   0,   .95, 1.05,[255, 240, 210]),
    sunset:  pal([112, 160, 172],[250, 192, 110],[238, 102, 62], [66, 172, 172], [20, 120, 132], [206, 92, 92],   .75, 0,   0,   .8,  1.1, [255, 236, 190]),
    dusk:    pal([42, 52, 112],  [122, 72, 132], [232, 112, 102],[62, 72, 142],  [22, 42, 102],  [156, 92, 134],  .65, .5,  .35, .78, 1,   [255, 225, 215]),
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

  /* ---------- sunrise / sunset (offline estimate, refined by the weather API) ---------- */
  let SR = 6.3, SS = 18.1;
  function estimateSun(d) {
    const rad = Math.PI / 180;
    const N = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 864e5);
    const decl = 23.44 * rad * Math.sin(2 * Math.PI * (284 + N) / 365);
    const phi = CFG.lat * rad;
    const cosH = (Math.sin(-0.833 * rad) - Math.sin(phi) * Math.sin(decl)) / (Math.cos(phi) * Math.cos(decl));
    const H = Math.acos(clamp(cosH, -1, 1)) / rad / 15;
    const B = 2 * Math.PI * (N - 81) / 364;
    const E = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
    const tzMeridian = -d.getTimezoneOffset() / 4;
    const noon = 12 + (tzMeridian - CFG.lon) / 15 - E / 60;
    return { sr: noon - H, ss: noon + H };
  }
  {
    const s = estimateSun(new Date());
    if (Number.isFinite(s.sr) && Number.isFinite(s.ss)) { SR = s.sr; SS = s.ss; }
  }

  /* ---------- weather ---------- */
  const FORCED = {
    clear: 0, partly: 2, cloudy: 3, overcast: 3, fog: 45, rain: 63, storm: 95, snow: 73,
  };

  function classify(code) {
    if (code === 0)  return { label: 'Clear sky',     cloud: .22, icon: 'clear' };
    if (code === 1)  return { label: 'Mostly clear',  cloud: .4,  icon: 'clear' };
    if (code === 2)  return { label: 'Partly cloudy', cloud: .68, icon: 'partly' };
    if (code === 3)  return { label: 'Overcast',      cloud: 1,   icon: 'cloud' };
    if (code === 45 || code === 48) return { label: 'Foggy', cloud: .9, fog: 1, icon: 'fog' };
    if (code >= 51 && code <= 57)   return { label: 'Drizzle', cloud: 1, rain: .4, icon: 'rain' };
    if (code === 61 || code === 80) return { label: 'Light rain', cloud: 1, rain: .55, icon: 'rain' };
    if (code === 63 || code === 81 || code === 66) return { label: 'Rain', cloud: 1, rain: .8, icon: 'rain' };
    if (code === 65 || code === 82 || code === 67) return { label: 'Heavy rain', cloud: 1, rain: 1, icon: 'rain' };
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { label: 'Snow', cloud: 1, snow: .6, icon: 'snow' };
    if (code >= 95)  return { label: 'Thunderstorm', cloud: 1, rain: 1, icon: 'storm' };
    return { label: 'Fair', cloud: .4, icon: 'clear' };
  }

  const SVG = (inner, vb = '0 0 24 24') => `<svg viewBox="${vb}" aria-hidden="true">${inner}</svg>`;
  const CLOUD = '<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>';
  const ICONS = {
    clear:  night => night
      ? SVG('<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>')
      : SVG('<circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
    partly: night => night
      ? SVG('<path d="M10.5 3.2A5.2 5.2 0 1 0 14 9.4 4.2 4.2 0 0 1 10.5 3.2z"/><path d="M18 20h-8.5a4.2 4.2 0 0 1-.4-8.4A5.6 5.6 0 0 1 19.9 13 3.5 3.5 0 0 1 18 20z"/>')
      : SVG('<circle cx="8" cy="8" r="3"/><path d="M8 2v1.3M2 8h1.3M3.8 3.8l.9.9M12.2 3.8l-.9.9"/><path d="M18 20h-8.5a4.2 4.2 0 0 1-.4-8.4A5.6 5.6 0 0 1 19.9 13 3.5 3.5 0 0 1 18 20z"/>'),
    cloud: () => SVG(CLOUD),
    fog:   () => SVG('<path d="M3 8h18M5 12h14M3 16h18M7 20h10"/>'),
    rain:  () => SVG('<path d="M16 13v8M8 13v8M12 15v8"/><path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25"/>'),
    storm: () => SVG('<path d="M19 16.9A5 5 0 0 0 18 7h-1.26a8 8 0 1 0-11.62 9"/><path d="M13 11l-4 6h6l-4 6"/>'),
    snow:  () => SVG('<path d="M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 16.25"/><path d="M8 16h.01M8 20h.01M12 18h.01M12 22h.01M16 16h.01M16 20h.01"/>'),
  };

  const wx = { code: 0, temp: null, info: classify(0), loaded: false };
  const forced = q.get('weather');
  if (forced && forced in FORCED) {
    wx.code = FORCED[forced];
    wx.info = classify(wx.code);
    wx.temp = num('temp', 28);
    wx.loaded = true;
  } else if (q.has('temp')) {
    wx.temp = num('temp', 28);
  }

  async function fetchWeather() {
    if (forced && forced in FORCED) return;
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 9000);
      const url = 'https://api.open-meteo.com/v1/forecast'
        + `?latitude=${CFG.lat}&longitude=${CFG.lon}`
        + '&current=temperature_2m,weather_code&daily=sunrise,sunset&timezone=auto&forecast_days=1';
      const res = await fetch(url, { signal: ctl.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error('weather ' + res.status);
      const data = await res.json();
      wx.code = data.current.weather_code;
      wx.temp = data.current.temperature_2m;
      wx.info = classify(wx.code);
      wx.loaded = true;
      const parse = s => { const m = /T(\d\d):(\d\d)/.exec(s || ''); return m ? +m[1] + +m[2] / 60 : null; };
      const sr = parse(data.daily && data.daily.sunrise && data.daily.sunrise[0]);
      const ss = parse(data.daily && data.daily.sunset && data.daily.sunset[0]);
      if (sr && ss && ss > sr) { SR = sr; SS = ss; }
    } catch (e) {
      /* keep whatever we had; the banner still works without weather */
    }
    lastKey = '';
    tick();
  }

  /* ---------- scene building ---------- */
  const banner = $('banner');
  const NS = 'http://www.w3.org/2000/svg';

  // stars
  {
    const box = $('stars');
    for (let i = 0; i < 90; i++) {
      const s = document.createElement('i');
      s.className = 'star';
      const big = R() > .9;
      const size = big ? 2.6 : 1 + R() * 1.4;
      s.style.cssText = `left:${R() * 100}%;top:${R() * 100}%;width:${size}px;height:${size}px;`
        + `animation-delay:-${(R() * 4).toFixed(2)}s;animation-duration:${(2.4 + R() * 3).toFixed(2)}s;`;
      box.appendChild(s);
    }
  }

  // waves
  function wave(cls, { top, bottom, height, half, amp, dur, reverse, parent }) {
    const W = 2400, H = 60, mid = H / 2;
    let d = `M0 ${mid}`;
    for (let x = 0, i = 0; x < W; x += half, i++) {
      if (i === 0) d += ` Q ${half / 2} ${mid - amp} ${half} ${mid}`;
      else d += ` T ${x + half} ${mid}`;
    }
    d += ` L ${W} ${H} L 0 ${H} Z`;
    const el = document.createElement('div');
    el.className = 'wave ' + cls;
    if (top != null) el.style.top = top;
    if (height) el.style.height = height;
    el.style.animationDuration = dur + 's';
    if (reverse) el.style.animationDirection = 'reverse';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
    el.appendChild(svg);
    parent.appendChild(el);
    return el;
  }
  const sea = $('sea');
  wave('l', { top: '6%',  height: '16%', half: 150, amp: 12, dur: 24, parent: sea });
  wave('d', { top: '26%', height: '18%', half: 100, amp: 14, dur: 17, reverse: true, parent: sea });
  wave('l', { top: '50%', height: '22%', half: 200, amp: 16, dur: 13, parent: sea });
  wave('d', { top: '74%', height: '26%', half: 120, amp: 10, dur: 19, reverse: true, parent: sea });
  wave('front', { half: 120, amp: 14, dur: 15, parent: banner });

  // sun / moon reflection bars
  {
    const g = $('glitter');
    const rows = 11;
    for (let i = 0; i < rows; i++) {
      const b = document.createElement('i');
      b.className = 'gbar';
      const f = i / (rows - 1);
      b.style.top = `${6 + f * 88}%`;
      b.style.width = `${26 + f * 74 * (.7 + R() * .3)}%`;
      b.style.animationDelay = `-${(R() * 3).toFixed(2)}s`;
      b.style.animationDuration = `${(2.4 + R() * 2).toFixed(2)}s`;
      g.appendChild(b);
    }
  }

  // sparkles on the water
  {
    const box = $('sparkles');
    for (let i = 0; i < 16; i++) {
      const s = document.createElement('i');
      s.className = 'spark';
      const size = 2 + Math.round(R() * 3);
      s.style.cssText = `left:${4 + R() * 92}%;top:${70 + R() * 27}%;--s:${size}px;`
        + `animation-delay:-${(R() * 4).toFixed(2)}s;animation-duration:${(2.6 + R() * 2.4).toFixed(2)}s;`;
      box.appendChild(s);
    }
  }

  // clouds
  const CLOUD_SVG = `<svg viewBox="0 0 200 80" aria-hidden="true"><g fill="currentColor">
    <ellipse cx="60" cy="52" rx="48" ry="22"/><ellipse cx="108" cy="38" rx="44" ry="28"/>
    <ellipse cx="152" cy="54" rx="42" ry="20"/><ellipse cx="100" cy="58" rx="74" ry="20"/></g></svg>`;
  const cloudSpecs = [
    { top: 9,  s: 1.0, speed: 150, thr: 0 },
    { top: 24, s: .8,  speed: 190, thr: .08 },
    { top: 35, s: 1.2, speed: 130, thr: .25 },
    { top: 15, s: 1.4, speed: 210, thr: .45 },
    { top: 41, s: .9,  speed: 170, thr: .55 },
    { top: 5,  s: 1.1, speed: 240, thr: .7 },
    { top: 29, s: 1.6, speed: 260, thr: .85 },
  ];
  const cloudEls = cloudSpecs.map(c => {
    const el = document.createElement('div');
    el.className = 'cloud';
    el.innerHTML = CLOUD_SVG;
    const phase = R();
    el.style.cssText = `top:${c.top}%;width:${c.s * 22}cqw;animation-duration:${c.speed}s;`
      + `animation-delay:-${(phase * c.speed).toFixed(1)}s;--rx:${(phase * 160 - 30).toFixed(0)}cqw;`;
    $('clouds').appendChild(el);
    return { el, thr: c.thr };
  });

  // rain / snow
  const rainBox = $('rain');
  for (let i = 0; i < 70; i++) {
    const d = document.createElement('i');
    d.className = 'drop';
    const len = 7 + R() * 9;
    d.style.cssText = `left:${R() * 115}%;height:${len}cqh;animation-duration:${(.75 + R() * .55).toFixed(2)}s;`
      + `animation-delay:-${(R() * 2).toFixed(2)}s;opacity:${(.4 + R() * .5).toFixed(2)};`;
    rainBox.appendChild(d);
  }

  // ship sticker (Merry from assets/merry.png)
  {

    const targets = [$('ship'), $('reflect')];
    const probe = new Image();
    probe.onload = () => targets.forEach(t => {
      const im = new Image(); im.src = CFG.ship; im.alt = ''; im.draggable = false; t.appendChild(im);
    });
    probe.onerror = () => targets.forEach(t => { t.innerHTML = ''; });
    probe.src = CFG.ship;

    setVar('--ship-x', CFG.shipX + '%');
    setVar('--ship-y', CFG.shipY + 'cqh');
    setVar('--ship-h', CFG.shipSize + 'cqh');
  }

  /* ---------- clock ---------- */
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  const demoSecs = q.has('demo') ? Math.max(8, num('demo', 60)) : 0;
  const t0 = performance.now();
  function getNow() {
    if (demoSecs) {
      const h = (((performance.now() - t0) / 1000) / demoSecs * 24 + num('from', 5)) % 24;
      const d = new Date(); d.setHours(0, 0, 0, 0);
      d.setTime(d.getTime() + h * 3600e3);
      return { h, d };
    }
    const m = /^(\d{1,2}):(\d{2})$/.exec(q.get('time') || '');
    if (m) {
      const d = new Date(); d.setHours(+m[1], +m[2], 0, 0);
      return { h: +m[1] + +m[2] / 60, d };
    }
    const d = new Date();
    return { h: d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600, d };
  }

  let lastText = '';
  function renderClock(d) {
    let hr = d.getHours();
    const ap = hr >= 12 ? 'PM' : 'AM';
    hr = hr % 12 || 12;
    const mn = String(d.getMinutes()).padStart(2, '0');
    const key = `${hr}:${mn}${ap}${d.getDate()}`;
    if (key === lastText) return;
    lastText = key;
    $('hm').innerHTML = `${hr}<span class="colon">:</span>${mn}`;
    $('ampm').textContent = ap;
    $('date').textContent = `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  }

  /* ---------- scene update ---------- */
  let lastKey = '';
  const overcastOf = info => clamp(((info.cloud || 0) - .55) / .45);

  function applyScene(h) {
    const k = skyAt(h, SR, SS);
    const ov = overcastOf(wx.info);

    // overcast: wash the colors toward a soft grey, keep their brightness
    const wash = (c, amt, dark = .08) => {
      const l = 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
      return mixC(c, [l * .96, l, l * 1.06], amt).map(v => v * (1 - dark * ov));
    };
    const amt = .5 * ov;
    const top = wash(k.top, amt), mid = wash(k.mid, amt), bot = wash(k.bot, amt);
    const seaTop = wash(k.seaTop, amt * .8), seaBot = wash(k.seaBot, amt * .8);
    const cloudC = wash(k.cloud, .6 * ov, .18);

    setVar('--sky-top', rgb(top));
    setVar('--sky-mid', rgb(mid));
    setVar('--sky-bot', rgb(bot));
    setVar('--sea-top', rgb(seaTop));
    setVar('--sea-bot', rgb(seaBot));
    setVar('--sea-front', rgb(mixC(seaTop, seaBot, .22)));
    setVar('--wave-l', rgb(mixC(seaTop, [255, 255, 255], .35)));
    setVar('--wave-d', rgb(mixC(seaBot, [0, 6, 30], .35)));
    setVar('--cloud', rgb(cloudC));
    setVar('--spark', rgb(k.spark));

    setVar('--stars', (k.stars * (1 - .9 * ov)).toFixed(3));
    setVar('--aurora', (k.aurora * (1 - .85 * ov)).toFixed(3));
    setVar('--ship-b', (k.shipB * (1 - .06 * ov)).toFixed(3));
    setVar('--ship-s', (k.shipS * (1 - .2 * ov)).toFixed(3));
    setVar('--scrim', clamp(.2 + .3 * lum(mid), .2, .5).toFixed(3));

    // weather overlays
    const info = wx.info;
    setVar('--rain', String(info.rain || info.snow || 0));
    rainBox.classList.toggle('snow', !!info.snow);
    setVar('--fog', String((info.fog || 0) * .8));

    cloudEls.forEach(({ el, thr }) => {
      const a = clamp(((info.cloud || 0) - thr) / .18) * k.cloudA;
      el.style.opacity = a.toFixed(3);
    });

    // sun (sinks a little faster than it climbs so it is fully gone soon after sunset)
    const sun = $('sun'), moon = $('moon');
    const sink = el => (el >= 0 ? el : el * 2.2);
    const EDGE = .05;
    const t = (h - SR) / (SS - SR);
    let sunGlit = 0, sunX = 50;
    if (t > -0.07 && t < 1.07) {
      const elev = Math.sin(Math.PI * t);
      const e = clamp(elev);
      const low = Math.pow(1 - e, 1.6);
      const d = 15 + 9 * Math.pow(1 - e, 1.5);
      const edge = clamp((t + .07) / EDGE) * clamp((1.07 - t) / EDGE);
      sunX = 20 + t * 60;
      sun.style.cssText = `left:${sunX}%;top:${66 - 44 * sink(elev)}%;--d:${d.toFixed(2)}cqh;opacity:${((1 - .82 * ov) * edge).toFixed(3)};display:block;`;
      setVar('--sun-halo', rgb(mixC([255, 232, 168], [255, 132, 66], low)));
      setVar('--sun-disk', rgb(mixC([255, 252, 236], [255, 238, 208], low)));
      if (elev > -.15) sunGlit = clamp(.3 + .7 * (1 - e)) * (1 - .85 * ov) * clamp((elev + .15) / .2);
      setVar('--glit-c', rgb(mixC([255, 240, 205], [255, 190, 120], low)));
    } else {
      sun.style.display = 'none';
    }

    // moon (always rides the night sky)
    const moonSpan = 24 - (SS - SR) - .25;
    let dm = (((h - (SS + .25)) % 24) + 24) % 24;
    if (dm > 23.6) dm -= 24;                      // just before moonrise
    const tm = dm / moonSpan;
    let moonGlit = 0, moonX = 50;
    if (tm > -0.04 && tm < 1.06) {
      const elev = Math.sin(Math.PI * tm);
      const e = clamp(elev);
      const edge = clamp((tm + .04) / .04) * clamp((1.06 - tm) / EDGE);
      const vis = clamp(k.stars * 1.8) * (1 - .88 * ov) * edge;
      moonX = 20 + tm * 60;
      moon.style.cssText = `left:${moonX}%;top:${66 - 40 * sink(elev)}%;--d:${(10.5 + 3 * (1 - e)).toFixed(2)}cqh;opacity:${vis.toFixed(3)};display:block;`;
      if (elev > -.1) moonGlit = .5 * vis * clamp((elev + .1) / .2);
    } else {
      moon.style.display = 'none';
    }

    // reflection column under whichever light is strongest
    const g = $('glitter');
    if (sunGlit >= moonGlit) {
      g.style.left = sunX + '%';
      setVar('--glit', sunGlit.toFixed(3));
    } else {
      g.style.left = moonX + '%';
      setVar('--glit-c', '225 238 255');
      setVar('--glit', moonGlit.toFixed(3));
    }
  }

  /* ---------- weather pill ---------- */
  function renderWeather(h) {
    const pill = $('weather');
    if (!wx.loaded && wx.temp == null) { pill.hidden = true; return; }
    const night = h < SR || h > SS;
    $('wicon').innerHTML = (ICONS[wx.info.icon] || ICONS.clear)(night);
    $('temp').textContent = wx.temp == null ? '' : `${Math.round(wx.temp)}°C`;
    $('wlabel').textContent = CFG.city ? `${wx.info.label} · ${CFG.city}` : wx.info.label;
    pill.hidden = false;
  }

  /* ---------- loop ---------- */
  function tick() {
    const { h, d } = getNow();
    renderClock(d);
    const key = demoSecs ? 'demo' + Math.round(h * 120) : `${Math.round(h * 120)}|${wx.code}|${wx.temp}|${SR.toFixed(2)}`;
    if (key !== lastKey) {
      lastKey = key;
      applyScene(h);
      renderWeather(h);
    }
  }

  tick();
  setInterval(tick, demoSecs ? 100 : 1000);
  if (!(forced && forced in FORCED)) {
    fetchWeather();
    setInterval(fetchWeather, 20 * 60 * 1000);
  }
})();
