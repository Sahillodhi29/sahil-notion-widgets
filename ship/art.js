/* ============================================================
   The ship, drawn as one SVG on a 1000 x 609 canvas.
   Every part is built from small helpers so the shapes, lights and
   shading stay consistent. Light comes from the upper left.
   ============================================================ */
window.ShipArt = (() => {
  'use strict';

  /* ---------- tiny geometry kit ---------- */
  const f = n => +n.toFixed(1);
  const lerp = (a, b, t) => a + (b - a) * t;
  const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
  const pts = a => a.map(p => f(p[0]) + ',' + f(p[1])).join(' ');
  const seeded = seed => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const sparkle = (cx, cy, r) => `M${cx},${f(cy - r)}Q${f(cx + r * .16)},${f(cy - r * .16)} ${f(cx + r)},${cy}Q${f(cx + r * .16)},${f(cy + r * .16)} ${cx},${f(cy + r)}Q${f(cx - r * .16)},${f(cy + r * .16)} ${f(cx - r)},${cy}Q${f(cx - r * .16)},${f(cy - r * .16)} ${cx},${f(cy - r)}Z`;
  const arch = (x, y, w, h) => { const r = w / 2; return `M${f(x)},${f(y + h)}V${f(y + r)}A${f(r)},${f(r)} 0 0 1 ${f(x + w)},${f(y + r)}V${f(y + h)}Z`; };
  /* smooth path through points (Catmull-Rom converted to cubic beziers) */
  function smooth(p, closed = false) {
    const n = p.length; let d = `M${f(p[0][0])},${f(p[0][1])}`;
    const g = i => p[closed ? (i + n) % n : Math.max(0, Math.min(n - 1, i))];
    for (let i = 0; i < (closed ? n : n - 1); i++) {
      const p0 = g(i - 1), p1 = g(i), p2 = g(i + 1), p3 = g(i + 2);
      d += `C${f(p1[0] + (p2[0] - p0[0]) / 6)},${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)},${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])},${f(p2[1])}`;
    }
    return d + (closed ? 'Z' : '');
  }
  const offset = (a, dx, dy) => a.map(p => [p[0] + dx, p[1] + dy]);
  const lineTo = a => a.map(p => `L${f(p[0])},${f(p[1])}`).join('');
  /* dense Catmull-Rom samples of a polyline (idx = fractional input index of every sample) */
  function dense(P, k = 8) {
    const n = P.length, g = i => P[Math.max(0, Math.min(n - 1, i))], out = [], idx = [];
    for (let i = 0; i < n - 1; i++) {
      const p0 = g(i - 1), p1 = g(i), p2 = g(i + 1), p3 = g(i + 2);
      for (let j = 0; j < k; j++) {
        const t = j / k, t2 = t * t, t3 = t2 * t;
        out.push([0, 1].map(a => .5 * (2 * p1[a] + (-p0[a] + p2[a]) * t + (2 * p0[a] - 5 * p1[a] + 4 * p2[a] - p3[a]) * t2 + (-p0[a] + 3 * p1[a] - 3 * p2[a] + p3[a]) * t3)));
        idx.push(i + t);
      }
    }
    out.push(P[n - 1]); idx.push(n - 1);
    return { pts: out, idx };
  }
  /* a smooth band of varying width along a centreline: returns the outline plus inset top/bottom edge lines */
  function ribbon(P, W) {
    const { pts: D, idx } = dense(P, 8), T = [], B = [], Ti = [], Bi = [];
    D.forEach((p, i) => {
      const a = D[Math.max(0, i - 1)], b = D[Math.min(D.length - 1, i + 1)];
      let dx = b[0] - a[0], dy = b[1] - a[1]; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
      const k = idx[i], i0 = Math.min(Math.floor(k), W.length - 2), w = lerp(W[i0], W[i0 + 1], k - i0) / 2, nx = -dy, ny = dx;
      T.push([p[0] - nx * w, p[1] - ny * w]); B.push([p[0] + nx * w, p[1] + ny * w]);
      Ti.push([p[0] - nx * (w - 1.9), p[1] - ny * (w - 1.9)]); Bi.push([p[0] + nx * (w - 1.9), p[1] + ny * (w - 1.9)]);
    });
    const line = A => 'M' + A.map(q => f(q[0]) + ',' + f(q[1])).join('L');
    return { d: line(T) + 'L' + B.slice().reverse().map(q => f(q[0]) + ',' + f(q[1])).join('L') + 'Z', top: line(Ti), bot: line(Bi) };
  }

  /* ---------- palette ---------- */
  const C = {
    cream: '#fff3da', creamD: '#ecd9b4', creamDD: '#d4bd93',
    red: '#d4505f', redD: '#a8344b', redDD: '#7e2439',
    wood: '#c99a5d', woodD: '#8f6538', woodDD: '#5c3c20', woodL: '#e8c48c',
    glass: '#a8dcf0', ink: '#4a2a28',
  };
  const O = `stroke="${C.ink}" stroke-opacity=".5" stroke-width="1" stroke-linejoin="round" stroke-linecap="round"`;
  const OT = `stroke="${C.ink}" stroke-opacity=".36" stroke-width=".8" stroke-linejoin="round" stroke-linecap="round"`;
  const LIGHTS = [];
  const lamp = s => { LIGHTS.push(s); return ''; };

  const DEFS = `
    <linearGradient id="gRed" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e86272"/><stop offset=".55" stop-color="#cf4b5d"/><stop offset="1" stop-color="#a8344b"/></linearGradient>
    <linearGradient id="gRedD" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c04258"/><stop offset="1" stop-color="#8d2a41"/></linearGradient>
    <linearGradient id="gRedH" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#e45a6b"/><stop offset="1" stop-color="#b13a50"/></linearGradient>
    <linearGradient id="gCream" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffaf0"/><stop offset="1" stop-color="#efdcb8"/></linearGradient>
    <linearGradient id="gCreamH" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fffaf0"/><stop offset="1" stop-color="#e6d1a9"/></linearGradient>
    <linearGradient id="gHull" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d4a56a"/><stop offset=".5" stop-color="#aa753e"/><stop offset="1" stop-color="#6b4424"/></linearGradient>
    <linearGradient id="gDeck" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f1cf98"/><stop offset="1" stop-color="#cfa063"/></linearGradient>
    <linearGradient id="gLawn" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8fd574"/><stop offset=".6" stop-color="#6cbb59"/><stop offset="1" stop-color="#52a54b"/></linearGradient>
    <linearGradient id="gThatch" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f8e08e"/><stop offset="1" stop-color="#d9b055"/></linearGradient>
    <linearGradient id="gMast" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#835329"/><stop offset=".38" stop-color="#c8955a"/><stop offset=".62" stop-color="#dcae74"/><stop offset="1" stop-color="#7e4f27"/></linearGradient>
    <linearGradient id="gSail" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".6" stop-color="#fcf3df"/><stop offset="1" stop-color="#eadbbb"/></linearGradient>
    <linearGradient id="gYard" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d8a870"/><stop offset=".5" stop-color="#a8713a"/><stop offset="1" stop-color="#6e4624"/></linearGradient>
    <linearGradient id="gTyre" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4b556c"/><stop offset="1" stop-color="#1f2536"/></linearGradient>
    <linearGradient id="gDoor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9a766"/><stop offset="1" stop-color="#a8703a"/></linearGradient>
    <linearGradient id="gInside" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3c6"/><stop offset="1" stop-color="#ffc864"/></linearGradient>
    <linearGradient id="gGlass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c8ecf8"/><stop offset="1" stop-color="#7cbfdf"/></linearGradient>
    <linearGradient id="gPed" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#dadbe8"/><stop offset="1" stop-color="#aeb0c6"/></linearGradient>
    <linearGradient id="gDomeShade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity=".32"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#4a0f25" stop-opacity=".3"/></linearGradient>
    <radialGradient id="gFace" cx=".38" cy=".32" r=".85"><stop offset="0" stop-color="#fff9c2"/><stop offset=".6" stop-color="#fbe06c"/><stop offset="1" stop-color="#f0be46"/></radialGradient>
    <radialGradient id="gGlowW"><stop offset="0" stop-color="#ffe29a" stop-opacity=".85"/><stop offset="1" stop-color="#ffd070" stop-opacity="0"/></radialGradient>
    <linearGradient id="gWall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4ecd0"/><stop offset="1" stop-color="#d6cba6"/></linearGradient>
    <linearGradient id="gBarrel" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#a8733c"/><stop offset=".4" stop-color="#dcae72"/><stop offset="1" stop-color="#8f5f30"/></linearGradient>
    <linearGradient id="gPlate" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#f7e6ae"/><stop offset=".55" stop-color="#dcc283"/><stop offset="1" stop-color="#b99a5c"/></linearGradient>
    <radialGradient id="gGlowS"><stop offset="0" stop-color="#ffe08a" stop-opacity=".55"/><stop offset="1" stop-color="#ffd070" stop-opacity="0"/></radialGradient>
    <filter id="fBlur" x="-20%" y="-60%" width="140%" height="220%"><feGaussianBlur stdDeviation="6"/></filter>`;

  /* ============================================================
     Reusable parts
     ============================================================ */
  /* balustrade along a polyline: posts every step, top and base rails */
  function railLine(path, h, step = 8, o = {}) {
    const w = o.w || 1.8;
    // resample the polyline at equal spacing
    const segs = []; let total = 0;
    for (let i = 0; i < path.length - 1; i++) { const L = Math.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]); segs.push(L); total += L; }
    const n = Math.max(1, Math.round(total / step)), P = [];
    for (let k = 0; k <= n; k++) {
      let d = total * k / n, i = 0;
      while (i < segs.length - 1 && d > segs[i]) { d -= segs[i]; i++; }
      P.push(mix(path[i], path[i + 1], segs[i] ? d / segs[i] : 0));
    }
    const posts = P.map(p => `M${f(p[0])},${f(p[1])}V${f(p[1] - h)}`).join('');
    const shade = P.map(p => `M${f(p[0] + 1.2)},${f(p[1])}V${f(p[1] - h)}`).join('');
    const topD = o.curve ? smooth(P.map(p => [p[0], p[1] - h])) : 'M' + P.map(p => f(p[0]) + ',' + f(p[1] - h)).join('L');
    const baseD = o.curve ? smooth(P) : 'M' + P.map(p => f(p[0]) + ',' + f(p[1])).join('L');
    return `<path d="${shade}" stroke="rgb(90 60 40 / .26)" stroke-width="${w}" fill="none" stroke-linecap="round"/>
      <path d="${posts}" stroke="#fffaf0" stroke-width="${w}" fill="none" stroke-linecap="round"/>
      <path d="${baseD}" stroke="${C.creamDD}" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="${topD}" stroke="rgb(90 60 40 / .3)" stroke-width="4.2" fill="none" stroke-linecap="round" stroke-linejoin="round" transform="translate(0 1)"/>
      <path d="${topD}" stroke="#fffdf6" stroke-width="3.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  const rail = (a, b, h, step = 8, o = {}) => railLine([a, b], h, step, o);

  /* round cream porthole with a steel ring */
  function porthole(x, y, r = 8) {
    lamp(`<circle cx="${x}" cy="${y}" r="${f(r * .56)}" fill="#ffd978"/>`);
    return `<circle cx="${x}" cy="${f(y + 1)}" r="${f(r + 1.2)}" fill="rgb(60 20 20 / .32)"/>
      <circle cx="${x}" cy="${y}" r="${r}" fill="url(#gCream)" ${OT}/>
      <circle cx="${x}" cy="${y}" r="${f(r * .68)}" fill="#8796ad"/>
      <circle cx="${x}" cy="${y}" r="${f(r * .5)}" fill="url(#gGlass)"/>
      <circle cx="${f(x - r * .16)}" cy="${f(y - r * .2)}" r="${f(r * .14)}" fill="#fff" opacity=".9"/>`;
  }
  /* scroll at the end of a bulwark: a round cream boss with a real spiral */
  function volute(x, y, r) {
    const sp = [];
    for (let i = 0; i <= 26; i++) { const t = i / 26, ang = -2.4 + t * Math.PI * 4.2, rr = r * (.14 + .66 * t); sp.push([x + rr * Math.cos(ang) * 1.0, y + rr * Math.sin(ang)]); }
    return `<circle cx="${x}" cy="${f(y + 1.6)}" r="${r}" fill="rgb(60 20 20 / .26)"/>
      <circle cx="${x}" cy="${y}" r="${r}" fill="url(#gCream)" ${O}/>
      <circle cx="${f(x - r * .25)}" cy="${f(y - r * .3)}" r="${f(r * .5)}" fill="#fff" opacity=".35"/>
      <path d="${smooth(sp)}" fill="none" stroke="#b3a487" stroke-width="${f(Math.max(1.3, r * .12))}" stroke-linecap="round"/>`;
  }
  /* arched window with a cream frame (glows at night) */
  function win(x, y, w, h, o = {}) {
    lamp(`<path d="${arch(x, y, w, h)}" fill="#ffd978"/>`);
    return `<path d="${arch(x - 1.6, y - 1.6, w + 3.2, h + 1.6)}" fill="${o.frame || C.cream}" ${OT}/>
      <path d="${arch(x, y, w, h)}" fill="url(#gGlass)"/>
      ${o.bars === false ? '' : `<path d="M${f(x + w / 2)},${y}V${y + h}M${x},${f(y + h * .55)}H${x + w}" stroke="${C.cream}" stroke-width=".9" opacity=".85"/>`}`;
  }
  /* wooden arched door: the leaf swings open on hover, warm light shows behind it */
  function door(x, y, w, h, o = {}) {
    const r = w / 2, bx = x + r;
    return `<g class="dr">
      <path d="${arch(x - 2.2, y - 2.2, w + 4.4, h + 2.2)}" fill="${o.frame || C.cream}" ${OT}/>
      <path class="inside" d="${arch(x, y, w, h)}" fill="url(#gInside)"/>
      <g class="leaf"><path d="${arch(x, y, w, h)}" fill="url(#gDoor)" stroke="${C.woodDD}" stroke-opacity=".55" stroke-width=".9"/>
        <path d="M${f(bx)},${f(y + 2)}V${y + h}" stroke="${C.woodDD}" stroke-opacity=".35" stroke-width=".9"/>
        ${o.port === false ? '' : `<circle cx="${f(bx)}" cy="${f(y + r + 1)}" r="${f(Math.max(2, w * .17))}" fill="url(#gGlass)" stroke="${C.cream}" stroke-width="1.1"/>`}
        <circle cx="${f(x + w - 3)}" cy="${f(y + h * .62)}" r="1.3" fill="#f3dc9a"/></g></g>`;
  }
  /* a wooden mast: from (x0,y0) top to (x1,y1) base */
  function mast(top, base, w) {
    const dx = base[0] - top[0], dy = base[1] - top[1], L = Math.hypot(dx, dy), nx = -dy / L, ny = dx / L;
    const w0 = w * .78, w1 = w;
    const a = [top[0] + nx * w0 / 2, top[1] + ny * w0 / 2], b = [top[0] - nx * w0 / 2, top[1] - ny * w0 / 2];
    const c = [base[0] - nx * w1 / 2, base[1] - ny * w1 / 2], d = [base[0] + nx * w1 / 2, base[1] + ny * w1 / 2];
    return `<polygon points="${pts([a, b, c, d])}" fill="url(#gMast)" ${O}/>
      <path d="M${f(top[0] - nx * w0 * .18)},${f(top[1] - ny * w0 * .18)}L${f(base[0] - nx * w1 * .18)},${f(base[1] - ny * w1 * .18)}" stroke="rgb(255 255 255 / .3)" stroke-width="${f(w * .12)}" stroke-linecap="round"/>`;
  }
  /* dark rope wrap on a mast at fraction t */
  function wrap(top, base, t, w) {
    const p = mix(top, base, t), dx = base[0] - top[0], dy = base[1] - top[1], L = Math.hypot(dx, dy), nx = -dy / L, ny = dx / L;
    const a = [p[0] + nx * (w / 2 + 1.5), p[1] + ny * (w / 2 + 1.5)], b = [p[0] - nx * (w / 2 + 1.5), p[1] - ny * (w / 2 + 1.5)];
    return `<path d="M${f(a[0])},${f(a[1] - 2)}L${f(b[0])},${f(b[1] + 2)}" stroke="#4a3022" stroke-width="5" stroke-linecap="round"/>
      <path d="M${f(a[0])},${f(a[1] - 3.6)}L${f(b[0])},${f(b[1] + .4)}" stroke="rgb(255 255 255 / .15)" stroke-width="1" stroke-linecap="round"/>`;
  }
  /* a wooden yard (the horizontal spar) from A to B */
  const yard = (A, B, w = 6.6) => {
    const dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy), nx = -dy / L * w / 2, ny = dx / L * w / 2;
    return `<polygon points="${pts([[A[0] + nx, A[1] + ny], [B[0] + nx * .8, B[1] + ny * .8], [B[0] - nx * .8, B[1] - ny * .8], [A[0] - nx, A[1] - ny]])}" fill="url(#gYard)" ${O}/>
      <path d="M${f(A[0] + 3)},${f(A[1] - w * .22)}L${f(B[0] - 3)},${f(B[1] - w * .22)}" stroke="rgb(255 255 255 / .35)" stroke-width="1.2" stroke-linecap="round"/>
      <circle cx="${A[0]}" cy="${A[1]}" r="${f(w * .55)}" fill="#7e4f27" ${OT}/><circle cx="${B[0]}" cy="${B[1]}" r="${f(w * .5)}" fill="#7e4f27" ${OT}/>`;
  };
  /* a festooned sail hanging from yard A -> B: n scallops, belly depth d */
  function sail(A, B, d, n, o = {}) {
    const cd = d * .34, P = i => mix(A, B, i / n);
    const Cc = i => { const p = P(i); return [p[0], p[1] + cd + (i === 0 || i === n ? d * .22 : 0)]; };
    let path = `M${f(A[0])},${f(A[1])}L${f(B[0])},${f(B[1])}L${f(Cc(n)[0])},${f(Cc(n)[1])}`;
    let folds = '', shades = '', ties = '';
    for (let i = n - 1; i >= 0; i--) {
      const cr = Cc(i + 1), cl = Cc(i), pm = mix(P(i), P(i + 1), .5), w = P(i + 1)[0] - P(i)[0], bm = [pm[0], pm[1] + d];
      path += `C${f(cr[0] - w * .05)},${f(cr[1] + (d - cd) * .85)} ${f(bm[0] + w * .3)},${f(bm[1] + 1)} ${f(bm[0])},${f(bm[1])}C${f(bm[0] - w * .3)},${f(bm[1] + 1)} ${f(cl[0] + w * .05)},${f(cl[1] + (d - cd) * .85)} ${f(cl[0])},${f(cl[1])}`;
      folds += `<path d="M${f(pm[0] - w * .02)},${f(pm[1] + 4)}Q${f(pm[0] + w * .08)},${f(pm[1] + d * .5)} ${f(pm[0] + w * .02)},${f(bm[1] - 5)}" stroke="rgb(150 115 70 / .32)" stroke-width="1.3" fill="none" stroke-linecap="round"/>
        <path d="M${f(pm[0] - w * .24)},${f(pm[1] + 5)}Q${f(pm[0] - w * .26)},${f(pm[1] + d * .45)} ${f(pm[0] - w * .2)},${f(bm[1] - 9)}M${f(pm[0] + w * .26)},${f(pm[1] + 5)}Q${f(pm[0] + w * .3)},${f(pm[1] + d * .4)} ${f(pm[0] + w * .24)},${f(bm[1] - 9)}" stroke="rgb(150 115 70 / .2)" stroke-width="1" fill="none" stroke-linecap="round"/>`;
      shades += `<ellipse cx="${f(bm[0])}" cy="${f(bm[1] - 3)}" rx="${f(w * .36)}" ry="3.2" fill="rgb(140 105 60 / .16)"/>`;
    }
    for (let i = 1; i < n; i++) { const p = P(i); ties += `<path d="M${f(p[0] - 1)},${f(p[1] - 4)}l2.6,9" stroke="#6b4a30" stroke-width="2.4" stroke-linecap="round"/>`; }
    return `<g class="sailg"><path d="${path}Z" fill="url(#gSail)" ${OT}/>${shades}${folds}</g>${yard(A, B, o.w || 6.6)}${ties}`;
  }
  const rope = (a, b, o = .55) => `<path d="M${a[0]},${a[1]}L${b[0]},${b[1]}" stroke="#6b4a30" stroke-width="1.1" opacity="${o}" fill="none"/>`;
  /* triangular flag that flutters */
  const flag = (x, y, w, h, col = '#2f3a5e') => `<g class="flag"><path d="M${x},${y}C${f(x + w * .3)},${f(y - h * .25)} ${f(x + w * .65)},${f(y + h * .1)} ${f(x + w)},${f(y - h * .1)}L${f(x + w * .78)},${f(y + h * .45)}L${f(x + w * .96)},${f(y + h * .9)}C${f(x + w * .62)},${f(y + h * .78)} ${f(x + w * .3)},${f(y + h * 1.05)} ${x},${f(y + h * .9)}Z" fill="${col}" ${OT}/>
      <path d="${sparkle(f(x + w * .42), f(y + h * .42), h * .3)}" fill="#ffd25c"/></g>`;

  /* striped observation dome on a round platform. cx,cy = platform centre */
  function dome(cx, cy, o = {}) {
    const R = o.R || 40, Hh = o.Hh || 42, y0 = cy - 20, ry = 9, ay = y0 - Hh;
    const ang = [180, 144, 108, 72, 36, 0], rad = a => a * Math.PI / 180;
    const bx = a => cx + R * Math.cos(rad(a)), by = a => y0 + ry * Math.sin(rad(a));
    const col = ['#f8da66', '#d9506a', '#f8da66', '#d9506a', '#f8da66'];
    const sil = `M${f(cx - R)},${f(y0)}C${f(cx - R)},${f(y0 - Hh * .75)} ${f(cx - R * .55)},${f(ay)} ${cx},${f(ay)}C${f(cx + R * .55)},${f(ay)} ${f(cx + R)},${f(y0 - Hh * .75)} ${f(cx + R)},${f(y0)}A${R},${ry} 0 0 1 ${f(cx - R)},${f(y0)}Z`;
    let gores = '';
    for (let i = 0; i < 5; i++) {
      const d0 = bx(ang[i]) - cx, d1 = bx(ang[i + 1]) - cx;
      gores += `<path d="M${cx},${f(ay)}C${f(cx + d0 * .55)},${f(ay)} ${f(cx + d0)},${f(y0 - Hh * .75)} ${f(bx(ang[i]))},${f(by(ang[i]))}A${R},${ry} 0 0 0 ${f(bx(ang[i + 1]))},${f(by(ang[i + 1]))}C${f(cx + d1)},${f(y0 - Hh * .75)} ${f(cx + d1 * .55)},${f(ay)} ${cx},${f(ay)}Z" fill="${col[i]}" stroke="${C.ink}" stroke-opacity=".3" stroke-width=".8"/>`;
    }
    let ws = '';
    for (let i = 0; i < 8; i++) { const x = cx - R * .86 + i * (R * 1.72 / 7) - 3; ws += `<rect x="${f(x)}" y="${y0 + 3}" width="6" height="8" rx="1.8" fill="#8fd0c2" ${OT}/>`; lamp(`<rect x="${f(x)}" y="${y0 + 3}" width="6" height="8" rx="1.8" fill="#ffd978"/>`); }
    const wy = y0 - Hh * .78, wx = R * .56, ww = 13, wh = Math.min(26, Hh * .62);
    const dwin = x => { lamp(`<path d="${arch(x - ww / 2 + 1.8, wy + 2, ww - 3.6, wh - 2)}" fill="#ffd978"/>`); return `<path d="${arch(x - ww / 2, wy, ww, wh)}" fill="${C.cream}" ${OT}/><path d="${arch(x - ww / 2 + 1.8, wy + 2, ww - 3.6, wh - 2)}" fill="url(#gGlass)"/><path d="M${x},${wy + 2}V${wy + wh}M${x - ww / 2 + 1.8},${wy + wh * .55}H${x + ww / 2 - 1.8}" stroke="${C.cream}" stroke-width=".9" opacity=".9"/>`; };
    return `<g class="domebody">
      <path d="M${f(cx - 32)},${f(cy + 2)}Q${cx},${f(cy + 38)} ${f(cx + 32)},${f(cy + 2)}Z" fill="url(#gPed)" ${OT}/>
      <ellipse cx="${cx}" cy="${f(cy + 1.5)}" rx="${R + 7}" ry="11" fill="#d9b476" ${O}/>
      <ellipse cx="${cx}" cy="${f(cy - 1)}" rx="${R + 5}" ry="9" fill="#f6e2ae"/>
      <path d="M${f(cx - R - 1)},${f(y0)}V${f(y0 + 11)}Q${cx},${f(y0 + 24)} ${f(cx + R + 1)},${f(y0 + 11)}V${f(y0)}Z" fill="url(#gCreamH)" ${OT}/>
      ${ws}
      <clipPath id="cDm${cx}"><path d="${sil}"/></clipPath>
      <g clip-path="url(#cDm${cx})">${gores}<rect x="${cx - R - 2}" y="${f(ay - 2)}" width="${R * 2 + 4}" height="${Hh + 14}" fill="url(#gDomeShade)"/>
        <ellipse cx="${f(cx - R * .5)}" cy="${f(ay + Hh * .3)}" rx="${f(R * .15)}" ry="${f(Hh * .2)}" fill="rgb(255 255 255 / .38)"/></g>
      <path d="${sil}" fill="none" ${O}/>
      ${dwin(cx - wx)}${dwin(cx + wx)}
      ${o.topRail ? `<ellipse cx="${cx}" cy="${f(ay + 3)}" rx="${f(R * .52)}" ry="5" fill="#fff6e4" ${OT}/><ellipse cx="${cx}" cy="${f(ay + 3)}" rx="${f(R * .42)}" ry="3.2" fill="#d9c8a4"/>` : `<ellipse cx="${cx}" cy="${f(ay + 1)}" rx="9" ry="3.4" fill="${C.redDD}"/>`}
    </g>`;
  }

  /* one rounded petal of the sun's mane, pointing along +x then rotated */
  const petal = (ang, r0, r1, w, fill, hi) => { const L = r1 - r0;
    return `<g transform="rotate(${ang})"><path d="M${r0},${-w}C${f(r0 + L * .5)},${f(-w * 1.08)} ${f(r1 - L * .1)},${f(-w * .62)} ${r1},${f(-w * .1)}Q${f(r1 + w * .16)},0 ${r1},${f(w * .1)}C${f(r1 - L * .1)},${f(w * .62)} ${f(r0 + L * .5)},${f(w * 1.08)} ${r0},${w}Z" fill="${fill}" ${O}/>
      <path d="M${f(r0 + 4)},${f(-w * .42)}C${f(r0 + L * .5)},${f(-w * .64)} ${f(r1 - L * .2)},${f(-w * .34)} ${f(r1 - 3)},${f(-w * .06)}" stroke="${hi}" stroke-width="${f(w * .22)}" fill="none" stroke-linecap="round" opacity=".85"/></g>`; };

  /* a wooden barrel with iron hoops */
  const barrel = (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})"><ellipse cx="0" cy="12" rx="13" ry="4" fill="rgb(90 60 30 / .3)"/>
    <path d="M-10.5,-9C-14,-3 -14,5 -10.5,11C-5,13.5 5,13.5 10.5,11C14,5 14,-3 10.5,-9Z" fill="url(#gBarrel)" ${OT}/>
    <path d="M-12.3,-3.4C-5,0 5,0 12.3,-3.4M-12.3,5C-5,8.6 5,8.6 12.3,5" fill="none" stroke="#5c3c20" stroke-width="2" stroke-linecap="round"/>
    <ellipse cx="0" cy="-9" rx="10.5" ry="3.8" fill="#e8c48c" ${OT}/><ellipse cx="0" cy="-9" rx="7" ry="2.3" fill="none" stroke="rgb(140 95 45 / .45)" stroke-width="1"/>
    <path d="M-6.4,-4C-8.2,0 -8.2,5 -6.4,9" stroke="rgb(255 255 255 / .35)" stroke-width="1.6" fill="none" stroke-linecap="round"/></g>`;

  /* ============================================================
     The ship, back to front
     ============================================================ */
  function build() {
    LIGHTS.length = 0;
    const out = {};

    /* ---------- water under the ship ---------- */
    out.water = `<ellipse cx="520" cy="552" rx="290" ry="19" fill="#05203d" opacity=".3" filter="url(#fBlur)"/>
      <ellipse cx="740" cy="438" rx="60" ry="16" fill="#05203d" opacity=".22" filter="url(#fBlur)"/>
      <path class="foam" d="M262,540C250,552 268,562 300,562C380,568 500,560 560,534" stroke="#fff" stroke-width="6" fill="none" stroke-linecap="round" opacity=".7"/>
      <path class="foam" d="M226,556C240,572 280,574 330,568" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round" opacity=".5" style="animation-delay:-1.2s"/>
      <ellipse class="foam" cx="232" cy="568" rx="40" ry="6" fill="#fff" opacity=".45" style="animation-delay:-2s"/>
      <path class="foam" d="M600,510C640,508 690,486 730,452C752,432 766,410 772,380" stroke="#fff" stroke-width="4.5" fill="none" stroke-linecap="round" opacity=".55" style="animation-delay:-.6s"/>
      <path class="foam" d="M770,452C800,456 830,470 860,486" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" opacity=".4" style="animation-delay:-1.6s"/>
      <path class="foam" d="M760,462C800,472 840,490 880,512" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round" opacity=".3" style="animation-delay:-2.4s"/>`;

    /* ---------- rudder wheel + wardrobe dome tower (behind the stern) ---------- */
    out.rear = `<ellipse cx="806" cy="298" rx="26" ry="36" fill="#9a6733" ${O}/>
      <ellipse cx="806" cy="298" rx="20" ry="29" fill="none" stroke="#7a4d25" stroke-width="2"/>
      <ellipse cx="806" cy="298" rx="13" ry="20" fill="none" stroke="#7a4d25" stroke-width="2"/>
      <ellipse cx="806" cy="298" rx="6" ry="10" fill="#7a4d25"/>
      <ellipse cx="800" cy="282" rx="10" ry="16" fill="rgb(255 255 255 / .12)"/>`;
    out.wdome = `<g class="spot" data-key="wardrobe"><g class="house">
        <path d="M744,238L808,238C802,258 794,272 788,286L766,286C760,272 750,256 744,238Z" fill="url(#gPed)" ${OT}/>
        <path d="M752,242Q762,262 770,284" stroke="rgb(255 255 255 / .55)" stroke-width="4" fill="none" stroke-linecap="round"/>
        ${dome(777, 233, { R: 40, Hh: 32, topRail: true })}
        <rect x="811" y="183" width="8" height="17" rx="2" fill="#2d3142"/><path d="M809,184h12l-6,-8z" fill="#2d3142"/><rect x="813" y="187" width="4" height="8" fill="#ffd978"/>
        <rect x="810" y="198" width="10" height="3" rx="1" fill="#2d3142"/>
      </g></g>`;
    lamp(`<rect x="813" y="187" width="4" height="8" fill="#ffd978"/>`);

    /* ---------- mizzen mast, its sail and the red furled sail ---------- */
    {
      const top = [722, 46], base = [706, 246];
      out.mizzen = `<path d="M738,70C752,66 764,82 762,104C768,126 758,148 750,164L730,156C738,132 730,106 736,88Z" fill="url(#gRedD)" ${O}/>
        <path d="M744,76C750,100 752,128 744,154M756,90C760,110 758,130 754,148" stroke="rgb(255 255 255 / .22)" stroke-width="2.4" fill="none" stroke-linecap="round"/>
        <path d="M733,96q14,6 28,-2M731,126q16,6 30,-2" stroke="#6b4a30" stroke-width="2.4" fill="none" stroke-linecap="round" opacity=".8"/>
        ${mast(top, base, 11)}${wrap(top, base, .44, 11)}
        ${sail([668, 52], [790, 90], 28, 3)}
        ${rope(top, [668, 52])}${rope(top, [790, 90])}
        <line x1="722" y1="46" x2="722" y2="34" stroke="#6e4a2a" stroke-width="3" stroke-linecap="round"/>
        ${flag(724, 22, 38, 20)}`;
    }

    /* ---------- far rails + lawn ---------- */
    out.far = railLine([[374, 372], [420, 350]], 13, 7.5) + railLine([[502, 331], [584, 309]], 13, 7.5) + railLine([[612, 292], [622, 288]], 12, 7);
    {
      const L = [[372, 374], [418, 351], [470, 338], [530, 322], [584, 311], [612, 296], [645, 311], [674, 336], [694, 372], [670, 402], [597, 427], [540, 447], [500, 459], [484, 465], [466, 452], [455, 428], [452, 412], [438, 420], [408, 429], [404, 402], [392, 394], [378, 389]];
      const lawnD = smooth(L, true);
      // garden tiles in the left half, laid out in perspective
      const TL = [434, 358], TR = [506, 346], BR = [566, 440], BL = [478, 456];
      const q = (u, v) => { const a = mix(TL, TR, u), b = mix(BL, BR, u); return mix(a, b, v); };
      let tiles = '';
      for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
        const a = q(i / 5 + .012, j / 5 + .012), b = q((i + 1) / 5 - .012, j / 5 + .012), c = q((i + 1) / 5 - .012, (j + 1) / 5 - .012), d = q(i / 5 + .012, (j + 1) / 5 - .012);
        tiles += `<polygon points="${pts([a, b, c, d])}" fill="${(i + j) % 2 ? 'rgb(48 120 52 / .22)' : 'rgb(190 245 150 / .16)'}"/>`;
      }
      out.lawn = `<clipPath id="cLawn"><path d="${lawnD}"/></clipPath>
        <path d="${lawnD}" fill="url(#gLawn)"/>
        <g clip-path="url(#cLawn)">
          ${tiles}
          <ellipse cx="640" cy="372" rx="64" ry="26" fill="rgb(220 255 170 / .2)"/>
          <path d="M360,380L450,340L560,310L600,300L600,330L520,350L470,400Z" fill="rgb(30 90 50 / .1)"/>
          <path d="M560,440L690,382L700,372L700,440Z" fill="rgb(30 80 50 / .16)"/>
        </g>
        <path d="${lawnD}" fill="none" stroke="rgb(30 90 50 / .4)" stroke-width="1.2"/>`;
    }

    /* ---------- stern cabin (Finance & Investing) ---------- */
    {
      // red body with the four arched windows, cream rounded wall with three doors, flat red roof
      out.deck = `<clipPath id="cDeck"><path d="M692,321L748,312C768,308 782,298 788,282C791,270 786,260 776,254L772,288Z"/></clipPath>
        <path d="M692,321L748,312C768,308 782,298 788,282C791,270 786,260 776,254L772,288Z" fill="url(#gDeck)" ${O}/>
        <g clip-path="url(#cDeck)">${[0, 1, 2, 3, 4, 5, 6, 7].map(i => { const t = i / 7, a = mix([694, 320], [771, 290], t), L = 12 + 14 * t; return `<path d="M${f(a[0])},${f(a[1])}l${f(.348 * L)},${f(.937 * L)}" stroke="rgb(120 80 40 / .3)" stroke-width="1.1"/>`; }).join('')}</g>
        ${railLine([[750, 312], [770, 305], [784, 293], [789, 278], [784, 264], [774, 256]], 11, 6.4, { curve: true, w: 1.5 })}`;
      out.cabin = `
        <path d="M690,316L692,262C700,250 740,244 760,246C772,252 774,276 770,290L692,318Z" fill="url(#gRed)" ${O}/>
        <path d="M692,319L771,291" stroke="rgb(90 40 30 / .28)" stroke-width="7" clip-path="url(#cDeck)"/>
        ${[[712, 300], [730, 292], [746, 284], [760, 276]].map(([x, y]) => `<path d="${arch(x - 6, y - 26, 12, 28)}" fill="url(#gDoor)" ${OT}/><circle cx="${x}" cy="${y - 19}" r="3.6" fill="#8fd0c2" stroke="${C.cream}" stroke-width="1.1"/>` + lamp(`<circle cx="${x}" cy="${y - 19}" r="3.6" fill="#ffd978"/>`)).join('')}
        <path d="M676,252C688,244 722,236 750,238C764,240 772,246 772,252L720,274L690,266Z" fill="#e66677" ${O}/>
        <path d="M690,266L720,274L772,252L772,258L720,282L690,272Z" fill="${C.redD}"/>
        ${rail([692, 268], [770, 252], 9, 7)}
        <ellipse cx="722" cy="241" rx="11" ry="6" fill="#5aa84d"/><circle cx="716" cy="236" r="6" fill="#74c15f"/><circle cx="729" cy="237" r="5" fill="#68b857"/>`;
      out.cream = `<g class="spot" data-key="finance"><g class="house">
          <path d="M640,266C646,256 666,250 692,258L694,316L644,298Z" fill="url(#gCreamH)" ${O}/>
          <path d="M640,266C646,256 666,250 692,258L692,266C668,258 650,262 642,272Z" fill="${C.creamD}"/>
          ${door(647, 273, 11, 24)}${door(664, 271, 14, 28)}${door(683, 276, 11, 34)}
        </g></g>`;
    }

    /* ---------- stairs, low wall with the learning doors, trees ---------- */
    {
      const sA = [681, 311], sB = [709, 325], sC = [669, 377], sD = [643, 358];
      let treads = '';
      for (let i = 0; i <= 9; i++) { const a = mix(sA, sD, i / 9), b = mix(sB, sC, i / 9); treads += `M${f(a[0])},${f(a[1])}L${f(b[0])},${f(b[1])}`; }
      out.stairs = `<polygon points="${pts([sA, sB, sC, sD])}" fill="url(#gDeck)" ${O}/>
        <path d="${treads}" stroke="rgb(120 80 40 / .42)" stroke-width="1.4" fill="none"/>
        <path d="${treads}" stroke="rgb(255 255 255 / .25)" stroke-width=".8" fill="none" transform="translate(0 1.3)"/>
        <polygon points="${pts([sA, mix(sA, sB, .22), mix(sD, sC, .22), sD])}" fill="rgb(255 255 255 / .12)"/>
        ${railLine([sD, sA], 13, 8, { w: 1.6 })}${railLine([sC, sB], 13, 8, { w: 1.6 })}`;
      out.walk = `<polygon points="${pts([sC, sB, [716, 328], [734, 335], [712, 361], [690, 388], [684, 382]])}" fill="url(#gWall)"/>
        <path d="M${sC[0]},${sC[1]}L${sB[0]},${sB[1]}" stroke="rgb(110 90 55 / .25)" stroke-width="5" transform="translate(2 1)"/>`;
      out.learn = `<g class="spot" data-key="learning"><g class="house">
          <path d="M618,296L684,314L684,334L652,350L620,334Z" fill="url(#gCreamH)" ${O}/>
          <path d="M618,296L684,314L684,321L618,303Z" fill="${C.creamD}"/>
          ${railLine([[616, 288], [684, 310]], 11, 8.5, { w: 1.6 })}
          ${door(634, 306, 13, 25)}${door(656, 316, 12, 24)}
          <circle cx="640" cy="304" r="2.2" fill="#ffd978"/>
        </g></g>`;
      const tree = (x, y, h, w) => `<g class="tree"><ellipse cx="${x}" cy="${y + 8}" rx="${f(w * .8)}" ry="3.4" fill="rgb(20 60 30 / .3)"/><rect x="${x - 2}" y="${y + 2}" width="4" height="8" fill="#7a4f27"/>
        <path d="M${x},${y - h}L${x + w},${y + 4}Q${x},${y + 8} ${x - w},${y + 4}Z" fill="#2c8a4e" ${OT}/>
        <path d="M${x},${y - h}L${x + w * .55},${y - h * .35}L${x + w * .9},${y + 3}Q${x + w * .2},${y + 6} ${x},${y + 5}Z" fill="#1f6e3f" opacity=".6"/>
        <path d="M${x},${y - h * .72}L${x + w * .66},${y - h * .1}L${x - w * .66},${y - h * .1}Z" fill="#46ad63" opacity=".85"/>
        <path d="M${x},${y - h * .42}L${x + w * .8},${y + 2}L${x - w * .8},${y + 2}Z" fill="#3a9d58" opacity=".8"/></g>`;
      out.trees = tree(622, 322, 42, 16) + tree(660, 342, 31, 12);
    }

    /* ---------- main mast + sails ---------- */
    {
      const top = [606, 62], base = [609, 354];
      out.main = `${mast(top, base, 13)}<ellipse cx="609" cy="354" rx="16" ry="6" fill="#4a3022" ${OT}/><ellipse cx="609" cy="352" rx="14" ry="4.6" fill="#7a5233"/>
        ${wrap(top, base, .48, 13)}${wrap(top, base, .62, 13)}
        ${sail([536, 79], [776, 165], 40, 5)}${sail([540, 187], [684, 249], 30, 3)}
        ${rope(top, [536, 79], .5)}${rope(top, [776, 165], .5)}${rope([606, 80], [540, 187], .4)}`;
    }

    /* ---------- thatched pavilion (Meal Planner) ---------- */
    {
      const roof = 'M490,318L562,323C572,335 581,347 588,358Q560,380 524,384C510,362 495,340 490,318Z';
      const rows = Array.from({ length: 7 }, (_, i) => { const t = (i + .9) / 7.6, a = mix([490, 318], [524, 384], t), b = mix([562, 323], [588, 358], t); return `<path d="M${f(a[0] + 5)},${f(a[1] + 1)}L${f(b[0] - 5)},${f(b[1] - 1)}" stroke="rgb(150 105 30 / .3)" stroke-width="1.4" stroke-linecap="round" stroke-dasharray="${14 + i % 3 * 4} 4 ${22 - i % 2 * 6} 5 9 4"/>`; }).join('');
      out.pav = `<g class="spot" data-key="meal"><g class="house">
        <ellipse cx="548" cy="398" rx="52" ry="9" fill="rgb(20 70 40 / .28)"/>
        <path d="M508,344L524,386L524,410L509,372Z" fill="#8f6436" ${OT}/>
        <g transform="translate(524 386) matrix(1 -.423 0 1 0 0)">
          <rect x="0" y="0" width="52" height="25" fill="#dcb87f" ${OT}/>
          ${[6, 13, 20, 27, 34, 41, 48].map(x => `<path d="M${x},0V25" stroke="rgb(120 80 40 / .22)" stroke-width="1"/>`).join('')}
          <rect x="8" y="5" width="18" height="12" rx="2" fill="url(#gGlass)" stroke="${C.cream}" stroke-width="1.6"/><path d="M17,5V17M8,11H26" stroke="${C.cream}" stroke-width="1"/>
          <rect x="32" y="3" width="11" height="22" rx="2.4" fill="#7d5127" ${OT}/><circle cx="40" cy="15" r="1.1" fill="#f3dc9a"/>
        </g>
        <rect x="520" y="384" width="6" height="27" rx="1.6" fill="#7d5127" ${OT}/><rect x="573" y="362" width="6" height="29" rx="1.6" fill="#7d5127" ${OT}/>
        <path d="${roof}" transform="translate(0 4.6)" fill="#a98230" ${O}/>
        <path d="${roof}" fill="url(#gThatch)" ${O}/>
        <clipPath id="cRoof"><path d="${roof}"/></clipPath>
        <g clip-path="url(#cRoof)">${rows}<path d="M490,318L526,384L508,330Z" fill="rgb(255 255 255 / .2)"/></g>
        <path d="M490.6,318.6L561,323.5" stroke="#fff3c4" stroke-width="2" stroke-linecap="round"/>
        <path d="M490.6,318.6C495,340 510,362 524,383" stroke="#fff3c4" stroke-width="1.8" stroke-linecap="round" fill="none" opacity=".9"/>
      </g></g>`;
      lamp(`<g transform="translate(524 386) matrix(1 -.423 0 1 0 0)"><rect x="8" y="5" width="18" height="12" fill="#ffd978"/></g>`);
    }

    /* ---------- fore mast: ratlines, sails, flag, crow's-nest dome (Workout Planner) ---------- */
    {
      const top = [424, 196], base = [431, 394];
      let net = '';
      for (let i = 0; i <= 6; i++) { const t = i / 6, a = [lerp(414, 392, t), lerp(300, 384, t)], b = [lerp(431, 439, t), lerp(300, 384, t)]; net += `M${f(a[0])},${f(a[1])}L${f(b[0])},${f(b[1])}`; }
      net += `M414,300L392,384M431,300L439,384M422,300L416,384`;
      out.fore = `<path d="${net}" stroke="#6b4a30" stroke-width="1.1" opacity=".55" fill="none"/>
        ${mast(top, base, 13)}<ellipse cx="431" cy="394" rx="16" ry="6" fill="#4a3022" ${OT}/><ellipse cx="431" cy="392" rx="14" ry="4.6" fill="#7a5233"/>
        ${wrap(top, base, .52, 13)}${wrap(top, base, .74, 13)}
        ${sail([364, 246], [492, 338], 36, 3)}${sail([360, 166], [506, 259], 40, 4)}
        <ellipse cx="420" cy="224" rx="19" ry="9.5" transform="rotate(35 420 224)" fill="#f2aa6e" ${OT}/><path d="${sparkle(420, 224, 7)}" fill="#fff3c8"/>
        ${rope([424, 200], [364, 246], .45)}
        <g class="spot" data-key="workout"><g class="house">
          <line x1="420" y1="100" x2="420" y2="134" stroke="#6e4a2a" stroke-width="3.4" stroke-linecap="round"/>
          ${dome(420, 192, { R: 41, Hh: 44 })}
        </g></g>
        ${flag(422, 96, 50, 26)}`;
    }

    /* ---------- bow: far walls, forecastle deck, ramp ---------- */
    out.bow = `<path d="M262,404C290,376 320,356 358,338" stroke="${C.creamDD}" stroke-width="10" stroke-linecap="round" fill="none"/>
      <path d="M326,350L360,338L374,376L352,372L330,366Z" fill="url(#gRedD)" ${O}/>
      <path d="M262,404C290,376 320,356 358,338" stroke="url(#gCream)" stroke-width="8" stroke-linecap="round" fill="none"/>
      ${volute(358, 328, 13)}
      <clipPath id="cBowDeck"><path d="M266,406L322,372L360,374L404,404L408,430L272,422Z"/></clipPath>
      <path d="M266,406L322,372L360,374L404,404L408,430L272,422Z" fill="url(#gDeck)" ${O}/>
      <g clip-path="url(#cBowDeck)">${Array.from({ length: 9 }, (_, i) => `<path d="M${276 + i * 16},${f(420 - i * 2)}L${f(306 + i * 15)},${f(380 + i * 3.6)}" stroke="rgb(140 95 45 / .38)" stroke-width="1.2"/>`).join('')}
      <path d="M270,420L406,432" stroke="rgb(120 80 35 / .32)" stroke-width="6" fill="none"/></g>
      ${barrel(318, 398, 1)}${barrel(341, 388, .86)}${barrel(332, 407, .9)}
      ${railLine([[352, 376], [404, 408]], 12, 8)}
      ${(() => { const Q = [[376, 392], [412, 408], [404, 426], [368, 410]]; let t = '', d = ''; for (let i = 0; i <= 8; i++) { const a = mix(Q[0], Q[1], i / 8), b = mix(Q[3], Q[2], i / 8); t += `M${f(a[0])},${f(a[1])}L${f(b[0])},${f(b[1])}`; if (i < 8) { const a2 = mix(Q[0], Q[1], (i + .62) / 8), b2 = mix(Q[3], Q[2], (i + .62) / 8); d += `M${f(a2[0])},${f(a2[1])}L${f(b2[0])},${f(b2[1])}`; } }
        return `<polygon points="${pts(Q)}" fill="url(#gDeck)" ${O}/><path d="${d}" stroke="rgb(255 255 255 / .3)" stroke-width="1.3" fill="none"/><path d="${t}" stroke="rgb(120 80 40 / .5)" stroke-width="1.2" fill="none"/>${railLine([Q[3], Q[2]], 10, 8, { w: 1.5 })}`; })()}
      <path d="M407,424L440,413" stroke="${C.creamDD}" stroke-width="6.5" stroke-linecap="round"/><path d="M407,423L440,412" stroke="url(#gCream)" stroke-width="5" stroke-linecap="round"/>
      ${railLine([[409, 421], [438, 411]], 11, 6.5, { w: 1.5 })}`;

    /* ---------- the near bulwark: one cream rim from the bow scroll, round the dip, up to the stern ---------- */
    const RIM = [[447, 404], [451, 417], [457, 442], [470, 463], [488, 473], [512, 477], [545, 473], [575, 465], [606, 454], [641, 438], [667, 414], [690, 388], [712, 361], [734, 335], [746, 314]];
    const RIMW = [11, 11.5, 12, 13, 13.5, 13.5, 13.5, 14, 14.5, 15, 15.5, 16, 16, 16, 15];
    const rim = ribbon(RIM, RIMW);
    {
      const wall = [[486, 456], [572, 424], [684, 382], [690, 388], [667, 414], [641, 438], [606, 454], [575, 465], [545, 473], [512, 477], [488, 473], [470, 463]];
      out.nrail = `<clipPath id="cWall"><polygon points="${pts(wall)}"/></clipPath>
        <polygon points="${pts(wall)}" fill="url(#gWall)"/>
        <g clip-path="url(#cWall)"><path d="${rim.top}" fill="none" stroke="rgb(110 90 55 / .16)" stroke-width="12" transform="translate(0 -5)"/></g>
        ${railLine([[486, 456], [572, 424], [684, 382]], 19, 7.6, { w: 1.9 })}`;
    }

    /* ---------- near hull (everything below the rim) ---------- */
    {
      const bottom = [[262, 506], [276, 534], [300, 546], [330, 553], [380, 556], [430, 551], [480, 543], [520, 530], [560, 518], [600, 506], [640, 497], [680, 472], [720, 442], [750, 414], [768, 382], [775, 346]];
      const hullD = smooth(bottom) + 'L774,330L700,334L641,440' + RIM.slice(1, 9).reverse().map(p => 'L' + p[0] + ',' + p[1]).join('') + 'L408,428L270,420L262,470Z';
      const T = RIM.slice(1, 9);
      const Bt = [[408, 437], [419, 463], [438, 487], [460, 500], [486, 506], [520, 505], [556, 496], [610, 498]];
      const dipD = 'M408,428L451,414' + smooth(T).replace(/^M[\d.,]+/, '') + 'L612,500' + smooth(Bt.slice().reverse()).replace('M', 'L') + 'Z';
      let planks = '';
      [14, 28, 42].forEach(dy => { planks += `<path d="${smooth(offset(bottom, 0, -dy))}" fill="none" stroke="rgb(60 30 12 / .26)" stroke-width="1.5"/>`; });
      out.hull = `<clipPath id="cHull"><path d="${hullD}"/></clipPath>
        <path d="${hullD}" fill="url(#gHull)" ${O}/>
        <g clip-path="url(#cHull)">${planks}
          <path d="${smooth(offset(bottom, 0, -3))}" fill="none" stroke="rgb(30 15 20 / .5)" stroke-width="9"/>
          <path d="M600,420L780,330L780,520L600,520Z" fill="rgb(20 18 40 / .12)"/>
        </g>
        <path d="${dipD}" fill="url(#gRed)" ${O}/>
        <path d="${smooth(Bt)}" fill="none" stroke="${C.creamDD}" stroke-width="6.5" stroke-linecap="round" transform="translate(0 .8)"/>
        <path d="${smooth(Bt)}" fill="none" stroke="url(#gCream)" stroke-width="5.2" stroke-linecap="round"/>
        ${porthole(440, 453, 8.4)}${porthole(473, 486, 9)}${porthole(531, 491, 8)}`;
    }

    /* ---------- stern wall: red strip, the rim, gallery with the bank door ---------- */
    {
      out.stern = `<path d="M750,312L754,334C758,352 758,368 752,386C746,404 732,414 712,420L672,442L646,454L642,440L690,392L736,338Z" fill="url(#gRedH)" ${O}/>
        <path d="M748,370C750,392 742,408 722,418L676,442" fill="none" stroke="${C.creamDD}" stroke-width="5.4" stroke-linecap="round" transform="translate(0 .8)"/>
        <path d="M750,372C752,394 744,410 724,420L678,443" fill="none" stroke="url(#gCream)" stroke-width="4.4" stroke-linecap="round"/>
        ${porthole(731, 357, 6.6)}${porthole(706, 398, 8)}${porthole(731, 398, 6.6)}${porthole(750, 387, 6)}${porthole(676, 431, 8.2)}
        <path d="M736,398L746,394L752,440L740,446Z" fill="#232a3d" opacity=".9" clip-path="url(#cHull)"/>
        <path d="${rim.d}" fill="${C.creamDD}" transform="translate(0 1.4)"/>
        <path d="${rim.d}" fill="#f8eed4" ${OT}/>
        <path d="${rim.top}" fill="none" stroke="#fffdf6" stroke-width="2.4" stroke-linecap="round" opacity=".95"/>
        <path d="${rim.bot}" fill="none" stroke="${C.creamDD}" stroke-width="2.2" stroke-linecap="round" opacity=".8"/>
        ${volute(443, 396, 15)}`;
      out.cap = `<path d="M706,322L750,306L756,310L712,327Z" fill="#fffaf0" ${O}/>
        <path d="M712,327L756,310L756,315L712,333Z" fill="${C.creamDD}" ${OT}/>
        <path d="M708,322.6L750,307.2" stroke="#fff" stroke-width="1.4" stroke-linecap="round" opacity=".9"/>`;
      out.gallery = `<g class="spot" data-key="bank"><g class="house">
          <path d="M748,324L792,310L794,352L752,366Z" fill="url(#gCream)" ${O}/>
          <path d="M748,324L792,310L793,318L749,332Z" fill="${C.red}" ${OT}/>
          <rect x="754" y="338" width="8" height="14" rx="1.4" fill="#4b6f82" ${OT}/><path d="M758,338V352M754,345H762" stroke="${C.cream}" stroke-width=".9"/>
          <rect x="776" y="331" width="8" height="14" rx="1.4" fill="#4b6f82" ${OT}/><path d="M780,331V345M776,338H784" stroke="${C.cream}" stroke-width=".9"/>
          ${door(764, 334, 11, 22)}
          <path d="M740,372L760,366L796,352" stroke="#f0dcae" stroke-width="3.6" stroke-linecap="round" fill="none"/>
          ${railLine([[744, 372], [796, 354]], 10, 7)}
        </g></g>`;
      lamp(`<rect x="754" y="338" width="8" height="14" fill="#ffd978"/><rect x="776" y="331" width="8" height="14" fill="#ffd978"/>`);
    }

    /* ---------- the paddle-wheel tyre ---------- */
    out.tyre = `<g transform="rotate(-24 608 466)"><ellipse cx="608" cy="470" rx="45" ry="53" fill="rgb(10 14 28 / .35)"/>
      <ellipse cx="608" cy="466" rx="45" ry="53" fill="url(#gTyre)" ${O}/>
      <ellipse cx="608" cy="466" rx="41" ry="49" fill="none" stroke="rgb(0 0 0 / .28)" stroke-width="1.2"/>
      <ellipse cx="608" cy="466" rx="37" ry="45" fill="none" stroke="rgb(255 255 255 / .1)" stroke-width="2.2"/>
      <ellipse cx="608" cy="466" rx="33" ry="41.5" fill="none" stroke="rgb(0 0 0 / .26)" stroke-width="1.2"/>
      <path d="M576,436C582,420 596,413 612,414" fill="none" stroke="rgb(255 255 255 / .28)" stroke-width="2.6" stroke-linecap="round"/>
      <clipPath id="cDisc"><ellipse cx="610" cy="466" rx="29" ry="38"/></clipPath>
      <ellipse cx="610" cy="466" rx="29" ry="38" fill="#e0b26e"/>
      <g clip-path="url(#cDisc)"><path d="M596,420V512M610,420V512M624,420V512" stroke="rgb(130 80 35 / .28)" stroke-width="1.2"/><ellipse cx="600" cy="448" rx="14" ry="20" fill="rgb(255 255 255 / .16)"/></g>
      <ellipse cx="610" cy="466" rx="29" ry="38" fill="none" ${O}/>
      <ellipse cx="610" cy="466" rx="22" ry="31" fill="none" stroke="rgb(120 70 30 / .3)" stroke-width="1.4"/>
      <path d="${sparkle(610, 466, 15)}" fill="#cf4a5f" ${OT}/></g>`;

    /* ---------- bow panel + figurehead ---------- */
    out.front = `
      <path d="M270,421L408,431L407,522C394,538 362,548 326,556C298,552 268,538 262,500C258,452 262,430 270,421Z" fill="url(#gRed)" ${O}/>
      <path d="M262,490Q336,498 406,526" fill="none" stroke="${C.creamDD}" stroke-width="8" stroke-linecap="round" transform="translate(0 1)"/>
      <path d="M262,490Q336,498 406,526" fill="none" stroke="url(#gCream)" stroke-width="6.6" stroke-linecap="round"/>
      <path d="M262,418L410,430" stroke="${C.creamDD}" stroke-width="10" stroke-linecap="round" transform="translate(0 1)"/>
      <path d="M262,418L410,430" stroke="url(#gCream)" stroke-width="8.6" stroke-linecap="round"/>
      <path d="M262,416L410,428" stroke="#fffdf6" stroke-width="2.2" stroke-linecap="round" opacity=".9"/>
      <path d="M409,432L408,520C396,534 380,540 362,546" fill="none" stroke="url(#gCream)" stroke-width="5.4" stroke-linecap="round"/>
      <circle cx="352" cy="470" r="30" fill="rgb(60 20 25 / .3)" transform="translate(0 1.4)"/>
      <circle cx="352" cy="470" r="30" fill="url(#gCream)" ${O}/>
      <circle cx="352" cy="470" r="22.5" fill="#f7dc8e" stroke="#d9b45a" stroke-width="1.4"/>
      <path d="${sparkle(352, 470, 17)}" fill="${C.red}" ${OT}/>
      <circle cx="322" cy="548" r="13" fill="url(#gCream)" ${O}/><circle cx="322" cy="548" r="7" fill="${C.creamD}"/>
      <!-- figurehead: a smiling golden sun with a petal mane, rising out of a bronze collar -->
      <g class="fig">
        <circle cx="204" cy="454" r="84" fill="url(#gGlowS)"/>
        <g transform="translate(204 454)">${Array.from({ length: 12 }, (_, k) => petal(k * 30, 30, k % 2 ? 62 : 70, 9.6, '#f0913c', '#ffc36b')).join('')}</g>
        <g transform="rotate(-7 254 466)">
          <ellipse cx="254" cy="467.5" rx="28" ry="83" fill="rgb(60 30 20 / .3)"/>
          <ellipse cx="254" cy="466" rx="28" ry="83" fill="url(#gPlate)" ${O}/>
          <ellipse cx="254" cy="466" rx="21" ry="74" fill="none" stroke="#a3834a" stroke-opacity=".5" stroke-width="1.5"/>
          <ellipse cx="253" cy="465" rx="21" ry="74" fill="none" stroke="#fff8dc" stroke-opacity=".7" stroke-width="1.6" transform="translate(-1.2 -1.2)"/>
          <path d="M228,436C244,440 266,440 280,436M228,498C244,502 266,502 280,498" fill="none" stroke="#a3834a" stroke-opacity=".55" stroke-width="1.8" stroke-linecap="round"/>
          <path d="M228,438C244,442 266,442 280,438M228,500C244,504 266,504 280,500" fill="none" stroke="#fff8dc" stroke-opacity=".6" stroke-width="1" stroke-linecap="round"/>
          ${[[262, 410], [265, 466], [262, 524], [244, 384]].map(([x, y]) => `<circle cx="${x}" cy="${y + 1}" r="3.4" fill="rgb(80 50 20 / .3)"/><circle cx="${x}" cy="${y}" r="3.2" fill="#e9d590" ${OT}/><circle cx="${x - 1}" cy="${y - 1}" r="1" fill="#fff"/>`).join('')}
        </g>
        <g transform="translate(204 454)">
          ${Array.from({ length: 12 }, (_, k) => (k * 30 + 15 > 80 && k * 30 + 15 < 280) ? petal(k * 30 + 15, 32, 51, 8, '#ffb552', '#ffe29a') : '').join('')}
          <circle r="37.6" fill="rgb(110 60 20 / .25)" cy="1.6"/>
          <circle r="37" fill="url(#gFace)" ${O}/>
          <ellipse cx="-13" cy="-18" rx="13" ry="6.4" transform="rotate(-24 -13 -18)" fill="#fff" opacity=".5"/>
          <ellipse cx="-12.5" cy="-3" rx="5" ry="6.3" fill="#3a2a22"/><ellipse cx="12.5" cy="-3" rx="5" ry="6.3" fill="#3a2a22"/>
          <circle cx="-10.8" cy="-5.8" r="2.1" fill="#fff"/><circle cx="14.2" cy="-5.8" r="2.1" fill="#fff"/>
          <circle cx="-13.8" cy="-.4" r="1" fill="#fff" opacity=".8"/><circle cx="11.2" cy="-.4" r="1" fill="#fff" opacity=".8"/>
          <ellipse cx="-22" cy="8.5" rx="6.2" ry="3.7" fill="#ff8f84" opacity=".7"/><ellipse cx="22" cy="8.5" rx="6.2" ry="3.7" fill="#ff8f84" opacity=".7"/>
          <path d="M-9,10.5Q0,20.5 9,10.5" stroke="#3a2a22" stroke-width="2.5" fill="none" stroke-linecap="round"/>
          <path d="M-3.6,15.2Q0,19 3.6,15.2" fill="#ff8f84" opacity=".85"/>
        </g>
        <path d="${sparkle(152, 404, 6.5)}" fill="#fff6cf"/><path d="${sparkle(146, 506, 4.6)}" fill="#fff6cf" opacity=".9"/>
      </g>`;

    /* ---------- spots: hit areas, tooltip anchors, zoom focus, stickers ---------- */
    const hits = {
      workout:  '<path d="M372,126C372,100 470,100 470,126V212H372Z"/><rect x="372" y="120" width="98" height="96" rx="30"/>',
      wardrobe: '<rect x="731" y="172" width="92" height="90" rx="28"/>',
      finance:  '<polygon points="640,264 694,254 696,318 644,300"/>',
      learning: '<polygon points="616,290 686,310 686,336 652,352 618,336"/>',
      meal:     '<polygon points="486,316 564,320 592,358 578,392 524,412 500,364"/>',
      bank:     '<polygon points="746,322 796,308 798,356 752,372"/>',
    };
    const tips = { workout: [330, 150], finance: [668, 236], learning: [586, 366], meal: [538, 308], wardrobe: [852, 190], bank: [872, 394] };
    const zoom = { workout: [380, 130, 80, 70], wardrobe: [738, 186, 80, 56], finance: [642, 262, 56, 52], learning: [630, 302, 42, 34], meal: [488, 322, 112, 70], bank: [750, 326, 44, 42] };
    const stk = { workout: [474, 108], wardrobe: [826, 150], finance: [700, 206], learning: [572, 300], meal: [524, 280], bank: [800, 322] };

    return {
      defs: DEFS, water: out.water,
      ship: ['rear', 'wdome', 'mizzen', 'far', 'lawn', 'deck', 'cabin', 'cream', 'stairs', 'learn', 'trees', 'main', 'pav', 'fore', 'bow', 'nrail', 'hull', 'walk', 'stern', 'cap', 'gallery', 'tyre', 'front'].map(k => `<g data-l="${k}">${out[k]}</g>`).join('\n'),
      lights: LIGHTS.join(''), hits, tips, zoom, stk,
    };
  }
  return { build };
})();
