'use strict';
/* Wardrobe widgets: one page, many pieces.
   /wardrobe/index.html?key=KEY&w=outfit      -> just that widget
   w = add | wish | outfit | outfits | closet | cats | wishlist | all   (comma-separate to combine)
   (w=wear still works and opens the outfit widget)
   Optional: &cur=$ to change the currency symbol (default ₹), &bg=transparent or &bg=HEX */
(() => {
  const API = '/api/wardrobe';
  const API_PHOTO = '/api/wardrobe-photo';
  const params = new URLSearchParams(location.search);
  const KEY = params.get('key') || '';
  const CUR = params.get('cur') || '\u20B9';
  const NEEDS = {
    add: ['items', 'schema'], wish: ['wishes', 'schema'], outfit: ['items', 'outfits'], outfits: ['items', 'outfits'],
    closet: ['items'], cats: ['items'], wishlist: ['wishes', 'schema'],
  };
  const ALIAS = { wear: 'outfit' };
  const keyQ = sep => (KEY ? `${sep}key=${encodeURIComponent(KEY)}` : '');
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- background: Notion dark by default; &bg=transparent or &bg=HEX to change ---------- */
  const bgParam = params.get('bg');
  if (bgParam) {
    const v = bgParam === 'transparent' ? 'transparent' : /^[0-9a-f]{3,8}$/i.test(bgParam) ? '#' + bgParam : null;
    if (v) { document.documentElement.style.background = v; document.body.style.background = v; }
  }

  /* ---------- which widgets? ---------- */
  const asked = (params.get('w') || 'all').toLowerCase().split(',').map(s => s.trim()).filter(Boolean).map(w => ALIAS[w] || w);
  const wantAll = asked.includes('all');
  const shown = wantAll ? Object.keys(NEEDS) : [...new Set(asked.filter(w => NEEDS[w]))];
  const unknown = asked.filter(w => w !== 'all' && !NEEDS[w]);
  document.querySelectorAll('.card[data-w]').forEach(c => { c.hidden = !shown.includes(c.dataset.w); });
  const FORM_ONLY = shown.length === 1 && (shown[0] === 'add' || shown[0] === 'wish');
  const MULTI = shown.length !== 1 || FORM_ONLY;       // a lone form still starts as the slim "+" card
  document.body.dataset.mode = MULTI ? 'multi' : 'single';
  if (shown.length === 1) $('stage').classList.add('solo');
  if (unknown.length || !shown.length) {
    const b = $('bad'); b.hidden = false;
    b.innerHTML = '<h2>Unknown widget</h2><p class="muted note">Use w=add, wish, outfit, outfits, closet, cats, wishlist or all.</p>';
  }
  const has = w => shown.includes(w);
  const need = [...new Set(shown.flatMap(w => NEEDS[w]))];

  const state = { today: null, items: [], outfits: [], wishes: [], schema: null, err: {}, pending: 0, loadedAt: 0, gaugeDone: false };
  const ui = { sort: 'recent', by: 'cat', ask: null, catAnim: true };
  const ob = { open: false, sel: [], cat: 'All', type: '', q: '', name: '' };
  const forms = {};
  const undoMap = new Map();

  /* ---------- helpers ---------- */
  const GONE = ['Donated', 'Sold', 'Retired', 'Missing/Lost', 'Wishlist', 'Gift'];      // pieces no longer in the closet
  const isActive = i => !i.status.some(s => GONE.includes(s));
  const dayNum = d => Math.floor(Date.parse(d + 'T00:00:00Z') / 864e5);
  const since = d => (d && state.today ? dayNum(state.today) - dayNum(d) : Infinity);
  const ago = d => {
    if (!d) return 'never worn';
    const n = since(d);
    if (n <= 0) return 'today';
    if (n === 1) return 'yesterday';
    if (n < 14) return `${n} days ago`;
    if (n < 60) return `${Math.round(n / 7)} weeks ago`;
    return `${Math.round(n / 30)} months ago`;
  };
  const longDate = d => { try { return new Date(Date.parse(d + 'T00:00:00Z')).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }); } catch (e) { return d; } };
  const money = n => CUR + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  const initial = s => (String(s).trim()[0] || '?').toUpperCase();
  const errText = e => e.message + (e.hint ? ' ' + e.hint : '');
  const plural = (n, one, many) => `${n} ${n === 1 ? one : (many || one + 's')}`;
  const CHECK = '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 6.3l2.4 2.4 4.6-5"/></svg>';
  const PLUS = '<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M7 1.5v11M1.5 7h11"/></svg>';
  const HEART = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 17s-6.5-4.1-6.5-8.6A3.6 3.6 0 0 1 10 6.2a3.6 3.6 0 0 1 6.5 2.2C16.5 12.9 10 17 10 17z"/></svg>';
  const CAMERA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.2l1-1.5h6.6l1 1.5h1.2A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z"/><circle cx="12" cy="12.5" r="3.4"/></svg>';
  const ICONS = {
    add: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 4L4 7l2 3.5L8 9.6V20h8V9.6l2 .9L20 7l-4.5-3a3.6 3.6 0 0 1-7 0z"/></svg>',
    wish: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-8-4.9-8-10.7A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 8 2.6c0 5.8-8 10.7-8 10.7z"/></svg>',
    outfit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6.5a2 2 0 1 0-2-2M12 6.5v2L3.5 14.6A1.6 1.6 0 0 0 4.4 17.5h15.2a1.6 1.6 0 0 0 .9-2.9z"/></svg>',
  };

  /* Garment colours are data, not theme: a "Navy" chip should look navy. */
  const COLORS = {
    'Animal print': 'animal', 'Beige': '#D9C7A7', 'Black': '#141414', 'Blue': '#2E62D1', 'Blush': '#F1C9C4', 'Brick': '#A5442F',
    'Bronze': '#A9713A', 'Brown': '#6B4429', 'Burgundy': '#6B1428', 'Camel': '#C1904E', 'Caramel': '#B97A3C', 'Champagne': '#EBD9B4',
    'Charcoal': '#3A3D42', 'Chocolate': '#4A2C1F', 'Clear': 'clear', 'Cognac': '#9A4E1C', 'Copper': '#B8663A', 'Coral': '#F2705E',
    'Cream': '#F3EAD3', 'Denim blue': '#4D6E96', 'Dusty rose': '#C69A9C', 'Emerald': '#12875A', 'Espresso': '#2E1D17', 'Fuchsia': '#D1368F',
    'Gold': '#CFA52F', 'Green': '#2F8F46', 'Greige': '#B7AEA2', 'Grey': '#8A8D91', 'Ivory': '#F6F1E0', 'Lavender': '#B9A3DB',
    'Light blue': '#A9CBEA', 'Lilac': '#C7A8D6', 'Mauve': '#A67B8E', 'Metallic': 'metal', 'Mint': '#A8E0C5', 'Moss': '#6A7B3A',
    'Multicolor': 'multi', 'Mustard': '#D1A21C', 'Navy': '#1C2A55', 'Neutral mixed': 'neutral', 'Oatmeal': '#D3C4A8', 'Olive': '#6F7132',
    'Orange': '#E8782A', 'Patterned mixed': 'multi', 'Peach': '#F6BFA0', 'Pink': '#EF8FB5', 'Plum': '#5E2A55', 'Powder blue': '#B7D0E6',
    'Purple': '#6C3FA0', 'Red': '#C42B2B', 'Rust': '#A8481F', 'Sage': '#9DB08C', 'Seafoam': '#8FD3BE', 'Silver': '#C0C3C7',
    'Soft black': '#26262A', 'Tan': '#C9A36E', 'Taupe': '#8B7B6E', 'Teal': '#1C7C80', 'Terracotta': '#C4653F', 'Turquoise': '#2FC1C1',
    'White': '#F7F7F5', 'Wine': '#5A1226', 'Yellow': '#EFD23B',
  };
  const COMMON_COLORS = ['Black', 'White', 'Cream', 'Beige', 'Grey', 'Navy', 'Denim blue', 'Blue', 'Red', 'Burgundy', 'Pink', 'Green', 'Olive', 'Brown', 'Camel', 'Multicolor'];
  const hexOf = name => { const c = COLORS[name]; return c && c[0] === '#' ? c : null; };
  const lumOf = hex => { const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16 & 255) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255)) / 255; };
  const colorAttr = name => { const c = COLORS[name]; return !c ? '' : c[0] === '#' ? ` style="--c:${c}"` : ` data-k="${c}"`; };

  /* Every category gets its own hue. It tints photo-less tiles and colours the "What's in it" bars. */
  const CAT_ORDER = ['Tops', 'Bottoms', 'Dresses', 'Jumpsuits & Rompers', 'Outerwear', 'Shoes', 'Bags', 'Accessories', 'Jewelry', 'Perfumes', 'Activewear', 'Loungewear', 'Swimwear', 'Intimates', 'Sleepwear', 'Costumes', 'Other'];
  const CAT_HUE = {
    'Tops': '#E8708F', 'Bottoms': '#F5E8AA', 'Dresses': '#C93A63', 'Jumpsuits & Rompers': '#B8407F', 'Outerwear': '#D9955A', 'Shoes': '#E0B84F',
    'Bags': '#D8664F', 'Accessories': '#F0C987', 'Jewelry': '#F4B6C4', 'Perfumes': '#E3A8C8', 'Activewear': '#E4536B', 'Loungewear': '#C78A9B', 'Swimwear': '#F2A58A',
    'Intimates': '#D96B8C', 'Sleepwear': '#A56A8A', 'Costumes': '#E04C9B', 'Other': '#A89098',
  };
  const catOrder = c => { const i = CAT_ORDER.indexOf(c); return i === -1 ? 99 : i; };

  /* What counts as a top and a bottom (mirrors the server). */
  const TOP_SUBS = ['Sports bra', 'Workout top', 'Hoodie', 'Sweatshirt', 'Camisole', 'Bikini top'];
  const BOTTOM_SUBS = ['Leggings', 'Workout leggings', 'Yoga pants', 'Joggers', 'Sweatpants', 'Bike shorts', 'Running shorts', 'Bikini bottom'];
  const BOTH_SUBS = ['Lounge set', 'Pajama set', 'One-piece swimsuit'];
  function roleOf(i) {
    if (i.cat === 'Tops') return { top: true, bottom: false };
    if (i.cat === 'Bottoms') return { top: false, bottom: true };
    if (i.cat === 'Dresses' || i.cat === 'Jumpsuits & Rompers') return { top: true, bottom: true, full: true };
    const both = i.sub.some(s => BOTH_SUBS.includes(s));
    return { top: both || i.sub.some(s => TOP_SUBS.includes(s)), bottom: both || i.sub.some(s => BOTTOM_SUBS.includes(s)), full: both };
  }

  /* ---------- pictures ---------- */
  // Photos you drag into Notion come back with a signed link that changes every minute. Keep the first one so the picture doesn't reload.
  const photoCache = new Map();
  function stable(id, url) {
    if (!url) return '';
    const [path, qs] = url.split('?');
    if (!qs || !/X-Amz-|Signature/i.test(qs)) return url;
    const hit = photoCache.get(id);
    if (hit && hit.path === path && Date.now() - hit.t < 40 * 60000) return hit.url;
    photoCache.set(id, { path, url, t: Date.now() });
    return url;
  }
  // A rounded photo. With no photo you get the garment's colour (or its category's hue) with a big initial.
  function thumb(r, cls) {
    const hex = r.color ? hexOf(r.color) : null;
    const base = hex || CAT_HUE[r.cat] || '#8E92A6';
    const light = lumOf(base) > 0.62;
    const inner = r.photo
      ? `<img src="${esc(r.photo)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-ini="${esc(initial(r.name))}">`
      : `<span class="ini">${esc(initial(r.name))}</span>`;
    return `<span class="th${cls ? ' ' + cls : ''}${light ? ' light' : ''}" style="--c:${base}">${inner}</span>`;
  }
  document.addEventListener('error', e => {
    const im = e.target;
    if (im && im.tagName === 'IMG' && im.dataset.ini) im.parentElement.innerHTML = `<span class="ini">${esc(im.dataset.ini)}</span>`;
  }, true);

  /* Which subcategories belong to which category (the Notion list is flat). */
  const SUB_BY_CAT = {
    'Tops': 'Blouse,Bodysuit,Button-up,Camisole,Cardigan,Corset,Crop,Graphic tee,Henley,Hoodie,Long-sleeve,Mock neck,Peplum,Polo,Pullover sweater,Sweater,Sweatshirt,Tank,Tee shirt,Tunic,Turtleneck,Vest,Wrap top,Wrap',
    'Bottoms': 'Bootcut,Boyfriend jeans,Cigarette pants,Culottes,Denim shorts,Denim skirt,Flare,Jeans,Linen shorts,Maxi skirt,Midi skirt,Mini skirt,Mom jeans,Pencil skirt,Pleated skirt,Shorts,Skinny,Skirt,Slip skirt,Straight-leg,Tailored shorts,Trousers,Wide-leg',
    'Jumpsuits & Rompers': 'Jumpsuit,Romper,Overalls',
    'Dresses': 'Casual dress,Cocktail dress,Day dress,Evening dress,Formal gown,Maxi dress,Midi dress,Mini dress,Shirt dress,Slip dress,Sundress,Sweater dress,Work dress,Wrap dress',
    'Outerwear': 'Athletic jacket,Blazer,Bomber jacket,Cape,Denim jacket,Duster,Kimono,Leather jacket,Moto jacket,Parka,Poncho,Puffer coat,Raincoat,Shacket,Suit jacket,Trench coat,Utility jacket,Wool coat,Vest',
    'Shoes': 'Ankle boots,Athletic sneakers,Ballet flats,Block heels,Boots,Chelsea boots,Clogs,Combat boots,Cowboy boots,Espadrilles,Fashion sneakers,Flat sandals,Flats,Flip flops,Heeled sandals,Heels,Knee-high boots,Loafers,Mary Janes,Mules,Over-the-knee boots,Oxfords,Platforms,Pumps,Rain boots,Sandals,Slides,Sneakers,Snow boots,Stilettos,Wedges',
    'Accessories': 'Baseball cap,Beanie,Belt,Eyeglasses,Gloves,Hair accessory,Hat,Scarf,Silk scarf,Socks,Sun Hat,Sunglasses,Tights,Wallet,Watch,Winter scarf',
    'Jewelry': 'Anklet,Bangle,Bracelet,Brooch,Drop earrings,Earrings,Hoop earrings,Jewelry set,Necklace,Pendant necklace,Ring,Statement necklace,Stud earrings',
    'Bags': 'Backpack,Belt bag,Clutch,Crossbody,Evening bag,Satchel,Shoulder bag,Tote bag,Travel bag,Weekender,Work bag',
    'Activewear': 'Athletic jacket,Athletic sneakers,Bike shorts,Joggers,Leggings,Running shorts,Sports bra,Workout leggings,Workout top,Yoga pants',
    'Loungewear': 'Hoodie,Joggers,Leggings,Lounge set,Robe,Sweatpants,Sweatshirt',
    'Swimwear': 'Bikini bottom,Bikini top,One-piece swimsuit,Swim cover-up',
    'Intimates': 'Bra,Bralette,Bodysuit - intimate,Lingerie set,Shapewear,Slip,Underwear',
    'Sleepwear': 'Camisole,Pajama set,Robe,Slip',
  };
  Object.keys(SUB_BY_CAT).forEach(k => { SUB_BY_CAT[k] = SUB_BY_CAT[k].split(','); });

  /* ---------- feedback ---------- */
  function toast(msg, ms, action) {
    const t = $('toast');
    t.textContent = '';
    const s = document.createElement('span'); s.textContent = msg; t.append(s);
    t.classList.toggle('act', !!action);
    if (action) {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = action.label;
      b.addEventListener('click', () => { t.classList.remove('show'); action.fn(); });
      t.append(b);
    }
    t.classList.add('show');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => t.classList.remove('show'), ms || 3200);
  }

  /* ---------- network ---------- */
  async function post(body, url) {
    // Writes authenticate with the x-widget-key header (same as the Sail and Meal widgets); ?key= only works for reads.
    const r = await fetch(url || API, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-widget-key': KEY }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) { const e = new Error(j.error || `HTTP ${r.status}`); e.hint = j.hint; throw e; }
    return j;
  }

  async function load() {
    const r = await fetch(`${API}?need=${need.join(',')}${keyQ('&')}`, { cache: 'no-store' });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || data.error) { const e = new Error(data.error || `Could not load the Wardrobe (HTTP ${r.status}).`); e.hint = data.hint; throw e; }
    state.today = data.today;
    ['items', 'outfits', 'wishes'].forEach(k => {
      if (!data[k]) return;
      if (data[k].error) { state.err[k] = data[k]; return; }
      state.err[k] = null;
      state[k] = data[k].rows.map(r2 => { r2.photo = stable(r2.id, r2.photo); return r2; });
    });
    if (data.schema) { if (data.schema.error) state.err.schema = data.schema; else { state.err.schema = null; state.schema = data.schema; } }
    state.loadedAt = Date.now();
  }

  function showBad(e) {
    const b = $('bad'); b.hidden = false;
    b.innerHTML = `<h2>Couldn't load your wardrobe</h2><p class="muted note">${esc(e.message)}${e.hint ? ' ' + esc(e.hint) : ''}<br>Check the key in the link, then open /api/wardrobe-health to see what's wrong.</p>`;
  }
  const secError = (k, what) => (state.err[k] ? `<p class="empty">Couldn't read ${what}: ${esc(state.err[k].error)}${state.err[k].hint ? ' ' + esc(state.err[k].hint) : ''}</p>` : '');
  const emptyState = (title, text, act, label, ico) => `<div class="empty-state"><span class="es-ico">${ICONS[ico || 'add']}</span><strong>${esc(title)}</strong><p>${esc(text)}</p>${act ? `<button type="button" class="btn sm primary" ${act}>${esc(label)}</button>` : ''}</div>`;
  const openForm$ = w => (has(w) ? `data-open-form="${w}"` : '');

  async function refresh() {
    if (state.pending) return;
    try { await load(); renderAll(); }
    catch (e) { if (!state.today) showBad(e); }       // keep what's on screen if a background refresh fails
  }

  // Widgets in separate embeds stay in step through this channel (when the browser lets them share it).
  let bc = null; try { bc = new BroadcastChannel('wardrobe-widgets'); bc.onmessage = () => setTimeout(refresh, 500); } catch (e) { /* not available in this sandbox */ }
  const announce = () => { if (bc) bc.postMessage('changed'); setTimeout(refresh, 800); };

  /* =========================================================
     FORMS  (New piece, New wish)
     ========================================================= */
  const FORM_DEFS = {
    add: {
      schemaKey: 'item', title: 'New piece', blurb: 'Name it, pick a category, save. Everything else is optional.',
      icon: 'add', nameProp: 'Name', action: 'item-create', save: 'Add to wardrobe', done: 'Added', dupList: () => state.items,
      moreLabel: 'Add photo & notes', sticky: ['Item Category'],
      essentials: [
        { p: 'Name', label: 'Name', kind: 'text', ph: 'Wine silk shirt', req: true, wide: true, lg: true },
        { p: 'Item Category', label: 'Category', kind: 'opts', chips: true, wide: true },
        { p: 'Item Subcategory', label: 'Type', kind: 'opts', multi: true, wide: true, filter: 'sub' },
        { p: 'Primary Color', label: 'Colour', kind: 'swatch', wide: true, col2: true },
      ],
      more: [
        { p: 'Photo', label: 'Photo', kind: 'photo', wide: true, full: true },
        { p: 'Notes', label: 'Notes', kind: 'area', ph: 'Fabric, fit, what you love about it...', wide: true, full: true },
      ],
    },
    wish: {
      schemaKey: 'wish', title: 'New wish', blurb: 'Park it here before you buy it.',
      icon: 'wish', nameProp: 'Item Name', action: 'wish-create', save: 'Add to wishlist', done: 'Wish saved', dupList: () => state.wishes,
      moreLabel: 'More details', sticky: ['Wishlist Priority', 'Wishlist Status', 'Date Added'],
      essentials: [
        { p: 'Item Name', label: 'Name', kind: 'text', ph: 'Silk slip dress', req: true, wide: true, lg: true },
        { p: 'Category', label: 'Category', kind: 'opts', multi: true, chips: true, wide: true },
        { p: 'Wishlist Priority', label: 'How much do you want it', kind: 'opts', chips: true, wide: true },
        { p: 'Estimated Price', label: 'Price', kind: 'money', col2: true },
        { p: 'Reason / Gap Filled', label: 'Why you want it', kind: 'area', ph: 'What gap does it fill?', wide: true, col2: true },
      ],
      more: [
        { p: 'Photo', label: 'Photo', kind: 'photo', wide: true, full: true },
        { p: 'Link', label: 'Link to the product', kind: 'url', ph: 'https://...', wide: true },
        { p: 'Wishlist Status', label: 'Status', kind: 'opts', wide: true, chips: true, def: 'Considering' },
        { p: 'Date Added', label: 'Date added', kind: 'date', def: 'today' },
        { p: 'Notes', label: 'Notes', kind: 'area', wide: true, full: true },
      ],
    },
  };

  const slug = s => String(s).replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  const CHIP_MAX = 14;      // lists longer than this become search-and-pick (unless the field says chips: true)
  const PICK_PEEK = 12;     // how many suggestions a search-and-pick shows before "more"
  const freshPhoto = () => ({ state: 'idle', preview: '', msg: '' });

  function defaultFor(F, f) {
    const opts = (F.sch[f.p] && F.sch[f.p].options) || [];
    let d = f.def === 'today' ? state.today : f.def;
    if (f.kind === 'opts' || f.kind === 'swatch') {
      if (f.multi) return (Array.isArray(d) ? d : []).filter(o => opts.includes(o));
      return typeof d === 'string' && opts.includes(d) ? d : '';
    }
    return d == null ? '' : String(d);
  }

  function buildForm(w) {
    const def = FORM_DEFS[w];
    const root = document.querySelector(`.card[data-w="${w}"]`);
    const sch = state.schema && state.schema[def.schemaKey];
    if (!sch || !sch[def.nameProp]) {
      root.innerHTML = `<h2>${esc(def.title)}</h2><p class="muted note">Notion has no "${esc(def.nameProp)}" property in this database. Open /api/wardrobe-health to see what's missing.</p>`;
      return;
    }
    const F = { w, def, root, sch, values: {}, session: 0, showAll: false, search: {}, exp: {}, open: !MULTI, photo: freshPhoto() };
    F.fields = [...def.essentials, ...def.more].filter(f => sch[f.p]);
    F.fieldOf = p => F.fields.find(f => f.p === p);
    F.fields.forEach(f => { F.values[f.p] = defaultFor(F, f); });
    const fld = f => `<div class="fld${f.wide ? ' wide' : ''}${f.full ? ' full' : ''}" data-f="${esc(f.p)}">${fieldInner(F, f)}</div>`;
    const sect = list => list.filter(f => sch[f.p]).map(fld).join('');
    // the essentials sit in two columns on a wide card, and stack on a narrow one
    const cols = list => `<div class="fcols"><div class="fgrid">${sect(list.filter(f => !f.col2))}</div><div class="fgrid">${sect(list.filter(f => f.col2))}</div></div>`;
    const headInner = `<span class="gico g-${w}">${ICONS[def.icon]}</span><div class="ftitle"><h2>${esc(def.title)}</h2><p class="muted">${esc(def.blurb)}</p></div><span class="fplus">${PLUS}</span>`;
    root.classList.toggle('collapsible', MULTI);
    root.classList.toggle('open', F.open);
    root.innerHTML = `
      ${MULTI ? `<button type="button" class="fhead" data-toggle aria-expanded="${F.open}">${headInner}</button>` : `<div class="fhead">${headInner}</div>`}
      <div class="fbody"${F.open ? '' : ' hidden'}>
        <div class="fscroll">
          ${cols(def.essentials)}
          <button type="button" class="more-toggle" aria-expanded="false">${esc(def.moreLabel)}</button>
          <div class="fgrid more" hidden>${sect(def.more)}</div>
        </div>
        <div class="ffoot"><span class="msg" data-msg></span><button type="button" class="btn primary" data-save>${esc(def.save)}</button></div>
      </div>`;
    forms[w] = F;
    F.fields.filter(f => isPicker(F, f)).forEach(f => refreshPicker(F, f));
    updateMsg(F);
    wireForm(F);
  }

  function setOpen(F, open) {
    F.open = open;
    F.root.classList.toggle('open', open);
    F.root.querySelector('.fbody').hidden = !open;
    const t = F.root.querySelector('[data-toggle]'); if (t) t.setAttribute('aria-expanded', open);
    $('stage').classList.toggle('forms-open', Object.values(forms).some(x => x.open));
  }

  function openForm(w) {
    const F = forms[w]; if (!F) return;
    if (!F.open) setOpen(F, true);
    F.root.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const i = F.root.querySelector('input[data-in]'); if (i) setTimeout(() => i.focus({ preventScroll: true }), 120);
  }

  const labelHtml = (F, f) => `<span class="lab">${esc(f.label)}${f.req ? ' <span class="req" aria-hidden="true">*</span>' : ''}</span>`;
  function isPicker(F, f) { return f.kind === 'opts' && !f.chips && (F.sch[f.p].options || []).length > CHIP_MAX; }

  function photoMarkup(F, f) {
    const ph = F.photo;
    return `<div class="lab-row">${labelHtml(F, f)}</div>
      <div class="photo-field">
        <span class="pf-prev">${ph.preview ? `<img src="${esc(ph.preview)}" alt="">` : CAMERA}</span>
        <div class="pf-main">
          <div class="pf-row">
            <button type="button" class="btn sm ghost" data-upload>Upload photo</button>
            <span class="pf-or">or</span>
            <input class="inp slim" type="url" data-photo placeholder="paste an image link" aria-label="Photo link" autocomplete="off">
          </div>
          <p class="pf-msg ${esc(ph.state)}" data-pmsg>${esc(ph.msg)}</p>
        </div>
        <input type="file" accept="image/*" hidden data-file>
      </div>`;
  }

  function fieldInner(F, f) {
    const v = F.values[f.p];
    const id = `${F.w}-${slug(f.p)}`;
    const lab = labelHtml(F, f);
    switch (f.kind) {
      case 'text':
      case 'url':
        return `<label for="${id}">${lab}</label><input id="${id}" class="inp${f.lg ? ' lg' : ''}" type="${f.kind === 'url' ? 'url' : 'text'}" data-in="${esc(f.p)}" value="${esc(v)}" placeholder="${esc(f.ph || '')}" maxlength="${f.kind === 'url' ? 1900 : 200}" autocomplete="off">`;
      case 'money':
        return `<label for="${id}">${lab}</label><span class="money"><span aria-hidden="true">${esc(CUR)}</span><input id="${id}" class="inp" type="number" inputmode="decimal" min="0" step="any" data-in="${esc(f.p)}" value="${esc(v)}"></span>`;
      case 'number':
        return `<label for="${id}">${lab}</label><input id="${id}" class="inp" type="number" inputmode="numeric" min="0" step="1" data-in="${esc(f.p)}" value="${esc(v)}">`;
      case 'date':
        return `<label for="${id}">${lab}</label><input id="${id}" class="inp" type="date" data-in="${esc(f.p)}" value="${esc(v)}">`;
      case 'area':
        return `<label for="${id}">${lab}</label><textarea id="${id}" class="inp" rows="2" data-in="${esc(f.p)}" maxlength="1900" placeholder="${esc(f.ph || '')}">${esc(v)}</textarea>`;
      case 'photo': return photoMarkup(F, f);
      case 'swatch': {
        const opts = F.sch[f.p].options || [];
        const sel = f.multi ? v : (v ? [v] : []);
        const open = !!F.exp[f.p];
        let list = open ? opts : opts.filter(o => COMMON_COLORS.includes(o) || sel.includes(o));
        if (!open && list.length < 6) list = opts.slice(0, 16);
        const hidden = opts.length - list.length;
        return `<div class="lab-row">${lab}<span class="cap">${esc(sel.join(', '))}</span></div><div class="sw-grid" role="group" aria-label="${esc(f.label)}">${list.map(o =>
          `<button type="button" class="sw" data-o="${esc(o)}"${colorAttr(o)} title="${esc(o)}" aria-label="${esc(o)}" aria-pressed="${sel.includes(o)}"></button>`).join('')}${hidden > 0 || open ? `<button type="button" class="sw-more" data-more="${esc(f.p)}">${open ? 'Fewer' : `+${hidden} more`}</button>` : ''}</div>`;
      }
      case 'opts': {
        const opts = F.sch[f.p].options || [];
        if (!isPicker(F, f)) {
          const sel = f.multi ? v : (v ? [v] : []);
          return `${lab}<div class="opts" role="group" aria-label="${esc(f.label)}">${opts.map(o =>
            `<button type="button" class="opt" data-o="${esc(o)}" aria-pressed="${sel.includes(o)}">${esc(o)}</button>`).join('')}</div>`;
        }
        return `${lab}<div class="pk"><div class="pk-sel"></div><input class="inp slim" type="search" data-q="${esc(f.p)}" placeholder="Search ${esc(f.label.toLowerCase())}" aria-label="Search ${esc(f.label.toLowerCase())}" autocomplete="off"><div class="pk-list"></div><div class="pk-foot"></div></div>`;
      }
      default: return '';
    }
  }

  function refreshPicker(F, f) {
    const wrap = F.root.querySelector(`[data-f="${CSS.escape(f.p)}"]`);
    if (!wrap || !isPicker(F, f)) return;
    const all = F.sch[f.p].options || [];
    const sel = f.multi ? F.values[f.p] : (F.values[f.p] ? [F.values[f.p]] : []);
    wrap.querySelector('.pk-sel').innerHTML = sel.map(o => `<button type="button" class="opt" data-o="${esc(o)}" aria-pressed="true" aria-label="Remove ${esc(o)}">${esc(o)}</button>`).join('');
    const q = (F.search[f.p] || '').trim().toLowerCase();
    let pool = all, cat = null, narrowed = false;
    if (f.filter === 'sub') {
      cat = F.values['Item Category'];
      const mapped = cat && SUB_BY_CAT[cat] ? SUB_BY_CAT[cat].filter(o => all.includes(o)) : null;
      if (mapped && mapped.length) { narrowed = true; if (!F.showAll) pool = mapped; }
    }
    const foot = [];
    let list = [], hint = '';
    if (f.filter === 'sub' && !narrowed && !q) {
      hint = 'Pick a category above, or start typing a type.';
    } else {
      const matches = pool.filter(o => !sel.includes(o) && (!q || o.toLowerCase().includes(q)));
      const lim = q || F.exp[f.p] ? 60 : PICK_PEEK;
      list = matches.slice(0, lim);
      if (!q && matches.length > lim) foot.push(`<button type="button" data-more="${esc(f.p)}">Show ${matches.length - lim} more</button>`);
      else if (!q && F.exp[f.p] && matches.length > PICK_PEEK) foot.push(`<button type="button" data-more="${esc(f.p)}">Show fewer</button>`);
      if (!list.length) hint = q ? 'No match in your Notion options.' : 'Nothing left to pick.';
    }
    if (narrowed) foot.push(`<button type="button" class="pk-all">${F.showAll ? `Only show ${esc(cat.toLowerCase())} types` : 'Show all types'}</button>`);
    wrap.querySelector('.pk-list').innerHTML = list.length
      ? list.map(o => `<button type="button" class="opt" data-o="${esc(o)}" aria-pressed="false">${esc(o)}</button>`).join('')
      : `<span class="hint">${esc(hint)}</span>`;
    wrap.querySelector('.pk-foot').innerHTML = foot.join('');
  }

  function rerenderField(F, f) {
    if (isPicker(F, f)) return refreshPicker(F, f);
    const wrap = F.root.querySelector(`[data-f="${CSS.escape(f.p)}"]`);
    if (wrap) wrap.innerHTML = fieldInner(F, f);
  }

  function renderFormAll(F) {
    F.fields.forEach(f => {
      const wrap = F.root.querySelector(`[data-f="${CSS.escape(f.p)}"]`);
      if (!wrap) return;
      if (isPicker(F, f)) { refreshPicker(F, f); return; }
      if (f.kind === 'photo') { wrap.innerHTML = photoMarkup(F, f); return; }
      if (['text', 'url', 'money', 'number', 'date', 'area'].includes(f.kind)) {
        const el = wrap.querySelector('[data-in]'); if (el) el.value = F.values[f.p];
        wrap.classList.remove('bad');
      } else wrap.innerHTML = fieldInner(F, f);
    });
  }

  function toggleOpt(F, f, o) {
    if (f.multi) {
      const a = F.values[f.p], i = a.indexOf(o);
      if (i === -1) a.push(o); else a.splice(i, 1);
    } else F.values[f.p] = F.values[f.p] === o ? '' : o;
    rerenderField(F, f);
    if (f.p === 'Item Category') { const sub = F.fieldOf('Item Subcategory'); if (sub) { F.showAll = false; refreshPicker(F, sub); } }
  }

  function updateMsg(F) {
    const el = F.root.querySelector('[data-msg]');
    if (!el) return;
    const name = String(F.values[F.def.nameProp] || '').trim().toLowerCase();
    let dup = null;
    if (name.length >= 3) dup = F.def.dupList().find(r => r.name.toLowerCase() === name);
    el.classList.toggle('warn', !!dup);
    if (dup) el.textContent = `You already have "${dup.name}".`;
    else if (F.session) el.textContent = `${F.session} added this session`;
    else el.textContent = '';
  }

  /* ----- photo field: upload from your device, or paste a link, with a live preview ----- */
  function setPhotoUI(F) {
    const wrap = F.root.querySelector('[data-f="Photo"]'); if (!wrap) return;
    const prev = wrap.querySelector('.pf-prev');
    if (prev) prev.innerHTML = F.photo.preview ? `<img src="${esc(F.photo.preview)}" alt="">` : CAMERA;
    const m = wrap.querySelector('[data-pmsg]');
    if (m) { m.textContent = F.photo.msg; m.className = `pf-msg ${F.photo.state}`; }
    const b = wrap.querySelector('[data-upload]'); if (b) b.disabled = F.photo.state === 'uploading';
  }

  function checkPhotoLink(F, url) {
    clearTimeout(F.pt);
    url = url.trim();
    F.values.Photo = '';
    if (!url) { F.photo = freshPhoto(); setPhotoUI(F); return; }
    if (!/^https:\/\//i.test(url)) { F.photo = { state: 'bad', preview: '', msg: 'The link has to start with https://' }; setPhotoUI(F); return; }
    F.photo = { state: 'checking', preview: '', msg: 'Checking the link...' }; setPhotoUI(F);
    F.pt = setTimeout(() => {
      const im = new Image();
      im.onload = () => { if (F.photoLink !== url) return; F.values.Photo = url; F.photo = { state: 'ok', preview: url, msg: 'Photo found. It will show on your tiles.' }; setPhotoUI(F); };
      im.onerror = () => { if (F.photoLink !== url) return; F.photo = { state: 'bad', preview: '', msg: 'That link opens a web page, not a picture. Right-click the picture and choose "Copy image address", or just use Upload photo.' }; setPhotoUI(F); };
      F.photoLink = url; im.referrerPolicy = 'no-referrer'; im.src = url;
    }, 450);
  }

  async function shrink(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error('decode')); i.src = url; });
      const sc = Math.min(1, 1000 / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * sc)), h = Math.max(1, Math.round(img.naturalHeight * sc));
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.drawImage(img, 0, 0, w, h);
      return c.toDataURL('image/jpeg', 0.84);
    } finally { URL.revokeObjectURL(url); }
  }

  async function uploadPhoto(F, file) {
    if (!file) return;
    F.values.Photo = ''; F.photoLink = '';
    const wrap = F.root.querySelector('[data-f="Photo"]'); const li = wrap && wrap.querySelector('[data-photo]'); if (li) li.value = '';
    F.photo = { state: 'uploading', preview: '', msg: 'Getting your photo ready...' }; setPhotoUI(F);
    let data;
    try { data = await shrink(file); }
    catch (e) { F.photo = { state: 'bad', preview: '', msg: "Couldn't read that picture. Try a JPG or PNG." }; setPhotoUI(F); return; }
    F.photo = { state: 'uploading', preview: data, msg: 'Uploading to Notion...' }; setPhotoUI(F);
    try {
      const res = await post({ data }, API_PHOTO);
      F.values.Photo = 'upload:' + res.id;
      F.photo = { state: 'ok', preview: data, msg: 'Uploaded. It will show on your tiles.' };
    } catch (e) { F.photo = { state: 'bad', preview: data, msg: `Upload failed: ${errText(e)}` }; }
    setPhotoUI(F);
  }

  function wireForm(F) {
    const { root } = F;
    root.addEventListener('click', e => {
      const t = e.target.closest('button');
      if (!t || !root.contains(t)) return;
      if (t.matches('[data-toggle]')) { setOpen(F, !F.open); return; }
      if (t.matches('[data-save]')) { submitForm(F); return; }
      if (t.matches('[data-upload]')) { const fi = root.querySelector('[data-file]'); if (fi) fi.click(); return; }
      if (t.classList.contains('more-toggle')) {
        const open = t.getAttribute('aria-expanded') !== 'true';
        t.setAttribute('aria-expanded', open); root.querySelector('.fgrid.more').hidden = !open; return;
      }
      if (t.classList.contains('pk-all')) { F.showAll = !F.showAll; const f = F.fieldOf('Item Subcategory'); if (f) refreshPicker(F, f); return; }
      if (t.dataset.more !== undefined) { const f = F.fieldOf(t.dataset.more); if (f) { F.exp[f.p] = !F.exp[f.p]; rerenderField(F, f); } return; }
      const wrap = t.closest('[data-f]');
      if (wrap && t.dataset.o !== undefined) {
        const f = F.fieldOf(wrap.dataset.f);
        if (f) toggleOpt(F, f, t.dataset.o);
      }
    });
    root.addEventListener('change', e => {
      if (e.target.matches('[data-file]')) { const file = e.target.files && e.target.files[0]; e.target.value = ''; uploadPhoto(F, file); }
    });
    root.addEventListener('input', e => {
      const el = e.target;
      if (el.dataset.photo !== undefined) { checkPhotoLink(F, el.value); return; }
      if (el.dataset.in) {
        F.values[el.dataset.in] = el.value;
        const wrap = el.closest('[data-f]'); if (wrap) wrap.classList.remove('bad');
        if (el.dataset.in === F.def.nameProp) updateMsg(F);
      } else if (el.dataset.q) {
        F.search[el.dataset.q] = el.value;
        const f = F.fieldOf(el.dataset.q); if (f) refreshPicker(F, f);
      }
    });
    root.addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.target.matches('input[data-in]')) { e.preventDefault(); submitForm(F); }
    });
  }

  function collect(F) {
    const out = {};
    for (const f of F.fields) {
      const v = F.values[f.p];
      if (['text', 'url', 'area', 'date', 'photo'].includes(f.kind)) { const s = String(v || '').trim(); if (s) out[f.p] = s; }
      else if (f.kind === 'money' || f.kind === 'number') { if (v !== '' && v != null && Number.isFinite(Number(v))) out[f.p] = Number(v); }
      else if (f.multi) { if (v.length) out[f.p] = v.slice(); }
      else if (v) out[f.p] = v;
    }
    return out;
  }

  function resetForm(F) {
    F.fields.forEach(f => { if (!F.def.sticky.includes(f.p)) F.values[f.p] = defaultFor(F, f); });
    F.search = {}; F.showAll = false; F.exp = {}; F.photo = freshPhoto(); F.photoLink = '';
    F.root.querySelectorAll('[data-q]').forEach(i => { i.value = ''; });
  }

  function flashSaved(F) {
    const b = F.root.querySelector('[data-save]'); if (!b) return;
    b.classList.add('saved'); b.textContent = 'Saved \u2713';
    clearTimeout(F.flash);
    F.flash = setTimeout(() => { b.classList.remove('saved'); b.textContent = F.def.save; }, 1500);
  }

  async function submitForm(F) {
    const msg = F.root.querySelector('[data-msg]');
    if (F.photo.state === 'uploading' || F.photo.state === 'checking') { msg.classList.add('warn'); msg.textContent = 'One second, the photo is still getting ready.'; return; }
    if (F.photo.state === 'bad') {
      const mt = F.root.querySelector('.more-toggle'); if (mt && mt.getAttribute('aria-expanded') !== 'true') mt.click();
      msg.classList.add('warn'); msg.textContent = 'Fix the photo, or clear its link, then save.'; return;
    }
    const vals = collect(F);
    const nameProp = F.def.nameProp;
    if (!vals[nameProp]) {
      const wrap = F.root.querySelector(`[data-f="${CSS.escape(nameProp)}"]`);
      wrap.classList.add('bad'); wrap.querySelector('input').focus();
      msg.classList.add('warn'); msg.textContent = 'Give it a name first.';
      return;
    }
    // optimistic: show it everywhere and clear the form right away; put it all back if Notion says no
    const snapshot = JSON.parse(JSON.stringify(F.values));
    const savedPhoto = F.photo;
    const tmp = { id: 'tmp-' + Date.now(), name: vals[nameProp], brand: '', photo: savedPhoto.preview || '' };
    if (F.w === 'add') Object.assign(tmp, { cat: vals['Item Category'] || null, sub: vals['Item Subcategory'] || [], color: vals['Primary Color'] || null, color2: [], price: vals.Price == null ? null : vals.Price, acq: state.today, status: ['Active'], loc: null, season: [], n: 0, last: null });
    else Object.assign(tmp, { cat: vals.Category || [], price: vals['Estimated Price'] == null ? null : vals['Estimated Price'], priority: vals['Wishlist Priority'] || null, status: vals['Wishlist Status'] || null, link: vals.Link || '', reason: vals['Reason / Gap Filled'] || '', added: vals['Date Added'] || null });
    const list = F.w === 'add' ? state.items : state.wishes;
    list.push(tmp);
    F.session++; resetForm(F); renderFormAll(F); updateMsg(F); renderLive(); flashSaved(F);
    state.pending++;
    try {
      await post({ action: F.def.action, values: vals });
      toast(`${F.def.done}: ${vals[nameProp]}`);
      announce();
    } catch (e) {
      const i = list.indexOf(tmp); if (i !== -1) list.splice(i, 1);
      F.values = snapshot; F.photo = savedPhoto; F.session--; renderFormAll(F); updateMsg(F); renderLive();
      toast(`Couldn't save: ${errText(e)}`, 8000);
    } finally { state.pending--; }
  }

  /* =========================================================
     OUTFITS: shared pieces
     ========================================================= */
  const piecesOf = o => o.items.map(id => state.items.find(i => i.id === id)).filter(Boolean);
  const liveOutfits = () => state.outfits.filter(o => !['Archived', 'Retired'].includes(o.status));

  function collage(o) {
    if (o.photo) return `<div class="cv cv1">${thumb({ name: o.name, photo: o.photo })}</div>`;
    const ps = piecesOf(o);
    const n = Math.min(ps.length, 4);
    const extra = ps.length - 4;
    if (!n) return `<div class="cv cv1">${thumb({ name: o.name })}</div>`;
    return `<div class="cv cv${n}">${ps.slice(0, 4).map(p => thumb(p)).join('')}${extra > 0 ? `<span class="cv-more">+${extra}</span>` : ''}</div>`;
  }

  /* ----- widget: today's outfit ----- */
  function renderToday() {
    $('todayDate').textContent = state.today ? longDate(state.today) : '';
    const body = $('todayBody');
    if (state.err.outfits || state.err.items) { body.innerHTML = secError(state.err.outfits ? 'outfits' : 'items', 'your outfits'); return; }
    const looks = liveOutfits().filter(o => o.last === state.today).sort((a, b) => (b.created || '').localeCompare(a.created || ''));
    const btn = $('openBuilder');
    btn.textContent = looks.length ? 'Add another look' : "Add Today's Outfit";
    if (!looks.length) {
      body.innerHTML = state.items.filter(isActive).length
        ? `<div class="today-empty"><span class="es-ico big">${ICONS.outfit}</span><div><strong>Nothing logged for today</strong><p>Tap the button, pick what you're wearing, and it's saved to your Outfits.</p></div></div>`
        : emptyState('Add a few pieces first', 'Once your wardrobe has some pieces, you can build and log outfits from it.', openForm$('add'), 'Add a piece', 'add');
      return;
    }
    body.innerHTML = looks.slice(0, 2).map((o, k) => {
      const ps = piecesOf(o);
      return `<div class="look${k ? ' small' : ''}">
        <div class="look-head"><span class="look-name">${esc(o.name)}</span><span class="pill">${plural(ps.length, 'piece')}</span></div>
        <div class="look-strip">${ps.map(p => `<div class="look-piece">${thumb(p)}<span>${esc(p.name)}</span></div>`).join('')}</div>
      </div>`;
    }).join('');
  }

  /* ----- widget: outfits gallery ----- */
  function renderOutfits() {
    const grid = $('ofGrid');
    if (state.err.outfits) { grid.innerHTML = secError('outfits', 'your outfits'); return; }
    let list = liveOutfits();
    $('ofCount').textContent = list.length ? plural(list.length, 'look') : '';
    if (ui.sort === 'fav') list = list.filter(o => o.status === 'Favorite');
    if (ui.sort === 'worn') list.sort((a, b) => b.n - a.n || (b.last || '').localeCompare(a.last || ''));
    else list.sort((a, b) => (b.last || b.created || '').localeCompare(a.last || a.created || '') || (b.created || '').localeCompare(a.created || ''));
    if (!list.length) {
      grid.innerHTML = ui.sort === 'fav'
        ? emptyState('No favourites yet', 'Tap the heart on a look you love and it will live here.', '', '', 'wish')
        : emptyState('No outfits yet', "Log today's outfit and your looks will collect here.", has('outfit') ? 'data-open-builder' : '', "Add Today's Outfit", 'outfit');
      return;
    }
    grid.innerHTML = list.map(o => {
      const fav = o.status === 'Favorite';
      const today = o.last === state.today;
      return `<article class="oc" data-id="${esc(o.id)}">
        <button type="button" class="oc-open" data-open-outfit aria-label="Open ${esc(o.name)}">${collage(o)}</button>
        <button type="button" class="heart${fav ? ' on' : ''}" data-fav aria-pressed="${fav}" aria-label="Favourite">${HEART}</button>
        ${today ? '<span class="oc-today">Today</span>' : ''}
        <div class="oc-body"><span class="oc-name">${esc(o.name)}</span><span class="oc-meta">${o.n ? `Worn ${o.n}\u00D7 \u00B7 ${ago(o.last)}` : 'Not worn yet'}</span></div>
      </article>`;
    }).join('');
  }

  function findOutfit(id) { return state.outfits.find(o => o.id === id); }

  async function toggleFav(id) {
    const o = findOutfit(id); if (!o) return;
    if (String(id).startsWith('tmp-')) { toast('Still saving. Try again in a second.'); return; }
    const prev = o.status;
    const next = prev === 'Favorite' ? 'Active' : 'Favorite';
    o.status = next; state.pending++; renderLive(); if (detailId === id) renderDetail();
    try { await post({ action: 'outfit-status', id, status: next }); announce(); }
    catch (e) { o.status = prev; renderLive(); if (detailId === id) renderDetail(); toast(`Couldn't save: ${errText(e)}`, 8000); }
    finally { state.pending--; }
  }

  function applyChange(c, useNew) {
    const row = state.items.find(i => i.id === c.id) || state.outfits.find(o => o.id === c.id);
    if (!row) return;
    row.n = useNew ? c.count : (c.prevCount || 0);
    row.last = useNew ? state.today : c.prevLast;
  }

  async function wearOutfit(id) {
    const row = findOutfit(id); if (!row) return;
    if (String(id).startsWith('tmp-')) { toast('Still saving. Try again in a second.'); return; }
    if (row.last === state.today) {
      const u = undoMap.get(id);
      if (u) return undoWear(id, u);
      toast('Already logged today.'); return;
    }
    const affected = [row, ...piecesOf(row).filter(it => it.last !== state.today)];
    const prev = affected.map(r => ({ r, n: r.n, last: r.last }));
    affected.forEach(r => { r.n = (r.n || 0) + 1; r.last = state.today; });
    state.pending++; renderLive(); if (detailId) renderDetail();
    try {
      const res = await post({ action: 'wear', kind: 'outfit', id });
      undoMap.set(id, res.changes);
      toast(`Logged for today: ${row.name}`, 6000, { label: 'Undo', fn: () => undoWear(id, res.changes) });
      announce();
    } catch (e) {
      prev.forEach(p => { p.r.n = p.n; p.r.last = p.last; });
      renderLive(); if (detailId) renderDetail(); toast(`Couldn't save: ${errText(e)}`, 8000);
    } finally { state.pending--; }
  }

  async function undoWear(id, changes) {
    const now = changes.map(c => {
      const row = state.items.find(i => i.id === c.id) || state.outfits.find(o => o.id === c.id);
      return row ? { row, n: row.n, last: row.last } : null;
    }).filter(Boolean);
    changes.forEach(c => applyChange(c, false));
    undoMap.delete(id);
    state.pending++; renderLive(); if (detailId) renderDetail();
    try { await post({ action: 'wear-restore', changes }); announce(); }
    catch (e) {
      now.forEach(p => { p.row.n = p.n; p.row.last = p.last; });
      undoMap.set(id, changes); renderLive(); if (detailId) renderDetail(); toast(`Couldn't undo: ${errText(e)}`, 8000);
    } finally { state.pending--; }
  }

  /* =========================================================
     THE WINDOW (sheet): outfit builder + outfit details
     ========================================================= */
  let detailId = null;
  const sheet = () => $('sheet');
  function openSheet() { sheet().hidden = false; document.body.classList.add('locked'); requestAnimationFrame(() => sheet().classList.add('in')); }
  function closeSheet() {
    ob.open = false; detailId = null;
    sheet().classList.remove('in'); document.body.classList.remove('locked');
    setTimeout(() => { if (!sheet().classList.contains('in')) { sheet().hidden = true; sheet().innerHTML = ''; } }, 220);
  }

  /* ----- outfit builder ----- */
  const obPool = () => state.items.filter(isActive);
  function obFiltered() {
    const q = ob.q.trim().toLowerCase();
    return obPool().filter(i => (ob.cat === 'All' || i.cat === ob.cat) && (!ob.type || i.sub.includes(ob.type))
      && (!q || `${i.name} ${i.cat || ''} ${i.sub.join(' ')} ${i.color || ''}`.toLowerCase().includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  function openBuilder(pre) {
    if (!obPool().length) { toast('Add a few pieces to your wardrobe first.'); return; }
    if (typeof pre === 'string' && !ob.sel.includes(pre)) ob.sel.push(pre);
    detailId = null;
    ob.open = true; ob.cat = 'All'; ob.type = ''; ob.q = '';
    sheet().innerHTML = `
      <div class="sheet-backdrop" data-close></div>
      <section class="sheet-panel" role="dialog" aria-modal="true" aria-label="Add today's outfit">
        <header class="sp-head">
          <span class="gico g-outfit">${ICONS.outfit}</span>
          <div class="title"><h2>Today's outfit</h2><p class="eyebrow">${esc(state.today ? longDate(state.today) : 'Pick what you wore')}</p></div>
          <button type="button" class="x" data-close aria-label="Close">&times;</button>
        </header>
        <div class="sp-filters">
          <label class="search wide"><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="9" cy="9" r="5.5"/><path d="M13.5 13.5L17 17"/></svg><input id="obSearch" type="search" placeholder="Search your pieces" aria-label="Search your pieces" autocomplete="off"></label>
          <div id="obCats" class="chips-row" role="group" aria-label="Category"></div>
          <div id="obTypes" class="chips-row sub" role="group" aria-label="Type"></div>
        </div>
        <div id="obGrid" class="sp-grid"></div>
        <footer class="sp-tray">
          <div class="tray-info"><div id="obReq" class="req"></div><div id="obStrip" class="strip"></div></div>
          <div class="tray-act"><input id="obName" class="inp slim" type="text" maxlength="120" placeholder="Name this look (optional)" aria-label="Name this look" autocomplete="off"><button type="button" class="btn primary" id="obSave" disabled>Log today's outfit</button></div>
        </footer>
      </section>`;
    openSheet(); obRender();
    setTimeout(() => { const s = $('obSearch'); if (s && !('ontouchstart' in window)) s.focus(); }, 180);
  }
  function obRender() { obRenderCats(); obRenderTypes(); obRenderGrid(); obRenderTray(); }
  function obRenderCats() {
    const pool = obPool();
    const counts = new Map(); pool.forEach(i => counts.set(i.cat || 'Other', (counts.get(i.cat || 'Other') || 0) + 1));
    const cats = [...counts.keys()].sort((a, b) => catOrder(a) - catOrder(b));
    $('obCats').innerHTML = [['All', pool.length], ...cats.map(c => [c, counts.get(c)])].map(([c, n]) =>
      `<button type="button" class="chip" data-cat="${esc(c)}" aria-pressed="${ob.cat === c}" ${c !== 'All' ? `style="--c:${CAT_HUE[c] || '#98A0B3'}"` : ''}>${esc(c)} <b>${n}</b></button>`).join('');
  }
  function obRenderTypes() {
    const box = $('obTypes');
    if (ob.cat === 'All') { box.hidden = true; box.innerHTML = ''; return; }
    const counts = new Map();
    obPool().filter(i => i.cat === ob.cat).forEach(i => i.sub.forEach(s => counts.set(s, (counts.get(s) || 0) + 1)));
    const subs = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    if (!subs.length) { box.hidden = true; box.innerHTML = ''; return; }
    box.hidden = false;
    box.innerHTML = [['', 'All types', 0], ...subs.map(([s, n]) => [s, s, n])].map(([v, label, n]) =>
      `<button type="button" class="chip sm" data-type="${esc(v)}" aria-pressed="${ob.type === v}">${esc(label)}${n ? ` <b>${n}</b>` : ''}</button>`).join('');
  }
  function pieceCard(i) {
    const on = ob.sel.includes(i.id);
    const sub = [i.cat, i.sub[0]].filter(Boolean).join(' \u00B7 ');
    return `<button type="button" class="pc" data-id="${esc(i.id)}" aria-pressed="${on}">${thumb(i, 'pc-th')}<span class="pc-check">${CHECK}</span><span class="pc-name">${esc(i.name)}</span><span class="pc-sub">${esc(sub)}</span></button>`;
  }
  function obRenderGrid() {
    const list = obFiltered();
    const g = $('obGrid');
    if (!list.length) { g.innerHTML = '<p class="empty big">Nothing matches. Try another search or category.</p>'; return; }
    const grouped = ob.cat === 'All' && !ob.q.trim() && !ob.type;
    if (!grouped) { g.innerHTML = `<div class="pc-grid">${list.map(pieceCard).join('')}</div>`; return; }
    const by = new Map(); list.forEach(i => { const k = i.cat || 'Other'; if (!by.has(k)) by.set(k, []); by.get(k).push(i); });
    g.innerHTML = [...by].sort((a, b) => catOrder(a[0]) - catOrder(b[0])).map(([c, arr]) =>
      `<section class="pc-sec"><h3 style="--c:${CAT_HUE[c] || '#98A0B3'}">${esc(c)} <span>${arr.length}</span></h3><div class="pc-grid">${arr.map(pieceCard).join('')}</div></section>`).join('');
  }
  function obReq() {
    const roles = ob.sel.map(id => state.items.find(i => i.id === id)).filter(Boolean).map(roleOf);
    const top = roles.some(r => r.top), bottom = roles.some(r => r.bottom);
    return { top, bottom, full: roles.some(r => r.top && r.bottom), ok: top && bottom };
  }
  function obRenderTray() {
    const r = obReq();
    const pill = (ok, label) => `<span class="rq${ok ? ' ok' : ''}">${ok ? CHECK : '<i></i>'}${label}</span>`;
    $('obReq').innerHTML = pill(r.top, 'Top') + pill(r.bottom, 'Bottom') + (r.full ? '<span class="rq-note">A dress or set covers both</span>' : '') + `<span class="rq-count">${ob.sel.length ? plural(ob.sel.length, 'piece') + ' picked' : 'Pick your pieces'}</span>`;
    $('obStrip').innerHTML = ob.sel.map(id => state.items.find(i => i.id === id)).filter(Boolean).map(i => `<button type="button" class="sel-th" data-remove="${esc(i.id)}" title="Remove ${esc(i.name)}" aria-label="Remove ${esc(i.name)}">${thumb(i)}<span class="rm">&times;</span></button>`).join('');
    const b = $('obSave'); b.disabled = !r.ok;
    b.textContent = r.ok ? `Log today's outfit \u00B7 ${ob.sel.length}` : "Log today's outfit";
  }
  function obToggle(id) {
    const i = ob.sel.indexOf(id);
    if (i === -1) ob.sel.push(id); else ob.sel.splice(i, 1);
    const card = sheet().querySelector(`.pc[data-id="${CSS.escape(id)}"]`);
    if (card) card.setAttribute('aria-pressed', i === -1);
    obRenderTray();
  }

  async function saveOutfit() {
    const r = obReq(); if (!r.ok) return;
    const name = ($('obName') && $('obName').value || '').trim();
    const ids = ob.sel.slice();
    const pieces = ids.map(id => state.items.find(i => i.id === id)).filter(Boolean);
    const d = new Date(Date.parse(state.today + 'T00:00:00Z'));
    const autoName = `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()]} ${d.getUTCDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]} outfit`;
    const tmp = { id: 'tmp-' + Date.now(), name: name || autoName, items: ids, n: 1, last: state.today, status: 'Active', photo: '', created: new Date().toISOString() };
    const prev = pieces.filter(p => p.last !== state.today).map(p => ({ p, n: p.n, last: p.last }));
    prev.forEach(x => { x.p.n = (x.p.n || 0) + 1; x.p.last = state.today; });
    state.outfits.push(tmp);
    const saved = { sel: ids, name };
    closeSheet(); ob.sel = []; ob.name = '';
    state.pending++; renderLive();
    try {
      const res = await post({ action: 'outfit-create', items: ids, name });
      undoMap.set('o:' + res.id, res);
      toast(`Outfit logged: ${res.name}`, 7000, { label: 'Undo', fn: () => undoOutfit(res) });
      announce();
    } catch (e) {
      const i = state.outfits.indexOf(tmp); if (i !== -1) state.outfits.splice(i, 1);
      prev.forEach(x => { x.p.n = x.n; x.p.last = x.last; });
      renderLive();
      toast(`Couldn't save: ${errText(e)}`, 9000);
      ob.sel = saved.sel; openBuilder(); if ($('obName')) $('obName').value = saved.name; obRenderGrid(); obRenderTray();
    } finally { state.pending--; }
  }

  async function undoOutfit(res) {
    const gone = findOutfit(res.id);
    const idx = gone ? state.outfits.indexOf(gone) : -1;
    if (idx !== -1) state.outfits.splice(idx, 1);
    const now = (res.changes || []).map(c => { const row = state.items.find(i => i.id === c.id); return row ? { row, n: row.n, last: row.last } : null; }).filter(Boolean);
    (res.changes || []).forEach(c => applyChange(c, false));
    state.pending++; renderLive();
    try { await post({ action: 'outfit-undo', id: res.id, changes: res.changes || [] }); toast('Outfit removed.'); announce(); }
    catch (e) {
      if (gone && idx !== -1) state.outfits.splice(idx, 0, gone);
      now.forEach(p => { p.row.n = p.n; p.row.last = p.last; });
      renderLive(); toast(`Couldn't undo: ${errText(e)}`, 8000);
    } finally { state.pending--; }
  }

  /* ----- outfit details ----- */
  function openDetail(id) {
    if (!findOutfit(id)) return;
    detailId = id; ob.open = false;
    renderDetail(); openSheet();
  }
  function renderDetail() {
    const o = findOutfit(detailId);
    if (!o) { closeSheet(); return; }
    const ps = piecesOf(o);
    const fav = o.status === 'Favorite', today = o.last === state.today;
    sheet().innerHTML = `
      <div class="sheet-backdrop" data-close></div>
      <section class="sheet-panel detail" role="dialog" aria-modal="true" aria-label="${esc(o.name)}">
        <header class="sp-head">
          <span class="gico g-outfit">${ICONS.outfit}</span>
          <div class="title"><h2>${esc(o.name)}</h2><p class="eyebrow">${o.n ? `Worn ${o.n}\u00D7 \u00B7 last ${ago(o.last)}` : 'Not worn yet'} \u00B7 ${plural(ps.length, 'piece')}</p></div>
          <button type="button" class="x" data-close aria-label="Close">&times;</button>
        </header>
        <div class="sp-grid"><div class="pc-grid roomy">${ps.length ? ps.map(p => `<div class="pc static">${thumb(p, 'pc-th')}<span class="pc-name">${esc(p.name)}</span><span class="pc-sub">${esc([p.cat, p.sub[0]].filter(Boolean).join(' \u00B7 '))}</span></div>`).join('') : '<p class="empty big">The pieces in this outfit are no longer in your wardrobe.</p>'}</div></div>
        <footer class="sp-tray detail-act">
          <button type="button" class="btn ghost heart-btn${fav ? ' on' : ''}" data-detail-fav aria-pressed="${fav}">${HEART}<span>${fav ? 'Favourite' : 'Add to favourites'}</span></button>
          <button type="button" class="btn ${today ? 'done' : 'primary'}" data-detail-wear>${today ? 'Worn today \u2713 (tap to undo)' : 'Wear this today'}</button>
        </footer>
      </section>`;
  }

  /* =========================================================
     MOST WANTED: your most-worn pieces as wanted posters, plus the ones sleeping in the closet
     ========================================================= */
  const hash = str => { let h = 2166136261; for (let k = 0; k < str.length; k++) { h ^= str.charCodeAt(k); h = Math.imul(h, 16777619); } return h >>> 0; };
  const BERRY = '\u0E3F';
  const TILTS = ['-1.6deg', '1deg', '-.7deg'];

  function renderCloset() {
    const box = $('posters'), sl = $('sleepers');
    if (state.err.items) { box.innerHTML = secError('items', 'your pieces'); sl.innerHTML = ''; return; }
    const act = state.items.filter(isActive);
    $('closetPill').textContent = act.length ? plural(act.length, 'piece') : '';
    const worn = act.filter(i => i.n > 0)
      .sort((a, b) => b.n - a.n || (b.last || '').localeCompare(a.last || '') || a.name.localeCompare(b.name)).slice(0, 3);
    box.innerHTML = worn.length ? worn.map((i, k) => `
      <div class="poster" style="--rot:${TILTS[k]}">
        <span class="rank">${k + 1}</span>
        <p class="wanted">Wanted</p>
        <div class="poster-photo">${thumb(i)}</div>
        <p class="poster-name">${esc(i.name)}</p>
        <p class="poster-bounty"><span>${BERRY}</span>${(i.n * 1000000).toLocaleString('en-US')}</p>
        <p class="poster-sub">worn ${i.n}\u00D7 \u00B7 ${esc(ago(i.last))}</p>
      </div>`).join('')
      : emptyState('No bounties yet', 'Log an outfit and the pieces you wear most will be pinned up here.', has('outfit') ? 'data-open-builder' : '', "Add Today's Outfit", 'outfit');
    // sleepers: never-worn pieces first, otherwise the ones you've not touched the longest. Reshuffled daily.
    let pool = act.filter(i => !i.n && !i.last), label = 'never worn';
    if (!pool.length) { pool = act.filter(i => since(i.last) >= 30).sort((a, b) => (a.last || '').localeCompare(b.last || '')).slice(0, 18); label = 'not worn in a while'; }
    const pick = pool.slice().sort((a, b) => hash(a.id + state.today) - hash(b.id + state.today)).slice(0, 6);
    $('sleepSub').textContent = pool.length ? `${pool.length} ${label}. Tap one to wear it today.` : '';
    $('sleepWrap').hidden = !pool.length;
    sl.innerHTML = pick.map(i => `<button type="button" class="sleeper" data-sleeper="${esc(i.id)}" aria-label="Wear ${esc(i.name)} today">${thumb(i)}<span>${esc(i.name)}</span></button>`).join('');
  }

  /* =========================================================
     WHAT'S IN IT: ranked bars by category / colour
     ========================================================= */
  function renderCats() {
    const el = $('arches');
    if (state.err.items) { el.innerHTML = secError('items', 'your pieces'); return; }
    const act = state.items.filter(isActive);
    const byColor = ui.by === 'color';
    const counts = new Map();
    act.forEach(i => { const k = (byColor ? i.color : i.cat) || (byColor ? 'No colour' : 'No category'); counts.set(k, (counts.get(k) || 0) + 1); });
    const entries = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    if (!entries.length) {
      el.innerHTML = emptyState('Nothing here yet', 'Once you add pieces, you will see what your closet is made of.', openForm$('add'), 'Add a piece');
      el.classList.remove('anim'); $('archNote').textContent = ''; return;
    }
    const cap = byColor ? 7 : 6;
    const top = entries.slice(0, cap);
    const rest = entries.slice(cap).reduce((s2, e) => s2 + e[1], 0);
    const restKinds = entries.length - cap;
    const max = Math.max(...top.map(e => e[1]));
    el.classList.toggle('anim', ui.catAnim); ui.catAnim = false;
    const rows = top.map(([label, n], i) => {
      const c = byColor ? COLORS[label] : null;
      const hex = c && c[0] === '#';
      const hue = byColor ? null : (CAT_HUE[label] || '#98A0B3');
      const dim = label === 'No category' || label === 'No colour' ? ' dim' : '';
      const w = Math.min(100, Math.max(6, Math.round((n / max) * 100)));
      const dot = byColor ? `<i class="dot"${hex ? ` style="--c:${c}"` : c ? ` data-k="${c}"` : ''}></i>` : `<i class="dot" style="--c:${hue}"></i>`;
      const fill = byColor && c ? `<i class="col" style="--w:${w}%;--i:${i}${hex ? `;--c:${c}` : ''}"${!hex ? ` data-k="${c}"` : ''}></i>` : `<i style="--w:${w}%;--i:${i}${hue ? `;--c:${hue}` : ''}"></i>`;
      return `<div class="brow${dim}"><span class="bl">${dot}<span title="${esc(label)}">${esc(label)}</span></span><span class="bar">${fill}</span><span class="bn">${n}</span></div>`;
    });
    if (rest) rows.push(`<div class="brow dim"><span class="bl"><span>Others</span></span><span class="bar-note">${restKinds} more ${byColor ? (restKinds === 1 ? 'colour' : 'colours') : (restKinds === 1 ? 'category' : 'categories')}</span><span class="bn">${rest}</span></div>`);
    el.innerHTML = rows.join('');
    $('archNote').textContent = plural(act.length, 'piece');
  }

  /* =========================================================
     WISHLIST
     ========================================================= */
  const PRIORITY_ORDER = ['Need', 'High priority', 'Want', 'Replace existing', 'Nice to have', 'Wait for sale', 'Budget dependent', 'Gift idea', 'Someday'];
  const PRI_HUE = { 'Need': '#E8708F', 'High priority': '#F4B6C4', 'Want': '#F5E8AA', 'Replace existing': '#E0B84F', 'Nice to have': '#F0C987', 'Wait for sale': '#D9955A', 'Budget dependent': '#C78A9B', 'Gift idea': '#E3A8C8', 'Someday': '#A89098' };
  const FINISHED = ['Purchased', 'Gifted', 'No longer needed', 'Skipped'];
  const FALLBACK_STATUS = ['Considering', 'Researching', 'Wait for sale', 'On Hold', 'Purchased', 'Gifted', 'No longer needed', 'Skipped'];

  function renderWishlist() {
    const box = $('wl');
    if (state.err.wishes) { box.innerHTML = secError('wishes', 'your wishlist'); return; }
    if (document.activeElement && document.activeElement.tagName === 'SELECT' && box.contains(document.activeElement)) return;   // don't close an open dropdown
    const open = state.wishes.filter(w => !FINISHED.includes(w.status));
    const total = open.reduce((s, w) => s + (w.price || 0), 0);
    $('wlTotal').textContent = open.length ? `${plural(open.length, 'wish', 'wishes')} \u00B7 ${money(total)}` : '';
    if (!open.length) { box.innerHTML = emptyState('Nothing on the list', 'Park things you are thinking about here before you buy them.', openForm$('wish'), 'Add a wish', 'wish'); return; }
    const statuses = (state.schema && state.schema.wish && state.schema.wish['Wishlist Status'] && state.schema.wish['Wishlist Status'].options) || FALLBACK_STATUS;
    const rank = k => { const i2 = PRIORITY_ORDER.indexOf(k); return i2 === -1 ? (k === 'No priority' ? 999 : 500) : i2; };
    const sorted = open.slice().sort((a, b) => rank(a.priority || 'No priority') - rank(b.priority || 'No priority') || a.name.localeCompare(b.name));
    box.innerHTML = '<div class="wgrid">' + sorted.map(w => {
      const opts = `<option value=""${w.status ? '' : ' selected'}>Set status</option>` + statuses.map(s2 => `<option${s2 === w.status ? ' selected' : ''}>${esc(s2)}</option>`).join('');
      const ask = ui.ask === w.id
        ? `<div class="buy-ask"><span>Add it to your wardrobe too?</span><button type="button" class="btn sm primary" data-act="toitem">Add to wardrobe</button><button type="button" class="btn sm ghost" data-act="bought">Just mark bought</button><button type="button" class="btn sm ghost" data-act="cancel">Cancel</button></div>`
        : `<div class="w-act"><select class="sel" data-act="status" aria-label="Status for ${esc(w.name)}">${opts}</select><button type="button" class="btn sm ghost" data-act="buy">Bought it</button>${/^https?:/i.test(w.link) ? `<a href="${esc(w.link)}" target="_blank" rel="noopener noreferrer">Link</a>` : ''}</div>`;
      const pri = w.priority ? `<span class="wc-pri" style="--c:${PRI_HUE[w.priority] || '#C78A9B'}">${esc(w.priority)}</span>` : '';
      return `<article class="wc" data-id="${esc(w.id)}">
        <div class="wc-photo">${thumb({ name: w.name, photo: w.photo, cat: (w.cat || [])[0] }, 'wc-th')}${pri}${w.price != null ? `<span class="wc-price">${esc(money(w.price))}</span>` : ''}</div>
        <div class="w-main"><div class="w-name">${esc(w.name)}</div>${w.reason ? `<div class="w-sub">${esc(w.reason)}</div>` : ''}</div>${ask}</article>`;
    }).join('') + '</div>';
  }

  async function setWishStatus(id, status) {
    const w = state.wishes.find(x => x.id === id);
    if (!w) return;
    const prev = w.status;
    w.status = status; ui.ask = null; state.pending++; renderLive();
    try {
      await post({ action: 'wish-status', id, status });
      if (FINISHED.includes(status)) toast(`Marked ${status.toLowerCase()}: ${w.name}`, 6000, { label: 'Undo', fn: () => setWishStatus(id, prev || null) });
      announce();
    } catch (e) {
      w.status = prev; renderLive(); toast(`Couldn't save: ${errText(e)}`, 8000);
    } finally { state.pending--; }
  }

  async function wishToItem(id) {
    const w = state.wishes.find(x => x.id === id);
    if (!w) return;
    const prev = w.status;
    const tmp = { id: 'tmp-' + Date.now(), name: w.name, brand: '', cat: (w.cat || [])[0] || null, sub: [], color: null, color2: [], price: w.price, acq: state.today, status: ['Active'], loc: null, season: [], n: 0, last: null, photo: w.photo || '' };
    w.status = 'Purchased'; ui.ask = null; state.items.push(tmp); state.pending++; renderLive();
    try {
      await post({ action: 'wish-to-item', id });
      toast(`Added to your wardrobe: ${w.name}`, 5000);
      announce();
    } catch (e) {
      w.status = prev; const i = state.items.indexOf(tmp); if (i !== -1) state.items.splice(i, 1);
      renderLive(); toast(`Couldn't save: ${errText(e)}`, 8000);
    } finally { state.pending--; }
  }

  /* ---------- wiring ---------- */
  if (has('outfit')) $('openBuilder').addEventListener('click', () => openBuilder());
  if (has('outfits')) {
    document.querySelectorAll('[data-sort]').forEach(b => b.addEventListener('click', () => {
      ui.sort = b.dataset.sort;
      document.querySelectorAll('[data-sort]').forEach(x => x.setAttribute('aria-selected', x === b));
      renderOutfits();
    }));
    $('ofGrid').addEventListener('click', e => {
      const card = e.target.closest('.oc'); if (!card) return;
      if (e.target.closest('[data-fav]')) toggleFav(card.dataset.id);
      else if (e.target.closest('[data-open-outfit]')) openDetail(card.dataset.id);
    });
  }
  if (has('cats')) document.querySelectorAll('[data-by]').forEach(b => b.addEventListener('click', () => {
    ui.by = b.dataset.by; ui.catAnim = true;
    document.querySelectorAll('[data-by]').forEach(x => x.setAttribute('aria-selected', x === b));
    renderCats();
  }));
  if (has('wishlist')) {
    $('wl').addEventListener('click', e => {
      const b = e.target.closest('button[data-act]'); if (!b) return;
      const row = b.closest('.wc'); if (!row) return;
      const id = row.dataset.id;
      const act = b.dataset.act;
      if (act === 'buy') { ui.ask = id; renderWishlist(); }
      else if (act === 'cancel') { ui.ask = null; renderWishlist(); }
      else if (act === 'bought') setWishStatus(id, 'Purchased');
      else if (act === 'toitem') wishToItem(id);
    });
    $('wl').addEventListener('change', e => {
      const s = e.target.closest('select[data-act="status"]'); if (!s) return;
      setWishStatus(s.closest('.wc').dataset.id, s.value || null);
    });
  }
  // the window
  sheet().addEventListener('click', e => {
    const t = e.target;
    if (t.closest('[data-close]')) { closeSheet(); return; }
    const pc = t.closest('.pc:not(.static)'); if (pc && ob.open) { obToggle(pc.dataset.id); return; }
    const chip = t.closest('[data-cat]'); if (chip) { ob.cat = chip.dataset.cat; ob.type = ''; obRender(); return; }
    const ty = t.closest('[data-type]'); if (ty) { ob.type = ty.dataset.type; obRenderTypes(); obRenderGrid(); return; }
    const rm = t.closest('[data-remove]'); if (rm) { obToggle(rm.dataset.remove); return; }
    if (t.closest('#obSave')) { saveOutfit(); return; }
    if (t.closest('[data-detail-fav]')) { toggleFav(detailId); return; }
    if (t.closest('[data-detail-wear]')) { wearOutfit(detailId); return; }
  });
  sheet().addEventListener('input', e => { if (e.target.id === 'obSearch') { ob.q = e.target.value; obRenderGrid(); } });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !sheet().hidden) closeSheet(); });
  document.addEventListener('click', e => {
    const f = e.target.closest('[data-open-form]'); if (f) { openForm(f.dataset.openForm); return; }
    if (e.target.closest('[data-open-builder]')) { openBuilder(); return; }
    const sl = e.target.closest('[data-sleeper]'); if (sl) openBuilder(sl.dataset.sleeper);
  });

  /* ---------- render ---------- */
  function renderLive() {
    if (has('outfit')) renderToday();
    if (has('outfits')) renderOutfits();
    if (has('closet')) renderCloset();
    if (has('cats')) renderCats();
    if (has('wishlist')) renderWishlist();
    if (detailId && !sheet().hidden) renderDetail();
  }

  function renderAll() {
    ['add', 'wish'].forEach(w => {
      if (!has(w)) return;
      if (!forms[w]) {
        if (state.err.schema) {
          document.querySelector(`.card[data-w="${w}"]`).innerHTML = `<h2>${esc(FORM_DEFS[w].title)}</h2><p class="muted note">Couldn't read the database options: ${esc(state.err.schema.error)}${state.err.schema.hint ? ' ' + esc(state.err.schema.hint) : ''}</p>`;
        } else if (state.schema) buildForm(w);
      } else updateMsg(forms[w]);
    });
    renderLive();
  }

  ['add', 'wish'].forEach(w => { if (has(w)) document.querySelector(`.card[data-w="${w}"]`).innerHTML = `<h2>${esc(FORM_DEFS[w].title)}</h2><div class="skel"><i></i><i></i><i></i></div>`; });

  refresh();
  setInterval(refresh, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  document.documentElement.addEventListener('pointerenter', () => { if (Date.now() - state.loadedAt > 8000) refresh(); });
})();
