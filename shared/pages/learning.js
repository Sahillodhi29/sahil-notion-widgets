/* learning: Studio registry entry */
(function () {
  const band = (t, s) => `<div class="band"><div><h2>${t}</h2><p class="sub">${s}</p></div></div><div class="body"><p class="dim">Sample</p></div>`;
  NW.pages.learning = {
    id: 'learning', name: 'Learning', folder: 'learning', themeKey: 'learning-theme', css: ['style.css', 'robin.css'],
    themes: [{ id: 'classic', name: 'Classic', note: 'Study lamp (no pictures)' }, { id: 'robin', name: 'Robin', note: 'Library violet' }],
    roles: { a: { name: 'Accent', note: 'gold: highlights and buttons', h: 42, s: 1 }, b: { name: 'Secondary', note: 'lavender touches', h: 268.5, s: .62 }, w: { name: 'Wall', note: 'the deep purple behind everything', h: 280, s: .6 } },
    cards: [['today', 'Today'], ['focus', 'Focus'], ['streak', 'Streak'], ['topics', 'Topics'], ['newtopic', 'New topic'], ['newtask', 'New task']].map(([id, t]) => ({ id, title: t, html: band(t, 'sample') })),
    art: { robin: {
      today: ['/learning/robin/wano.webp', 46, 36, 1], focus: ['/learning/robin/eyes.webp', 50, 26, 1], streak: ['/learning/robin/sky.webp', 50, 34, 1],
      topics: ['/learning/robin/hands.webp', 50, 58, 1], newtopic: ['/learning/robin/cheese.webp', 50, 26, 1], newtask: ['/learning/robin/wano.webp', 50, 62, 1] } },
  };
})();
