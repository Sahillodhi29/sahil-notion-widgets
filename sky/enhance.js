/* Sky banner: enhanced theme. Adds scenery on top of what script.js already builds. Nothing here changes the original logic. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id), banner = $('banner');
  if (!banner) return;
  const mk = (tag, cls, html, parent) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; (parent || banner).appendChild(e); return e; };

  /* shooting stars: only visible while the stars are (CSS reads --stars) */
  const sh = mk('div', 'x-shooters');
  [[58, 7, 3, 17], [74, 15, 9, 23], [32, 11, 15, 29]].forEach(([l, t, d, u]) => {
    const s = mk('i', 'x-shooter', '', sh); s.style.cssText = `left:${l}%;top:${t}%;animation-delay:${d}s;animation-duration:${u}s;`;
  });

  /* gulls: daytime only */
  const GULL = '<svg viewBox="0 0 40 20" aria-hidden="true"><path d="M2 14C9 2 16 4 20 12C24 4 31 2 38 14C31 8 25 9 20 16C15 9 9 8 2 14Z" fill="currentColor"/></svg>';
  const gl = mk('div', 'x-gulls');
  [[14, 0, 46, 1], [20, -17, 52, .72], [11, -31, 60, .85]].forEach(([top, delay, dur, sc]) => {
    const g = mk('div', 'x-gull', GULL, gl); g.style.cssText = `top:${top}%;animation-delay:${delay}s;animation-duration:${dur}s;--sc:${sc};`;
  });

  /* far islands on the horizon, with a lighthouse that wakes up at night */
  const LAND = 'M0 90C18 72 38 64 62 62C80 42 96 40 110 54C126 46 150 54 168 68C190 72 206 80 220 90Z';
  mk('div', 'x-isle a', `<svg viewBox="0 0 220 90" aria-hidden="true"><defs><linearGradient id="xb" x1="1" x2="0"><stop offset="0" stop-color="#FFF1C4" stop-opacity=".75"/><stop offset="1" stop-color="#FFF1C4" stop-opacity="0"/></linearGradient></defs>
    <path class="beam" d="M118 17L-70 8L-70 26Z" fill="url(#xb)"/><path class="land" d="${LAND}"/>
    <path class="land" d="M108 54L112 22H122L126 54Z"/><path class="land" d="M110 22H124L117 12Z"/><circle class="lamp" cx="117" cy="17" r="3.2"/></svg>`);
  mk('div', 'x-isle b', `<svg viewBox="0 0 220 90" aria-hidden="true"><path class="land far" d="M0 90C30 66 56 60 84 66C104 50 130 52 150 70C176 66 200 76 220 90Z"/></svg>`);

  /* the ship: a wake behind it, and its lamps */
  const wrap = $('shipWrap');
  if (wrap) { mk('div', 'x-wake', '<i></i><i></i>', wrap); mk('div', 'x-lamps', '<i></i><i></i><i></i>', wrap); }

  /* weather pill gets a condition tag so CSS can style it */
  const lab = $('wlabel'), pill = $('weather');
  if (lab && pill) {
    const tag = () => { const t = (lab.textContent || '').toLowerCase();
      pill.dataset.wx = /thunder/.test(t) ? 'storm' : /snow/.test(t) ? 'snow' : /rain|drizzle/.test(t) ? 'rain' : /fog/.test(t) ? 'fog' : /overcast/.test(t) ? 'cloud' : /partly/.test(t) ? 'partly' : 'clear'; };
    new MutationObserver(tag).observe(lab, { childList: true, characterData: true, subtree: true }); tag();
  }
})();
