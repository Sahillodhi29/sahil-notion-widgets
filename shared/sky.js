/* Harbour sky engine.  NWSky.mount(el, {ship, shipX, shipH, lat, lon}) fills `el` (position:relative) with a sea and sky that follow
   the real time of day (same palette and sunrise/sunset maths as the Home widget).  URL: ?time=18:30 freezes the clock, ?demo=60 plays a day in 60s.
   Returns {hour(), onTick(fn)} so a page can react to the time of day (night / day).  Uses only the clock: no network. */
(() => {
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v)), lerp = (a, b, t) => a + (b - a) * t, smooth = t => t * t * (3 - 2 * t);
  const mixC = (a, b, t) => a.map((v, i) => lerp(v, b[i], t)), rgb = c => c.map(v => Math.round(clamp(v, 0, 255))).join(' ');
  const pal = (top, mid, bot, seaTop, seaBot, cloud, cloudA, stars, shipB, shipS, spark) => ({ top, mid, bot, seaTop, seaBot, cloud, cloudA, stars, shipB, shipS, spark });
  const P = {
    night:   pal([9, 24, 64], [14, 52, 112], [28, 92, 158], [20, 72, 150], [8, 30, 92], [70, 110, 165], .5, 1, .78, .9, [210, 240, 255]),
    dawn:    pal([70, 76, 140], [196, 134, 166], [252, 190, 150], [128, 150, 196], [52, 80, 142], [255, 205, 195], .8, .22, .9, 1, [255, 235, 220]),
    morning: pal([112, 168, 214], [176, 212, 226], [250, 226, 192], [92, 170, 204], [40, 110, 162], [255, 244, 236], .85, 0, 1, 1, [255, 255, 255]),
    day:     pal([66, 148, 224], [122, 190, 236], [196, 228, 242], [62, 152, 208], [28, 96, 162], [255, 255, 255], .9, 0, 1, 1, [255, 255, 255]),
    golden:  pal([96, 150, 204], [248, 208, 142], [255, 172, 112], [104, 170, 192], [40, 108, 150], [255, 218, 176], .85, 0, .95, 1.05, [255, 240, 210]),
    sunset:  pal([112, 160, 172], [250, 192, 110], [238, 102, 62], [66, 172, 172], [20, 120, 132], [206, 92, 92], .75, 0, .8, 1.1, [255, 236, 190]),
    dusk:    pal([42, 52, 112], [122, 72, 132], [232, 112, 102], [62, 72, 142], [22, 42, 102], [156, 92, 134], .65, .5, .78, 1, [255, 225, 215]),
  };
  const blend = (a, b, t) => { const o = {}; for (const k in a) o[k] = Array.isArray(a[k]) ? mixC(a[k], b[k], t) : lerp(a[k], b[k], t); return o; };
  const skyAt = (h, sr, ss) => {
    const ks = [[0, P.night], [sr - 1.5, P.night], [sr - .35, P.dawn], [sr + 1.6, P.morning], [sr + 4.2, P.day], [ss - 3, P.day], [ss - 1.2, P.golden], [ss - .05, P.sunset], [ss + .9, P.dusk], [ss + 2.1, P.night], [24, P.night]];
    for (let i = 0; i < ks.length - 1; i++) { const [h0, a] = ks[i], [h1, b] = ks[i + 1]; if (h >= h0 && h <= h1) return blend(a, b, h1 === h0 ? 0 : smooth((h - h0) / (h1 - h0))); }
    return P.night;
  };
  function sunTimes(d, lat, lon) {
    const rad = Math.PI / 180, N = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 864e5), decl = 23.44 * rad * Math.sin(2 * Math.PI * (284 + N) / 365), phi = lat * rad;
    const H = Math.acos(clamp((Math.sin(-.833 * rad) - Math.sin(phi) * Math.sin(decl)) / (Math.cos(phi) * Math.cos(decl)), -1, 1)) / rad / 15;
    const B = 2 * Math.PI * (N - 81) / 364, E = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
    const noon = 12 + (-d.getTimezoneOffset() / 4 - lon) / 15 - E / 60; return { sr: noon - H, ss: noon + H };
  }
  const NS = 'http://www.w3.org/2000/svg';
  const waveSvg = (half, amp) => {
    const W = 2400, H = 60, m = 30; let d = `M0 ${m}`;
    for (let x = 0, i = 0; x < W; x += half, i++) d += i === 0 ? ` Q ${half / 2} ${m - amp} ${half} ${m}` : ` T ${x + half} ${m}`;
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><path d="${d} L ${W} ${H} L 0 ${H} Z"/></svg>`;
  };
  const CLOUD = '<svg viewBox="0 0 200 80"><g fill="currentColor"><ellipse cx="60" cy="52" rx="48" ry="22"/><ellipse cx="108" cy="38" rx="44" ry="28"/><ellipse cx="150" cy="54" rx="42" ry="20"/></g></svg>';

  function mount(host, o = {}) {
    o = Object.assign({ ship: '/shared/art/merry.png', shipX: 70, shipH: 42, lat: 26.2183, lon: 78.1828, clouds: 3 }, o);
    const q = new URLSearchParams(location.search), root = document.createElement('div'); root.className = 'nwsky';
    root.style.setProperty('--ship-x', o.shipX + '%'); root.style.setProperty('--ship-h', o.shipH + 'cqh');
    let seed = 7; const R = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    let h = '<div class="sky"></div><div class="stars"></div><div class="orb sun"><div class="halo"></div><div class="disk"></div></div><div class="orb moon"><div class="halo"></div><div class="disk"></div></div><div class="clouds"></div>';
    h += `<div class="sea"><div class="glitter"></div><div class="wave l" style="top:8%;height:30%;animation-duration:24s">${waveSvg(150, 12)}</div><div class="wave d" style="top:42%;height:34%;animation-duration:17s;animation-direction:reverse">${waveSvg(100, 14)}</div></div>`;
    h += `<div class="ship"><img src="${o.ship}" alt=""></div><div class="front">${waveSvg(120, 14)}</div>`;
    root.innerHTML = h; host.prepend(root);
    const $ = s => root.querySelector(s);
    const st = $('.stars'); for (let i = 0; i < 60; i++) { const s = document.createElement('i'); s.className = 'star'; const z = 1 + R() * 1.4; s.style.cssText = `left:${R() * 100}%;top:${R() * 100}%;width:${z}px;height:${z}px;animation-delay:-${(R() * 4).toFixed(2)}s;animation-duration:${(2.4 + R() * 3).toFixed(2)}s`; st.appendChild(s); }
    const gl = $('.glitter'); for (let i = 0; i < 8; i++) { const b = document.createElement('i'), f = i / 7; b.className = 'gbar'; b.style.cssText = `top:${8 + f * 84}%;width:${26 + f * 70}%;animation-delay:-${(R() * 3).toFixed(2)}s`; gl.appendChild(b); }
    for (let i = 0; i < 10; i++) { const s = document.createElement('i'); s.className = 'spark'; s.style.cssText = `left:${4 + R() * 92}%;top:${74 + R() * 22}%;--s:${2 + Math.round(R() * 3)}px;animation-delay:-${(R() * 4).toFixed(2)}s`; root.appendChild(s); }
    const cl = $('.clouds'); for (let i = 0; i < o.clouds; i++) { const c = document.createElement('div'); c.className = 'cloud'; c.innerHTML = CLOUD; c.style.cssText = `top:${6 + R() * 30}%;width:${16 + R() * 14}cqw;animation-duration:${70 + R() * 60}s;animation-delay:-${(R() * 100).toFixed(1)}s`; cl.appendChild(c); }

    const t0 = performance.now(), demo = q.has('demo') ? Math.max(8, parseFloat(q.get('demo')) || 60) : 0, fixed = /^(\d{1,2}):(\d{2})$/.exec(q.get('time') || '');
    const { sr: SR, ss: SS } = (() => { const s = sunTimes(new Date(), o.lat, o.lon); return Number.isFinite(s.sr) && Number.isFinite(s.ss) ? s : { sr: 6.3, ss: 18.1 }; })();
    const hour = () => { if (demo) return ((performance.now() - t0) / 1000 / demo * 24 + 5) % 24; if (fixed) return +fixed[1] + +fixed[2] / 60; const d = new Date(); return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600; };
    const subs = [], set = (k, v) => root.style.setProperty(k, v);
    function paint(hr) {
      const k = skyAt(hr, SR, SS);
      set('--sky-top', rgb(k.top)); set('--sky-mid', rgb(k.mid)); set('--sky-bot', rgb(k.bot)); set('--sea-top', rgb(k.seaTop)); set('--sea-bot', rgb(k.seaBot));
      set('--cloud', rgb(k.cloud)); set('--cloud-a', k.cloudA.toFixed(2)); set('--stars', k.stars.toFixed(3)); set('--ship-b', k.shipB.toFixed(2)); set('--ship-s', k.shipS.toFixed(2)); set('--spark', rgb(k.spark));
      const sun = $('.sun'), moon = $('.moon'), t = (hr - SR) / (SS - SR), sink = e => e >= 0 ? e : e * 2.2; let sg = 0, sx = 50, mg = 0, mx = 50;
      if (t > -.07 && t < 1.07) {
        const el = Math.sin(Math.PI * t), e = clamp(el), low = Math.pow(1 - e, 1.6), edge = clamp((t + .07) / .05) * clamp((1.07 - t) / .05); sx = 20 + t * 60;
        sun.style.cssText = `left:${sx}%;top:${66 - 44 * sink(el)}%;--d:${(15 + 9 * Math.pow(1 - e, 1.5)).toFixed(1)}cqh;opacity:${edge.toFixed(3)};display:block`;
        set('--sun-halo', rgb(mixC([255, 232, 168], [255, 132, 66], low))); set('--sun-disk', rgb(mixC([255, 252, 236], [255, 238, 208], low)));
        if (el > -.15) sg = clamp(.3 + .7 * (1 - e)) * clamp((el + .15) / .2); set('--glit-c', rgb(mixC([255, 240, 205], [255, 190, 120], low)));
      } else sun.style.display = 'none';
      const span = 24 - (SS - SR) - .25; let dm = (((hr - (SS + .25)) % 24) + 24) % 24; if (dm > 23.6) dm -= 24; const tm = dm / span;
      if (tm > -.04 && tm < 1.06) {
        const el = Math.sin(Math.PI * tm), e = clamp(el), vis = clamp(k.stars * 1.8) * clamp((tm + .04) / .04) * clamp((1.06 - tm) / .05); mx = 20 + tm * 60;
        moon.style.cssText = `left:${mx}%;top:${66 - 40 * sink(el)}%;--d:${(10.5 + 3 * (1 - e)).toFixed(1)}cqh;opacity:${vis.toFixed(3)};display:block`; if (el > -.1) mg = .5 * vis * clamp((el + .1) / .2);
      } else moon.style.display = 'none';
      const g = $('.glitter'); if (sg >= mg) { g.style.left = sx + '%'; set('--glit', sg.toFixed(3)); } else { g.style.left = mx + '%'; set('--glit-c', '225 238 255'); set('--glit', mg.toFixed(3)); }
      const night = hr < SR - .4 || hr > SS + 1; subs.forEach(f => f(hr, night, k));
    }
    let last = ''; const tick = () => { const hr = hour(), key = demo ? Math.round(hr * 120) : Math.round(hr * 60); if (key !== last) { last = key; paint(hr); } };
    tick(); setInterval(tick, demo ? 100 : 5000);
    return { root, hour, onTick: f => { subs.push(f); f(hour(), hour() < SR - .4 || hour() > SS + 1); }, sun: { SR, SS } };
  }
  window.NWSky = { mount, skyAt };
})();
