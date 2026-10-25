'use strict';
/* Finance widgets: one page, many pieces.
   /finance/index.html?key=KEY&w=left   -> just that widget
   w = add | left | ledger | trend | term | wall | path | future | goals | all  (comma-separate to combine)
   Optional: &bg=transparent | &bg=HEX     future-me defaults: &sip=300&rate=10&years=30&delay=10 */
(() => {
  const API = '/api/finance';
  const params = new URLSearchParams(location.search);
  const KEY = params.get('key') || '';
  const NEEDS = { add: 60, left: 35, ledger: 35, trend: 190, term: 0, wall: 0, path: 0, future: 0, goals: 0 };   // days of history each widget needs
  const PARTS = { add: ['tx'], left: ['tx', 'budgets'], ledger: ['tx', 'budgets'], trend: ['tx', 'budgets'], term: ['glossary'], wall: ['glossary'], path: ['roadmap'], future: [], goals: ['goals'] };
  const keyQ = sep => (KEY ? `${sep}key=${encodeURIComponent(KEY)}` : '');
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem('fin:' + k); return v == null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('fin:' + k, v); } catch (e) { /* storage blocked in this embed */ } },
  };

  /* ---------- background: Notion dark by default; &bg=transparent or &bg=HEX to change ---------- */
  const bgParam = params.get('bg');
  if (bgParam) {
    const v = bgParam === 'transparent' ? 'transparent' : /^[0-9a-f]{3,8}$/i.test(bgParam) ? '#' + bgParam : null;
    if (v) { document.documentElement.style.background = v; document.body.style.background = v; }
  }

  /* ---------- which widgets? ---------- */
  const asked = (params.get('w') || 'all').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
  const wantAll = asked.includes('all');
  const shown = wantAll ? Object.keys(NEEDS) : asked.filter(w => NEEDS[w] !== undefined);
  const unknown = asked.filter(w => w !== 'all' && NEEDS[w] === undefined);
  document.querySelectorAll('.card[data-w]').forEach(c => { c.hidden = !shown.includes(c.dataset.w); });
  document.body.dataset.mode = shown.length === 1 ? 'single' : 'multi';
  if (unknown.length || !shown.length) {
    const b = $('bad'); b.hidden = false;
    b.innerHTML = '<h2>Unknown widget</h2><p class="muted">Use w=add, left, ledger, trend, term, wall, path, future, goals or all.</p>';
  }
  const has = w => shown.includes(w);
  const DAYS = Math.max(14, ...shown.map(w => NEEDS[w]));
  const NEED_PARTS = [...new Set(shown.flatMap(w => PARTS[w]))];

  const state = {
    today: null, tx: [], budgets: [], glossary: [], roadmap: [], goals: [],
    meta: { categories: [], modes: [], incomeCategories: [], savingsCategory: 'Savings' },
    pending: 0, first: true, loaded: false, loadedAt: 0,
    mode: { left: store.get('left', 'month'), ledger: store.get('ledger', 'month'), trend: store.get('trend', 'week') },
    add: { type: 'Expense', category: null, mode: store.get('payMode', 'UPI'), day: 'today' },
    termId: null, termSkip: 0, revealed: false, wallSel: null, pathOpen: new Set(),
  };

  /* ---------- formatting & dates ---------- */
  const money = n => '₹' + Math.round(n).toLocaleString('en-IN');
  const moneyX = n => '₹' + (Number.isInteger(n) ? n.toLocaleString('en-IN') : n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const short = n => (n >= 1000 ? '₹' + (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'k' : money(n));
  const big = n => (n >= 1e7 ? '₹' + (n / 1e7).toFixed(2) + ' crore' : n >= 1e5 ? '₹' + (n / 1e5).toFixed(2) + ' lakh' : money(n));
  const pad2 = n => String(n).padStart(2, '0');
  const addDays = (d, n) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
  const dim = d => new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7), 0)).getUTCDate();
  const monday = d => addDays(d, -((new Date(d + 'T00:00:00Z').getUTCDay() + 6) % 7));
  const daysBetween = (a, b) => Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 864e5);
  const fmtDate = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  const dm = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const monthShort = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });
  const shiftMonth = (d, n) => new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1 + n, 1)).toISOString().slice(0, 10);
  const monthEnd = d => d.slice(0, 8) + pad2(dim(d));

  /* ---------- maths ---------- */
  const isSav = t => t.category === state.meta.savingsCategory;
  const spends = (from, to) => state.tx.filter(t => t.type === 'Expense' && !isSav(t) && t.date >= from && t.date <= to);
  const sum = rows => rows.reduce((s, t) => s + t.amount, 0);
  const monthlyBudget = () => state.budgets.filter(b => b.bucket !== 'Savings').reduce((s, b) => s + b.limit, 0);
  function period(mode) {
    const t = state.today, m = monthlyBudget();
    if (mode === 'week') { const from = monday(t); return { from, to: addDays(from, 6), budget: m * 7 / dim(t), factor: 7 / dim(t), word: 'week' }; }
    const from = t.slice(0, 8) + '01';
    return { from, to: monthEnd(t), budget: m, factor: 1, word: 'month' };
  }

  /* ---------- toast ---------- */
  function toast(msg, ms) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), ms || 3000); }
  const errText = e => `${e.message}${e.hint ? ' ' + e.hint : ''}`;

  /* ---------- add money ---------- */
  const CHECK = '<svg viewBox="0 0 12 12" fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 6.3l2.4 2.4 4.6-5"/></svg>';
  function addCategories() {
    const inc = state.meta.incomeCategories, all = state.meta.categories;
    const list = all.filter(c => (state.add.type === 'Income') === inc.includes(c));
    const uses = {}; state.tx.forEach(t => { uses[t.category] = (uses[t.category] || 0) + 1; });
    const PIN = ['Food & Snacks', 'Clothes', 'Skincare & Grooming', state.meta.savingsCategory];
    return list.map((c, i) => ({ c, i })).sort((a, b) => {
      const pa = PIN.indexOf(a.c), pb = PIN.indexOf(b.c);
      if ((pa >= 0) !== (pb >= 0)) return pa >= 0 ? -1 : 1;
      if (pa >= 0) return pa - pb;
      return (uses[b.c] || 0) - (uses[a.c] || 0) || a.i - b.i;
    }).map(x => x.c);
  }
  function renderAdd() {
    const A = state.add, cats = addCategories();
    if (A.category && !cats.includes(A.category)) A.category = null;
    $('addCats').innerHTML = cats.length
      ? cats.map(c => `<button type="button" class="chip${c === state.meta.savingsCategory ? ' saving' : ''}" data-c="${esc(c)}" aria-pressed="${A.category === c}">${esc(c)}</button>`).join('')
      : '<p class="empty">Loading categories…</p>';
    $('addModes').innerHTML = state.meta.modes.map(m => `<button type="button" data-v="${esc(m)}" aria-pressed="${A.mode === m}">${esc(m)}</button>`).join('');
    $('addDay').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === A.day)));
    const rows = state.tx.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
    $('recent').innerHTML = rows.length ? rows.map(t => {
      const inc = t.type === 'Income', sav = isSav(t);
      const label = t.note && t.note !== t.category ? `${esc(t.category)}<small>${esc(t.note)}</small>` : esc(t.category || t.name);
      return `<li class="${t.pending ? 'pending ' : ''}${sav ? 'saving' : ''}"><span class="rn">${label}</span><span class="ra ${inc ? 'in' : 'out'}">${inc ? '+' : sav ? '' : '−'}${moneyX(t.amount)}</span>` +
        `<button type="button" class="undo" data-id="${esc(t.id)}"${t.pending ? ' disabled' : ''}>Undo</button></li>`;
    }).join('') : (state.loaded ? '<li class="empty">Nothing logged yet. Your first entry will show up here.</li>' : '');
    updateAddBtn();
  }
  function updateAddBtn() {
    const A = state.add, a = parseFloat($('amt').value), ok = a > 0 && !!A.category, b = $('addBtn');
    b.disabled = !ok;
    b.textContent = ok ? (A.type === 'Income' ? `Add ${moneyX(a)} as ${A.category}` : `Add ${moneyX(a)} to ${A.category}`) : (A.type === 'Income' ? 'Add income' : 'Add spend');
  }
  async function submitAdd() {
    const A = state.add, amount = parseFloat($('amt').value), note = $('note').value.trim();
    if (!(amount > 0) || !A.category) return;
    const date = A.day === 'yesterday' ? addDays(state.today, -1) : state.today;
    const tmp = { id: 'tmp' + Date.now(), date, name: note || A.category, amount, type: A.type, category: A.category, mode: A.mode || null, note, pending: true };
    const keepAmt = $('amt').value;
    state.tx.unshift(tmp); state.pending++;
    $('amt').value = ''; $('note').value = '';
    renderAll();
    try {
      const j = await post({ action: 'tx-add', amount, type: A.type, category: A.category, mode: A.mode || undefined, note: note || undefined, date });
      const i = state.tx.findIndex(x => x.id === tmp.id);
      if (i > -1) state.tx[i] = j.row;
      if (bc) bc.postMessage('changed');
    } catch (e) {
      console.error('Add failed:', e);
      state.tx = state.tx.filter(x => x.id !== tmp.id);
      if (!$('amt').value) { $('amt').value = keepAmt; $('note').value = note; }
      toast(`Couldn't save: ${errText(e)}`, 7000);
    } finally { state.pending--; renderAll(); }
  }
  async function undoTx(id) {
    const i = state.tx.findIndex(x => x.id === id); if (i < 0) return;
    const [gone] = state.tx.splice(i, 1); state.pending++; renderAll();
    try { await post({ action: 'tx-undo', id }); if (bc) bc.postMessage('changed'); }
    catch (e) { console.error('Undo failed:', e); state.tx.splice(i, 0, gone); toast(`Couldn't undo: ${errText(e)}`, 7000); }
    finally { state.pending--; renderAll(); }
  }

  /* ---------- left to spend: a month of glass tiles ---------- */
  function renderLeft() {
    const m = state.mode.left, P = period(m), t = state.today;
    const spent = sum(spends(P.from, t)), left = P.budget - spent, over = left < 0, has$ = P.budget > 0;
    const saved = sum(state.tx.filter(x => isSav(x) && x.type === 'Expense' && x.date >= P.from && x.date <= t));
    $('leftTitle').textContent = has$ && over ? 'Over plan' : 'Left to spend';
    $('leftTitle').classList.toggle('over', has$ && over);
    $('leftNum').textContent = money(has$ ? Math.abs(left) : spent);
    $('leftNum').classList.toggle('over', has$ && over);
    $('leftLine').textContent = has$ ? `${money(spent)} spent of ${money(P.budget)} this ${P.word}.${saved ? ` ${money(saved)} saved.` : ''}` : 'Add monthly limits in the Budgets database to see what is left.';
    const dl = daysBetween(t, P.to) + 1;
    $('leftSafe').textContent = !has$ ? '' : over ? `You are ${money(-left)} past the plan for this ${P.word}.` : `About ${money(left / dl)} a day for the next ${dl} ${dl === 1 ? 'day' : 'days'}.`;
    const allow = monthlyBudget() / dim(t);
    let html = ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(l => `<span class="hd">${l}</span>`).join('');
    if (m === 'month') html += '<div class="d pad"></div>'.repeat((new Date(P.from + 'T00:00:00Z').getUTCDay() + 6) % 7);
    for (let d = P.from; d <= P.to; d = addDays(d, 1)) {
      const ds = sum(spends(d, d));
      const cls = d > t ? 'future' : ds === 0 ? '' : !allow || ds <= allow ? 't3 gl' : ds <= allow * 1.6 ? 't2 gl' : 't1 gl';
      html += `<div class="d ${cls}${d === t ? ' today' : ''}" title="${esc(fmtDate(d))}: ${money(ds)}">${+d.slice(8)}</div>`;
    }
    $('days').innerHTML = html;
  }

  /* ---------- ledger: a shelf of book spines ---------- */
  function renderLedger() {
    const m = state.mode.ledger, P = period(m), t = state.today;
    const by = {}; spends(P.from, t).forEach(x => { const c = x.category || 'Other'; by[c] = (by[c] || 0) + x.amount; });
    const rows = state.budgets.filter(b => b.bucket !== 'Savings').map(b => ({ name: b.category, limit: b.limit * P.factor, spent: by[b.category] || 0 }));
    Object.keys(by).forEach(c => { if (!rows.some(r => r.name === c)) rows.push({ name: c, limit: 0, spent: by[c] }); });
    rows.sort((a, b) => b.spent - a.spent || b.limit - a.limit);
    const maxV = Math.max(1, ...rows.map(r => Math.max(r.limit, r.spent)));
    const totalSpent = rows.reduce((s, r) => s + r.spent, 0), totalLimit = rows.reduce((s, r) => s + r.limit, 0);
    $('ledgerLine').textContent = rows.length ? (totalLimit ? `${money(totalSpent)} of ${money(totalLimit)} this ${P.word}. Orange means past the budget.` : `${money(totalSpent)} spent this ${P.word}.`) : '';
    $('spines').innerHTML = rows.length ? rows.map(r => {
      const cap = Math.max(r.limit, r.spent) || 1, w = Math.max(10, cap / maxV * 100);
      const inside = r.limit ? Math.min(r.spent, r.limit) : r.spent, ratio = r.limit ? r.spent / r.limit : 0;
      const cls = !r.limit || ratio > .75 ? 'warm' : '';
      const over = r.limit && r.spent > r.limit
        ? `<i class="over" style="left:${(r.limit / cap * 100).toFixed(1)}%;width:${((r.spent - r.limit) / cap * 100).toFixed(1)}%"></i><b class="tick" style="left:${(r.limit / cap * 100).toFixed(1)}%"></b>` : '';
      const amt = r.limit ? `<span class="${ratio > 1 ? 'over' : ''}"><em>${money(r.spent)}</em> of ${money(r.limit)}</span>` : `<span><em>${money(r.spent)}</em> no limit</span>`;
      return `<div><div class="sp-top"><b>${esc(r.name)}</b>${amt}</div><div class="spine" style="width:${w.toFixed(1)}%"><i class="${cls}" style="width:${(inside / cap * 100).toFixed(1)}%"></i>${over}<span class="gl-hi"></span></div></div>`;
    }).join('') : '<p class="empty">Log a few spends and your categories will line up here.</p>';
  }

  /* ---------- trend: columns of glass tiles ---------- */
  function renderTrend() {
    const m = state.mode.trend, t = state.today, cols = [];
    if (m === 'week') {
      const m0 = monday(t);
      for (let i = 7; i >= 0; i--) { const from = addDays(m0, -7 * i); cols.push({ from, to: addDays(from, 6), label: String(+from.slice(8)), sub: (i === 7 || from.slice(5, 7) !== addDays(from, -7).slice(5, 7)) ? monthShort(from) : '', cur: i === 0 }); }
    } else {
      for (let i = 5; i >= 0; i--) { const from = shiftMonth(t, -i); cols.push({ from, to: monthEnd(from), label: monthShort(from), sub: (i === 5 || from.slice(5, 7) === '01') ? from.slice(0, 4) : '', cur: i === 0 }); }
    }
    cols.forEach(c => { c.v = sum(spends(c.from, c.to < t ? c.to : t)); });
    const budget = m === 'week' ? monthlyBudget() * 7 / dim(t) : monthlyBudget();
    const maxV = Math.max(1, budget, ...cols.map(c => c.v));
    const unit = [50, 100, 200, 250, 500, 1000, 2000].find(u => Math.ceil(maxV / u) <= 12) || 5000;
    const rows = Math.max(1, Math.ceil(maxV / unit)), PX = m === 'week' ? 44 : 60, TW = PX - 8, PY = 19, TH = 15, top = 16, base = top + rows * PY, W = cols.length * PX + 6, H = base + 30;
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Spending by ${m === 'week' ? 'week' : 'month'}"><defs><linearGradient id="glg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".38"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>`;
    cols.forEach((c, k) => {
      const x = 3 + k * PX + (PX - TW) / 2, full = Math.floor(c.v / unit), rem = c.v / unit - full;
      const tile = (i, h) => {
        const y = base - i * PY - 2 - h, col = (budget && i * unit >= budget) ? 'tl-o' : c.cur ? 'tl-c' : 'tl-p';
        return `<rect x="${x}" y="${y}" width="${TW}" height="${h}" rx="3.5" class="${col}"/><rect x="${x}" y="${y}" width="${TW}" height="${h}" rx="3.5" fill="url(#glg)"/>`;
      };
      for (let i = 0; i < full; i++) s += tile(i, TH);
      let stackTop = base - full * PY;
      if (rem > .08) { const h = Math.max(3, TH * rem); s += tile(full, h); stackTop = base - full * PY - h - 2; }
      if (c.v) s += `<text class="val" x="${x + TW / 2}" y="${Math.max(10, stackTop - 4)}">${short(c.v)}</text>`;
      s += `<text class="${c.cur ? 'cur' : ''}" x="${x + TW / 2}" y="${base + 13}">${esc(c.label)}</text>`;
      if (c.sub) s += `<text class="sub" x="${x + TW / 2}" y="${base + 25}">${esc(c.sub)}</text>`;
    });
    if (budget) { const y = base - (budget / unit) * PY; s += `<line x1="0" x2="${W}" y1="${y}" y2="${y}" class="tl-line" stroke-width="1" stroke-dasharray="4 3"/>`; }
    s += '</svg>';
    $('trend').innerHTML = s;
    const cur = cols[cols.length - 1].v, prev = cols[cols.length - 2].v, d = cur - prev, w = m === 'week' ? 'week' : 'month';
    $('trendLine').textContent = `This ${w} ${money(cur)} so far, last ${w} ${money(prev)}. ${prev || cur ? `That is ${money(Math.abs(d))} ${d > 0 ? 'more' : 'less'}.` : ''}`;
    $('trendKey').textContent = `One tile is ${money(unit)}.${budget ? ' Tiles above the dashed line are over budget.' : ''}`;
  }

  /* ---------- glossary: term of the day + word wall ---------- */
  function pool() { const un = state.glossary.filter(g => !g.learned), b = un.filter(g => g.level === 'Beginner'); return b.length ? b : un; }
  function pickTerm() {
    const p = pool(); if (!p.length) return null;
    const h = [...String(state.today)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
    return p[(h + state.termSkip) % p.length];
  }
  function renderTerm() {
    const g = state.glossary, n = g.filter(x => x.learned).length;
    $('termCount').textContent = g.length ? `${n} of ${g.length} learned` : '';
    let cur = g.find(x => x.id === state.termId && !x.learned);
    if (!cur) { cur = pickTerm(); state.termId = cur ? cur.id : null; state.revealed = false; }
    const bar = g.length ? `<div class="bar" aria-hidden="true"><i style="width:${Math.round(n / g.length * 100)}%"></i></div>` : '';
    if (!g.length) { $('termBox').innerHTML = '<p class="empty">No terms yet. Add some to the Glossary database.</p>'; return; }
    if (!cur) { $('termBox').innerHTML = `<div class="tcard"><span class="tterm">All learned</span><p class="tmean">You have marked every term as learned. Add new ones to the Glossary as you meet them.</p></div>${bar}`; return; }
    const head = `<span class="topic">${esc(cur.topic || '')}${cur.level ? ', ' + esc(cur.level.toLowerCase()) : ''}</span><span class="tterm">${esc(cur.term)}</span>`;
    $('termBox').innerHTML = state.revealed
      ? `<div class="tcard">${head}<p class="tmean">${esc(cur.meaning)}</p>${cur.example ? `<p class="tex">${esc(cur.example)}</p>` : ''}</div>` +
        `<div class="tbtns"><button type="button" class="btn sm" data-act="learn">I know this one</button><button type="button" class="btn sm ghost" data-act="next">Another term</button></div>${bar}`
      : `<button type="button" class="tcard" data-act="reveal">${head}<span class="tap">Tap to see what it means</span></button>` +
        `<div class="tbtns"><button type="button" class="btn sm ghost" data-act="next">Another term</button></div>${bar}`;
  }
  function renderWall() {
    const g = state.glossary, n = g.filter(x => x.learned).length;
    $('wallCount').textContent = g.length ? `${n} of ${g.length} learned` : '';
    $('wall').innerHTML = g.map(x => `<button type="button" class="wt gl${x.id === state.wallSel ? ' sel' : ''}" data-id="${esc(x.id)}" aria-pressed="${x.learned}" title="${esc(x.term)}">${esc(x.term.charAt(0).toUpperCase())}</button>`).join('');
    const s = g.find(x => x.id === state.wallSel);
    $('wallInfo').innerHTML = s
      ? `<span class="topic">${esc(s.topic || '')}${s.level ? ', ' + esc(s.level.toLowerCase()) : ''}</span><span class="tterm">${esc(s.term)}</span><p class="tmean">${esc(s.meaning)}</p>${s.example ? `<p class="tex">${esc(s.example)}</p>` : ''}` +
        `<div class="tbtns"><button type="button" class="btn sm${s.learned ? ' ghost' : ''}" data-act="wall-learn">${s.learned ? 'Mark as not learned' : 'I know this one'}</button></div>`
      : '<p class="muted">Tap a tile to read the term. Butter tiles are the ones you have learned.</p>';
  }
  async function setLearned(id, value) {
    const g = state.glossary.find(x => x.id === id); if (!g) return;
    const prev = g.learned; g.learned = value; state.pending++; renderAll();
    try { await post({ action: 'term-learned', id, value }); if (bc) bc.postMessage('changed'); }
    catch (e) { console.error('Glossary save failed:', e); g.learned = prev; toast(`Couldn't save: ${errText(e)}`, 7000); }
    finally { state.pending--; renderAll(); }
  }

  /* ---------- roadmap ---------- */
  function renderPath() {
    const r = state.roadmap.slice().sort((a, b) => a.order - b.order), next = r.findIndex(s => !s.done), n = r.filter(s => s.done).length;
    $('pathCount').textContent = r.length ? `${n} of ${r.length} steps` : '';
    $('pathStrip').innerHTML = r.map((s, i) => `<i class="${s.done ? 'on gl' : i === next ? 'next' : ''}"></i>`).join('');
    $('steps').innerHTML = r.length ? r.map((s, i) => {
      const cls = s.done ? 'done' : i === next ? 'next' : '', open = i === next || state.pathOpen.has(s.id);
      return `<li class="${cls}" style="--i:${i}"><button type="button" class="chk" data-id="${esc(s.id)}" aria-pressed="${s.done}" aria-label="Mark step ${i + 1} ${s.done ? 'not done' : 'done'}">${CHECK}</button>` +
        `<button type="button" class="st" data-open="${esc(s.id)}"><b>${esc(s.step)}</b>${open && s.why ? `<p>${esc(s.why)}</p>` : ''}</button></li>`;
    }).join('') : '<li class="empty">No steps yet. Add some to the Roadmap database.</li>';
  }
  async function setStep(id, value) {
    const s = state.roadmap.find(x => x.id === id); if (!s) return;
    const prev = s.done; s.done = value; state.pending++; renderAll();
    try { await post({ action: 'step-toggle', id, value }); if (bc) bc.postMessage('changed'); }
    catch (e) { console.error('Roadmap save failed:', e); s.done = prev; toast(`Couldn't save: ${errText(e)}`, 7000); }
    finally { state.pending--; renderAll(); }
  }

  /* ---------- future me (needs no database) ---------- */
  const fv = (p, rate, years) => { const n = years * 12, i = rate / 100 / 12; return i ? p * ((Math.pow(1 + i, n) - 1) / i) : p * n; };
  const num = (k, d, lo, hi) => { const v = parseFloat(params.get(k)); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
  const F = { sip: num('sip', 300, 50, 5000), rate: num('rate', 10, 4, 14), years: num('years', 30, 5, 40), delay: num('delay', 10, 1, 15) };
  function mosaic(value, inv, unit) {
    const inT = Math.min(100, Math.round(inv / unit)), grT = Math.min(100 - inT, Math.max(0, Math.round((value - inv) / unit)));
    let h = '';
    for (let k = 0; k < 100; k++) { const rank = (9 - Math.floor(k / 10)) * 10 + (k % 10); h += `<i class="${rank < inT ? 'in gl' : rank < inT + grT ? 'gr gl' : ''}"></i>`; }
    return `<div class="mosaic" aria-hidden="true">${h}</div>`;
  }
  function renderFuture() {
    F.delay = Math.min(F.delay, F.years - 1);
    $('sDelay').max = String(Math.min(15, F.years - 1)); $('sDelay').value = F.delay;
    $('vSip').textContent = money(F.sip); $('vRate').textContent = F.rate + '%'; $('vYears').textContent = F.years; $('vDelay').textContent = F.delay + (F.delay === 1 ? ' year' : ' years');
    const ly = F.years - F.delay, now = fv(F.sip, F.rate, F.years), late = fv(F.sip, F.rate, ly);
    const invNow = F.sip * F.years * 12, invLate = F.sip * ly * 12, unit = now / 100 || 1;
    $('futureOut').innerHTML =
      `<div class="fcol"><span class="muted">Start now, ${F.years} years</span><span class="big">${big(now)}</span>${mosaic(now, invNow, unit)}<span class="muted small">${big(invNow)} put in, ${big(now - invNow)} growth</span></div>` +
      `<div class="fcol"><span class="muted">Start in ${F.delay} ${F.delay === 1 ? 'year' : 'years'}, ${ly} years</span><span class="big dim">${big(late)}</span>${mosaic(late, invLate, unit)}<span class="muted small">${big(invLate)} put in, ${big(late - invLate)} growth</span></div>` +
      `<p class="fverdict">Starting ${F.delay} ${F.delay === 1 ? 'year' : 'years'} later means putting in ${big(invNow - invLate)} less but finishing <b>${big(now - late)}</b> behind.</p>` +
      `<div class="fkey"><span><i class="k-in"></i>Money you put in</span><span><i class="k-gr"></i>Growth</span><span><i class="k-no"></i>Not reached</span></div>`;
    $('futureNote').textContent = `Assumes ${F.rate}% a year, added every month. These are not promises: real returns go up and down, and some years are negative. In today's prices the first result is about ${big(now / Math.pow(1.06, F.years))} (at 6% inflation). At a cautious 6% it would be ${big(fv(F.sip, 6, F.years))}.`;
  }

  /* ---------- goals ---------- */
  function lily(p) {
    let s = '<svg viewBox="0 0 100 100" aria-hidden="true">';
    for (let i = 0; i < 6; i++) {
      const f = Math.max(0, Math.min(1, p * 6 - i)), cls = f >= 1 ? 'full' : f > 0 ? 'part' : '';
      s += `<ellipse class="p ${cls}" cx="50" cy="26" rx="12" ry="24" transform="rotate(${i * 60} 50 50)"/>`;
    }
    return s + `<circle class="core${p >= 1 ? ' full' : ''}" cx="50" cy="50" r="15"/></svg>`;
  }
  function renderGoals() {
    const gs = state.goals.slice().sort((a, b) => (a.status === 'Done') - (b.status === 'Done'));
    $('goalList').innerHTML = gs.length ? gs.map(g => {
      const p = g.target > 0 ? Math.min(1, g.saved / g.target) : 0, pc = Math.round(p * 100), done = g.status === 'Done' || p >= 1;
      const left = g.date ? daysBetween(state.today || g.date, g.date) : null;
      const when = g.date ? `${dm(g.date)} ${g.date.slice(0, 4)}${left == null || done ? '' : left >= 0 ? `, ${left} ${left === 1 ? 'day' : 'days'} left` : ', past due'}` : 'No date set';
      return `<div class="goal${done ? ' done' : ''}"><div class="lily">${lily(p)}<span class="pc ${pc < 100 ? 'low' : ''}">${pc}%</span></div>` +
        `<div class="ginfo"><span class="gname">${esc(g.goal)}</span><span class="gnum"><b>${money(g.saved)}</b> of ${money(g.target)}</span><span class="muted small">${esc(when)}</span>` +
        `<div class="gadd" data-id="${esc(g.id)}"><button type="button" class="btn sm" data-amt="100">+₹100</button><button type="button" class="btn sm" data-amt="300">+₹300</button><button type="button" class="btn sm ghost" data-amt="500">+₹500</button>` +
        `<input type="text" inputmode="decimal" placeholder="₹ other" aria-label="Other amount for ${esc(g.goal)}"><button type="button" class="btn sm ghost" data-custom="1">Add</button></div></div></div>`;
    }).join('') : '<p class="empty">No goals yet. Add one to the Goals database.</p>';
  }
  async function addGoal(id, amount) {
    const g = state.goals.find(x => x.id === id); if (!g || !amount) return;
    const prev = { saved: g.saved, status: g.status };
    g.saved = Math.max(0, g.saved + amount); g.status = g.target > 0 && g.saved >= g.target ? 'Done' : 'Active';
    state.pending++; renderAll();
    try { const j = await post({ action: 'goal-add', id, amount }); g.saved = j.saved; g.status = j.status; if (bc) bc.postMessage('changed'); }
    catch (e) { console.error('Goal save failed:', e); g.saved = prev.saved; g.status = prev.status; toast(`Couldn't save: ${errText(e)}`, 7000); }
    finally { state.pending--; renderAll(); }
  }

  /* ---------- render everything ---------- */
  function syncSeg() {
    document.querySelectorAll('.seg').forEach(s => {
      const f = s.dataset.for, cur = f === 'addType' ? state.add.type : state.mode[f];
      s.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === cur)));
    });
  }
  function renderAll() {
    syncSeg();
    if (has('add')) renderAdd();
    const ready = state.loaded;
    if (ready) {
      if (has('left')) renderLeft();
      if (has('ledger')) renderLedger();
      if (has('trend')) renderTrend();
      if (has('term')) renderTerm();
      if (has('wall')) renderWall();
      if (has('path')) renderPath();
      if (has('goals')) renderGoals();
    }
    if (has('future')) renderFuture();
    state.first = false;
  }

  /* ---------- data ---------- */
  async function post(body) {
    // Writes authenticate with the x-widget-key header; ?key= only works for reads.
    const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-widget-key': KEY }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) { const e = new Error(j.error || `HTTP ${r.status}`); e.hint = j.hint; throw e; }
    return j;
  }
  async function load() {
    const r = await fetch(`${API}?parts=${NEED_PARTS.join(',')}&days=${DAYS}${keyQ('&')}`, { cache: 'no-store' });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || data.error) { const e = new Error(data.error || `Could not load your finance data (HTTP ${r.status}).`); e.hint = data.hint; throw e; }
    const bad = [];
    NEED_PARTS.forEach(p => { if (Array.isArray(data[p])) state[p] = data[p]; else bad.push(`${p}: ${(data[p] && data[p].error) || 'no data'}${data[p] && data[p].hint ? ' ' + data[p].hint : ''}`); });
    if (data.meta && !data.meta.error) state.meta = data.meta;
    state.today = data.today; state.loadedAt = Date.now();
    if (bad.length && !state.loaded) { const e = new Error(bad.join(' | ')); throw e; }
    state.loaded = true;
  }
  async function refresh() {
    if (state.pending || !shown.length) return;
    try {
      if (NEED_PARTS.length) await load();
      renderAll();
    } catch (e) {
      if (state.loaded) return;          // keep what's on screen if a background refresh fails
      const b = $('bad'); b.hidden = false;
      b.innerHTML = `<h2>Couldn't load your finances</h2><p class="muted">${esc(e.message)}${e.hint ? ' ' + esc(e.hint) : ''}<br>Check the key in the link, then open /api/finance-health to see what is wrong.</p>`;
    }
  }

  // Widgets in separate embeds stay in step through this channel (when the browser lets them share it).
  let bc = null; try { bc = new BroadcastChannel('finance-widgets'); bc.onmessage = () => setTimeout(refresh, 500); } catch (e) { /* not available in this sandbox */ }

  /* ---------- events ---------- */
  document.addEventListener('click', e => {
    const q = s => e.target.closest(s);
    let el;
    if ((el = q('.seg button'))) {
      const f = el.parentElement.dataset.for, v = el.dataset.v;
      if (f === 'addType') { state.add.type = v; state.add.category = null; } else { state.mode[f] = v; store.set(f, v); }
      return renderAll();
    }
    if ((el = q('#addCats .chip'))) { state.add.category = state.add.category === el.dataset.c ? null : el.dataset.c; return renderAdd(); }
    if ((el = q('#addModes button'))) { state.add.mode = state.add.mode === el.dataset.v ? '' : el.dataset.v; store.set('payMode', state.add.mode); return renderAdd(); }
    if ((el = q('#addDay button'))) { state.add.day = el.dataset.v; return renderAdd(); }
    if (q('#addBtn')) return submitAdd();
    if ((el = q('.undo'))) return undoTx(el.dataset.id);
    if ((el = q('#termBox [data-act]'))) {
      const a = el.dataset.act;
      if (a === 'reveal') { state.revealed = true; return renderTerm(); }
      if (a === 'next') { state.termSkip++; state.termId = null; state.revealed = false; return renderTerm(); }
      if (a === 'learn') { const id = state.termId; state.termId = null; state.revealed = false; return setLearned(id, true); }
    }
    if ((el = q('.wt'))) { state.wallSel = el.dataset.id; return renderWall(); }
    if ((el = q('[data-act="wall-learn"]'))) { const g = state.glossary.find(x => x.id === state.wallSel); if (g) setLearned(g.id, !g.learned); return; }
    if ((el = q('.chk'))) { const s = state.roadmap.find(x => x.id === el.dataset.id); if (s) setStep(s.id, !s.done); return; }
    if ((el = q('.st'))) { const id = el.dataset.open; state.pathOpen.has(id) ? state.pathOpen.delete(id) : state.pathOpen.add(id); return renderPath(); }
    if ((el = q('.gadd button'))) {
      const box = el.closest('.gadd');
      if (el.dataset.amt) return addGoal(box.dataset.id, parseFloat(el.dataset.amt));
      const inp = box.querySelector('input'), v = parseFloat(inp.value);
      if (!(v > 0)) { toast('Type an amount above 0 first.'); return; }
      inp.value = ''; return addGoal(box.dataset.id, v);
    }
  });
  if (has('add')) {
    $('amt').addEventListener('input', e => {
      let v = e.target.value.replace(/[^0-9.]/g, ''); const i = v.indexOf('.');
      if (i > -1) v = v.slice(0, i + 1) + v.slice(i + 1).replace(/\./g, '').slice(0, 2);
      e.target.value = v; updateAddBtn();
    });
    ['amt', 'note'].forEach(id => $(id).addEventListener('keydown', e => { if (e.key === 'Enter') submitAdd(); }));
  }
  if (has('future')) {
    const bind = (id, key) => { const el = $(id); el.value = F[key]; el.addEventListener('input', () => { F[key] = parseFloat(el.value); renderFuture(); $('sDelay').value = F.delay; }); };
    bind('sSip', 'sip'); bind('sRate', 'rate'); bind('sYears', 'years'); bind('sDelay', 'delay');
  }

  renderAll();
  refresh();
  setInterval(refresh, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  document.documentElement.addEventListener('pointerenter', () => { if (Date.now() - state.loadedAt > 8000) refresh(); });
})();
