/* Notion Widgets: the registry.  One entry per widget page, read by the Studio and by shared/preview.html.
   To bring a new page into the Studio: add an entry here (folder, themes, cards, default art, sample markup),
   add <script src="/shared/skin.js" data-page="<id>"></script> to that page's <head> after theme.js, and make
   its style.css use the colour roles and plate hooks (see STUDIO.md).  Nothing else needs to change. */
(function () {
  const L = (n) => `<li class="item${n[0] ? ' done' : ''}"><span class="tick"></span><span class="name">${n[1]}</span></li>`;
  const mustdoBody = {
    check: `<div class="meter"><i style="width:60%"></i></div><ul class="list">${L([1,'Read 20 pages'])}${L([0,'Walk 8,000 steps'])}</ul>`,
    week: `<div class="week" style="min-height:90px"><div class="bcol full"><div class="bbar"><i style="height:100%"></i></div><span class="blab">Tue</span></div><div class="bcol"><div class="bbar"><i style="height:70%"></i></div><span class="blab">Wed</span></div><div class="bcol"><div class="bbar"><i style="height:35%"></i></div><span class="blab">Thu</span></div><div class="bcol today full"><div class="bbar"><i style="height:100%"></i></div><span class="blab">Fri</span></div></div>`,
    month: `<div class="heat" style="max-width:220px"><i class="l4"></i><i class="l3"></i><i class="l2"></i><i class="l0"></i><i class="l1"></i><i class="l4"></i><i class="l4 today"></i></div>`,
    manage: `<div class="adder"><input placeholder="Read 20 pages…"><button class="btn" type="button">Add</button></div><ul class="list edit">${L([0,'Stretch 10 minutes'])}</ul>`,
  };
  const row = (a, b) => `<div class="stockrow"><div class="rn">${a}<small>${b}</small></div><button class="want" type="button">Need restocking</button></div>`;
  const chips = `<div class="chips"><button class="chip" type="button" aria-pressed="true">Groceries</button><button class="chip" type="button">Cleaning</button></div>`;
  const stockBody = {
    add: `<label class="field"><span class="lbl">What is it?</span><input placeholder="Sweet Potato"></label><button class="btn" type="button">Add to stock</button>`,
    shelf: `${chips}<div class="stocklist">${row('Eggs <i>1 tray</i>', 'every month · in 12 days')}</div>`,
    restock: `${chips}<div class="stocklist"><div class="stockrow"><div class="rn">Dish soap<small>every 2 months</small></div><button class="done" type="button">Restocked!</button></div></div>`,
    cost: `<p class="hero"><span class="num">₹2,390</span></p><div class="bars"><div class="cbar"><div class="cname">Groceries</div><div class="ctrack"><i style="width:88%"></i></div><div class="cval">₹2,125</div></div><div class="cbar"><div class="cname">Cleaning</div><div class="ctrack"><i style="width:22%"></i></div><div class="cval">₹181</div></div></div>`,
  };
  window.NW = {
    version: 1,
    /* colour presets: hex for the three roles.  The Studio keeps each page's own light/dark tones and only moves hue + saturation. */
    presets: [
      { id: 'crimson-gold',   name: 'Crimson & Gold',   a: '#D9B26A', b: '#C22B27', w: '#2A0C10' },
      { id: 'orange-blue',    name: 'Orange & Off-blue', a: '#F28B30', b: '#3B5B8A', w: '#16304C' },
      { id: 'emerald-brass',  name: 'Emerald & Brass',  a: '#D6B25E', b: '#2E8B6A', w: '#0E2A22' },
      { id: 'violet-rose',    name: 'Violet & Rose',    a: '#E58FB4', b: '#7A56C8', w: '#1C1233' },
      { id: 'ocean-coral',    name: 'Ocean & Coral',    a: '#FF7F6B', b: '#2A7FA8', w: '#0C2233' },
      { id: 'slate',          name: 'Slate',            a: '#C9CED6', b: '#7C8798', w: '#161A21' },
      { id: 'berry-fizz',     name: 'Berry Fizz',       a: '#E0B7EB', b: '#C366A9', w: '#A71842' },
      { id: 'magenta-lemon',  name: 'Magenta & Lemon',  a: '#EBFF72', b: '#DE6DC5', w: '#75CCAC' },
      { id: 'rose-citron',    name: 'Rose & Citron',    a: '#C9C769', b: '#ED809D', w: '#461312' },
      { id: 'crimson-olive',  name: 'Crimson & Olive',  a: '#88B04C', b: '#9B1B30', w: '#0F4C81' },
    ],
    pages: {
      mustdo: {
        id: 'mustdo', name: "Must Do's", folder: 'mustdo', themeKey: 'mustdo-theme',
        css: ['style.css', 'shanks.css'], today: 'MON, 16 NOV',
        themes: [{ id: 'classic', name: 'Classic', note: 'Crimson & dark gold' }, { id: 'shanks', name: 'Shanks', note: 'Warmer red, brighter brass' }],
        roles: { a: { name: 'Accent', note: 'done tiles, buttons, labels', h: 40, s: .62 },
                 b: { name: 'Secondary', note: 'bars, today, streak', h: 2, s: .66 },
                 w: { name: 'Wall', note: 'the dark card behind everything', h: 355, s: .55 } },
        cards: [
          { id: 'check',  title: "Must do's",       sub: 'MON, 16 NOV',   side: '<span class="count">3 / 5</span>',    body: mustdoBody.check },
          { id: 'week',   title: 'This week',       sub: 'LAST 7 DAYS · 6 LOGGED', side: '<span class="num">80%</span>', body: mustdoBody.week },
          { id: 'month',  title: 'Last 30 days',    sub: '13 OCT – 16 NOV', side: '<span class="count">2-day streak</span>', body: mustdoBody.month },
          { id: 'manage', title: "Your must do's",  sub: '5 ON THE LIST', side: '', body: mustdoBody.manage },
        ],
        art: {
          classic: { check: ['/mustdo/art/7.webp', 50, 26], week: ['/mustdo/art/3.webp', 50, 24], month: ['/mustdo/art/2.webp', 50, 36], manage: ['/mustdo/art/1.webp', 62, 28, .82] },
          shanks:  { check: ['/mustdo/art/5.webp', 50, 0],  week: ['/mustdo/art/6.webp', 58, 50], month: ['/mustdo/art/4.webp', 50, 40], manage: ['/mustdo/art/7.webp', 82, 30] },
        },
      },
      stock: {
        id: 'stock', name: 'Stock & Resources', folder: 'stock', themeKey: 'stock-theme',
        css: ['style.css', 'ace.css'], today: 'MONDAY 16 NOV',
        themes: [{ id: 'classic', name: 'Classic', note: 'Night blue & orange' }, { id: 'ace', name: 'Ace', note: 'After dark, ice-blue' }],
        roles: { a: { name: 'Accent', note: 'due, buttons, labels', h: 28, s: .88 },
                 b: { name: 'Secondary', note: 'rows, bars, rails', h: 214, s: .40 },
                 w: { name: 'Wall', note: 'the deep card behind everything', h: 210, s: .55 } },
        cards: [
          { id: 'add',     title: 'New stock item',   sub: '', side: '<span class="ace-print" aria-hidden="true"></span>', body: stockBody.add },
          { id: 'shelf',   title: 'The shelf',        sub: '2 ITEMS', side: '', body: stockBody.shelf },
          { id: 'restock', title: 'Restocking area',  sub: '1 WAITING', side: '', body: stockBody.restock },
          { id: 'cost',    title: 'Monthly run rate', sub: 'MONDAY 16 NOV', side: '', body: stockBody.cost },
        ],
        art: {
          classic: { add: ['/stock/art/1.webp', 50, 24], shelf: ['/stock/art/4.webp', 50, 34], restock: ['/stock/art/6.webp', 50, 8],  cost: ['/stock/art/5.webp', 50, 70] },
          ace:     { add: ['/stock/art/2.webp', 50, 44], shelf: ['/stock/art/3.webp', 50, 34], restock: ['/stock/art/1.webp', 50, 30], cost: ['/stock/art/7.webp', 45, 50] },
        },
      },
    },
  };
})();
