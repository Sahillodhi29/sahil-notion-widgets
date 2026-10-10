/* ============================================================
   Island Map
   Six little islands that open your Notion pages. The sea and sky
   follow the time of day, exactly like the sky banner.

   URL options:
     ?only=workout            show just one island
                              (workout, learning, meal, wardrobe, bank, finance)
     ?time=18:30              preview the sky at a time of day
     ?lat= &lon=              sky location (default Gwalior)
     ?workout=assets/x.gif    use a different sticker for an island
   Stickers: drop assets/workout.png (or .gif), learning, meal,
   wardrobe, bank, finance into the assets folder. No code changes.
   ============================================================ */
(() => {
  'use strict';
  const q = new URLSearchParams(location.search);
  const $ = id => document.getElementById(id);
  const root = document.documentElement;
  const NS = 'http://www.w3.org/2000/svg';

  /* ---------- the six islands ---------- */
  const ISLANDS = [
    { key: 'workout', name: 'Workout Planner',
      url: 'https://app.notion.com/p/Workout-Planner-3e7fa221698780908ad1d249532cd932',
      glow: '104 214 134', rot: -1.5, d: ['-14px', '0px'], n: ['-4px', '0px'],
      p: { grass: '#3f9060', hi: '#79c783', dk: '#2d6c48', rock: '#8b6a4d', rockDk: '#5d4533' } },
    { key: 'learning', name: 'Learning Planner',
      url: 'https://app.notion.com/p/Learning-Planner-f76fa221698783db8e2681ce2394c6a7',
      glow: '226 130 210', rot: 1.8, d: ['16px', '30px'], n: ['6px', '26px'],
      p: { grass: '#9a54a8', hi: '#d28bd6', dk: '#74408a', rock: '#5b3a78', rockDk: '#3b2652' } },
    { key: 'meal', name: 'Meal Planner',
      url: 'https://app.notion.com/p/Meal-Planner-3eefa221698780818e5fc99b43a74a87',
      glow: '236 112 134', rot: -1, d: ['-10px', '-6px'], n: ['-6px', '30px'],
      p: { grass: '#a63a50', hi: '#d86a7c', dk: '#7a2a3d', rock: '#6b3030', rockDk: '#431d22' } },
    { key: 'wardrobe', name: 'Wardrobe',
      url: 'https://app.notion.com/p/Wardrobe-Organizer-305fa22169878363870b8121ff54b768',
      glow: '118 156 240', rot: 1.2, d: ['30px', '24px'], n: ['6px', '0px'],
      p: { grass: '#3d5fa6', hi: '#7898dc', dk: '#2b4580', rock: '#34456f', rockDk: '#212c4d' } },
    { key: 'bank', name: 'Bank Officer in Making',
      url: 'https://app.notion.com/p/Bank-Officer-in-Making-3f0fa22169878133a416e22d1592203b',
      glow: '226 164 110', rot: -1.6, d: ['-22px', '4px'], n: ['-6px', '26px'],
      p: { grass: '#8c5a3a', hi: '#bf8c62', dk: '#6a4028', rock: '#58382a', rockDk: '#3a2218' } },
    { key: 'finance', name: 'Finance & Investing',
      url: 'https://app.notion.com/p/Finance-Investing-3e7fa221698780d09d1fe5b1ab6c4ce0',
      glow: '255 168 202', rot: 1.4, d: ['14px', '34px'], n: ['4px', '0px'],
      p: { grass: '#f09bbd', hi: '#ffc8dc', dk: '#d676a0', rock: '#c26f93', rockDk: '#9a4f72' } },
  ];

  /* ---------- island art (hand-built SVG, viewBox 200 x 156) ---------- */
  function baseIsland(k, p) {
    let drips = '', dripsDk = '';
    [34, 50, 66, 82, 100, 118, 134, 150, 166].forEach((x, i) => {
      const t = (x - 100) / 78;
      const y = 62 + 24 * Math.sqrt(Math.max(0, 1 - t * t));
      const r = 6.2 + ((i * 37) % 5) * 0.9;
      dripsDk += `<circle cx="${x}" cy="${(y + 1.6).toFixed(1)}" r="${r}" fill="${p.dk}"/>`;
      drips += `<circle cx="${x}" cy="${(y - 1).toFixed(1)}" r="${r}" fill="${p.grass}"/>`;
    });
    return `
      <defs><linearGradient id="rk-${k}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${p.rock}"/><stop offset="1" stop-color="${p.rockDk}"/></linearGradient></defs>
      <path d="M22 64 C20 102 66 138 100 146 C134 138 180 102 178 64 Z" fill="url(#rk-${k})"/>
      <path d="M44 92 q22 9 44 2 M104 112 q22 6 40-6 M62 114 q12 6 24 3" stroke="${p.rockDk}" stroke-opacity=".55" stroke-width="3.4" stroke-linecap="round" fill="none"/>
      <circle cx="146" cy="88" r="3" fill="${p.rockDk}" opacity=".5"/><circle cx="64" cy="108" r="2.4" fill="${p.rockDk}" opacity=".5"/>
      ${dripsDk}${drips}
      <ellipse cx="100" cy="62" rx="78" ry="24" fill="${p.grass}"/>
      <ellipse cx="100" cy="57" rx="66" ry="17" fill="${p.hi}" opacity=".5"/>
      <g fill="#fff" opacity=".85"><circle cx="76" cy="72" r="1.5"/><circle cx="126" cy="74" r="1.5"/><circle cx="104" cy="76" r="1.2"/></g>`;
  }

  const ART = {
    workout: () => `
      <g class="pr"> <!-- pine tree -->
        <rect x="160" y="52" width="5" height="12" rx="2" fill="#7a5638"/>
        <path d="M162.500 22 L176 44 H149 Z" fill="#2d7a4f"/><path d="M162.500 33 L179 56 H146 Z" fill="#3a9560"/>
        <circle cx="158" cy="38" r="1.600" fill="#fff" opacity=".6"/>
      </g>
      <g class="pr" transform="rotate(-8 52 66)"> <!-- dumbbell -->
        <rect x="38" y="64" width="28" height="4.500" rx="2" fill="#c3cad6"/>
        <rect x="33" y="56" width="8" height="21" rx="3" fill="#f2a65a"/><rect x="63" y="56" width="8" height="21" rx="3" fill="#f2a65a"/>
        <rect x="29" y="59" width="5" height="15" rx="2" fill="#4b5563"/><rect x="70" y="59" width="5" height="15" rx="2" fill="#4b5563"/>
        <rect x="35" y="58" width="2.500" height="8" rx="1" fill="#fff" opacity=".45"/>
      </g>
      <g class="pr"> <!-- kettlebell -->
        <path d="M137 63 a7 7 0 0 1 14 0" fill="none" stroke="#3f4a5a" stroke-width="3.500" stroke-linecap="round"/>
        <circle cx="144" cy="71" r="10" fill="#4f5d73"/><circle cx="140.500" cy="67.500" r="3" fill="#fff" opacity=".28"/>
        <rect x="139" y="72" width="10" height="3" rx="1.500" fill="#f2a65a"/>
      </g>
      <g fill="#79c783"><path d="M88 46 q2-7 4 0 q2-6 4 0z"/><path d="M118 44 q2-6 4 0 q2-5 4 0z"/></g>`,

    learning: () => `
      <g class="pr"> <!-- blossom tree -->
        <path d="M159 64 q-1-14 1-22" stroke="#7a5638" stroke-width="5" stroke-linecap="round" fill="none"/>
        <circle cx="160" cy="34" r="15" fill="#f6a4c8"/><circle cx="148" cy="42" r="10" fill="#ffc0da"/><circle cx="172" cy="42" r="10" fill="#f48fb8"/>
        <circle cx="156" cy="30" r="3" fill="#fff" opacity=".6"/>
        <g fill="#ffd1e4"><circle cx="150" cy="70" r="1.800"/><circle cx="170" cy="72" r="1.800"/><circle cx="141" cy="64" r="1.600"/></g>
      </g>
      <g class="pr"> <!-- books -->
        <rect x="31" y="64" width="34" height="9" rx="2.500" fill="#f4a7cf"/><rect x="31" y="70" width="34" height="2" fill="#fff" opacity=".55"/>
        <rect x="35" y="55" width="28" height="9" rx="2.500" fill="#7fd6c8"/><rect x="35" y="61" width="28" height="2" fill="#fff" opacity=".55"/>
        <rect x="33" y="47" width="25" height="8" rx="2.500" fill="#f6dc8e"/><rect x="33" y="52" width="25" height="2" fill="#fff" opacity=".6"/>
        <path d="M45.500 36 l12 5 -12 5 -12-5z" fill="#3b2652"/><path d="M52 43 v5" stroke="#f6dc8e" stroke-width="1.600" stroke-linecap="round"/>
      </g>
      <g fill="#d28bd6"><path d="M94 46 l1.400 3.200 3.200 1.400-3.200 1.400-1.400 3.200-1.400-3.200-3.200-1.400 3.200-1.400z" opacity=".9"/></g>`,

    meal: () => `
      <g class="pr"> <!-- apple tree -->
        <rect x="157" y="46" width="6" height="18" rx="2.500" fill="#7a5638"/>
        <circle cx="160" cy="34" r="16" fill="#5fae6a"/><circle cx="148" cy="42" r="10" fill="#79c27d"/><circle cx="172" cy="42" r="10" fill="#4f9a5c"/>
        <circle cx="154" cy="34" r="3.600" fill="#e8465a"/><circle cx="168" cy="38" r="3.600" fill="#e8465a"/><circle cx="161" cy="45" r="3.600" fill="#f0586c"/>
        <circle cx="153" cy="33" r="1" fill="#fff" opacity=".7"/>
      </g>
      <g class="pr"> <!-- cooking pot -->
        <ellipse cx="51" cy="74" rx="19" ry="4" fill="#000" opacity=".12"/>
        <rect x="35" y="56" width="32" height="18" rx="6" fill="#f3e5c9"/><rect x="35" y="62" width="32" height="4.500" fill="#c85468"/>
        <rect x="31" y="58" width="6" height="4" rx="2" fill="#d9c7a3"/><rect x="65" y="58" width="6" height="4" rx="2" fill="#d9c7a3"/>
        <path d="M37 56 q14-9 28 0z" fill="#e6d3b0"/><circle cx="51" cy="50.500" r="2.600" fill="#c85468"/>
        <path class="steam" d="M44 47 q-3-5 0-9"/><path class="steam b" d="M58 47 q-3-5 0-9"/>
      </g>
      <g fill="#f3e5c9" opacity=".9"><circle cx="92" cy="72" r="1.500"/><circle cx="116" cy="70" r="1.500"/></g>`,

    wardrobe: () => `
      <g class="pr"> <!-- clothes rack -->
        <path d="M33 74 v-33 M71 74 v-33 M30 41 h44" stroke="#c9a85c" stroke-width="3" stroke-linecap="round" fill="none"/>
        <path d="M45 41 v3 M45 44 l-6 4 h12z" stroke="#c9a85c" stroke-width="1.600" fill="none" stroke-linecap="round"/>
        <path d="M37 50 l5-3 h6 l5 3 -3 5 -3-2 v13 H42 V53 l-3 2z" fill="#f5e8ec"/>
        <path d="M60 42 v2 M54 52 q6-8 12 0 l3 17 H51z" fill="#f5c26b" stroke="none"/><path d="M56 52 h8" stroke="#d99a3a" stroke-width="1.600"/>
      </g>
      <g class="pr"> <!-- folded stack + hat box -->
        <rect x="136" y="64" width="30" height="8" rx="3" fill="#f5e8ec"/>
        <rect x="139" y="57" width="26" height="8" rx="3" fill="#f7a8c4"/>
        <rect x="137" y="50" width="28" height="8" rx="3" fill="#e9c46a"/>
        <path d="M151 40 l1.800 3.800 4 .6-3 2.800.8 4-3.600-2-3.600 2 .8-4-3-2.800 4-.6z" fill="#fff3c4"/>
      </g>
      <g fill="#c9d6f7"><circle cx="92" cy="73" r="1.500"/><circle cx="118" cy="72" r="1.500"/></g>`,

    bank: () => `
      <g class="pr"> <!-- little bank -->
        <path d="M133 44 l22-14 22 14z" fill="#e2b04a"/><rect x="136" y="44" width="38" height="4" fill="#f3e6cf"/>
        <g fill="#f3e6cf"><rect x="138" y="49" width="5" height="17" rx="1"/><rect x="147" y="49" width="5" height="17" rx="1"/><rect x="157" y="49" width="5" height="17" rx="1"/><rect x="166" y="49" width="5" height="17" rx="1"/></g>
        <rect x="132" y="66" width="46" height="6" rx="2" fill="#e8d9bb"/>
        <circle cx="155" cy="39" r="3" fill="#8c5a3a"/>
      </g>
      <g class="pr"> <!-- coins -->
        <g fill="#f5c542"><ellipse cx="52" cy="71" rx="14" ry="4.500"/><rect x="38" y="66" width="28" height="5"/><ellipse cx="52" cy="66" rx="14" ry="4.500" fill="#ffd96a"/>
        <rect x="38" y="60" width="28" height="5"/><ellipse cx="52" cy="60" rx="14" ry="4.500" fill="#ffd96a"/>
        <rect x="38" y="54" width="28" height="5"/><ellipse cx="52" cy="54" rx="14" ry="4.500" fill="#ffe388"/></g>
        <path d="M44 54 h16" stroke="#d99a1e" stroke-width="1.400" stroke-linecap="round"/>
        <circle cx="76" cy="68" r="6" fill="#f5c542"/><circle cx="76" cy="68" r="3.600" fill="none" stroke="#d99a1e" stroke-width="1.200"/>
      </g>
      <g fill="#f3e6cf" opacity=".8"><circle cx="96" cy="74" r="1.400"/><circle cx="118" cy="72" r="1.400"/></g>`,

    finance: () => `
      <g class="pr"> <!-- piggy bank -->
        <ellipse cx="50" cy="77" rx="20" ry="3.500" fill="#000" opacity=".1"/>
        <rect x="35" y="68" width="6" height="9" rx="2.500" fill="#ec7fa8"/><rect x="56" y="68" width="6" height="9" rx="2.500" fill="#ec7fa8"/>
        <ellipse cx="48" cy="62" rx="19" ry="13" fill="#ff8fb8"/>
        <ellipse cx="66" cy="64" rx="6" ry="5" fill="#ffb0cd"/><circle cx="64.500" cy="64" r="1" fill="#c25b84"/><circle cx="67.500" cy="64" r="1" fill="#c25b84"/>
        <path d="M36 52 l3-7 6 5z" fill="#ec7fa8"/><circle cx="56" cy="57" r="1.800" fill="#5c2a44"/>
        <rect x="42" y="51" width="11" height="2.600" rx="1.300" fill="#c25b84"/>
        <circle cx="47.500" cy="41" r="5.500" fill="#f5c542"/><circle cx="47.500" cy="41" r="3.200" fill="none" stroke="#d99a1e" stroke-width="1.100"/>
        <ellipse cx="42" cy="58" rx="4" ry="2.600" fill="#fff" opacity=".35"/>
      </g>
      <g class="pr"> <!-- coin sprout -->
        <path d="M156 72 q-1-14 1-24" stroke="#59b88a" stroke-width="3.600" stroke-linecap="round" fill="none"/>
        <path d="M157 62 q-12-2-14-12 q11 0 14 12z" fill="#a8e6cf"/><path d="M157 56 q12-2 14-12 q-11 0-14 12z" fill="#7fd5b0"/>
        <circle cx="158" cy="42" r="7" fill="#f5c542"/><circle cx="158" cy="42" r="4.200" fill="none" stroke="#d99a1e" stroke-width="1.300"/>
        <path d="M156 42 h4" stroke="#d99a1e" stroke-width="1.300" stroke-linecap="round"/>
      </g>
      <g fill="#ffe3ee"><circle cx="96" cy="74" r="1.500"/><circle cx="120" cy="72" r="1.500"/></g>`,
  };

  /* ---------- build the islands ---------- */
  function ripples() {
    const s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', '0 0 200 156'); s.setAttribute('class', 'ripples'); s.setAttribute('aria-hidden', 'true');
    s.innerHTML = '<ellipse cx="100" cy="142" rx="80" ry="9"/><ellipse cx="100" cy="142" rx="80" ry="9"/><ellipse cx="100" cy="142" rx="80" ry="9"/>';
    return s;
  }
  const SPARK_PHASES = [[14, 18, 4.5, 3.4, -1], [82, 30, 5.5, 4.2, -2.4], [58, 6, 4, 3.8, -.6]];

  function stickerNode(isle) {
    const box = document.createElement('div');
    box.className = 'sticker';
    const ph = () => {
      box.textContent = '';
      const s = document.createElementNS(NS, 'svg');
      s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', 'ph'); s.setAttribute('aria-hidden', 'true');
      s.innerHTML = '<path d="M12 1.500l2.600 7.300 7.400 2.700-7.400 2.700L12 21.500l-2.600-7.300L2 11.500l7.400-2.700z"/>';
      box.appendChild(s);
    };
    const custom = q.get(isle.key);
    const tries = custom ? [custom] : [`assets/${isle.key}.png`, `assets/${isle.key}.gif`, `assets/${isle.key}.webp`];
    let i = 0;
    const img = new Image();
    img.alt = ''; img.draggable = false;
    img.addEventListener('error', () => { i++; if (i < tries.length) img.src = tries[i]; else ph(); });
    img.src = tries[0];
    box.appendChild(img);
    return box;
  }

  function build() {
    const only = q.get('only');
    const list = ISLANDS.filter(i => !only || i.key === only);
    const grid = $('grid');
    if (list.length === 1) grid.classList.add('single');
    list.forEach((it, idx) => {
      const a = document.createElement('a');
      a.className = 'isle';
      a.href = q.get(it.key + 'Link') || it.url;
      a.target = '_blank'; a.rel = 'noopener';
      a.setAttribute('aria-label', 'Open ' + it.name);
      a.style.setProperty('--glow', it.glow);
      a.style.setProperty('--rot', it.rot + 'deg');
      a.style.setProperty('--dl', (-idx * 1.1).toFixed(1) + 's');
      if (list.length > 1) {
        a.style.setProperty('--dx', it.d[0]); a.style.setProperty('--dy', it.d[1]);
        a.style.setProperty('--nx', it.n[0]); a.style.setProperty('--ny', it.n[1]);
      }
      a.appendChild(ripples());

      const body = document.createElement('div');
      body.className = 'body';
      const sv = document.createElementNS(NS, 'svg');
      sv.setAttribute('viewBox', '0 0 200 156'); sv.setAttribute('aria-hidden', 'true');
      sv.innerHTML = baseIsland(it.key, it.p) + ART[it.key]();
      body.appendChild(sv);
      body.appendChild(stickerNode(it));

      const fx = document.createElement('div');
      fx.className = 'fx';
      SPARK_PHASES.forEach(([l, t, s, d, dl]) => {
        const i = document.createElement('i');
        i.style.cssText = `left:${l}%;top:${t + 24}%;--s:${s}px;--d:${d}s;--dl:${dl - idx * .3}s`;
        fx.appendChild(i);
      });
      body.appendChild(fx);
      a.appendChild(body);

      const tag = document.createElement('div');
      tag.className = 'tag'; tag.textContent = it.name;
      a.appendChild(tag);
      grid.appendChild(a);
    });
  }

  /* ============================================================
     Time-synced sky (same palette + curve as the sky banner)
     ============================================================ */
  const num = (k, d) => { const v = parseFloat(q.get(k)); return Number.isFinite(v) ? v : d; };
  const LAT = num('lat', 26.2183), LON = num('lon', 78.1828);
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = t => t * t * (3 - 2 * t);
  const mixC = (a, b, t) => a.map((v, i) => lerp(v, b[i], t));
  const rgb = c => c.map(v => Math.round(clamp(v, 0, 255))).join(' ');
  const pal = (top, mid, bot, seaTop, seaBot, cloud, cloudA, stars, aurora, shipB, shipS, spark) =>
    ({ top, mid, bot, seaTop, seaBot, cloud, cloudA, stars, aurora, shipB, shipS, spark });
  const P = {
    night:   pal([9,24,64],[14,52,112],[28,92,158],[20,72,150],[8,30,92],[70,110,165],.5,1,.9,.78,.9,[210,240,255]),
    dawn:    pal([70,76,140],[196,134,166],[252,190,150],[128,150,196],[52,80,142],[255,205,195],.8,.22,.15,.9,1,[255,235,220]),
    morning: pal([112,168,214],[176,212,226],[250,226,192],[92,170,204],[40,110,162],[255,244,236],.85,0,0,1,1,[255,255,255]),
    day:     pal([66,148,224],[122,190,236],[196,228,242],[62,152,208],[28,96,162],[255,255,255],.9,0,0,1,1,[255,255,255]),
    golden:  pal([96,150,204],[248,208,142],[255,172,112],[104,170,192],[40,108,150],[255,218,176],.85,0,0,.95,1.05,[255,240,210]),
    sunset:  pal([112,160,172],[250,192,110],[238,102,62],[66,172,172],[20,120,132],[206,92,92],.75,0,0,.8,1.1,[255,236,190]),
    dusk:    pal([42,52,112],[122,72,132],[232,112,102],[62,72,142],[22,42,102],[156,92,134],.65,.5,.35,.78,1,[255,225,215]),
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
    const t = q.get('time');
    if (!t) return null;
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
    set('--spark', rgb(k.spark)); set('--stars', k.stars.toFixed(3));
    set('--cloud', rgb(k.cloud)); set('--cloud-a', k.cloudA.toFixed(3));
  }
  async function fetchSun() {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 8000);
      const res = await fetch('https://api.open-meteo.com/v1/forecast?latitude=' + LAT + '&longitude=' + LON +
        '&daily=sunrise,sunset&timezone=auto&forecast_days=1', { signal: ctl.signal });
      clearTimeout(t);
      if (!res.ok) return;
      const data = await res.json();
      const parse = s => { const m = /T(\d\d):(\d\d)/.exec(s || ''); return m ? +m[1] + +m[2] / 60 : null; };
      const sr = parse(data.daily && data.daily.sunrise && data.daily.sunrise[0]);
      const ss = parse(data.daily && data.daily.sunset && data.daily.sunset[0]);
      if (sr && ss && ss > sr) { SR = sr; SS = ss; applySky(); }
    } catch { /* offline estimate is good enough */ }
  }

  /* ---------- scene decorations ---------- */
  function seeded(seed) {
    return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function decorate() {
    const r = seeded(4242);
    const deco = $('deco');
    const add = (cls, css) => { const i = document.createElement('i'); i.className = cls; i.style.cssText = css; deco.appendChild(i); };
    for (let i = 0; i < 26; i++) add('star', `left:${r() * 100}%;top:${r() * 15}%;--d:${2 + r() * 3}s;--dl:${-r() * 4}s`);
    for (let i = 0; i < 4; i++) add('cld', `top:${2 + r() * 11}%;left:0;--w:${90 + r() * 110}px;--h:${14 + r() * 14}px;--d:${70 + r() * 60}s;--dl:${-r() * 110}s`);
    for (let i = 0; i < 16; i++) add('glint', `left:${r() * 94}%;top:${24 + r() * 68}%;--w:${14 + r() * 26}px;--d:${3.5 + r() * 4}s;--dl:${-r() * 6}s`);
    for (let i = 0; i < 8; i++) add('spk', `left:${r() * 96}%;top:${r() * 90}%;--s:${4 + r() * 3}px;--d:${2.6 + r() * 2.6}s;--dl:${-r() * 4}s`);

    const sea = $('sea');
    const wave = (cls, amp, off) => {
      const sv = document.createElementNS(NS, 'svg');
      sv.setAttribute('viewBox', '0 0 800 60'); sv.setAttribute('preserveAspectRatio', 'none'); sv.setAttribute('class', cls);
      let d = `M0 ${30 + off}`;
      for (let x = 0; x < 800; x += 100) d += ` q25 ${-amp} 50 0 t50 0`;
      d += ' V60 H0 Z';
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', d);
      sv.appendChild(p);
      return sv;
    };
    sea.append(wave('w1', 14, 4), wave('w2', 11, 14));
  }

  build();
  decorate();
  applySky();
  if (PREVIEW == null) { setInterval(applySky, 30000); fetchSun(); }
})();
