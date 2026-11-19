/* Notion Widgets: skin.  Loaded in <head> of every widget page (after theme.js):
     <script src="/shared/skin.js" data-page="mustdo"></script>
   Reads what the Studio saved in this browser (localStorage "nw-studio-v1", pictures in IndexedDB) and applies it
   as CSS variables, so a widget changes colour or picture without any edit to the page.  Does nothing when the
   Studio has never been used, and keeps working when storage is blocked.  Live: follows the Studio across
   embeds through storage events and a BroadcastChannel. */
(() => {
  const me = document.currentScript, PAGE = me && me.dataset.page;
  if (!PAGE) return;
  const KEY = 'nw-studio-v1', root = document.documentElement;
  const style = document.createElement('style'); style.id = 'nw-skin'; document.head.appendChild(style);
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } };
  const num = (v, d, lo, hi) => { v = Number(v); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
  const esc = s => String(s).replace(/["\\\n\r]/g, '');

  // pictures kept on this device live in IndexedDB; "idb:<id>" in the settings points at them
  const urls = new Map();
  const idbBlob = id => new Promise(res => {
    try {
      const open = indexedDB.open('nw-studio', 1);
      open.onupgradeneeded = () => open.result.createObjectStore('img');
      open.onerror = () => res(null);
      open.onsuccess = () => {
        try { const g = open.result.transaction('img').objectStore('img').get(id); g.onsuccess = () => res(g.result || null); g.onerror = () => res(null); } catch (e) { res(null); }
      };
    } catch (e) { res(null); }
  });
  const resolve = async src => {
    if (!src) return null;
    if (!src.startsWith('idb:')) return /^(https?:|data:image\/|\/)/.test(src) ? src : null;
    const id = src.slice(4); if (urls.has(id)) return urls.get(id);
    const b = await idbBlob(id); if (!b) return null;
    const u = URL.createObjectURL(b); urls.set(id, u); return u;
  };

  let run = 0;
  async function apply() {
    const me = ++run, st = read(), pg = st && st.pages && st.pages[PAGE];
    if (!pg) { style.textContent = ''; root.removeAttribute('data-skin'); root.removeAttribute('data-skin-wait'); return; }
    const art = pg.art || {}, keys = Object.keys(art);
    if (keys.some(k => String((art[k] || {}).src).startsWith('idb:'))) {   // hold the old picture back for a beat so it never flashes
      root.setAttribute('data-skin-wait', '1');
      style.textContent = 'html[data-skin-wait] .card > .head::before{opacity:0}';
      setTimeout(() => root.removeAttribute('data-skin-wait'), 1500);
    }
    let css = 'html[data-skin] .card > .head::before{transition:transform .9s cubic-bezier(.2,.7,.2,1),opacity .4s}';
    const p = pg.pal;
    if (p) {
      let v = '';
      for (const r of ['a', 'b', 'w']) if (p[r]) v += `--${r}-h:${num(p[r].h, 0, -720, 720)};--${r}-k:${num(p[r].k, 1, 0, 2)};`;
      if (v) css += `html[data-skin]{${v}}`;
    }
    for (const k of keys) {
      const a = art[k] || {}, [theme, card] = k.split('.');
      if (!theme || !card || !/^[\w-]+$/.test(theme) || !/^[\w-]+$/.test(card)) continue;
      const u = await resolve(a.src); if (me !== run) return;
      if (!u) continue;
      const flip = !!a.flip, z = num(a.zoom, 1, 1, 3);
      css += `html[data-skin][data-theme="${theme}"] .card[data-w="${card}"]>.head{--plate-art:url("${esc(u)}");--plate-pos:${num(a.x, 50, 0, 100)}% ${num(a.y, 50, 0, 100)}%;--plate-zoom:${z};`
        + `--plate-bright:${num(a.bright, .94, .4, 1.5)};--plate-flip:${flip ? -1 : 1};--mask-dir:${flip ? '270deg' : '90deg'};--plate-origin:${flip || z > 1 ? '50% 50%' : '80% 50%'}}`;
    }
    if (me !== run) return;
    root.setAttribute('data-skin', '1'); style.textContent = css; root.removeAttribute('data-skin-wait');
  }
  apply();
  addEventListener('storage', e => { if (e.key === KEY || e.key === null) apply(); });
  try { new BroadcastChannel('nw-studio').onmessage = () => apply(); } catch (e) { /* storage events still work */ }
})();
