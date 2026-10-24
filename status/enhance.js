/* Current Status: enhanced theme. script.js calls window.__statusAfterDraw() after every draw; this adds a gauge,
   habit counts, a "today" band and a shimmer on the month line, and gives the banner some life. It only reads numbers script.js already worked out. */
(() => {
  'use strict';
  const q = new URLSearchParams(location.search);
  const $ = id => document.getElementById(id);
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let bannerDone = false;

  /* ---------- the banner: a lighthouse, gulls, shooting stars and the Merry sailing past ---------- */
  function banner() {
    if (bannerDone) return; const b = $('banner'), sky = b && b.querySelector('.b-sky'); if (!sky) return; bannerDone = true;
    const LAND = 'M0 90C18 72 38 64 62 62C80 42 96 40 110 54C126 46 150 54 168 68C190 72 206 80 220 90Z';
    sky.insertAdjacentHTML('beforeend', `<div class="x-isle a"><svg viewBox="0 0 220 90" aria-hidden="true"><defs><linearGradient id="xsBeam" x1="1" x2="0"><stop offset="0" stop-color="#FFF1C4" stop-opacity=".8"/><stop offset="1" stop-color="#FFF1C4" stop-opacity="0"/></linearGradient></defs>
      <path class="beam" d="M118 17L-80 7L-80 27Z" fill="url(#xsBeam)"/><path class="land" d="${LAND}"/><path class="land" d="M108 54L112 22H122L126 54Z"/><path class="land" d="M110 22H124L117 12Z"/><circle class="lamp" cx="117" cy="17" r="3.2"/></svg></div>
      <div class="x-isle b"><svg viewBox="0 0 220 90" aria-hidden="true"><path class="land far" d="M0 90C30 66 56 60 84 66C104 50 130 52 150 70C176 66 200 76 220 90Z"/></svg></div>
      <div class="x-gulls">${[[18, 0, 46, 1], [34, -17, 54, .75]].map(([t, d, u, s]) => `<div class="x-gull" style="top:${t}%;animation-delay:${d}s;animation-duration:${u}s;--sc:${s}"><svg viewBox="0 0 40 20"><path d="M2 14C9 2 16 4 20 12C24 4 31 2 38 14C31 8 25 9 20 16C15 9 9 8 2 14Z" fill="currentColor"/></svg></div>`).join('')}</div>
      <div class="x-shooters">${[[58, 10, 4, 19], [76, 22, 12, 27]].map(([l, t, d, u]) => `<i class="x-shooter" style="left:${l}%;top:${t}%;animation-delay:${d}s;animation-duration:${u}s"></i>`).join('')}</div>`);
    const ship = document.createElement('img'); ship.className = 'x-merry'; ship.alt = ''; ship.draggable = false;
    ship.src = q.get('merry') || '../sky/assets/merry.png'; ship.addEventListener('error', () => ship.remove(), { once: true });
    b.querySelector('.b-sea').after(ship);
  }

  /* ---------- per card ---------- */
  function gauge(inner, comp) {                                     // the "avg" plaque becomes a brass gauge
    const old = inner.querySelector('.count'); if (!old) return;
    const v = comp.avg == null ? null : Math.max(0, Math.min(100, comp.avg));
    const el = document.createElement('div'); el.className = 'x-gauge'; el.title = `Average ${comp.per.label}`;
    el.innerHTML = `<svg viewBox="0 0 44 44" aria-hidden="true"><circle class="gt" cx="22" cy="22" r="17"/>${v ? `<circle class="gv" cx="22" cy="22" r="17" pathLength="100" stroke-dasharray="${v} 100"/>` : ''}</svg><b>${v == null ? '–' : v}${v == null ? '' : '<small>%</small>'}</b><em>avg</em>`;
    old.replaceWith(el);
  }
  function habitCounts(inner, kind, comp) {                         // "5/7" at the end of each habit row
    if (kind !== 'mustdo' || !comp.habits || !comp.counted) return;
    inner.querySelectorAll('.hgrid .hrow').forEach((row, i) => {
      const n = document.createElement('div');
      if (i === 0) n.className = 'hn';
      else { const hb = comp.habits[i - 1]; if (!hb) return; const r = hb.n / comp.counted; n.className = 'hn' + (r >= .8 ? ' hi' : r <= .3 ? ' lo' : ''); n.textContent = `${hb.n}/${comp.counted}`; }
      row.appendChild(n);
    });
  }
  function todayBand(inner) {                                       // a soft column behind today in the habit grid
    const grid = inner.querySelector('.hgrid'), mark = grid && grid.querySelector('.hh .hd span.today'); if (!mark) return;
    requestAnimationFrame(() => {
      const g = grid.getBoundingClientRect(), m = mark.getBoundingClientRect(); if (!g.width) return;
      const pad = m.width * .12, band = document.createElement('i'); band.className = 'x-band';
      band.style.cssText = `left:${(((m.left - pad) - g.left) / g.width * 100).toFixed(2)}%;width:${((m.width + pad * 2) / g.width * 100).toFixed(2)}%`;
      grid.prepend(band);
    });
  }
  function shimmer(inner) {                                         // a bright glint travelling along the month line
    inner.querySelectorAll('.wave .line').forEach(l => { const s = l.cloneNode(); s.setAttribute('class', 'shine'); s.removeAttribute('stroke'); l.after(s); });
  }
  function caps(inner) {                                            // brass end-cap on bars, hidden when a bar is empty
    inner.querySelectorAll('.bf').forEach(f => { if (parseFloat(f.style.getPropertyValue('--p')) === 0) f.classList.add('zero'); });
  }

  window.__statusAfterDraw = ({ COMPS, SHOW }) => {
    banner();
    SHOW.forEach(kind => {
      const comp = COMPS[kind], inner = $('in-' + kind); if (!inner || !comp || comp.error) return;
      gauge(inner, comp); habitCounts(inner, kind, comp); todayBand(inner); shimmer(inner); caps(inner);
    });
  };
})();
