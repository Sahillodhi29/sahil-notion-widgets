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
    Object.keys(names).forEach(s => names[s].forEach((n, i) => topics.push({ id: s + i, name: n, subject: s, steps: 0, url: '#' })));
    const pages = {};
    const mk = () => ({ majors: [
      { title: 'NOTES', minors: [{ title: 'Detailed Notes', text: '', locked: 0 }, { title: 'Short Notes', text: '', locked: 0 }] },
      { title: 'IMPORTANT POINTS', minors: [{ title: 'Critical concepts', text: '', locked: 0 }, { title: 'Tricks', text: '', locked: 0 }, { title: 'Things I keep forgetting', text: '', locked: 0 }] },
      { title: 'HOT QUESTIONS', minors: [{ title: 'Questions', text: '', locked: 0, virtual: true }, { title: 'Mistakes / Solutions', text: '', locked: 0, virtual: true }] },
    ] });
    pages.q0 = mk();
    pages.q0.majors[0].minors[1].text = '- Increase of x% then decrease of x% is a net loss of x²/100 %\n- Successive change: a + b + ab/100';
    return {
      topics: { subjects, topics },
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

  if (W === 'notes' || W === 'all') notes();
  else root.append($('section', 'card', '<p class="empty">This piece isn’t built yet.</p>'));
})();
