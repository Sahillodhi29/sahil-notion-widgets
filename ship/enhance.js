/* Ship navigation: enhanced theme. Adds life around the ship; nothing here changes the original scene or its links. */
(() => {
  'use strict';
  const world = document.getElementById('world'), sea = document.getElementById('sea'), sky = world && world.querySelector('.sky');
  const bob = document.querySelector('.bob');
  if (!world || !sea || !sky || !bob) return;
  const html = (parent, str, where) => parent.insertAdjacentHTML(where || 'beforeend', str);

  /* far islands on the horizon (tucked behind the sea, so they sit on the line), with a lighthouse that wakes at night */
  const LAND = 'M0 90C18 72 38 64 62 62C80 42 96 40 110 54C126 46 150 54 168 68C190 72 206 80 220 90Z';
  html(sea, `<div class="x-isle a"><svg viewBox="0 0 220 90" aria-hidden="true"><defs><linearGradient id="xBeam" x1="1" x2="0"><stop offset="0" stop-color="#FFF1C4" stop-opacity=".8"/><stop offset="1" stop-color="#FFF1C4" stop-opacity="0"/></linearGradient></defs>
    <path class="beam" d="M118 17L-80 7L-80 27Z" fill="url(#xBeam)"/><path class="land" d="${LAND}"/><path class="land" d="M108 54L112 22H122L126 54Z"/><path class="land" d="M110 22H124L117 12Z"/><circle class="lamp" cx="117" cy="17" r="3.2"/></svg></div>
    <div class="x-isle b"><svg viewBox="0 0 220 90" aria-hidden="true"><path class="land far" d="M0 90C30 66 56 60 84 66C104 50 130 52 150 70C176 66 200 76 220 90Z"/></svg></div>
    <div class="x-boat"><svg viewBox="0 0 60 50" aria-hidden="true"><path class="sail" d="M28 4L28 34L8 34Z"/><path class="sail s2" d="M32 10L32 34L50 34Z"/><path class="hull" d="M4 36H56L50 44H10Z"/><circle class="blamp" cx="30" cy="40" r="2.2"/></svg></div>`, 'beforebegin');

  /* gulls and shooting stars live in the sky */
  const GULL = '<svg viewBox="0 0 40 20" aria-hidden="true"><path d="M2 14C9 2 16 4 20 12C24 4 31 2 38 14C31 8 25 9 20 16C15 9 9 8 2 14Z" fill="currentColor"/></svg>';
  html(sky, '<div class="x-gulls">' + [[16, 0, 52, 1], [34, -19, 60, .72], [24, -33, 68, .86]].map(([t, d, u, s]) =>
    `<div class="x-gull" style="top:${t}%;animation-delay:${d}s;animation-duration:${u}s;--sc:${s}">${GULL}</div>`).join('') + '</div>');
  html(sky, '<div class="x-shooters">' + [[56, 8, 4, 19], [74, 18, 11, 25], [30, 12, 17, 31]].map(([l, t, d, u]) =>
    `<i class="x-shooter" style="left:${l}%;top:${t}%;animation-delay:${d}s;animation-duration:${u}s"></i>`).join('') + '</div>');

  /* the ship: a foamy wake behind the stern, spray at the bow, a soft bloom round the lit windows, and glints on the six spots */
  const foamg = bob.querySelector('.foamg'), lit = bob.querySelector('.lit'), stickers = bob.querySelector('.stickers');
  if (foamg) html(foamg, `<g class="x-wake" aria-hidden="true"><ellipse cx="790" cy="440" rx="62" ry="8"/><ellipse cx="790" cy="440" rx="62" ry="8" style="animation-delay:-1.8s"/><ellipse cx="760" cy="428" rx="44" ry="6" style="animation-delay:-.9s"/></g>`, 'afterend');
  if (lit) {
    const spray = [[-26, -30, 0], [-12, -38, .5], [6, -34, 1.1], [-34, -16, 1.6], [14, -24, 2.1], [-4, -42, 2.6], [-20, -26, 3]];
    html(lit, `<g class="x-spray" aria-hidden="true">${spray.map(([dx, dy, d]) => `<circle cx="282" cy="552" r="${(1.6 + (Math.abs(dx) % 3) * .5).toFixed(1)}" style="--dx:${dx}px;--dy:${dy}px;animation-delay:-${d}s"/>`).join('')}</g>`, 'afterend');
    const bloom = lit.cloneNode(true); bloom.setAttribute('class', 'x-bloom'); bloom.setAttribute('aria-hidden', 'true'); lit.after(bloom);
  }
  if (stickers) {
    const ST = { workout: [474, 108], wardrobe: [826, 150], finance: [700, 206], learning: [572, 300], meal: [524, 280], bank: [800, 322] };
    const star = 'M0-8C1.2-2 2-1.2 8 0C2 1.2 1.2 2 0 8C-1.2 2-2 1.2-8 0C-2-1.2-1.2-2 0-8Z';
    html(stickers, '<g class="x-glints" aria-hidden="true">' + Object.values(ST).map(([x, y], i) =>
      `<path d="${star}" transform="translate(${x + 30} ${y - 34})" style="animation-delay:-${(i * 1.5).toFixed(1)}s"/>`).join('') + '</g>', 'afterend');
  }
})();
