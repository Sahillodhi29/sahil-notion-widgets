'use strict';
/* ============================================================
   Stock & Resources widgets: what you keep at home and when it runs out.

   /stock/index.html?key=KEY&w=due        -> just that widget
   w = add | due | shelf | cost | all     (comma-separate to combine)
   Optional: &bg=transparent | &bg=HEX

   Every item lives in the Notion "Stock" database with a cadence
   (Every + Unit) and the date it was last restocked. The next due date
   and the monthly run rate are worked out here, so nothing has to be
   kept in step by hand in Notion.
   ============================================================ */
(() => {
  const API = '/api/stock';
  const params = new URLSearchParams(location.search);
  const KEY = params.get('key') || '';
  const WIDGETS = ['add', 'due', 'shelf', 'cost'];
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- background ---------- */
  const bgParam = params.get('bg');
  if (bgParam) {
    const v = bgParam === 'transparent' ? 'transparent' : /^[0-9a-f]{3,8}$/i.test(bgParam) ? '#' + bgParam : null;
    if (v) { document.documentElement.style.background = v; document.body.style.background = v; }
  }

  /* ---------- which widgets? ---------- */
  const asked = (params.get('w') || 'all').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
  const wantAll = asked.includes('all');
  const shown = wantAll ? WIDGETS.slice() : asked.filter(w => WIDGETS.includes(w));
  const unknown = asked.filter(w => w !== 'all' && !WIDGETS.includes(w));
  document.querySelectorAll('.card[data-w]').forEach(c => { c.hidden = !shown.includes(c.dataset.w); });
  document.body.dataset.mode = shown.length === 1 ? 'single' : 'multi';
  const has = w => shown.includes(w);
  if (unknown.length || !shown.length) {
    const b = $('bad'); b.hidden = false;
    b.innerHTML = '<h2>Unknown widget</h2><p class="muted">Use w=add, due, shelf, cost or all.</p>';
  }

  /* ---------- state ---------- */
  const state = {
    today: null, items: [], meta: { categories: [], units: [] },
    loaded: false, loadedAt: 0, pending: 0,
    group: 'cat',
    add: { cat: null, unit: 'Month' },
    undo: new Map(),          // item id -> what to put back if Undo is pressed
  };

  /* ---------- formatting & dates ---------- */
  const money = n => '₹' + Math.round(n).toLocaleString('en-IN');
  const short = n => (n >= 1000 ? '₹' + (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'k' : money(n));
  const pad2 = n => String(n).padStart(2, '0');
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
      const x = info(t);
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
      toast(`${name} added. Press Restocked when you buy it.`);
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
    try { await post({ action: 'need', id, value: it.needed }); if (bc) bc.postMessage('changed'); }
    catch (e) { console.error('Need failed:', e); it.needed = before; toast(`Couldn't save: ${errText(e)}`, 7000); }
    finally { state.pending--; renderAll(); }
  }

  /* ---------- due: the shopping list ---------- */
  function rowHtml(it, x) {
    return `<li class="row ${x.tone}">
      <button type="button" class="tick" data-id="${esc(it.id)}" aria-label="Restock ${esc(it.item)}"></button>
      <span class="rn">${esc(it.item)}${it.pack ? `<small>${esc(it.pack)} · ${esc(cadence(it))}</small>` : `<small>${esc(cadence(it))}</small>`}</span>
      <span class="pill ${x.tone}">${esc(dueLabel(x))}</span>
      <button type="button" class="need${it.needed ? ' on' : ''}" data-id="${esc(it.id)}" aria-pressed="${it.needed}" title="Mark as needed">Need</button>
    </li>`;
  }
  function renderDue() {
    const rows = state.items.map(it => ({ it, x: info(it) }));
    const tracked = rows.filter(r => r.x.left !== null).sort((a, b) => a.x.left - b.x.left);
    const fresh = rows.filter(r => r.x.left === null).sort((a, b) => byName(a.it, b.it));
    const soon = tracked.filter(r => r.x.left <= 7);
    $('dueDate').textContent = state.today ? fmtDate(state.today) : '';
    const late = soon.filter(r => r.x.left < 0).length;
    $('dueTitle').textContent = late ? 'Past due' : 'Restock soon';
    const count = soon.length + fresh.length;
    $('dueCount').textContent = count ? `${count} to buy` : '';

    if (!state.items.length) {
      $('dueList').innerHTML = '<p class="empty">Nothing on the shelf yet. Add your first item with the “New stock item” widget.</p>';
      return;
    }
    let html = '';
    if (soon.length) html += `<ul class="list">${soon.map(r => rowHtml(r.it, r.x)).join('')}</ul>`;
    else {
      const next = tracked.slice(0, 3);
      html += `<p class="allgood">Nothing needs buying this week.</p>`;
      if (next.length) html += `<ul class="list quiet">${next.map(r => rowHtml(r.it, r.x)).join('')}</ul>`;
    }
    if (fresh.length) {
      html += `<p class="grp-note">Never logged yet — press the circle once to start the clock.</p>` +
        `<ul class="list quiet">${fresh.map(r => rowHtml(r.it, r.x)).join('')}</ul>`;
    }
    $('dueList').innerHTML = html;
  }

  /* ---------- shelf: everything, grouped ---------- */
  function shelfRow(it, x) {
    const pct = x.left === null ? 0 : Math.max(0, Math.min(100, Math.round((x.span - Math.max(0, x.left)) / x.span * 100)));
    return `<li class="srow ${x.tone}">
      <span class="rn">${esc(it.item)}${it.pack ? ` <i>${esc(it.pack)}</i>` : ''}</span>
      <span class="when">${esc(dueLabel(x))}</span>
      <span class="track" aria-hidden="true"><i style="width:${x.left === null ? 0 : pct}%"></i></span>
      <span class="per">${it.cost ? esc(short(x.per)) + '/mo' : ''}</span>
    </li>`;
  }
  function renderShelf() {
    const rows = state.items.map(it => ({ it, x: info(it) }));
    $('shelfNote').textContent = rows.length ? `${rows.length} ${rows.length === 1 ? 'thing' : 'things'} tracked` : '';
    if (!rows.length) { $('shelf').innerHTML = '<p class="empty">Your shelf is empty. Add something with the “New stock item” widget.</p>'; return; }

    const groups = new Map();
    if (state.group === 'cat') {
      rows.sort((a, b) => byName(a.it, b.it)).forEach(r => {
        const k = r.it.cat || 'Uncategorised';
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(r);
      });
    } else {
      const buckets = [
        ['Late', r => r.x.tone === 'late'],
        ['This week', r => r.x.tone === 'today' || r.x.tone === 'soon'],
        ['Later', r => r.x.tone === 'ok'],
        ['Not logged yet', r => r.x.tone === 'new'],
      ];
      buckets.forEach(([name, test]) => {
        const hit = rows.filter(test).sort((a, b) => (a.x.left === null ? 0 : a.x.left) - (b.x.left === null ? 0 : b.x.left) || byName(a.it, b.it));
        if (hit.length) groups.set(name, hit);
      });
    }

    $('shelf').innerHTML = [...groups.entries()].map(([name, list]) => {
      const per = list.reduce((s, r) => s + r.x.per, 0);
      return `<section class="grp"><h3>${esc(name)}<span>${list.length} · ${esc(short(per))} a month</span></h3>` +
        `<ul>${list.map(r => shelfRow(r.it, r.x)).join('')}</ul></section>`;
    }).join('');
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
  function syncSeg() {
    document.querySelectorAll('.seg[data-for="group"] button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === state.group)));
  }
  function renderAll() {
    syncSeg();
    if (!state.loaded) return;
    if (has('add')) renderAdd();
    if (has('due')) renderDue();
    if (has('shelf')) renderShelf();
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
    if ((el = q('.seg[data-for="group"] button'))) { state.group = el.dataset.v; return renderAll(); }
    if ((el = q('#iCats .chip'))) { state.add.cat = state.add.cat === el.dataset.c ? null : el.dataset.c; return renderAdd(); }
    if ((el = q('#iUnit button'))) { state.add.unit = el.dataset.v; return renderAdd(); }
    if (q('#iSave')) return submitItem();
    if ((el = q('.tick'))) return doRestock(el.dataset.id);
    if ((el = q('.undo'))) return undoRestock(el.dataset.id);
    if ((el = q('.need'))) return toggleNeed(el.dataset.id);
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
