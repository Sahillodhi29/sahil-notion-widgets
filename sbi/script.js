'use strict';
/* SBI PO Prelims: one page, many pieces, chosen with ?w=
   Built so far: w=notes (subject > topic > category > write). */
(function () {
  const Q = new URLSearchParams(location.search);
  const KEY = Q.get('key') || '';
  const DEMO = Q.get('demo') === '1';
  const W = (Q.get('w') || 'notes').toLowerCase();
  const root = document.getElementById('root');
  const $ = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  };

  /* ---------------- data layer ---------------- */
  const demo = (() => {
    const subjects = [{ id: 'q', name: 'Quantitative Aptitude' }, { id: 'r', name: 'Reasoning Ability' }, { id: 'e', name: 'English Language' }];
    const names = {
      q: ['Percentage', 'Profit & Loss', 'Quadratic Equation', 'Ratio & Proportion', 'Simplification / Approximation', 'Time & Distance'],
      r: ['Alphabet Test', 'Coded Inequalities', 'Input-Output', 'Logical Reasoning', 'Puzzle', 'Seating Arrangement', 'Syllogism', 'Tabulation'],
      e: ['Double Fillers', 'Fill in the Blanks', 'Pair Formation', 'Para Jumbles', 'Paragraph Completion', 'Sentence Improvement', 'Vocabulary', 'Word Usage'],
    };
    const topics = [];
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    Object.keys(names).forEach(s => names[s].forEach((n, i) => {
      const k = Math.floor(rnd() * 6); const st = [0, 1, 2, 3, 4].map(j => j < k);
      topics.push({ id: s + i, name: n, subject: s, steps: k, st, pri: rnd() < .3 ? 1 : 2, url: '#' });
    }));
    const pages = {};
    const mk = () => ({ majors: [
      { title: 'NOTES', minors: [{ title: 'Detailed Notes', text: '', locked: 0 }, { title: 'Short Notes', text: '', locked: 0 }] },
      { title: 'IMPORTANT POINTS', minors: [{ title: 'Critical concepts', text: '', locked: 0 }, { title: 'Tricks', text: '', locked: 0 }, { title: 'Things I keep forgetting', text: '', locked: 0 }] },
      { title: 'HOT QUESTIONS', minors: [{ title: 'Questions', text: '', locked: 0, virtual: true }, { title: 'Mistakes / Solutions', text: '', locked: 0, virtual: true }] },
    ] });
    pages.q0 = mk();
    pages.q0.majors[0].minors[1].text = '- Increase of x% then decrease of x% is a net loss of x²/100 %\n- Successive change: a + b + ab/100';
    return {
      topics: { subjects, topics, stages: ['Concept', 'Notes', 'Basic Qs', 'PYQs', 'Topic Test'], exam: '2027-05-02' },
      page(id) { if (!pages[id]) pages[id] = mk(); return Object.assign({ id, url: '#', editedAt: '' }, JSON.parse(JSON.stringify(pages[id]))); },
      save(b) {
        const p = pages[b.page] || (pages[b.page] = mk());
        const M = p.majors.find(m => m.title === b.major); const m = M.minors.find(x => x.title === b.minor);
        m.text = b.text;
      },
    };
  })();

  async function api(path, opts) {
    if (DEMO) {
      await new Promise(r => setTimeout(r, 250));
      if (path.startsWith('?action=topics')) return demo.topics;
      if (path.startsWith('?action=page')) return demo.page(new URLSearchParams(path.slice(1)).get('id'));
      if (opts && opts.body) { demo.save(JSON.parse(opts.body)); return { ok: true }; }
    }
    let res;
    try {
      res = await fetch('../api/sbi' + path, Object.assign({ headers: { 'x-widget-key': KEY, 'Content-Type': 'application/json' } }, opts || {}));
    } catch (e) { throw Object.assign(new Error('You seem to be offline.'), { hint: 'It will retry on its own.' }); }
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(j.error || 'Request failed (' + res.status + ').'), { hint: j.hint, status: res.status });
    return j;
  }

  /* ---------------- notes widget ---------------- */
  function notes() {
    const S = { subjects: [], topics: [], subj: null, topic: null, major: 0, minor: 0, page: null, loading: false, err: null };
    let dirty = false, version = 0, timer = null, chain = Promise.resolve(), retryT = null, status = 'idle', statusMsg = '';

    const card = $('section', 'card notes');
    const errBox = $('div'); const subjRow = $('div'); const topicRow = $('div'); const sep = $('div', 'sep');
    const crumb = $('div', 'crumb'); const tabs = $('div', 'tabs'); const minorRow = $('div', 'row');
    const editor = $('div', 'editor');
    const ta = $('textarea'); ta.spellcheck = true; ta.disabled = true;
    ta.placeholder = 'Pick a subject, then a topic, and start writing.';
    const foot = $('div', 'foot');
    editor.append(ta, foot);
    card.append(errBox, subjRow, topicRow, sep, crumb, tabs, minorRow, editor);
    root.append(card);

    const topicsOfSubject = () => S.topics.filter(t => t.subject === S.subj);
    const curTopic = () => S.topics.find(t => t.id === S.topic);
    const curMajor = () => S.page && S.page.majors[S.major];
    const curMinor = () => { const m = curMajor(); return m && m.minors[S.minor]; };

    function showErr(e) {
      errBox.innerHTML = e ? '<div class="err">' + esc(e.message) + (e.hint ? '<small>' + esc(e.hint) + '</small>' : '') + '</div>' : '';
    }

    /* ----- render the pickers (never touches what you are typing) ----- */
    function render() {
      subjRow.innerHTML = '<p class="lbl">Subject</p>';
      const sr = $('div', 'row');
      if (!S.subjects.length && !S.err) sr.innerHTML = '<span class="skel"></span><span class="skel"></span><span class="skel"></span>';
      S.subjects.forEach(s => {
        const b = $('button', 'chip' + (s.id === S.subj ? ' on' : ''), esc(s.name)); b.type = 'button';
        b.onclick = () => pickSubject(s.id); sr.append(b);
      });
      subjRow.append(sr);

      topicRow.innerHTML = '';
      if (S.subj) {
        topicRow.append($('p', 'lbl', 'Topic'));
        const tr = $('div', 'row');
        topicsOfSubject().forEach(t => {
          const b = $('button', 'chip' + (t.id === S.topic ? ' on' : ''), esc(t.name) + (t.steps ? '<small>' + t.steps + '/5</small>' : '')); b.type = 'button';
          b.onclick = () => pickTopic(t.id); tr.append(b);
        });
        topicRow.append(tr);
      }

      const t = curTopic();
      card.classList.toggle('open', !!t);
      sep.style.display = crumb.style.display = tabs.style.display = minorRow.style.display = editor.style.display = t ? '' : 'none';
      tabs.innerHTML = ''; minorRow.innerHTML = ''; crumb.innerHTML = '';
      if (!t) return;
      const subj = S.subjects.find(s => s.id === S.subj);
      const link = t.url && t.url !== '#' ? '<a href="' + esc(t.url) + '" target="_blank" rel="noopener">Open in Notion ↗</a>' : '';
      crumb.innerHTML = esc(subj ? subj.name : '') + ' › <b>' + esc(t.name) + '</b>' + link;
      if (S.page) {
        S.page.majors.forEach((m, i) => {
          const b = $('button', 'tab' + (i === S.major ? ' on' : ''), esc(titleCase(m.title))); b.type = 'button';
          b.onclick = () => pickMajor(i); tabs.append(b);
        });
        const M = curMajor();
        if (M && !(M.minors.length === 1 && M.minors[0].direct)) {
          M.minors.forEach((m, i) => {
            const b = $('button', 'chip' + (i === S.minor ? ' on' : ''), esc(m.title) + (m.text.trim() ? '<small>•</small>' : '')); b.type = 'button';
            b.onclick = () => pickMinor(i); minorRow.append(b);
          });
        } else minorRow.style.display = 'none';
      }
      renderFoot();
    }
    const titleCase = s => s.toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase());

    function renderFoot() {
      foot.innerHTML = '';
      const st = $('span', 'status ' + status, '<i></i>' + esc(statusMsg || ''));
      foot.append(st);
      if (status === 'error') { const b = $('button', '', 'Retry'); b.type = 'button'; b.onclick = () => flush(); foot.append(b); }
      foot.append($('span', 'sp'));
      const m = curMinor();
      if (m && m.locked) foot.append($('span', 'note', m.locked + ' item' + (m.locked > 1 ? 's' : '') + ' here (image, table or nested list) can only be edited in Notion.'));
      else foot.append($('span', 'hint', '"- " makes a bullet · "1. " a numbered line'));
    }
    function setStatus(s, msg) { status = s; statusMsg = msg; const el = foot.querySelector('.status'); if (el) { el.className = 'status ' + s; el.lastChild.nodeValue = msg; } else renderFoot(); }
    const clock = () => new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

    /* ----- load page structure ----- */
    async function loadPage(id, quiet) {
      if (!quiet) { S.loading = true; S.page = null; ta.disabled = true; ta.value = ''; ta.placeholder = 'Loading…'; render(); }
      try {
        const p = await api('?action=page&id=' + encodeURIComponent(id));
        if (S.topic !== id) return null;
        showErr(null); return p;
      } catch (e) { if (S.topic === id) { showErr(e); S.err = e; } return null; }
      finally { S.loading = false; }
    }
    function showArea() {
      const m = curMinor();
      ta.disabled = !m;
      ta.value = m ? m.text : '';
      ta.placeholder = m ? 'Write here — it saves on its own.' : 'This topic page has no sections yet.';
      status = dirty ? status : 'idle'; if (!dirty) statusMsg = m ? 'Up to date' : '';
      if (!dirty && m) setStatus('saved', 'Up to date');
    }

    /* ----- picking ----- */
    async function pickSubject(id) {
      await flush(); S.subj = id; store.set('sbi.subj', id);
      const first = S.topic && curTopic() && curTopic().subject === id ? S.topic : null;
      if (!first) { S.topic = null; S.page = null; }
      render(); showArea();
    }
    async function pickTopic(id) {
      await flush(); S.topic = id; S.major = 0; S.minor = 0; store.set('sbi.topic', id);
      const p = await loadPage(id); if (!p) { render(); return; }
      S.page = p; render(); showArea();
    }
    async function pickMajor(i) { await flush(); S.major = i; S.minor = 0; store.set('sbi.major', i); render(); showArea(); }
    async function pickMinor(i) { await flush(); S.minor = i; store.set('sbi.minor', i); render(); showArea(); }

    /* ----- saving ----- */
    ta.addEventListener('input', () => {
      const m = curMinor(); if (!m) return;
      m.text = ta.value; dirty = true; version++;
      setStatus('dirty', 'Unsaved changes…');
      clearTimeout(timer); timer = setTimeout(flush, 1300);
    });
    ta.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); flush(); return; }
      if (e.key === 'Enter' && !e.shiftKey && ta.selectionStart === ta.selectionEnd) {
        const v = ta.value, pos = ta.selectionStart, ls = v.lastIndexOf('\n', pos - 1) + 1, line = v.slice(ls, pos);
        const mb = /^(\s*)([-*•]|\d+[.)])\s(.*)$/.exec(line);
        if (!mb) return;
        e.preventDefault();
        if (!mb[3].trim()) { ta.setRangeText('', ls, pos, 'end'); }
        else {
          const next = /^\d/.test(mb[2]) ? (parseInt(mb[2], 10) + 1) + '.' : mb[2];
          ta.setRangeText('\n' + mb[1] + next + ' ', pos, pos, 'end');
        }
        ta.dispatchEvent(new Event('input'));
      }
    });
    function flush() {
      clearTimeout(timer); clearTimeout(retryT);
      if (!dirty) return chain;
      const m = curMinor(), M = curMajor(), t = curTopic();
      if (!m || !M || !t) return chain;
      const body = { page: t.id, major: M.title, minor: m.title, text: m.text }, v = version;
      setStatus('saving', 'Saving…');
      chain = chain.then(async () => {
        try {
          await api('', { method: 'POST', body: JSON.stringify(body) });
          if (v === version) { dirty = false; setStatus('saved', 'Saved ' + clock()); m.virtual = false; }
          else { setStatus('dirty', 'Unsaved changes…'); flush(); }
          showErr(null);
        } catch (e) {
          setStatus('error', 'Not saved'); showErr(e);
          if (e.status !== 403 && e.status !== 401) retryT = setTimeout(flush, 8000);
        }
      });
      return chain;
    }
    function leave() {
      if (!dirty) return;
      const m = curMinor(), M = curMajor(), t = curTopic(); if (!m || DEMO) return;
      try { fetch('../api/sbi', { method: 'POST', keepalive: true, headers: { 'x-widget-key': KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ page: t.id, major: M.title, minor: m.title, text: m.text }) }); } catch (e) {}
    }
    addEventListener('pagehide', leave);
    document.addEventListener('visibilitychange', () => { if (document.hidden) { flush(); leave(); } else refresh(); });
    addEventListener('focus', refresh);

    /* pick up edits you made in Notion itself, when nothing is waiting to save */
    async function refresh() {
      if (dirty || !S.topic || S.loading || document.activeElement === ta) return;
      const id = S.topic, p = await loadPage(id, true);
      if (!p || dirty || S.topic !== id || !S.page || p.editedAt === S.page.editedAt) return;
      S.page = p; S.major = Math.min(S.major, p.majors.length - 1); S.minor = Math.min(S.minor, ((curMajor() || {}).minors || []).length - 1);
      render(); showArea();
    }

    /* ----- start ----- */
    (async function start() {
      render();
      try {
        const d = await api('?action=topics');
        S.subjects = d.subjects; S.topics = d.topics;
        if (!S.subjects.length) { showErr({ message: 'No Prelims topics found.', hint: 'Check that the topics are linked to the SBI PO Prelims aspirant.' }); }
        const ss = store.get('sbi.subj'), st = store.get('sbi.topic');
        if (ss && S.subjects.some(s => s.id === ss)) S.subj = ss;
        render();
        if (st && S.topics.some(t => t.id === st && t.subject === S.subj)) {
          S.topic = st; S.major = +store.get('sbi.major') || 0; S.minor = +store.get('sbi.minor') || 0;
          const p = await loadPage(st);
          if (p) { S.page = p; S.major = Math.min(S.major, p.majors.length - 1); S.minor = Math.min(S.minor, ((curMajor() || {}).minors || [{}]).length - 1); }
        }
        render(); showArea();
      } catch (e) { S.err = e; showErr(e); render(); }
    })();
  }

  /* ---------------- tracking pieces ---------------- */
  let dataP = null;
  const loadData = () => dataP || (dataP = api('?action=topics'));
  const STAGE_SHORT = ['Concept', 'Notes', 'Basic Qs', 'PYQs', 'Test'];
  const today = () => { const d = new Date(Q.get('today') || Date.now()); return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); };
  const dayDiff = (a, b) => Math.round((b - a) / 864e5);
  const pct = (a, b) => b ? Math.round(100 * a / b) : 0;
  const fmtDate = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

  function totals(d) {
    const nst = (d.stages || STAGE_SHORT).length;
    const done = d.topics.reduce((a, t) => a + t.steps, 0), all = d.topics.length * nst;
    return { nst, done, all, full: d.topics.filter(t => t.steps === nst).length };
  }
  const pieces = {
    countdown(d) {
      const c = $('section', 'card tight');
      if (!d.exam) { c.innerHTML = '<p class="lbl">Countdown</p><p class="empty">Add an Exam Date to the SBI PO Prelims aspirant row in Notion.</p>'; return c; }
      const left = dayDiff(today(), new Date(d.exam + 'T00:00:00Z'));
      const weeks = Math.floor(Math.max(left, 0) / 7);
      c.innerHTML = '<p class="lbl">SBI PO Prelims</p><div class="big">' + Math.max(left, 0) + '<span> days to go</span></div>' +
        '<p class="sub">' + (left > 0 ? weeks + ' weeks and ' + (left % 7) + ' days · ' : '') + esc(fmtDate(d.exam)) + '</p>';
      return c;
    },
    ring(d) {
      const t = totals(d), p = pct(t.done, t.all), R = 52, C = 2 * Math.PI * R;
      const c = $('section', 'card tight');
      c.innerHTML = '<p class="lbl">Overall progress</p><div class="ringrow"><svg viewBox="0 0 130 130" width="120" height="120">' +
        '<circle cx="65" cy="65" r="' + R + '" fill="none" stroke="#2c2c2c" stroke-width="11"/>' +
        '<circle cx="65" cy="65" r="' + R + '" fill="none" stroke="var(--acc)" stroke-width="11" stroke-linecap="round" stroke-dasharray="' + (C * p / 100) + ' ' + C + '" transform="rotate(-90 65 65)"/>' +
        '<text x="65" y="72" text-anchor="middle" fill="#e8e6e1" font-size="26" font-weight="700" font-family="Quicksand">' + p + '%</text></svg>' +
        '<div><div class="num">' + t.done + '<small> / ' + t.all + ' steps</small></div><p class="sub">' + t.full + ' of ' + d.topics.length + ' topics fully done</p></div></div>';
      return c;
    },
    subjects(d) {
      const c = $('section', 'card'); c.innerHTML = '<p class="lbl">Subjects</p>';
      d.subjects.forEach(s => {
        const ts = d.topics.filter(t => t.subject === s.id), nst = (d.stages || STAGE_SHORT).length;
        const done = ts.reduce((a, t) => a + t.steps, 0), p = pct(done, ts.length * nst), full = ts.filter(t => t.steps === nst).length;
        const state = !done ? 'Not started' : full === ts.length ? 'Done' : p >= 60 ? 'Strong' : 'Learning';
        const r = $('div', 'srow', '<div class="stop"><b>' + esc(s.name) + '</b><span class="tag">' + state + '</span></div>' +
          '<div class="bar"><i style="width:' + p + '%"></i></div><div class="sbot"><span>' + full + ' of ' + ts.length + ' topics done</span><span>' + p + '%</span></div>');
        c.append(r);
      });
      return c;
    },
    pipeline(d) {
      const c = $('section', 'card'); c.innerHTML = '<p class="lbl">Stage pipeline · topics that cleared each stage</p>';
      const n = d.topics.length, stg = d.stages || STAGE_SHORT;
      const counts = stg.map((_, i) => d.topics.filter(t => t.st && t.st[i]).length);
      const weakest = counts.some(x => x < n) ? counts.indexOf(Math.min.apply(null, counts)) : -1;
      stg.forEach((name, i) => {
        c.append($('div', 'prow', '<span class="pn">' + esc(STAGE_SHORT[i] || name) + '</span><div class="bar"><i style="width:' + pct(counts[i], n) + '%"></i></div><span class="pc">' + counts[i] + '/' + n + '</span>'));
      });
      if (weakest >= 0 && counts[weakest] < n && Math.max.apply(null, counts) > 0) c.append($('p', 'sub', 'Furthest behind: <b>' + esc(STAGE_SHORT[weakest] || stg[weakest]) + '</b>'));
      return c;
    },
    heat(d) {
      const c = $('section', 'card'); c.innerHTML = '<p class="lbl">Syllabus map</p>';
      const stg = d.stages || STAGE_SHORT;
      const head = $('div', 'hrow hhead', '<span></span>' + stg.map((s, i) => '<span class="hc">' + esc(STAGE_SHORT[i] || s) + '</span>').join(''));
      c.append(head);
      d.subjects.forEach(s => {
        c.append($('div', 'hsub', esc(s.name)));
        d.topics.filter(t => t.subject === s.id).forEach(t => {
          const full = t.steps === stg.length;
          const r = $('a', 'hrow' + (full ? ' full' : ''), '<span class="hn">' + esc(t.name) + '</span>' + stg.map((_, i) => '<span class="hc"><i class="dot' + (t.st && t.st[i] ? ' on' : '') + '"></i></span>').join(''));
          if (t.url && t.url !== '#') { r.href = t.url; r.target = '_blank'; r.rel = 'noopener'; }
          r.title = t.name + ' — ' + t.steps + '/' + stg.length;
          c.append(r);
        });
      });
      return c;
    },
    next(d) {
      const c = $('section', 'card'); c.innerHTML = '<p class="lbl">Study next</p>';
      const stg = d.stages || STAGE_SHORT;
      const open = d.topics.filter(t => t.steps < stg.length);
      // high priority first, then the ones already started (finish before opening new), then the furthest along
      open.sort((a, b) => a.pri - b.pri || (b.steps > 0) - (a.steps > 0) || b.steps - a.steps || a.name.localeCompare(b.name));
      if (!open.length) { c.append($('p', 'empty', 'Every topic is done. Revise.')); return c; }
      open.slice(0, +Q.get('n') || 5).forEach(t => {
        const i = t.st ? t.st.indexOf(false) : 0, sub = (d.subjects.find(s => s.id === t.subject) || {}).name || '';
        const r = $('a', 'nrow', '<div><b>' + esc(t.name) + '</b><span class="sub2">' + esc(sub) + '</span></div><span class="tag' + (t.pri === 1 ? ' hot' : '') + '">' + (t.pri === 1 ? 'P1 · ' : '') + 'Next: ' + esc(STAGE_SHORT[i] || stg[i]) + '</span>');
        if (t.url && t.url !== '#') { r.href = t.url; r.target = '_blank'; r.rel = 'noopener'; }
        c.append(r);
      });
      if (!open.some(t => t.pri === 1)) c.append($('p', 'hint', 'Mark topics as P1 in Notion and they will jump to the top.'));
      return c;
    },
    pace(d) {
      const c = $('section', 'card'); c.innerHTML = '<p class="lbl">Pace</p>';
      const t = totals(d); const now = today(), exam = d.exam ? new Date(d.exam + 'T00:00:00Z') : null;
      if (!exam) { c.append($('p', 'empty', 'Needs an Exam Date in Notion.')); return c; }
      const left = Math.max(dayDiff(now, exam), 0), remain = t.all - t.done;
      // aim to finish with a revision buffer (default 30 days) before the exam
      const buffer = Math.min(+Q.get('buffer') || 30, left), work = Math.max(left - buffer, 1);
      const perWeek = remain / (work / 7), perDay = remain / work;
      const start = new Date((Q.get('start') || '2026-10-25') + 'T00:00:00Z');
      const span = Math.max(dayDiff(start, exam) - (+Q.get('buffer') || 30), 1);
      const expected = Math.min(t.all, Math.max(0, Math.round(t.all * dayDiff(start, now) / span)));
      const diff = t.done - expected;
      const msg = !remain ? 'Everything is covered.' : diff >= 0 ? 'Ahead of plan by ' + diff + ' step' + (diff === 1 ? '' : 's') + '.' : 'Behind plan by ' + (-diff) + ' step' + (diff === -1 ? '' : 's') + '.';
      c.append($('div', 'prow2', '<div><div class="num">' + (remain ? perWeek.toFixed(1) : 0) + '</div><span class="sub2">steps / week needed</span></div>' +
        '<div><div class="num">' + (remain ? perDay.toFixed(1) : 0) + '</div><span class="sub2">steps / day</span></div>' +
        '<div><div class="num">' + t.done + '<small> / ' + expected + '</small></div><span class="sub2">done / planned by today</span></div>'));
      c.append($('p', 'sub' + (diff < 0 ? ' warnt' : ''), '<b>' + msg + '</b> Plan: all ' + t.all + ' steps done ' + buffer + ' days before the exam, leaving that time for revision.'));
      return c;
    },
  };

  function render(names, d) {
    names.forEach(n => { if (pieces[n]) root.append(pieces[n](d)); });
  }
  const ALL = ['countdown', 'ring', 'subjects', 'pipeline', 'next', 'pace', 'heat'];
  const want = W === 'all' ? ALL : W.split(',').map(x => x.trim());
  const track = want.filter(n => pieces[n]);
  if (track.length) {
    const holder = $('div', 'grid'); root.append(holder);
    const draw = d => {
      const keep = root; holder.innerHTML = '';
      track.forEach(n => holder.append(pieces[n](d)));
    };
    loadData().then(draw).catch(e => { holder.innerHTML = '<div class="err">' + esc(e.message) + (e.hint ? '<small>' + esc(e.hint) + '</small>' : '') + '</div>'; });
    if (!DEMO) setInterval(() => { api('?action=topics').then(draw).catch(() => {}); }, 60000);
  }
  if (want.includes('notes') || W === 'all') notes();
  if (!want.includes('notes') && W !== 'all' && !track.length) root.append($('section', 'card', '<p class="empty">Unknown piece. Use w=notes, countdown, ring, subjects, pipeline, next, pace, heat or all.</p>'));
})();
