/* Enhanced theme layer (loaded only with ?theme=enhance). Adds water life, an island with a
   lighthouse, gulls, fireflies and a shooting star. It never edits the original scene. */
(() => {
  'use strict';
  const world = document.getElementById('world'), scene = document.getElementById('scene'), sea = document.getElementById('sea');
  if (!world || !scene || !sea) return;
  const NS = 'http://www.w3.org/2000/svg', r = (a, b) => a + Math.random() * (b - a);
  const mk = (html, cls) => { const d = document.createElement('div'); d.className = cls; d.innerHTML = html; return d; };

  /* water: reflection, ripple rings round the hull, wake behind the stern */
  const w = document.createElementNS(NS, 'svg');
  w.setAttribute('class', 'ewater'); w.setAttribute('viewBox', '0 0 1000 609'); w.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  w.setAttribute('aria-hidden', 'true');
  w.innerHTML = `<defs><radialGradient id="eRef"><stop offset="0" stop-color="#a8344b" stop-opacity=".55"/><stop offset="1" stop-color="#a8344b" stop-opacity="0"/></radialGradient>
    <filter id="eBl" x="-30%" y="-100%" width="160%" height="300%"><feGaussianBlur stdDeviation="5"/></filter></defs>
    <ellipse class="eref" cx="520" cy="566" rx="270" ry="15" fill="url(#eRef)" filter="url(#eBl)"/>
    ${[0, 2, 4].map(d => `<ellipse class="ering" cx="520" cy="552" rx="250" ry="13" style="animation-delay:-${d}s"/>`).join('')}
    <path class="ewake" d="M790 548 Q880 560 990 538" stroke-width="3" opacity=".5"/>
    <path class="ewake" d="M770 556 Q870 572 995 556" stroke-width="2.2" opacity=".38" style="animation-delay:-.8s"/>
    ${Array.from({ length: 9 }, (_, i) => `<circle class="efoam" cx="${240 + i * 62 + r(-10, 10)}" cy="${553 + r(-4, 4)}" r="${r(1.6, 3.2).toFixed(1)}" style="animation-delay:-${r(0, 3).toFixed(1)}s"/>`).join('')}`;
  world.insertBefore(w, scene);

  /* island + lighthouse on the horizon (colours follow the sea, so it tints with the sky) */
  const isle = mk(`<svg viewBox="0 0 160 90" aria-hidden="true"><defs><linearGradient id="eBeam" x1="0" x2="1"><stop offset="0" stop-color="#fff2b8" stop-opacity=".9"/><stop offset="1" stop-color="#fff2b8" stop-opacity="0"/></linearGradient></defs>
    <path class="ebeam" d="M92 26 L190 4 L190 48 Z"/>
    <path class="land" d="M0 90 Q10 62 42 54 Q74 44 104 56 Q138 62 160 90 Z"/>
    <ellipse class="rock" cx="30" cy="84" rx="14" ry="5"/>
    <g class="tower"><path d="M88 58 L92 28 L98 28 L102 58 Z" fill="#fff3da"/><path d="M89.4 46 L90.6 38 L99.4 38 L100.6 46 Z" fill="#d4505f"/>
      <rect x="90" y="23" width="10" height="5" rx="1" fill="#4a2a28"/><path d="M89 23 L95 16 L101 23 Z" fill="#d4505f"/></g>
    <circle class="lglow" cx="95" cy="25.5" r="9"/><circle class="lamp" cx="95" cy="25.5" r="2.4"/>
    <g fill="#2f6d4a" opacity=".8"><path d="M52 60 L58 44 L64 60 Z"/><path d="M62 62 L67 50 L72 62 Z"/><path d="M118 62 L123 50 L128 62 Z"/></g></svg>`, 'eisle');
  world.insertBefore(isle, w);

  /* gulls */
  const gulls = mk('', 'egulls');
  [[8, 60, 0], [13, 78, .35], [5, 95, .7]].forEach(([top, dur, ph]) => {
    const g = mk('<svg viewBox="0 0 20 10"><path d="M0 7 Q5 0 10 6 Q15 0 20 7"/></svg>', 'egull');
    g.style.cssText = `top:${top}%;animation-duration:${dur}s;animation-delay:-${(ph * dur).toFixed(1)}s`;
    g.firstChild.style.animationDelay = `-${r(0, .7).toFixed(2)}s`;
    gulls.appendChild(g);
  });
  world.appendChild(gulls);

  /* fireflies drifting over the deck at night */
  const flies = mk('', 'eflies');
  for (let i = 0; i < 18; i++) {
    const f = document.createElement('i'); f.className = 'efly'; const s = r(2.5, 4.5);
    f.style.cssText = `left:${r(22, 84)}%;top:${r(32, 80)}%;width:${s}px;height:${s}px;--dx:${r(-26, 26).toFixed(0)}px;--dy:${r(-34, 10).toFixed(0)}px;--t:${r(5, 10).toFixed(1)}s;--b:${r(2, 4.5).toFixed(1)}s;animation-delay:-${r(0, 6).toFixed(1)}s,-${r(0, 4).toFixed(1)}s`;
    flies.appendChild(f);
  }
  world.appendChild(flies);
  world.appendChild(mk('<i class="eshoot"></i>', 'eshootwrap'));
})();
