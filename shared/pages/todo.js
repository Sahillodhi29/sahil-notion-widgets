/* todo: Studio registry entry */
(function () {
  const ico = '<span class="gico" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 6.5l1.4 1.4L8 5.2M11 6.5h9"/></svg></span>';
  const head = (t, c) => `<div class="head"><div class="ttl">${ico}<h2>${t}</h2></div><span class="cnt">${c}</span></div><div class="pane"><p class="sub">Sample list</p></div>`;
  NW.pages.todo = {
    id: 'todo', name: 'To-do', folder: 'todo', themeKey: 'todo-theme', css: ['style.css', 'chopper.css'],
    themes: [{ id: 'classic', name: 'Classic', note: 'Lemon and raspberry (no pictures)' }, { id: 'chopper', name: 'Chopper', note: 'Cotton-candy pink' }],
    roles: { a: { name: 'Accent', note: 'lemon: highlights and buttons', h: 55, s: 1 }, b: { name: 'Secondary', note: 'raspberry: rails and tags', h: 334.9, s: .83 } },
    cards: [
      { id: 'general', title: 'General', html: head('General', '4') },
      { id: 'self', title: 'Self improvement', html: head('Self improvement', '2') },
      { id: 'week', title: 'Next 7 days', html: head('Next 7 days', '6') },
      { id: 'backlog', title: 'Backlog', html: head('Backlog', '3') },
      { id: 'add', title: 'Quick add', html: head('Quick add', '') },
    ],
    art: { chopper: {
      general: ['/todo/chopper/plate-hat.webp', 50, 22, 1], self: ['/todo/chopper/hero.webp', 50, 62, 1], week: ['/todo/chopper/plate-angry.webp', 50, 52, 1],
      backlog: ['/todo/chopper/nap.webp', 50, 46, 1], add: ['/todo/chopper/plate-sky.webp', 50, 54, 1] } },
  };
})();
