'use strict';
/* Wardrobe widgets: one page, many pieces.
   /wardrobe/index.html?key=KEY&w=add      -> just that widget
   w = add | wish | wear | closet | cats | wishlist | all   (comma-separate to combine)
   Optional: &cur=$ to change the currency symbol (default ₹), &bg=transparent or &bg=HEX */
(() => {
  const API = '/api/wardrobe';
  const params = new URLSearchParams(location.search);
  const KEY = params.get('key') || '';
  const CUR = params.get('cur') || '\u20B9';
  const NEEDS = {
    add: ['items', 'schema'], wish: ['wishes', 'schema'], wear: ['items', 'outfits'],
    closet: ['items'], cats: ['items'], wishlist: ['wishes', 'schema'],
  };
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
  const asked = (params.get('w') || 'all').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
  const wantAll = asked.includes('all');
  const shown = wantAll ? Object.keys(NEEDS) : asked.filter(w => NEEDS[w]);
  const unknown = asked.filter(w => w !== 'all' && !NEEDS[w]);
  document.querySelectorAll('.card[data-w]').forEach(c => { c.hidden = !shown.includes(c.dataset.w); });
  const MULTI = shown.length !== 1;
  document.body.dataset.mode = MULTI ? 'multi' : 'single';
  if (unknown.length || !shown.length) {
    const b = $('bad'); b.hidden = false;
    b.innerHTML = '<h2>Unknown widget</h2><p class="muted note">Use w=add, wish, wear, closet, cats, wishlist or all.</p>';
  }
  const has = w => shown.includes(w);
  const need = [...new Set(shown.flatMap(w => NEEDS[w]))];

  const state = { today: null, items: [], outfits: [], wishes: [], schema: null, err: {}, pending: 0, loadedAt: 0, gaugeDone: false };
  const ui = { tab: 'item', q: '', by: 'cat', ask: null, snap: null, showAll: false, catAnim: true };
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
  const CHECK = '<svg viewBox="0 0 12 12" fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 6.3l2.4 2.4 4.6-5"/></svg>';
  const PLUS = '<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M7 1.5v11M1.5 7h11"/></svg>';
  const ARCH_SVG = c => `<svg viewBox="0 0 46 56" stroke="${c}" aria-hidden="true"><path d="M3 54V21a20 20 0 0 1 40 0v33"/><path d="M12 54V22a11 11 0 0 1 22 0v32" opacity=".55"/></svg>`;

  /* Garment colours. These are data, not theme: a "Navy" chip should look navy. */
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
  const colorAttr = name => {
    const c = COLORS[name];
    if (!c) return '';
    return c[0] === '#' ? ` style="--c:${c}"` : ` data-k="${c}"`;
  };

  /* An arch-shaped photo (or a soft tinted initial when there is no photo). Tint follows the garment's colour. */
  const archHtml = r => {
    const hex = r.color ? hexOf(r.color) : null;
    const cls = 'arch' + (hex ? ' tinted' : '') + (hex && lumOf(hex) > 0.6 ? ' light' : '');
    const inner = r.photo
      ? `<img src="${esc(r.photo)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-ini="${esc(initial(r.name))}">`
      : `<span class="ini">${esc(initial(r.name))}</span>`;
    return `<span class="${cls}"${hex ? ` style="--c:${hex}"` : ''}>${inner}</span>`;
  };
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
  async function post(body) {
    // Writes authenticate with the x-widget-key header (same as the Sail and Meal widgets); ?key= only works for reads.
    const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-widget-key': KEY }, body: JSON.stringify(body) });
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
      if (data[k].error) state.err[k] = data[k]; else { state.err[k] = null; state[k] = data[k].rows; }
    });
    if (data.schema) { if (data.schema.error) state.err.schema = data.schema; else { state.err.schema = null; state.schema = data.schema; } }
    state.loadedAt = Date.now();
  }

  function showBad(e) {
    const b = $('bad'); b.hidden = false;
    b.innerHTML = `<h2>Couldn't load your wardrobe</h2><p class="muted note">${esc(e.message)}${e.hint ? ' ' + esc(e.hint) : ''}<br>Check the key in the link, then open /api/wardrobe-health to see what's wrong.</p>`;
  }
  const secError = (k, what) => (state.err[k] ? `<p class="empty">Couldn't read ${what}: ${esc(state.err[k].error)}${state.err[k].hint ? ' ' + esc(state.err[k].hint) : ''}</p>` : '');
  const emptyState = (title, text, form, label) => `<div class="empty-state">${ARCH_SVG('#E2C593')}<strong>${esc(title)}</strong><p>${esc(text)}</p>${form && has(form) ? `<button type="button" class="btn sm primary" data-open-form="${form}">${esc(label)}</button>` : ''}</div>`;

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
      nameProp: 'Name', action: 'item-create', save: 'Add to wardrobe', done: 'Added', dupList: () => state.items,
      sticky: ['Item Category', 'Location', 'Season', 'Item Status', 'Date Acquired', 'Condition'],
      essentials: [
        { p: 'Name', label: 'Name', kind: 'text', ph: 'Wine silk shirt', req: true, wide: true, lg: true },
        { p: 'Item Category', label: 'Category', kind: 'opts', chips: true, wide: true },
        { p: 'Item Subcategory', label: 'Type', kind: 'opts', multi: true, wide: true, filter: 'sub' },
        { p: 'Primary Color', label: 'Colour', kind: 'swatch', wide: true, col2: true },
        { p: 'Brand', label: 'Brand', kind: 'text', col2: true },
        { p: 'Price', label: 'Price', kind: 'money', col2: true },
      ],
      more: [
        { p: 'Secondary Colors', label: 'Other colours', kind: 'swatch', multi: true, wide: true, full: true, group: 'Basics' },
        { p: 'Size', label: 'Size', kind: 'text' },
        { p: 'Date Acquired', label: 'Date acquired', kind: 'date', def: 'today' },
        { p: 'Item Status', label: 'Status', kind: 'opts', multi: true, wide: true, def: ['Active'] },
        { p: 'Location', label: 'Where it lives', kind: 'opts', wide: true },
        { p: 'Wear Count', label: 'Times worn already', kind: 'number', def: 0 },
        { p: 'Season', label: 'Season', kind: 'opts', multi: true, wide: true, chips: true, group: 'Style' },
        { p: 'Occasion', label: 'Occasion', kind: 'opts', multi: true, wide: true },
        { p: 'Style/Aesthetic', label: 'Style', kind: 'opts', multi: true, wide: true },
        { p: 'Pattern', label: 'Pattern', kind: 'opts', multi: true, wide: true },
        { p: 'Fabric', label: 'Fabric', kind: 'opts', multi: true, wide: true },
        { p: 'Condition', label: 'Condition', kind: 'opts', multi: true, wide: true, group: 'Care & notes' },
        { p: 'Care', label: 'Care', kind: 'opts', multi: true, wide: true },
        { p: 'Tags', label: 'Tags', kind: 'opts', multi: true, wide: true },
        { p: 'Notes', label: 'Notes', kind: 'area', wide: true, full: true },
        { p: 'Photo', label: 'Photo link', kind: 'url', ph: 'Paste an image link (https://...)', wide: true, full: true },
      ],
    },
    wish: {
      schemaKey: 'wish', title: 'New wish', blurb: 'Park it here before you buy it.',
      nameProp: 'Item Name', action: 'wish-create', save: 'Add to wishlist', done: 'Wish saved', dupList: () => state.wishes,
      sticky: ['Wishlist Priority', 'Wishlist Status', 'Date Added'],
      essentials: [
        { p: 'Item Name', label: 'Name', kind: 'text', ph: 'Silk slip dress', req: true, wide: true, lg: true },
        { p: 'Category', label: 'Category', kind: 'opts', multi: true, chips: true, wide: true },
        { p: 'Wishlist Priority', label: 'How much do you want it', kind: 'opts', chips: true, wide: true },
        { p: 'Brand', label: 'Brand', kind: 'text', col2: true },
        { p: 'Estimated Price', label: 'Price', kind: 'money', col2: true },
        { p: 'Reason / Gap Filled', label: 'Why you want it', kind: 'area', ph: 'What gap does it fill?', wide: true, col2: true },
      ],
      more: [
        { p: 'Link', label: 'Link', kind: 'url', ph: 'https://...', wide: true },
        { p: 'Wishlist Status', label: 'Status', kind: 'opts', wide: true, chips: true, def: 'Considering' },
        { p: 'Date Added', label: 'Date added', kind: 'date', def: 'today' },
        { p: 'Notes', label: 'Notes', kind: 'area', wide: true },
        { p: 'Photo', label: 'Photo link', kind: 'url', ph: 'Paste an image link (https://...)', wide: true },
      ],
    },
  };

  const slug = s => String(s).replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  const CHIP_MAX = 14;      // lists longer than this become search-and-pick (unless the field says chips: true)
  const PICK_PEEK = 12;     // how many suggestions a search-and-pick shows before "more"

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
    const F = { w, def, root, sch, values: {}, session: 0, showAll: false, search: {}, exp: {}, open: !MULTI };
    F.fields = [...def.essentials, ...def.more].filter(f => sch[f.p]);
    F.fieldOf = p => F.fields.find(f => f.p === p);
    F.fields.forEach(f => { F.values[f.p] = defaultFor(F, f); });
    const fld = f => `${f.group ? `<h3 class="fgroup">${esc(f.group)}</h3>` : ''}<div class="fld${f.wide ? ' wide' : ''}${f.full ? ' full' : ''}" data-f="${esc(f.p)}">${fieldInner(F, f)}</div>`;
    const sect = list => list.filter(f => sch[f.p]).map(fld).join('');
    // the essentials sit in two columns on a wide card, and stack on a narrow one
    const cols = list => `<div class="fcols"><div class="fgrid">${sect(list.filter(f => !f.col2))}</div><div class="fgrid">${sect(list.filter(f => f.col2))}</div></div>`;
    const mark = `<svg class="arch-mark" viewBox="0 0 30 38" fill="none" stroke-width="1.8" aria-hidden="true"><path d="M3 37V15a12 12 0 0 1 24 0v22" stroke="#E2C593"/><path d="M9 37V16a6 6 0 0 1 12 0v21" stroke="#D99B96"/></svg>`;
    const headInner = `${mark}<div class="ftitle"><h2>${esc(def.title)}</h2><p class="muted">${esc(def.blurb)}</p></div><span class="fplus">${PLUS}</span>`;
    root.classList.toggle('collapsible', MULTI);
    root.classList.toggle('open', F.open);
    root.innerHTML = `
      ${MULTI ? `<button type="button" class="fhead" data-toggle aria-expanded="${F.open}">${headInner}</button>` : `<div class="fhead">${headInner}</div>`}
      <div class="fbody"${F.open ? '' : ' hidden'}>
        <div class="fscroll">
          ${cols(def.essentials)}
          <button type="button" class="more-toggle" aria-expanded="false">More details</button>
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
    const brand = String((F.values.Brand) || '').trim().toLowerCase();
    let dup = null;
    if (name.length >= 3) dup = F.def.dupList().find(r => r.name.toLowerCase() === name && (!brand || !r.brand || r.brand.toLowerCase() === brand));
    el.classList.toggle('warn', !!dup);
    if (dup) el.textContent = `You already have "${dup.name}"${dup.brand ? ` (${dup.brand})` : ''}.`;
    else if (F.session) el.textContent = `${F.session} added this session`;
    else el.textContent = '';
  }

  function wireForm(F) {
    const { root } = F;
    root.addEventListener('click', e => {
      const t = e.target.closest('button');
      if (!t || !root.contains(t)) return;
      if (t.matches('[data-toggle]')) { setOpen(F, !F.open); return; }
      if (t.matches('[data-save]')) { submitForm(F); return; }
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
    root.addEventListener('input', e => {
      const el = e.target;
      if (el.dataset.in) {
        F.values[el.dataset.in] = el.value;
        const wrap = el.closest('[data-f]'); if (wrap) wrap.classList.remove('bad');
        if (el.dataset.in === F.def.nameProp || el.dataset.in === 'Brand') updateMsg(F);
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
      if (['text', 'url', 'area', 'date'].includes(f.kind)) { const s = String(v || '').trim(); if (s) out[f.p] = s; }
      else if (f.kind === 'money' || f.kind === 'number') { if (v !== '' && v != null && Number.isFinite(Number(v))) out[f.p] = Number(v); }
      else if (f.multi) { if (v.length) out[f.p] = v.slice(); }
      else if (v) out[f.p] = v;
    }
    return out;
  }

  function resetForm(F) {
    F.fields.forEach(f => { if (!F.def.sticky.includes(f.p)) F.values[f.p] = defaultFor(F, f); });
    F.search = {}; F.showAll = false; F.exp = {};
    F.root.querySelectorAll('[data-q]').forEach(i => { i.value = ''; });
  }

  function flashSaved(F) {
    const b = F.root.querySelector('[data-save]'); if (!b) return;
    b.classList.add('saved'); b.textContent = 'Saved \u2713';
    clearTimeout(F.flash);
    F.flash = setTimeout(() => { b.classList.remove('saved'); b.textContent = F.def.save; }, 1500);
  }

  async function submitForm(F) {
    const vals = collect(F);
    const nameProp = F.def.nameProp;
    if (!vals[nameProp]) {
      const wrap = F.root.querySelector(`[data-f="${CSS.escape(nameProp)}"]`);
      wrap.classList.add('bad'); wrap.querySelector('input').focus();
      const msg = F.root.querySelector('[data-msg]'); msg.classList.add('warn'); msg.textContent = 'Give it a name first.';
      return;
    }
    // optimistic: show it everywhere and clear the form right away; put it all back if Notion says no
    const snapshot = JSON.parse(JSON.stringify(F.values));
    const tmp = { id: 'tmp-' + Date.now(), name: vals[nameProp], brand: vals.Brand || '', photo: vals.Photo || '' };
    if (F.w === 'add') Object.assign(tmp, { cat: vals['Item Category'] || null, sub: vals['Item Subcategory'] || [], color: vals['Primary Color'] || null, color2: vals['Secondary Colors'] || [], price: vals.Price == null ? null : vals.Price, acq: vals['Date Acquired'] || null, status: vals['Item Status'] || [], loc: vals.Location || null, season: vals.Season || [], n: vals['Wear Count'] || 0, last: null });
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
      F.values = snapshot; F.session--; renderFormAll(F); updateMsg(F); renderLive();
      toast(`Couldn't save: ${errText(e)}`, 8000);
    } finally { state.pending--; }
  }

  /* =========================================================
     WORN TODAY
     ========================================================= */
  const TILE_PEEK = 12, TILE_MAX = 48;

  function wearPool() {
    const q = ui.q.trim().toLowerCase();
    let list = ui.tab === 'item'
      ? state.items.filter(isActive)
      : state.outfits.filter(o => !['Archived', 'Retired'].includes(o.status));
    if (q) list = list.filter(r => `${r.name} ${r.brand || ''} ${r.cat || ''}`.toLowerCase().includes(q));
    return list;
  }
  // Order is decided when you open the tab or search, and stays put while you tap, so tiles don't jump under your finger.
  function wearOrdered() {
    const pool = wearPool();
    if (!ui.snap) {
      ui.snap = pool.slice().sort((a, b) =>
        ((b.last === state.today) - (a.last === state.today)) || (b.last || '').localeCompare(a.last || '') || a.name.localeCompare(b.name)).map(r => r.id);
    }
    const pos = new Map(ui.snap.map((id, i) => [id, i]));
    return pool.slice().sort((a, b) => (pos.has(a.id) ? pos.get(a.id) : -1) - (pos.has(b.id) ? pos.get(b.id) : -1));
  }

  function renderWear() {
    const el = $('tiles');
    $('wearDate').textContent = state.today ? longDate(state.today) : '';
    const errKey = ui.tab === 'item' ? 'items' : 'outfits';
    if (state.err[errKey]) { el.innerHTML = secError(errKey, ui.tab === 'item' ? 'your pieces' : 'your outfits'); $('tilesMore').hidden = true; return; }
    const todayN = state.items.filter(i => i.last === state.today && isActive(i)).length;
    const wc = $('wearCount');
    wc.textContent = todayN ? `${plural(todayN, 'piece')} logged` : 'Nothing logged yet';
    wc.classList.toggle('quiet', !todayN);
    const list = wearOrdered();
    const limit = ui.q || ui.showAll ? TILE_MAX : TILE_PEEK;
    const show = list.slice(0, limit);
    el.innerHTML = show.length ? show.map(r => {
      const meta = r.last ? `${plural(r.n, 'wear')} \u00B7 ${ago(r.last)}` : (ui.tab === 'outfit' ? `${plural(r.items.length, 'piece')}, never worn` : 'Not worn yet');
      return `<button type="button" class="tile" data-id="${esc(r.id)}" aria-pressed="${r.last === state.today}">
        ${archHtml(r)}
        <span class="t-name">${esc(r.name)}</span><span class="t-meta">${esc(meta)}</span>
        <span class="t-check">${CHECK}</span></button>`;
    }).join('') : (ui.q
      ? '<p class="empty">Nothing matches that search.</p>'
      : ui.tab === 'item'
        ? emptyState('Your closet is waiting', 'Add your first piece, then tap it here each day to log what you wore.', 'add', 'Add a piece')
        : emptyState('No outfits yet', 'Build an outfit in Notion and it will show up here, ready to log in one tap.'));
    const more = $('tilesMore');
    if (!ui.q && list.length > TILE_PEEK) { more.hidden = false; more.textContent = ui.showAll ? 'Show fewer' : `Show all ${list.length}`; }
    else more.hidden = true;
    $('tilesNote').textContent = list.length > limit && (ui.q || ui.showAll) ? `Showing ${limit} of ${list.length}. Search to find the rest.` : '';
  }

  function applyChange(c, useNew) {
    const row = state.items.find(i => i.id === c.id) || state.outfits.find(o => o.id === c.id);
    if (!row) return;
    row.n = useNew ? c.count : (c.prevCount || 0);
    row.last = useNew ? state.today : c.prevLast;
  }

  async function wearTap(id) {
    const kind = ui.tab;
    const row = (kind === 'item' ? state.items : state.outfits).find(r => r.id === id);
    if (!row) return;
    if (String(id).startsWith('tmp-')) { toast('Still saving. Try again in a second.'); return; }
    if (row.last === state.today) {
      const u = undoMap.get(id);
      if (u) return undoWear(id, u);
      toast('Already logged today.'); return;
    }
    const affected = [row];
    if (kind === 'outfit') row.items.forEach(iid => { const it = state.items.find(x => x.id === iid); if (it && it.last !== state.today) affected.push(it); });
    const prev = affected.map(r => ({ r, n: r.n, last: r.last }));
    affected.forEach(r => { r.n = (r.n || 0) + 1; r.last = state.today; });
    state.pending++; renderLive();
    try {
      const res = await post({ action: 'wear', kind, id });
      undoMap.set(id, res.changes);
      toast(kind === 'outfit' ? `Logged outfit: ${row.name}` : `Logged: ${row.name}`, 6000, { label: 'Undo', fn: () => undoWear(id, res.changes) });
      announce();
    } catch (e) {
      prev.forEach(p => { p.r.n = p.n; p.r.last = p.last; });
      renderLive(); toast(`Couldn't save: ${errText(e)}`, 8000);
    } finally { state.pending--; }
  }

  async function undoWear(id, changes) {
    const now = changes.map(c => {
      const row = state.items.find(i => i.id === c.id) || state.outfits.find(o => o.id === c.id);
      return row ? { row, n: row.n, last: row.last } : null;
    }).filter(Boolean);
    changes.forEach(c => applyChange(c, false));
    undoMap.delete(id);
    state.pending++; renderLive();
    try { await post({ action: 'wear-restore', changes }); announce(); }
    catch (e) {
      now.forEach(p => { p.row.n = p.n; p.row.last = p.last; });
      undoMap.set(id, changes); renderLive(); toast(`Couldn't undo: ${errText(e)}`, 8000);
    } finally { state.pending--; }
  }

  /* =========================================================
     CLOSET GAUGE
     ========================================================= */
  const archPath = r => `M${100 - r} 188V100A${r} ${r} 0 0 1 ${100 + r} 100V188`;

  function renderCloset() {
    if (state.err.items) { $('legend').innerHTML = secError('items', 'your pieces'); return; }
    const act = state.items.filter(isActive);
    const total = act.length;
    const within = d => act.filter(i => i.last && since(i.last) <= d).length;
    const w7 = within(7), w30 = within(30), w90 = within(90);
    const pct = n => (total ? Math.round((n / total) * 100) : 0);
    const rings = [[84, 'f90', pct(w90)], [64, 'f30', pct(w30)], [44, 'f7', pct(w7)]];
    const animate = !state.gaugeDone;
    $('gauge').innerHTML = '<path class="sill" d="M6 190H194"/>' + rings.map(([r]) => `<path class="track" d="${archPath(r)}"/>`).join('') +
      rings.map(([r, c, p]) => `<path class="fill ${c}" d="${archPath(r)}" pathLength="100" style="stroke-dasharray:${animate ? 0 : p} 100;opacity:${p ? 1 : 0}"/>`).join('');
    if (animate) {
      state.gaugeDone = true;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        $('gauge').querySelectorAll('.fill').forEach((p, i) => { p.style.strokeDasharray = `${rings[i][2]} 100`; });
      }));
    }
    $('gaugeNum').textContent = total;
    $('gaugeOf').textContent = total === 1 ? 'piece' : 'pieces';
    $('closetSub').textContent = total ? `${pct(w30)}% worn this month` : '';
    $('legend').innerHTML =
      `<div class="l7"><i></i>This week<b>${w7} <small>of ${total}</small></b></div>` +
      `<div class="l30"><i></i>This month<b>${w30} <small>of ${total}</small></b></div>` +
      `<div class="l90"><i></i>Last 90 days<b>${w90} <small>of ${total}</small></b></div>`;
    const value = act.reduce((s, i) => s + (i.price || 0), 0);
    const never = act.filter(i => !i.last).length;
    $('cstats').innerHTML = total
      ? `<div><span class="num">${money(value)}</span><span class="muted">Closet value</span></div><div><span class="num">${never}</span><span class="muted">Never worn</span></div>`
      : '<p class="hint">Your closet is empty. Add your first piece to see this fill up.</p>';
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
      el.innerHTML = emptyState('Nothing here yet', 'Once you add pieces, you will see what your closet is made of.', 'add', 'Add a piece');
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
      const dim = label === 'No category' || label === 'No colour' ? ' dim' : '';
      const w = Math.min(100, Math.max(6, Math.round((n / max) * 100)));
      const dot = byColor ? `<i class="dot"${hex ? ` style="--c:${c}"` : c ? ` data-k="${c}"` : ''}></i>` : '';
      const fill = byColor && c ? `<i class="col" style="--w:${w}%;--i:${i}${hex ? `;--c:${c}` : ''}"${!hex ? ` data-k="${c}"` : ''}></i>` : `<i style="--w:${w}%;--i:${i}"></i>`;
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
  const FINISHED = ['Purchased', 'Gifted', 'No longer needed', 'Skipped'];
  const FALLBACK_STATUS = ['Considering', 'Researching', 'Wait for sale', 'On Hold', 'Purchased', 'Gifted', 'No longer needed', 'Skipped'];

  function renderWishlist() {
    const box = $('wl');
    if (state.err.wishes) { box.innerHTML = secError('wishes', 'your wishlist'); return; }
    if (document.activeElement && document.activeElement.tagName === 'SELECT' && box.contains(document.activeElement)) return;   // don't close an open dropdown
    const open = state.wishes.filter(w => !FINISHED.includes(w.status));
    const total = open.reduce((s, w) => s + (w.price || 0), 0);
    $('wlTotal').textContent = open.length ? `${plural(open.length, 'wish', 'wishes')} \u00B7 ${money(total)}` : '';
    if (!open.length) { box.innerHTML = emptyState('Nothing on the list', 'Park things you are thinking about here before you buy them.', 'wish', 'Add a wish'); return; }
    const statuses = (state.schema && state.schema.wish && state.schema.wish['Wishlist Status'] && state.schema.wish['Wishlist Status'].options) || FALLBACK_STATUS;
    const groups = new Map();
    open.forEach(w => { const k = w.priority || 'No priority'; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(w); });
    const rank = k => { const i = PRIORITY_ORDER.indexOf(k); return i === -1 ? (k === 'No priority' ? 999 : 500) : i; };
    box.innerHTML = [...groups].sort((a, b) => rank(a[0]) - rank(b[0])).map(([k, list]) => {
      const sub = list.reduce((s, w) => s + (w.price || 0), 0);
      return `<div class="wl-group"><h3>${esc(k)}</h3><span>${sub ? money(sub) : ''}</span></div>` + list.map(w => {
        const sub2 = [w.brand, w.reason].filter(Boolean).join(' \u00B7 ');
        const opts = `<option value=""${w.status ? '' : ' selected'}>Set status</option>` + statuses.map(s => `<option${s === w.status ? ' selected' : ''}>${esc(s)}</option>`).join('');
        const ask = ui.ask === w.id
          ? `<div class="buy-ask"><span>Add it to your wardrobe too?</span><button type="button" class="btn sm primary" data-act="toitem">Add to wardrobe</button><button type="button" class="btn sm ghost" data-act="bought">Just mark bought</button><button type="button" class="btn sm ghost" data-act="cancel">Cancel</button></div>`
          : `<div class="w-act"><select class="sel" data-act="status" aria-label="Status for ${esc(w.name)}">${opts}</select>${/^https?:/i.test(w.link) ? `<a href="${esc(w.link)}" target="_blank" rel="noopener noreferrer">Open link</a>` : ''}<button type="button" class="btn sm ghost" data-act="buy">Bought it</button></div>`;
        return `<div class="wrow" data-id="${esc(w.id)}">${archHtml(w)}
          <div class="w-main"><div class="w-name">${esc(w.name)}</div><div class="w-sub">${esc(sub2)}</div></div>
          <div class="w-price">${w.price != null ? esc(money(w.price)) : ''}</div>${ask}</div>`;
      }).join('');
    }).join('');
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
    const tmp = { id: 'tmp-' + Date.now(), name: w.name, brand: w.brand || '', cat: null, sub: [], color: null, color2: [], price: w.price, acq: state.today, status: ['Active'], loc: null, season: [], n: 0, last: null, photo: '' };
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

  /* ---------- wiring for the live widgets ---------- */
  if (has('wear')) {
    $('tiles').addEventListener('click', e => { const t = e.target.closest('.tile'); if (t) wearTap(t.dataset.id); });
    document.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => {
      ui.tab = b.dataset.tab; ui.snap = null; ui.showAll = false;
      document.querySelectorAll('[data-tab]').forEach(x => x.setAttribute('aria-selected', x === b));
      renderWear();
    }));
    $('wearSearch').addEventListener('input', e => { ui.q = e.target.value; ui.snap = null; renderWear(); });
    $('tilesMore').addEventListener('click', () => { ui.showAll = !ui.showAll; renderWear(); });
  }
  if (has('cats')) document.querySelectorAll('[data-by]').forEach(b => b.addEventListener('click', () => {
    ui.by = b.dataset.by; ui.catAnim = true;
    document.querySelectorAll('[data-by]').forEach(x => x.setAttribute('aria-selected', x === b));
    renderCats();
  }));
  if (has('wishlist')) {
    $('wl').addEventListener('click', e => {
      const b = e.target.closest('button[data-act]'); if (!b) return;
      const row = b.closest('.wrow'); if (!row) return;
      const id = row.dataset.id;
      const act = b.dataset.act;
      if (act === 'buy') { ui.ask = id; renderWishlist(); }
      else if (act === 'cancel') { ui.ask = null; renderWishlist(); }
      else if (act === 'bought') setWishStatus(id, 'Purchased');
      else if (act === 'toitem') wishToItem(id);
    });
    $('wl').addEventListener('change', e => {
      const s = e.target.closest('select[data-act="status"]'); if (!s) return;
      setWishStatus(s.closest('.wrow').dataset.id, s.value || null);
    });
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-open-form]');
    if (b) openForm(b.dataset.openForm);
  });

  /* ---------- render ---------- */
  function renderLive() {
    if (has('wear')) renderWear();
    if (has('closet')) renderCloset();
    if (has('cats')) renderCats();
    if (has('wishlist')) renderWishlist();
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
