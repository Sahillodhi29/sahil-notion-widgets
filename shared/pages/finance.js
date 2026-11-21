/* finance: Studio registry entry */
(function () {
  const head = (t, s) => `<div class="head"><h2>${t}</h2><span class="muted">${s}</span></div>`;
  const C = [['ledger', 'The ledger'], ['trend', 'Spending trend'], ['term', 'Term of the day'], ['wall', 'Word wall'], ['path', 'Money roadmap'], ['future', 'Future me'], ['goals', 'Goals']];
  NW.pages.finance = {
    id: 'finance', name: 'Finance', folder: 'finance', themeKey: 'finance-theme', css: ['style.css', 'nami.css'],
    themes: [{ id: 'classic', name: 'Classic', note: 'Ledger gold (no pictures)' }, { id: 'nami', name: 'Nami', note: 'Orange and sea' }],
    roles: { b: { name: 'Accent', note: 'orange: numbers, buttons, bars', h: 21.9, s: .97 }, w: { name: 'Wall', note: 'the deep sea behind everything', h: 205.8, s: .53 } },
    cards: C.map(([id, t]) => ({ id, title: t, html: head(t, 'sample') })),
    art: { nami: Object.fromEntries(C.map(([id]) => [id, [`/finance/nami/band-${id}.webp?v=1`, 100, 50, 1]])) },
  };
})();
