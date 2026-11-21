/* Today's Adventure: enhanced theme. Adds scenery on top of what script.js already builds; nothing here changes the original logic. */
(() => {
  'use strict';
  const q = new URLSearchParams(location.search), root = document.documentElement;
  const sky = document.getElementById('sky'), scene = document.querySelector('.scene');
  if (!sky || !scene) return;
  const mk = (tag, cls, html, parent) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; (parent || sky).appendChild(e); return e; };
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const num = (k, d) => { const v = parseFloat(q.get(k)); return Number.isFinite(v) ? v : d; };

  /* sun and moon crossing the sky, following the real hour (same location options as the original) */
  const sun = mk('div', 'x-orb x-sun', '<i class="halo"></i><i class="disk"></i>');
  const moon = mk('div', 'x-orb x-moon', '<i class="halo"></i><i class="disk"></i>');
  const LAT = num('lat', 26.2183), LON = num('lon', 78.1828);
  const estimate = () => {
    const d = new Date(), rad = Math.PI / 180, N = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 864e5);
    const decl = 23.44 * rad * Math.sin(2 * Math.PI * (284 + N) / 365), phi = LAT * rad;
    const H = Math.acos(clamp((Math.sin(-0.833 * rad) - Math.sin(phi) * Math.sin(decl)) / (Math.cos(phi) * Math.cos(decl)), -1, 1)) / rad / 15;
    const B = 2 * Math.PI * (N - 81) / 364, E = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
    const noon = 12 + (-d.getTimezoneOffset() / 4 - LON) / 15 - E / 60;
    return { sr: noon - H, ss: noon + H };
  };
  const place = () => {
    const { sr, ss } = estimate(), t0 = q.get('time'), m = t0 && /^(\d{1,2})(?::(\d{2}))?$/.exec(t0.trim());
    const now = new Date(), h = m ? +m[1] + (m[2] ? +m[2] / 60 : 0) : now.getHours() + now.getMinutes() / 60;
    const stars = parseFloat(getComputedStyle(root).getPropertyValue('--stars')) || 0;
    const HZ = 128, RISE = 52, sink = e => (e >= 0 ? e : e * 2.2);
    const t = (h - sr) / (ss - sr);
    if (t > -.06 && t < 1.06) {
      const e = Math.sin(Math.PI * t), low = Math.pow(1 - clamp(e), 1.6);
      sun.style.cssText = `display:block;left:${12 + t * 76}%;top:${HZ - RISE * sink(e)}px;--low:${low.toFixed(2)};opacity:${(clamp(1 - stars * 3) * clamp((t + .06) / .05) * clamp((1.06 - t) / .05)).toFixed(2)}`;
    } else sun.style.display = 'none';
    const span = 24 - (ss - sr) - .25; let dm = (((h - (ss + .25)) % 24) + 24) % 24; if (dm > 23.6) dm -= 24;
    const tm = dm / span;
    if (tm > -.04 && tm < 1.06) {
      const e = Math.sin(Math.PI * tm);
      moon.style.cssText = `display:block;left:${12 + tm * 76}%;top:${HZ - (RISE - 6) * sink(e)}px;opacity:${(clamp(stars * 1.8) * clamp((tm + .04) / .04) * clamp((1.06 - tm) / .05)).toFixed(2)}`;
    } else moon.style.display = 'none';
  };
  place(); setInterval(place, 20000);

  /* far islands, with a lighthouse that wakes at night */
  const LAND = 'M0 90C18 72 38 64 62 62C80 42 96 40 110 54C126 46 150 54 168 68C190 72 206 80 220 90Z';
  mk('div', 'x-isle a', `<svg viewBox="0 0 220 90" aria-hidden="true"><defs><linearGradient id="xb" x1="1" x2="0"><stop offset="0" stop-color="#FFF1C4" stop-opacity=".75"/><stop offset="1" stop-color="#FFF1C4" stop-opacity="0"/></linearGradient></defs>
    <path class="beam" d="M118 17L-70 8L-70 26Z" fill="url(#xb)"/><path class="land" d="${LAND}"/><path class="land" d="M108 54L112 22H122L126 54Z"/><path class="land" d="M110 22H124L117 12Z"/><circle class="lamp" cx="117" cy="17" r="3.2"/></svg>`);
  mk('div', 'x-isle b', '<svg viewBox="0 0 220 90" aria-hidden="true"><path class="land far" d="M0 90C30 66 56 60 84 66C104 50 130 52 150 70C176 66 200 76 220 90Z"/></svg>');

  /* shooting stars (visible only while the stars are) */
  const sh = mk('div', 'x-shooters');
  [[56, 8, 4, 19], [72, 16, 11, 25], [30, 12, 17, 31]].forEach(([l, t, d, u]) => { mk('i', 'x-shooter', '', sh).style.cssText = `left:${l}%;top:${t}%;animation-delay:${d}s;animation-duration:${u}s;`; });

  /* fireflies drifting over the lawn at night */
  const fl = mk('div', 'x-flies', '', scene);
  const spots = [[2, 230], [6, 262], [10, 214], [13, 276], [43, 262], [47, 224], [53, 280], [57, 244], [88, 268], [91, 220], [95, 250], [98, 282]];
  spots.forEach(([l, t], i) => { mk('i', 'x-fly', '', fl).style.cssText = `left:${l}%;top:${t}px;--dx:${(i % 2 ? 1 : -1) * (10 + (i * 7) % 16)}px;--dy:${-(8 + (i * 5) % 14)}px;animation-delay:-${(i * 1.3) % 6}s;animation-duration:${5 + (i % 4)}s;`; });
})();
