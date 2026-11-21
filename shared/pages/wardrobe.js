/* wardrobe: Studio registry entry */
(function () {
  const head = (t, e) => `<div class="head"><div class="title"><h2>${t}</h2><p class="eyebrow">${e}</p></div></div>`;
  NW.pages.wardrobe = {
    id: 'wardrobe', name: 'Wardrobe', folder: 'wardrobe', themeKey: 'wardrobe-theme', css: ['style.css', 'sanji.css'],
    themes: [{ id: 'classic', name: 'Classic', note: 'Closet wine (no pictures)' }, { id: 'sanji', name: 'Sanji', note: 'Black suit and gold' }],
    roles: { a: { name: 'Accent', note: 'gold: buttons and labels', h: 48.1, s: .79 }, b: { name: 'Secondary', note: 'rose and wine highlights', h: 344.5, s: .72 }, w: { name: 'Wall', note: 'the dark wine behind everything', h: 339, s: .62 } },
    cards: [
      { id: 'cats', title: "What's in it", html: head("What's in it", '42 pieces') },
      { id: 'outfits', title: 'Outfits', html: head('Outfits', '12 outfits') },
      { id: 'wishlist', title: 'Wishlist', html: head('Wishlist', '3 things') },
    ],
    art: { sanji: {
      cats: ['/wardrobe/sanji/plate-cats.webp', 40, 66, 1], outfits: ['/wardrobe/sanji/plate-outfits.webp', 40, 57, 1], wishlist: ['/wardrobe/sanji/plate-wish.webp', 50, 20, 1] } },
  };
})();
