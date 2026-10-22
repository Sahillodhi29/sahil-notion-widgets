/* ============================================================
   Ship Navigation
   A ship seen from above at a 3/4 angle. Six spots on it open your
   six Notion pages. Hover a spot: it lights up and its name appears.
   Click: the camera pushes in on that spot, then the page opens in a
   new tab. The sky and sea follow the real time of day (same recipe
   as the Sky Banner).

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
    workout:  { name: 'Workout Planner',        g: '104 214 134', url: 'https://app.notion.com/p/Workout-Planner-3e7fa221698780908ad1d249532cd932' },
    finance:  { name: 'Finance & Investing',    g: '255 168 202', url: 'https://app.notion.com/p/Finance-Investing-3e7fa221698780d09d1fe5b1ab6c4ce0' },
    learning: { name: 'Learning Planner',       g: '198 144 240', url: 'https://app.notion.com/p/Learning-Planner-f76fa221698783db8e2681ce2394c6a7' },
    meal:     { name: 'Meal Planner',           g: '255 120 150', url: 'https://app.notion.com/p/Meal-Planner-3eefa221698780818e5fc99b43a74a87' },
    wardrobe: { name: 'Wardrobe',               g: '127 166 255', url: 'https://app.notion.com/p/Wardrobe-Organizer-305fa22169878363870b8121ff54b768' },
    bank:     { name: 'Bank Officer in Making', g: '255 200 97',  url: 'https://app.notion.com/p/Bank-Officer-in-Making-3f0fa22169878133a416e22d1592203b' },
  };
  const KEYS = Object.keys(PAGES);
  const linkOf = k => q.get(k + 'Link') || PAGES[k].url;

  /* ============================================================
     Time-synced sky (palette + curve shared with the Sky Banner)
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

  /* ---------- seeded random ---------- */
  const rng = seed => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const R = rng(20261019);
  const NS = 'http://www.w3.org/2000/svg';

  /* ============================================================
     Environment: stars, waves, glitter, sparkles, clouds
     ============================================================ */
  const world = $('world'), stage = $('stage'), flash = $('flash'), fallback = $('fallback');
  const sea = $('sea');
  {
    const box = $('stars');
    for (let i = 0; i < 60; i++) {
      const s = document.createElement('i'); s.className = 'star';
      const big = R() > .9, size = big ? 2.4 : 1 + R() * 1.3;
      s.style.cssText = `left:${R() * 100}%;top:${R() * 100}%;width:${size}px;height:${size}px;animation-delay:-${(R() * 4).toFixed(2)}s;animation-duration:${(2.4 + R() * 3).toFixed(2)}s;`;
      box.appendChild(s);
    }
  }
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
    if (bottom != null) el.style.bottom = bottom;
    if (height) el.style.height = height;
    el.style.animationDuration = dur + 's';
    if (reverse) el.style.animationDirection = 'reverse';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', d);
    svg.appendChild(path); el.appendChild(svg); parent.appendChild(el);
    return el;
  }
  // far bands are small and tight, near bands are long and slow (perspective)
  wave('l', { top: '1%',  height: '6%',  half: 54,  amp: 10, dur: 34, parent: sea });
  wave('d', { top: '8%',  height: '8%',  half: 76,  amp: 12, dur: 27, reverse: true, parent: sea });
  wave('l', { top: '17%', height: '11%', half: 110, amp: 14, dur: 22, parent: sea });
  wave('d', { top: '30%', height: '14%', half: 150, amp: 14, dur: 18, reverse: true, parent: sea });
  wave('l', { top: '46%', height: '17%', half: 200, amp: 16, dur: 15, parent: sea });
  wave('d', { top: '65%', height: '35%', half: 260, amp: 12, dur: 20, reverse: true, parent: sea });
  {
    const g = $('glitter'), rows = 12;
    for (let i = 0; i < rows; i++) {
      const b = document.createElement('i'); b.className = 'gbar';
      const f = i / (rows - 1);
      b.style.top = `${3 + Math.pow(f, 1.2) * 92}%`;
      b.style.width = `${20 + f * 80 * (.7 + R() * .3)}%`;
      b.style.height = `${(.35 + f * .55).toFixed(2)}%`;
      b.style.animationDelay = `-${(R() * 3).toFixed(2)}s`;
      b.style.animationDuration = `${(2.4 + R() * 2).toFixed(2)}s`;
      g.appendChild(b);
    }
  }
  {
    const box = $('sparkles');
    for (let i = 0; i < 18; i++) {
      const s = document.createElement('i'); s.className = 'spark';
      const size = 2 + Math.round(R() * 3);
      s.style.cssText = `left:${4 + R() * 92}%;top:${30 + R() * 66}%;--s:${size}px;animation-delay:-${(R() * 4).toFixed(2)}s;animation-duration:${(2.6 + R() * 2.4).toFixed(2)}s;`;
      box.appendChild(s);
    }
  }
  const CLOUD_SVG = `<svg viewBox="0 0 200 80" aria-hidden="true"><g fill="currentColor">
    <ellipse cx="60" cy="52" rx="48" ry="22"/><ellipse cx="108" cy="38" rx="44" ry="28"/>
    <ellipse cx="152" cy="54" rx="42" ry="20"/><ellipse cx="100" cy="58" rx="74" ry="20"/></g></svg>`;
  const cloudEls = [
    { top: 4,  s: .95, speed: 160, ph: .55 }, { top: 36, s: .7, speed: 200, ph: .33 }, { top: 14, s: 1.15, speed: 140, ph: .69 },
    { top: 46, s: .6, speed: 230, ph: .49 }, { top: 2, s: .8, speed: 250, ph: .25 },
  ].map(c => {
    const el = document.createElement('div'); el.className = 'cloud'; el.innerHTML = CLOUD_SVG;
    const phase = c.ph;
    el.style.cssText = `top:${c.top}%;width:${c.s * 15}cqw;animation-duration:${c.speed}s;animation-delay:-${(phase * c.speed).toFixed(1)}s;--rx:${(phase * 160 - 30).toFixed(0)}cqw;`;
    $('clouds').appendChild(el);
    return el;
  });

  function applySky() {
    const d = new Date();
    const h = PREVIEW != null ? PREVIEW : d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
    const k = skyAt(h, SR, SS);
    const set = (n, v) => root.style.setProperty(n, v);
    set('--sky-top', rgb(k.top)); set('--sky-mid', rgb(k.mid)); set('--sky-bot', rgb(k.bot));
    set('--sea-top', rgb(k.seaTop)); set('--sea-bot', rgb(k.seaBot));
    set('--sea-front', rgb(mixC(k.seaTop, k.seaBot, .22)));
    set('--wave-l', rgb(mixC(k.seaTop, [255, 255, 255], .35)));
    set('--wave-d', rgb(mixC(k.seaBot, [0, 6, 30], .35)));
    set('--cloud', rgb(k.cloud)); set('--cloud-a', k.cloudA.toFixed(3));
    set('--spark', rgb(k.spark)); set('--stars', k.stars.toFixed(3)); set('--aurora', k.aurora.toFixed(3));
    cloudEls.forEach(el => { el.style.opacity = (k.cloudA * .95).toFixed(3); });

    // sun and moon, placed like the Sky Banner (sun sinks a little faster than it climbs)
    const sun = $('sun'), moon = $('moon');
    const sink = e => (e >= 0 ? e : e * 2.2), EDGE = .05;
    const t = (h - SR) / (SS - SR);
    let sunGlit = 0, sunX = 50, moonGlit = 0, moonX = 50;
    const yOf = elev => 62 - 16 * sink(elev);   // % of the sky box (30% of the stage): horizon at 75% of it
    if (t > -0.07 && t < 1.07) {
      const elev = Math.sin(Math.PI * t), e = clamp(elev), low = Math.pow(1 - e, 1.6);
      const dd = 3.4 + 2.2 * Math.pow(1 - e, 1.5);
      const edge = clamp((t + .07) / EDGE) * clamp((1.07 - t) / EDGE);
      sunX = 20 + t * 60;
      sun.style.cssText = `left:${sunX}%;top:${yOf(elev)}%;--d:${dd.toFixed(2)}cqw;opacity:${edge.toFixed(3)};display:block;`;
      set('--sun-halo', rgb(mixC([255, 232, 168], [255, 132, 66], low)));
      set('--sun-disk', rgb(mixC([255, 252, 236], [255, 238, 208], low)));
      if (elev > -.15) sunGlit = clamp(.3 + .7 * (1 - e)) * clamp((elev + .15) / .2);
      set('--glit-c', rgb(mixC([255, 240, 205], [255, 190, 120], low)));
    } else sun.style.display = 'none';
    const moonSpan = 24 - (SS - SR) - .25;
    let dm = (((h - (SS + .25)) % 24) + 24) % 24; if (dm > 23.6) dm -= 24;
    const tm = dm / moonSpan;
    if (tm > -0.04 && tm < 1.06) {
      const elev = Math.sin(Math.PI * tm), e = clamp(elev);
      const edge = clamp((tm + .04) / .04) * clamp((1.06 - tm) / EDGE);
      const vis = clamp(k.stars * 1.8) * edge;
      moonX = 20 + tm * 60;
      moon.style.cssText = `left:${moonX}%;top:${yOf(elev)}%;--d:${(2.8 + .8 * (1 - e)).toFixed(2)}cqw;opacity:${vis.toFixed(3)};display:block;`;
      if (elev > -.1) moonGlit = .5 * vis * clamp((elev + .1) / .2);
    } else moon.style.display = 'none';
    const g = $('glitter');
    if (sunGlit >= moonGlit) { g.style.left = sunX + '%'; set('--glit', sunGlit.toFixed(3)); }
    else { g.style.left = moonX + '%'; set('--glit-c', '225 238 255'); set('--glit', moonGlit.toFixed(3)); }
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
     The ship (drawn in art.js) + the six spots
     ============================================================ */
  const art = window.ShipArt.build();
  const tips = KEYS.map(k => {
    const p = PAGES[k], [x, y] = art.tips[k], w = Math.round(p.name.length * 7.4 + 30);
    return `<g class="tip" data-key="${k}" style="--g:${p.g}"><rect x="${x - w / 2}" y="${y - 13}" width="${w}" height="26" rx="13"/>
      <circle cx="${x - w / 2 + 14}" cy="${y}" r="4" fill="rgb(${p.g})"/><text x="${x - w / 2 + 25}" y="${y + 4.6}">${p.name}</text></g>`;
  }).join('');
  const hitG = KEYS.map(k => `<g class="hit" data-key="${k}" tabindex="0" role="link" aria-label="Open ${PAGES[k].name}">${art.hits[k]}</g>`).join('');
  const zc = KEYS.map(k => { const [x, y, w, h] = art.zoom[k]; return `<rect class="zc" data-key="${k}" x="${x}" y="${y}" width="${w}" height="${h}" fill="none" pointer-events="none"/>`; }).join('');
  const stickers = KEYS.map(k => {
    const [x, y] = art.stk[k];
    return `<g class="stkg" data-key="${k}"><image class="stk" x="${x}" y="${y}" width="46" height="46" preserveAspectRatio="xMidYMax meet" style="display:none"/></g>`;
  }).join('');
  $('scene').innerHTML = `<defs>${art.defs}</defs>
    <g class="bob">
      <g class="foamg">${art.water}</g>
      <g class="dim">${art.ship}</g>
      <g class="lights lit">${art.lights}</g>
      <g class="stickers">${stickers}</g>
      <g class="tips">${tips}</g>
      <g class="hits">${hitG}</g>
      ${zc}
    </g>${art.front || ''}`;

  /* ============================================================
     Stickers
     ============================================================ */
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

  /* ============================================================
     Hover + the camera push-in
     ============================================================ */
  let busy = false;
  const hot = (key, on) => document.querySelectorAll(`[data-key="${key}"].spot, [data-key="${key}"].tip`).forEach(n => n.classList.toggle('hot', on));
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
      if (key) hot(key, false);
    }, 950);
  }
  function enter(key) {
    if (busy) return;
    const box = document.querySelector(`.zc[data-key="${key}"]`); if (!box) return;
    const url = linkOf(key), name = PAGES[key].name;
    hot(key, true);
    if (REDUCED || q.get('zoom') === '0') { busy = true; openUrl(url, name); setTimeout(() => { busy = false; }, 600); return; }
    busy = true;
    const sr = stage.getBoundingClientRect(), dr = box.getBoundingClientRect();
    const ox = dr.left + dr.width / 2 - sr.left, oy = dr.top + dr.height / 2 - sr.top;
    const S = Math.min(7, Math.max(2.6, (sr.height * .6) / Math.max(10, dr.height)));
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
  KEYS.forEach(k => {
    const h = document.querySelector(`.hit[data-key="${k}"]`);
    h.addEventListener('pointerenter', () => { if (!busy) hot(k, true); });
    h.addEventListener('pointerleave', () => { if (!busy) hot(k, false); });
    h.addEventListener('click', e => { e.preventDefault(); enter(k); });
    h.addEventListener('focus', () => hot(k, true));
    h.addEventListener('blur', () => { if (!busy) hot(k, false); });
    h.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); enter(k); } });
  });
  { const demo = q.get('hot'); if (demo && PAGES[demo]) hot(demo, true); }
  window.addEventListener('pageshow', () => { if (stage.classList.contains('zooming')) reset(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && stage.classList.contains('zooming')) reset(); });

  /* plain links for small screens */
  KEYS.forEach(k => {
    const a = document.createElement('a');
    a.href = linkOf(k); a.target = '_blank'; a.rel = 'noopener'; a.textContent = PAGES[k].name;
    a.style.setProperty('--g', PAGES[k].g);
    $('list').appendChild(a);
  });

  applySky();
  if (PREVIEW == null) { setInterval(applySky, 30000); fetchSun(); }
})();
