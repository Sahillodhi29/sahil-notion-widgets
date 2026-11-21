/* meal: Studio registry entry */
(function () {
  NW.pages.meal = {
    id: 'meal', name: 'Meal', folder: 'meal', themeKey: 'meal-theme', css: ['style.css', 'luffy.css'],
    themes: [{ id: 'classic', name: 'Classic', note: 'Plate and linen (no pictures)' }, { id: 'luffy', name: 'Luffy', note: 'Straw-hat blue' }],
    roles: { b: { name: 'Accent', note: 'reds: buttons, ring, labels', h: 3.7, s: .88 }, w: { name: 'Wall', note: 'the deep blue behind everything', h: 223.2, s: .66 } },
    cards: [
      { id: 'plate', title: "Today's meals", html: `<div class="head"><h2>Today's meals</h2><span class="muted">2 of 4</span></div><div class="meals"></div>` },
      { id: 'streak', title: 'Streak', html: `<h2>Streak</h2><p class="streak-main"><span class="stnum">6</span><span class="stunit"> days</span></p>` },
      { id: 'week', title: 'This week', html: `<h2>This week</h2><p class="muted">Mon to Sun</p>` },
      { id: 'heat', title: 'Last five weeks', html: `<h2>Last five weeks</h2><div class="heat"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>` },
      { id: 'skipped', title: 'What gets skipped', html: `<h2>What gets skipped</h2><p class="muted">Mostly snacks</p>` },
    ],
    art: { luffy: {
      plate: ['/meal/luffy/plate-hat.webp', 50, 40, 1], streak: ['/meal/luffy/plate-fist.webp', 50, 30, 1], week: ['/meal/luffy/plate-linen.webp', 50, 50, 1],
      heat: ['/meal/luffy/plate-meadow.webp', 50, 62, 1], skipped: ['/meal/luffy/plate-eyes.webp', 50, 60, 1] } },
  };
})();
