/* workout: Studio registry entry */
(function () {
  const bars = '<div class="week" style="min-height:90px"><div class="wd"></div></div>';
  const tile = n => `<div class="tile"><span class="tname">${n}</span></div>`;
  NW.pages.workout = {
    id: 'workout', name: 'Workout', folder: 'workout', themeKey: 'workout-theme', css: ['style.css', 'zoro.css'],
    themes: [{ id: 'classic', name: 'Classic', note: 'Guava orchard (no pictures)' }, { id: 'zoro', name: 'Zoro', note: 'Swordsman green' }],
    roles: { a: { name: 'Accent', note: 'rose: buttons, labels, rings', h: 359.3, s: .93 }, b: { name: 'Secondary', note: 'guava yellow touches', h: 73.7, s: .37 }, w: { name: 'Wall', note: 'the deep green behind everything', h: 100, s: .56 } },
    cards: [
      { id: 'session', title: "Today's session", html: `<div class="head"><h2>Today's session</h2><span class="muted">2 of 5</span></div><div class="tiles"><div class="tgroup"><div class="trow">${tile('Bench press')}${tile('Rows')}</div></div></div>` },
      { id: 'week', title: 'This week', html: `<h2>This week</h2><p class="muted">Mon to Sun</p>` },
      { id: 'streak', title: 'Streak', html: `<h2>Streak</h2><p class="streak-main"><span class="stnum">6</span><span class="stunit"> days</span></p>` },
      { id: 'mosaic', title: 'Last five weeks', html: `<h2>Last five weeks</h2><div class="mosaic"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>` },
      { id: 'balance', title: 'Push, pull, legs', html: `<h2>Push, pull, legs</h2><p class="muted">Balanced this week</p>` },
      { id: 'fuel', title: 'Fuel check', html: `<h2>Fuel check</h2><p class="muted">On target today</p>` },
      { id: 'program', title: 'Your program', cls: 'prog', html: `<div class="prog-head"><div class="prog-title"><h2>Your program</h2><p class="muted">Push / Pull / Legs</p></div></div>` },
    ],
    art: { zoro: {
      session: ['/workout/zoro/plate-swords.webp', 50, 42, 1], week: ['/workout/zoro/plate-swords2.webp', 50, 40, 1], streak: ['/workout/zoro/plate-earring.webp', 50, 62, 1],
      mosaic: ['/workout/zoro/plate-chibi.webp', 50, 48, 1], balance: ['/workout/zoro/plate-water.webp', 50, 34, 1], fuel: ['/workout/zoro/plate-cherry.webp', 50, 44, 1], program: ['/workout/zoro/plate-swords2.webp', 50, 40, 1] } },
  };
})();
