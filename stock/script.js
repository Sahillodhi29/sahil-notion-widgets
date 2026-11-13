'use strict';
/* ============================================================
   Stock & Resources widgets: what you keep at home and when it runs out.

   /stock/index.html?key=KEY&w=shelf      -> just that widget
   w = add | shelf | restock | cost | all (comma-separate to combine)
   Optional: &bg=transparent | &bg=HEX

   The shelf lists one category at a time; pressing "Need restocking" on an
   item moves it into the Restocking area, which lists the same categories and
   clears an item when you press "Restocked!".

   Every item lives in the Notion "Stock" database with a cadence
   (Every + Unit) and the date it was last restocked. The next due date
   and the monthly run rate are worked out here, so nothing has to be
   kept in step by hand in Notion.
   ============================================================ */
(() => {
  const API = '/api/stock';
  const params = new URLSearchParams(location.search);
  const KEY = params.get('key') || '';
  const WIDGETS = ['add', 'shelf', 'restock', 'cost'];
  const ALIAS = { due: 'restock' };            // old links to the shopping list keep working
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- background ---------- */
  const bgParam = params.get('bg');
  if (bgParam) {
    const v = bgParam === 'transparent' ? 'transparent' : /^[0-9a-f]{3,8}$/i.test(bgParam) ? '#' + bgParam : null;
    if (v) { document.documentElement.style.background = v; document.body.style.background = v; }
  }

  /* ---------- which widgets? ---------- */
  const asked = (params.get('w') || 'all').toLowerCase().split(',').map(s => s.trim()).filter(Boolean).map(s => ALIAS[s] || s);
  const wantAll = asked.includes('all');
  const shown = wantAll ? WIDGETS.slice() : asked.filter(w => WIDGETS.includes(w));
  const unknown = asked.filter(w => w !== 'all' && !WIDGETS.includes(w));
  document.querySelectorAll('.card[data-w]').forEach(c => { c.hidden = !shown.includes(c.dataset.w); });
  document.body.dataset.mode = shown.length === 1 ? 'single' : 'multi';
  const has = w => shown.includes(w);
  if (unknown.length || !shown.length) {
    const b = $('bad'); b.hidden = false;
    b.innerHTML = '<h2>Unknown widget</h2><p class="muted">Use w=add, shelf, restock, cost or all.</p>';
  }

  /* ---------- state ---------- */
  const state = {
    today: null, items: [], meta: { categories: [], units: [] },
    loaded: false, loadedAt: 0, pending: 0,
    shelfCat: null, restockCat: null,
    add: { cat: null, unit: 'Month' },
    undo: new Map(),          // item id -> what to put back if Undo is pressed
  };

  /* ---------- formatting & dates ---------- */
  const money = n => '₹' + Math.round(n).toLocaleString('en-IN');
  const short = n => (n >= 1000 ? '₹' + (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'k' : money(n));
  const addDays = (d, n) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
  const addMonths = (d, n) => {
    const [y, m, day] = d.split('-').map(Number);
    const t = new Date(Date.UTC(y, m - 1 + n, 1));
    const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
    t.setUTCDate(Math.min(day, last));
    return t.toISOString().slice(0, 10);
  };
  const daysBetween = (a, b) => Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 864e5);
  const fmtDate = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' });

  /* ---------- the maths: cadence, next due, monthly cost ---------- */
  const WORD = { day: 'day', week: 'week', month: 'month', quarter: 'quarter', year: 'year' };
  function cycle(it) {
    const n = it.every > 0 ? it.every : 1;
    const u = String(it.unit || 'Month').toLowerCase();
    if (u.startsWith('day')) return { key: 'day', n, days: n };
    if (u.startsWith('week')) return { key: 'week', n, days: n * 7 };
    if (u.startsWith('quat') || u.startsWith('quar')) return { key: 'quarter', n, days: n * 91.31 };
    if (u.startsWith('year')) return { key: 'year', n, days: n * 365.25 };
    return { key: 'month', n, days: n * 30.44 };
  }
  function nextOf(it) {
    if (!it.last) return null;
    const c = cycle(it);
    if (c.key === 'day' || c.key === 'week') return addDays(it.last, Math.round(c.days));
    if (c.key === 'month') return addMonths(it.last, c.n);
    if (c.key === 'quarter') return addMonths(it.last, 3 * c.n);
    return addMonths(it.last, 12 * c.n);
  }
  function info(it) {
    const c = cycle(it), next = nextOf(it);
    const span = next ? Math.max(1, daysBetween(it.last, next)) : Math.max(1, Math.round(c.days));
    const left = next ? daysBetween(state.today, next) : null;
    const per = it.cost ? it.cost * (365.25 / 12) / span : 0;
    const tone = left === null ? 'new' : left < 0 ? 'late' : left === 0 ? 'today' : left <= 3 ? 'soon' : 'ok';
    return { c, next, span, left, per, tone };
  }
  const cadence = it => { const c = cycle(it); return c.n === 1 ? 'every ' + WORD[c.key] : `every ${c.n} ${WORD[c.key]}s`; };
  function dueLabel(x) {
    if (x.tone === 'new') return 'never logged';
    if (x.left < 0) return `${-x.left} ${-x.left === 1 ? 'day' : 'days'} late`;
    if (x.left === 0) return 'due today';
    if (x.left === 1) return 'tomorrow';
    return `in ${x.left} days`;
  }
  const byName = (a, b) => a.item.localeCompare(b.item, 'en', { sensitivity: 'base' });

  /* ---------- toast ---------- */
  function toast(msg, ms) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), ms || 3000); }
  const errText = e => `${e.message}${e.hint ? ' ' + e.hint : ''}`;

  /* ---------- add: a new thing to keep in stock ---------- */
  function renderAdd() {
    const A = state.add, cats = state.meta.categories || [];
    if (A.cat && !cats.includes(A.cat)) A.cat = null;
    $('iCats').innerHTML = cats.length
      ? cats.map(c => `<button type="button" class="chip" data-c="${esc(c)}" aria-pressed="${A.cat === c}">${esc(c)}</button>`).join('')
      : '<span class="muted small">Add a category option in Notion and it shows up here.</span>';
    $('iUnit').innerHTML = (state.meta.units.length ? state.meta.units : ['Day', 'Week', 'Month', 'Quarter', 'Year'])
      .map(u => `<button type="button" data-v="${esc(u)}" aria-pressed="${A.unit === u}">${esc(u)}</button>`).join('');
    const rows = state.items.filter(x => x.last).sort((a, b) => b.last.localeCompare(a.last)).slice(0, 4);
    $('recent').innerHTML = rows.length ? rows.map(t => {
      return `<li><span class="rn">${esc(t.item)}<small>${esc(dm(t.last))} · ${esc(cadence(t))}</small></span>` +
        `<span class="ra">${t.cost ? short(t.cost) : ''}</span>` +
        `<button type="button" class="undo" data-id="${esc(t.id)}"${state.undo.has(t.id) ? '' : ' disabled'}>Undo</button></li>`;
    }).join('') : '';
    updateSave();
  }
  const dm = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  function newCategory() { return ($('iNewCat').value || '').trim(); }
  function updateSave() {
    const name = ($('iName').value || '').trim(), ok = !!name && !!(state.add.cat || newCategory());
    $('iSave').disabled = !ok;
  }
  async function submitItem() {
    const name = ($('iName').value || '').trim();
    const cat = state.add.cat || newCategory();
    if (!name || !cat) return;
    const every = Math.max(1, Math.round(parseFloat($('iEvery').value) || 1));
    const costRaw = ($('iCost').value || '').trim();
    const values = {
      'Item': name, 'Category': cat, 'Every': every, 'Unit': state.add.unit,
      'Pack': ($('iPack').value || '').trim(), 'Note': ($('iNote').value || '').trim(),
      'Cost': costRaw === '' ? null : Math.max(0, parseFloat(costRaw) || 0),
    };
    $('iSave').disabled = true;
    try {
      const j = await post({ action: 'item-create', values });
      state.items.push(j.row);
      if (cat && !state.meta.categories.includes(cat)) { state.meta.categories.push(cat); state.meta.categories.sort(); }
      $('iName').value = ''; $('iPack').value = ''; $('iCost').value = ''; $('iNote').value = ''; $('iNewCat').value = ''; $('iEvery').value = '1';
      toast(`${name} added. Press Need restocking when it runs out.`);
      if (bc) bc.postMessage('changed');
    } catch (e) {
      console.error('Add failed:', e);
      toast(`Couldn't save: ${errText(e)}`, 7000);
    } finally { renderAll(); }
  }

  /* ---------- restock / need / undo ---------- */
  async function doRestock(id) {
    const it = state.items.find(x => x.id === id); if (!it) return;
    const before = { last: it.last, needed: it.needed, cost: it.cost };
    it.last = state.today; it.needed = false;
    state.pending++; renderAll();
    try {
      const j = await post({ action: 'restock', id });
      Object.assign(it, j.row);
      state.undo.set(id, j.prev || before);
      if (bc) bc.postMessage('changed');
      toast(`${it.item} restocked today.`, 2600);
    } catch (e) {
      console.error('Restock failed:', e);
      Object.assign(it, before);
      toast(`Couldn't save: ${errText(e)}`, 7000);
    } finally { state.pending--; renderAll(); }
  }
  async function undoRestock(id) {
    const it = state.items.find(x => x.id === id), prev = state.undo.get(id);
    if (!it || !prev) return;
    const self = { last: it.last, needed: it.needed, cost: it.cost };
    it.last = prev.last; it.needed = prev.needed; it.cost = prev.cost;
    state.pending++; renderAll();
    try {
      const j = await post({ action: 'restock-undo', id, prev });
      Object.assign(it, j.row);
      state.undo.delete(id);
      if (bc) bc.postMessage('changed');
    } catch (e) {
      console.error('Undo failed:', e);
      Object.assign(it, self);
      toast(`Couldn't undo: ${errText(e)}`, 7000);
    } finally { state.pending--; renderAll(); }
  }
  async function toggleNeed(id) {
    const it = state.items.find(x => x.id === id); if (!it) return;
    const before = it.needed;
    it.needed = !before;
    state.pending++; renderAll();
    try {
      await post({ action: 'need', id, value: it.needed });
      if (bc) bc.postMessage('changed');
      toast(it.needed ? `${it.item} moved to the restocking area.` : `${it.item} taken off the restocking list.`, 2400);
    } catch (e) { console.error('Need failed:', e); it.needed = before; toast(`Couldn't save: ${errText(e)}`, 7000); }
    finally { state.pending--; renderAll(); }
  }

  /* ---------- categories: one at a time ---------- */
  function catsOf() {
    const set = new Set();
    state.items.forEach(it => { if (it.cat) set.add(it.cat); });
    return [...set].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
  }
  const pickCat = (cats, cur) => (cur && cats.includes(cur) ? cur : cats[0] || null);
  function catChips(id, cats, pick) {
    $(id).innerHTML = cats
      .map(c => `<button type="button" class="chip" data-c="${esc(c)}" aria-pressed="${pick === c}">${esc(c)}</button>`)
      .join('');
  }
  const itemRow = (it, x, action) => `<li class="stockrow">
      <span class="rn">${esc(it.item)}${it.pack ? ` <i>${esc(it.pack)}</i>` : ''}<small>${esc(cadence(it))} · ${esc(dueLabel(x))}</small></span>
      ${action}
    </li>`;

  /* ---------- the shelf: every item in the chosen category ---------- */
  function renderShelf() {
    const cats = catsOf();
    state.shelfCat = pickCat(cats, state.shelfCat);
    catChips('shelfCats', cats, state.shelfCat);
    const rows = (state.shelfCat ? state.items.filter(it => it.cat === state.shelfCat) : state.items.slice()).sort(byName);
    $('shelfNote').textContent = rows.length ? `${rows.length} ${rows.length === 1 ? 'item' : 'items'}` : '';
    const box = $('shelfList');
    if (!state.items.length) { box.innerHTML = '<p class="empty">Your shelf is empty. Add something with the “New stock item” widget.</p>'; return; }
    if (!rows.length) { box.innerHTML = `<p class="empty">Nothing in ${esc(state.shelfCat)} yet.</p>`; return; }
    box.innerHTML = `<ul class="stocklist" style="list-style:none;margin:0;padding:0">${rows.map(it => itemRow(it, info(it),
      `<button type="button" class="want" data-id="${esc(it.id)}" aria-pressed="${!!it.needed}">${it.needed ? 'Needed' : 'Need restocking'}</button>`)).join('')}</ul>`;
  }

  /* ---------- the restocking area: what you ticked as needed ---------- */
  function renderRestock() {
    const cats = catsOf();
    state.restockCat = pickCat(cats, state.restockCat);
    catChips('restockCats', cats, state.restockCat);
    const needed = state.items.filter(it => it.needed);
    const rows = (state.restockCat ? needed.filter(it => it.cat === state.restockCat) : needed).sort(byName);
    $('restockNote').textContent = rows.length ? `${rows.length} waiting` : '';
    const box = $('restockList');
    if (!state.items.length) { box.innerHTML = '<p class="empty">Nothing to restock yet.</p>'; return; }
    if (!rows.length) { box.innerHTML = `<p class="empty">Nothing waiting${state.restockCat ? ' in ' + esc(state.restockCat) : ''}. Press “Need restocking” on the shelf.</p>`; return; }
    box.innerHTML = `<ul class="stocklist" style="list-style:none;margin:0;padding:0">${rows.map(it => itemRow(it, info(it),
      `<button type="button" class="done" data-id="${esc(it.id)}">Restocked!</button>`)).join('')}</ul>`;
  }

  /* ---------- cost: what keeping stock actually costs ---------- */
  function renderCost() {
    const rows = state.items.map(it => ({ it, x: info(it) }));
    const total = rows.reduce((s, r) => s + r.x.per, 0);
    const priced = rows.filter(r => r.it.cost).length;
    $('costNum').textContent = money(total);
    $('costLine').textContent = rows.length
      ? `${priced} of ${rows.length} items have a price. That is ${money(total * 12)} a year to keep the shelf stocked.`
      : 'Add your first item to see what the shelf costs.';
    $('costNote').textContent = state.today ? fmtDate(state.today).replace(/^[A-Za-z]+, /, '') : '';

    const by = new Map();
    rows.forEach(r => {
      const k = r.it.cat || 'Uncategorised';
      by.set(k, (by.get(k) || 0) + r.x.per);
    });
    const list = [...by.entries()].sort((a, b) => b[1] - a[1]);
    const max = Math.max(1, ...list.map(x => x[1]));
    $('costBars').innerHTML = list.length ? list.map(([name, v]) => {
      const items = rows.filter(r => (r.it.cat || 'Uncategorised') === name).length;
      return `<div class="cbar"><span class="cname">${esc(name)}<i>${items} ${items === 1 ? 'item' : 'items'}</i></span>` +
        `<span class="ctrack"><i style="width:${Math.round(v / max * 100)}%"></i></span>` +
        `<span class="cval">${v ? esc(money(v)) : '—'}</span></div>`;
    }).join('') : '<p class="empty">Nothing priced yet.</p>';
    $('costKey').textContent = 'Monthly run rate = what one restock costs, spread across its cadence. A ₹600 tray of eggs bought monthly counts as ₹600 a month; ₹100 of fruit every 3 days counts as about ₹1,000 a month.';
  }

  /* ---------- render everything ---------- */
  function renderAll() {
    if (!state.loaded) return;
    if (has('add')) renderAdd();
    if (has('shelf')) renderShelf();
    if (has('restock')) renderRestock();
    if (has('cost')) renderCost();
  }

  /* ---------- data ---------- */
  async function post(body) {
    const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-widget-key': KEY }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) { const e = new Error(j.error || `HTTP ${r.status}`); e.hint = j.hint; throw e; }
    return j;
  }
  async function load() {
    const r = await fetch(`${API}?parts=items,meta${KEY ? '&key=' + encodeURIComponent(KEY) : ''}`, { cache: 'no-store' });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || data.error) { const e = new Error(data.error || `Could not load your stock (HTTP ${r.status}).`); e.hint = data.hint; throw e; }
    const items = Array.isArray(data.items) ? data.items
      : data.items && Array.isArray(data.items.rows) ? data.items.rows
      : null;
    if (items) state.items = items;
    else throw new Error(`items: ${(data.items && data.items.error) || 'no data'}${data.items && data.items.hint ? ' ' + data.items.hint : ''}`);
    if (data.meta && !data.meta.error) state.meta = data.meta;
    state.today = data.today; state.loadedAt = Date.now(); state.loaded = true;
  }
  async function refresh() {
    if (state.pending || !shown.length) return;
    try { await load(); renderAll(); }
    catch (e) {
      if (state.loaded) return;                    // keep what is on screen if a background refresh fails
      const b = $('bad'); b.hidden = false;
      b.innerHTML = `<h2>Couldn't load your stock</h2><p class="muted">${esc(e.message)}${e.hint ? ' ' + esc(e.hint) : ''}<br>Check the key in the link, then open /api/stock-health to see what is wrong.</p>`;
    }
  }

  // Embeds on the same page stay in step through this channel.
  let bc = null;
  try { bc = new BroadcastChannel('stock-widgets'); bc.onmessage = () => setTimeout(refresh, 500); } catch (e) { /* not available in this sandbox */ }

  /* ---------- events ---------- */
  document.addEventListener('click', e => {
    const q = s => e.target.closest(s);
    let el;
    if ((el = q('#shelfCats .chip'))) { state.shelfCat = el.dataset.c; return renderAll(); }
    if ((el = q('#restockCats .chip'))) { state.restockCat = el.dataset.c; return renderAll(); }
    if ((el = q('#iCats .chip'))) { state.add.cat = state.add.cat === el.dataset.c ? null : el.dataset.c; return renderAdd(); }
    if ((el = q('#iUnit button'))) { state.add.unit = el.dataset.v; return renderAdd(); }
    if (q('#iSave')) return submitItem();
    if ((el = q('.want'))) return toggleNeed(el.dataset.id);
    if ((el = q('.done'))) return doRestock(el.dataset.id);
    if ((el = q('.undo'))) return undoRestock(el.dataset.id);
  });

  if (has('add')) {
    $('iName').addEventListener('input', updateSave);
    $('iNewCat').addEventListener('input', updateSave);
    $('iEvery').addEventListener('input', e => { e.target.value = e.target.value.replace(/[^0-9]/g, '').slice(0, 3); });
    $('iCost').addEventListener('input', e => { e.target.value = e.target.value.replace(/[^0-9.]/g, ''); });
    ['iName', 'iNewCat', 'iPack', 'iCost', 'iNote'].forEach(id => $(id).addEventListener('keydown', ev => { if (ev.key === 'Enter') submitItem(); }));
  }

  renderAll();
  refresh();
  setInterval(refresh, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  document.documentElement.addEventListener('pointerenter', () => { if (Date.now() - state.loadedAt > 8000) refresh(); });
})();
