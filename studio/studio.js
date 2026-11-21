/* Studio: pictures + colours for every widget page, saved on this device.
   Settings  -> localStorage "nw-studio-v1"   (small JSON; read by /shared/skin.js on every widget)
   Pictures  -> IndexedDB "nw-studio"/"img"    (uploads are shrunk to 1600px WebP first)
   Everything a widget needs to know about a page lives in /shared/registry.js. */
(() => {
  'use strict';
  const NW = window.NW, KEY = 'nw-studio-v1', $ = id => document.getElementById(id);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const bc = (() => { try { return new BroadcastChannel('nw-studio'); } catch (e) { return null; } })();
  let state = load(), pageId = (NW.pages[new URLSearchParams(location.search).get('page')] ? new URLSearchParams(location.search).get('page') : Object.keys(NW.pages)[0]), themeId = null, cardId = null, storageOk = true;

  function load() { try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s && s.pages) return s; } catch (e) { /* none yet */ } return { v: 1, pages: {} }; }
  function commit() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { storageOk = false; toast('This browser blocked saving here. Open the Studio in its own tab and try again.'); }
    if (bc) bc.postMessage(Date.now());
  }
  const P = () => NW.pages[pageId];
  const pg = create => state.pages[pageId] || (create ? (state.pages[pageId] = {}) : null);

  let toastT;
  function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 3200); }

  /* ---------- pictures kept on this device ---------- */
  const idb = () => new Promise((res, rej) => {
    const o = indexedDB.open('nw-studio', 1);
    o.onupgradeneeded = () => o.result.createObjectStore('img');
    o.onsuccess = () => res(o.result); o.onerror = () => rej(o.error);
  });
  const idbRun = async (mode, fn) => { const db = await idb(); return new Promise((res, rej) => { const tx = db.transaction('img', mode), r = fn(tx.objectStore('img')); tx.oncomplete = () => res(r && r.result); tx.onerror = () => rej(tx.error); }); };
  const idbPut = (id, blob) => idbRun('readwrite', s => s.put(blob, id));
  const idbGet = id => idbRun('readonly', s => s.get(id));
  const idbKeys = () => idbRun('readonly', s => s.getAllKeys());
  const idbDel = id => idbRun('readwrite', s => s.delete(id));
  const urls = new Map();
  async function urlFor(src) {
    if (!src) return '';
    if (!src.startsWith('idb:')) return src;
    const id = src.slice(4); if (urls.has(id)) return urls.get(id);
    const b = await idbGet(id).catch(() => null); if (!b) return '';
    const u = URL.createObjectURL(b); urls.set(id, u); return u;
  }
  async function gc() {   // forget pictures nothing points at any more
    try {
      const used = new Set();
      Object.values(state.pages).forEach(p => Object.values(p.art || {}).forEach(a => { if (a && String(a.src).startsWith('idb:')) used.add(a.src.slice(4)); }));
      (await idbKeys()).forEach(k => { if (!used.has(k)) { idbDel(k); urls.delete(k); } });
    } catch (e) { /* not important */ }
  }
  async function shrink(file) {
    const bmp = await createImageBitmap(file), sc = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * sc); c.height = Math.round(bmp.height * sc);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    let b = await new Promise(r => c.toBlob(r, 'image/webp', .86));
    if (!b || b.type !== 'image/webp') b = await new Promise(r => c.toBlob(r, 'image/jpeg', .88));
    return b;
  }

  /* ---------- colour maths ---------- */
  function hexToHsl(hex) {
    const n = parseInt(hex.slice(1), 16), r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
    let h = 0, s = 0;
    if (d) { s = d / (1 - Math.abs(2 * l - 1)); h = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; }
    return { h, s, l };
  }
  function hslToHex(h, s, l) {
    const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l), f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return '#' + [f(0), f(8), f(4)].map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
  }
  const roleVal = (page, role, hex) => { const { h, s } = hexToHsl(hex); return { hex, h: Math.round(h * 10) / 10, k: Math.round(clamp(s / page.roles[role].s, .15, 1.6) * 100) / 100 }; };
  const defaultHex = (page, role) => hslToHex(page.roles[role].h, page.roles[role].s, role === 'w' ? .14 : role === 'a' ? .62 : .45);
  const palHexes = (page, p) => ({ a: p && p.a ? p.a.hex : defaultHex(page, 'a'), b: p && p.b ? p.b.hex : defaultHex(page, 'b'), w: p && p.w ? p.w.hex : defaultHex(page, 'w') });
  function setPal(pid, hexes) {
    const page = NW.pages[pid], p = state.pages[pid] || (state.pages[pid] = {});
    p.pal = { a: roleVal(page, 'a', hexes.a), b: roleVal(page, 'b', hexes.b), w: roleVal(page, 'w', hexes.w) };
  }

  /* ---------- page + theme tabs ---------- */
  function renderPages() {
    const el = $('pages'); el.innerHTML = '';
    Object.values(NW.pages).forEach(p => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'tab'; b.textContent = p.name; b.setAttribute('aria-pressed', String(p.id === pageId));
      b.onclick = () => { pageId = p.id; themeId = null; cardId = null; renderAll(); };
      el.appendChild(b);
    });
  }
  function liveTheme() { try { return localStorage.getItem(P().themeKey) || P().themes[0].id; } catch (e) { return P().themes[0].id; } }
  function renderThemes() {
    const el = $('themes'); el.innerHTML = '';
    if (!themeId) themeId = liveTheme(); if (!P().themes.some(t => t.id === themeId)) themeId = P().themes[0].id;
    const live = liveTheme();
    P().themes.forEach(t => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'tab'; b.setAttribute('aria-pressed', String(t.id === themeId));
      b.innerHTML = `${t.name}${t.id === live ? '<span class="live" title="Showing on your widgets now"></span>' : ''}`;
      b.onclick = () => { themeId = t.id; cardId = null; renderThemes(); renderGrid(); };
      el.appendChild(b);
    });
    if (live !== themeId) {
      const u = document.createElement('button'); u.type = 'button'; u.className = 'btn ghost small'; u.textContent = `Show ${P().themes.find(t => t.id === themeId).name} on my widgets`;
      u.onclick = () => { try { localStorage.setItem(P().themeKey, themeId); toast(`${P().name} now shows ${themeId}. Open widgets pick it up when you click into them.`); } catch (e) { toast('Could not switch the theme from here.'); } renderThemes(); };
      el.appendChild(u);
    }
  }

  /* ---------- colours ---------- */
  function renderColours() {
    const page = P(), p = (pg() || {}).pal, h = palHexes(page, p);
    const pr = $('presets'); pr.innerHTML = '';
    NW.presets.forEach(s => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'preset';
      b.setAttribute('aria-pressed', String(!!p && p.a.hex.toLowerCase() === s.a.toLowerCase() && p.b.hex.toLowerCase() === s.b.toLowerCase() && p.w.hex.toLowerCase() === s.w.toLowerCase()));
      b.innerHTML = `<span class="dots"><i style="background:${s.w}"></i><i style="background:${s.b}"></i><i style="background:${s.a}"></i></span>${s.name}`;
      b.onclick = () => { setPal(pageId, s); commit(); renderColours(); toast(`${s.name} on ${page.name}`); };
      pr.appendChild(b);
    });
    const rl = $('roles'); rl.innerHTML = '';
    ['a', 'b', 'w'].forEach(r => {
      const d = document.createElement('label'); d.className = 'role';
      d.innerHTML = `<input type="color" value="${h[r]}" aria-label="${page.roles[r].name} colour"><div><b>${page.roles[r].name}</b><span>${page.roles[r].note}</span></div>`;
      d.querySelector('input').oninput = e => { const cur = palHexes(page, (pg(true) || {}).pal); cur[r] = e.target.value; setPal(pageId, cur); commit(); markPresets(); };
      rl.appendChild(d);
    });
    $('palReset').hidden = !p; $('palAll').hidden = !p && false;
  }
  function markPresets() { const p = (pg() || {}).pal; document.querySelectorAll('.preset').forEach((b, i) => { const s = NW.presets[i]; b.setAttribute('aria-pressed', String(!!p && p.a.hex.toLowerCase() === s.a.toLowerCase() && p.b.hex.toLowerCase() === s.b.toLowerCase() && p.w.hex.toLowerCase() === s.w.toLowerCase())); }); $('palReset').hidden = !p; }
  $('palReset').onclick = () => { const p = pg(); if (p) delete p.pal; commit(); renderColours(); toast('Back to the page\'s own colours'); };
  $('palAll').onclick = () => {
    const h = palHexes(P(), (pg() || {}).pal); Object.keys(NW.pages).forEach(id => setPal(id, h)); commit(); toast('These colours are now on every page'); renderColours();
  };

  /* ---------- pictures ---------- */
  const artKey = () => `${themeId}.${cardId}`;
  const getArt = () => { const p = pg(); return p && p.art && p.art[artKey()] || null; };
  const artDefault = () => { const d = P().art[themeId][cardId]; return { src: d[0], x: d[1], y: d[2], zoom: 1, bright: d[3] != null ? d[3] : .94, flip: false }; };
  const curArt = () => getArt() || artDefault();
  function editArt(mut) {
    const p = pg(true); p.art = p.art || {}; const a = p.art[artKey()] || artDefault();
    mut(a); p.art[artKey()] = a; commit(); syncControls(); markTiles();
  }
  function renderGrid() {
    const g = $('grid'); park(); g.innerHTML = '';
    P().cards.forEach(c => {
      const t = document.createElement('div'); t.className = 'tile'; t.dataset.card = c.id;
      t.innerHTML = `<div class="pv"><div class="frame"><iframe loading="lazy" tabindex="-1" title="${c.title}" src="/shared/preview.html?page=${pageId}&theme=${themeId}&card=${c.id}"></iframe><div class="cover"></div></div>
        <div class="cap"><span><b>${c.title}</b></span><span class="tag"></span></div></div>`;
      const cover = t.querySelector('.cover'); let drag = null;
      cover.addEventListener('pointerdown', e => {
        if (cardId !== c.id) { select(c.id); return; }
        const a = curArt(); drag = { x: e.clientX, y: e.clientY, a0: a.x, b0: a.y, flip: a.flip };
        cover.setPointerCapture(e.pointerId);
      });
      cover.addEventListener('pointermove', e => {
        if (!drag) return; const r = cover.getBoundingClientRect(), s = drag.flip ? 1 : -1;
        editArt(a => { a.x = Math.round(clamp(drag.a0 + s * (e.clientX - drag.x) / r.width * 120, 0, 100)); a.y = Math.round(clamp(drag.b0 - (e.clientY - drag.y) / r.height * 150, 0, 100)); });
      });
      const end = () => { drag = null; }; cover.addEventListener('pointerup', end); cover.addEventListener('pointercancel', end);
      cover.addEventListener('wheel', e => { if (cardId !== c.id) return; e.preventDefault(); editArt(a => { a.zoom = Math.round(clamp((a.zoom || 1) * (e.deltaY < 0 ? 1.06 : .943), .5, 2.5) * 100) / 100; }); }, { passive: false });
      g.appendChild(t);
    });
    markTiles();
  }
  function markTiles() {
    const p = pg();
    document.querySelectorAll('.tile').forEach(t => {
      t.classList.toggle('on', t.dataset.card === cardId);
      const custom = p && p.art && p.art[`${themeId}.${t.dataset.card}`];
      t.querySelector('.tag').textContent = custom ? 'Your picture' : (t.dataset.card === cardId ? '' : 'Click to change');
    });
  }
  const park = () => { const ed = $('editor'); ed.hidden = true; $('hPics').closest('.panel').appendChild(ed); };   // keep the editor out of tiles that are about to be rebuilt
  function select(id) {
    cardId = id; markTiles(); renderEditor();
    const t = document.querySelector(`.tile[data-card="${id}"]`); if (t) { t.appendChild($('editor')); t.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
  }
  function renderEditor() {
    const ed = $('editor'); ed.hidden = !cardId; if (!cardId) { park(); return; }
    const c = P().cards.find(x => x.id === cardId), th = P().themes.find(x => x.id === themeId);
    $('edKicker').textContent = `${P().name} · ${th.name}`; $('edTitle').textContent = c.title;
    $('linkNote').textContent = ''; $('linkNote').className = 'hint'; $('linkIn').value = '';
    syncControls();
  }
  async function syncControls() {
    if (!cardId) return; const a = curArt();
    $('cX').value = a.x; $('cY').value = a.y; $('cZ').value = a.zoom || 1; $('cB').value = a.bright; $('cF').checked = !!a.flip;
    $('oX').textContent = Math.round(a.x) + '%'; $('oY').textContent = Math.round(a.y) + '%'; $('oZ').textContent = (a.zoom || 1).toFixed(2) + '×'; $('oB').textContent = Math.round(a.bright * 100) + '%';
    $('edReset').hidden = !getArt();
    const u = await urlFor(a.src); if (cardId) $('edThumb').src = u;
  }
  [['cX', 'x', 1], ['cY', 'y', 1], ['cZ', 'zoom', 1], ['cB', 'bright', 1]].forEach(([id, k]) => { $(id).oninput = e => editArt(a => { a[k] = Number(e.target.value); }); });
  $('cF').onchange = e => editArt(a => { a.flip = e.target.checked; });
  $('edDone').onclick = () => { cardId = null; park(); markTiles(); };
  $('edReset').onclick = () => { const p = pg(); if (p && p.art) delete p.art[artKey()]; commit(); gc(); syncControls(); markTiles(); toast('Back to the original picture'); };

  async function useFile(file) {
    if (!file || !/^image\//.test(file.type)) { toast('That is not a picture file.'); return; }
    try {
      const blob = await shrink(file), id = 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      await idbPut(id, blob);
      editArt(a => { a.src = 'idb:' + id; a.x = 50; a.y = 40; a.zoom = 1; a.flip = false; });
      gc(); toast('Picture added. Drag it on the preview to line it up.');
    } catch (e) { toast('Could not read that picture. Try a JPG, PNG or WebP.'); }
  }
  $('upFile').onchange = e => { useFile(e.target.files[0]); e.target.value = ''; };
  const drop = $('drop');
  ['dragenter', 'dragover'].forEach(n => drop.addEventListener(n, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(n => drop.addEventListener(n, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => useFile(e.dataTransfer.files[0]));
  $('linkForm').onsubmit = e => {
    e.preventDefault(); const u = $('linkIn').value.trim(), note = $('linkNote');
    const fail = m => { note.textContent = m; note.className = 'hint err'; };
    if (!/^https?:\/\/\S+$/i.test(u)) return fail('Paste a full link that starts with https://');
    note.className = 'hint'; note.textContent = 'Checking the link…';
    const im = new Image();
    im.onload = () => {
      editArt(a => { a.src = u; a.x = 50; a.y = 40; a.zoom = 1; a.flip = false; }); gc();
      const temp = /(secure\.notion-static|prod-files-secure|notion\.so\/image)/.test(u);
      note.textContent = temp ? 'Added. Notion image links expire after a while: upload the file instead if you want it to last.' : 'Added.';
    };
    im.onerror = () => fail('That link did not load as a picture. Some sites block this: try uploading the file instead.');
    im.src = u;
  };

  /* ---------- export / import ---------- */
  const blobToData = b => new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); });
  $('exportBtn').onclick = async () => {
    try {
      const images = {};
      for (const p of Object.values(state.pages)) for (const a of Object.values(p.art || {})) if (a && String(a.src).startsWith('idb:')) { const id = a.src.slice(4), b = await idbGet(id); if (b) images[id] = await blobToData(b); }
      const blob = new Blob([JSON.stringify({ app: 'notion-widgets-studio', v: 1, settings: state, images })], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'my-widget-look.json'; document.body.appendChild(a); a.click(); a.remove();
      toast('Saved my-widget-look.json. Import it on another device to get the same look.');
    } catch (e) { toast('Could not export from here.'); }
  };
  $('importFile').onchange = async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try {
      const j = JSON.parse(await f.text());
      if (j.app !== 'notion-widgets-studio' || !j.settings || !j.settings.pages) throw new Error('shape');
      for (const [id, d] of Object.entries(j.images || {})) await idbPut(id, await (await fetch(d)).blob());
      Object.keys(j.settings.pages).forEach(k => { if (NW.pages[k]) state.pages[k] = j.settings.pages[k]; });
      commit(); renderAll(); toast('Look imported.');
    } catch (err) { toast('That file is not a Studio export.'); }
  };

  /* look: cute "Harbour" (sea and sky that follow your clock) or plain "Graphite" */
  const LOOKS = { harbour: 'Harbour', graphite: 'Graphite' };
  const setLook = l => { document.body.dataset.look = l; $('lookBtn').textContent = 'Look: ' + LOOKS[l]; try { localStorage.setItem('nw-studio-look', l); } catch (e) { /* fine */ } };
  try { const l = localStorage.getItem('nw-studio-look'); if (LOOKS[l]) setLook(l); } catch (e) { /* default */ }
  $('lookBtn').onclick = () => setLook(document.body.dataset.look === 'harbour' ? 'graphite' : 'harbour');
  if (window.NWSky) NWSky.mount(document.querySelector('.bar'), { shipX: 54, shipH: 70, clouds: 2 });

  function renderAll() { renderPages(); renderColours(); renderThemes(); renderGrid(); renderEditor(); }
  try { localStorage.setItem('nw-probe', '1'); localStorage.removeItem('nw-probe'); } catch (e) { storageOk = false; toast('This browser is blocking saved settings for embedded pages.'); }
  addEventListener('storage', e => { if (e.key === KEY) { state = load(); markTiles(); } });
  renderAll();
})();
