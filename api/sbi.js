'use strict';
/* ============================================================
   /api/sbi   (SBI PO prep widgets)

   GET  ?action=topics            Prelims subjects + their topics
   GET  ?action=page&id=PAGEID    the notes structure of one topic page
   POST {page, major, minor, text}  save one writing area

   Notes live on each topic page itself, inside the toggles
   NOTES / IMPORTANT POINTS / HOT QUESTIONS and their sub-toggles.
   Only plain text blocks (paragraph, bullet, numbered line) are
   ever edited. Anything else you put there in Notion (images,
   tables, nested lists) is left exactly as it is.

   Optional env overrides: DB_SYLLABUS, SBI_PRELIMS_ID
   ============================================================ */
const { HttpError, notion, queryAll, wrap, readBody, getAllowedPage, norm } = require('../lib/notion');

const DB_SYLLABUS = norm(process.env.DB_SYLLABUS || '1effa22169878314961681647c5171de');
const PRELIMS_ID = norm(process.env.SBI_PRELIMS_ID || '96ffa221698783209a3281f5e188349d');

/* Sub-sections that a major heading gets when it has none yet. */
const DEFAULT_MINORS = { 'hot questions': ['Questions', 'Mistakes / Solutions'] };

const STAGES = ['Concept', 'Notes', 'Basic Qs', 'PYQs', 'Topic Test'];
const TEXT_TYPES = ['paragraph', 'bulleted_list_item', 'numbered_list_item'];
const dash = id => { const s = norm(id); return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`; };
const plain = rt => (rt || []).map(t => t.plain_text || '').join('');
const key = s => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

async function children(id) {
  const out = [];
  let cursor;
  do {
    const d = await notion(`/blocks/${id}/children?page_size=100${cursor ? '&start_cursor=' + cursor : ''}`);
    out.push(...(d.results || []));
    cursor = d.has_more ? d.next_cursor : null;
  } while (cursor && out.length < 500);
  return out;
}

const isToggle = (b, level) => b.type === level && b[level].is_toggleable;

/* ---------- topics ---------- */
async function topics() {
  const rows = await queryAll(DB_SYLLABUS, {
    filter: { property: 'Aspirant', relation: { contains: dash(PRELIMS_ID) } },
  }, 200);
  const subjectIds = new Set();
  const list = rows.map(r => {
    const p = r.properties || {};
    const t = p['Topic Name'] && p['Topic Name'].title;
    const sub = p['Subject'] && p['Subject'].relation && p['Subject'].relation[0];
    if (sub) subjectIds.add(sub.id);
    const st = STAGES.map(n => !!(p[n] && p[n].checkbox));
    const pr = p['Priority'] && p['Priority'].select && p['Priority'].select.name || '';
    const pm = /P([123])/.exec(pr);
    return { id: r.id, name: plain(t).trim(), subject: sub ? norm(sub.id) : '', steps: st.filter(Boolean).length,
      st, pri: pm ? +pm[1] : 2, url: r.url };
  }).filter(t => t.name && t.subject);

  const subjects = await Promise.all([...subjectIds].map(async id => {
    const pg = await notion(`/pages/${id}`);
    const tp = Object.values(pg.properties || {}).find(x => x.type === 'title');
    return { id: norm(id), name: plain(tp && tp.title).trim() || 'Subject' };
  }));
  const order = ['quant', 'reason', 'english'];
  const rank = n => { const i = order.findIndex(o => n.toLowerCase().includes(o)); return i < 0 ? 9 : i; };
  subjects.sort((a, b) => rank(a.name) - rank(b.name));
  list.sort((a, b) => a.name.localeCompare(b.name));
  let exam = null;
  try {
    const ap = await notion(`/pages/${PRELIMS_ID}`);
    const d = ap.properties && ap.properties['Exam Date'] && ap.properties['Exam Date'].date;
    exam = d && d.start ? d.start.slice(0, 10) : null;
  } catch (e) { /* the countdown simply shows no date */ }
  return { subjects, topics: list, stages: STAGES, exam };
}

/* ---------- read one topic page ---------- */
function readArea(kids) {
  const lines = [];
  let locked = 0;
  for (const b of kids) {
    if (TEXT_TYPES.includes(b.type) && !b.has_children) {
      const t = plain(b[b.type].rich_text);
      if (b.type === 'bulleted_list_item') lines.push('- ' + t);
      else if (b.type === 'numbered_list_item') lines.push('1. ' + t);
      else lines.push(t);
    } else if (!(b.type === 'paragraph' && !plain(b.paragraph.rich_text) && !b.has_children)) {
      locked++;
    }
  }
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  return { text: lines.join('\n'), locked };
}

async function readPage(id) {
  const page = await getAllowedPage(id, [DB_SYLLABUS]);
  const top = await children(id);
  const majors = [];
  for (const b of top) {
    if (!isToggle(b, 'heading_2')) continue;
    const title = plain(b.heading_2.rich_text).trim();
    const kids = b.has_children ? await children(b.id) : [];
    const subs = kids.filter(k => isToggle(k, 'heading_3'));
    let minors;
    if (subs.length) {
      minors = await Promise.all(subs.map(async s => {
        const inner = s.has_children ? await children(s.id) : [];
        return { title: plain(s.heading_3.rich_text).trim(), ...readArea(inner) };
      }));
    } else {
      const names = DEFAULT_MINORS[key(title)];
      if (names) minors = names.map(n => ({ title: n, text: '', locked: 0, virtual: true }));
      else minors = [{ title, ...readArea(kids), direct: true }];
    }
    const defs = DEFAULT_MINORS[key(title)];
    if (defs && subs.length) {
      for (const n of defs) {
        if (!minors.some(m => key(m.title) === key(n))) minors.push({ title: n, text: '', locked: 0, virtual: true });
      }
    }
    majors.push({ title, minors });
  }
  return { id: norm(id), url: page.url, majors, editedAt: page.last_edited_time };
}

/* ---------- write one area ---------- */
const rich = text => {
  const out = [];
  for (let i = 0; i < text.length; i += 1900) out.push({ type: 'text', text: { content: text.slice(i, i + 1900) } });
  return out;
};

function toBlocks(text) {
  const lines = String(text).replace(/\r/g, '').replace(/\s+$/, '').split('\n');
  if (lines.length === 1 && lines[0] === '') return [];
  return lines.map(l => {
    let m;
    if ((m = /^\s*[-*•]\s+(.*)$/.exec(l))) return { type: 'bulleted_list_item', text: m[1] };
    if ((m = /^\s*\d+[.)]\s+(.*)$/.exec(l))) return { type: 'numbered_list_item', text: m[1] };
    return { type: 'paragraph', text: l };
  });
}
const mk = b => ({ object: 'block', type: b.type, [b.type]: { rich_text: b.text ? rich(b.text) : [] } });

async function syncChildren(parentId, text) {
  const want = toBlocks(text);
  const kids = parentId ? await children(parentId) : [];
  // Editable = plain text blocks without nested content. Everything else stays untouched.
  const editable = kids.filter(b => TEXT_TYPES.includes(b.type) && !b.has_children);
  // Trailing empty paragraphs from the template are free to reuse.
  let k = 0;
  while (k < want.length && k < editable.length && editable[k].type === want[k].type) {
    const old = plain(editable[k][editable[k].type].rich_text);
    if (old !== want[k].text) {
      await notion(`/blocks/${editable[k].id}`, {
        method: 'PATCH',
        body: { [want[k].type]: { rich_text: rich(want[k].text) } },
      });
    }
    k++;
  }
  for (const b of editable.slice(k)) {
    await notion(`/blocks/${b.id}`, { method: 'DELETE' });
  }
  const rest = want.slice(k).map(mk);
  for (let i = 0; i < rest.length; i += 90) {
    await notion(`/blocks/${parentId}/children`, { method: 'PATCH', body: { children: rest.slice(i, i + 90) } });
  }
}

async function save({ page, major, minor, text }) {
  if (typeof text !== 'string') throw new HttpError(400, 'Nothing to save.');
  if (text.length > 60000) throw new HttpError(413, 'That is too long for one box (60,000 characters).');
  await getAllowedPage(page, [DB_SYLLABUS]);
  const top = await children(page);
  const maj = top.find(b => isToggle(b, 'heading_2') && key(plain(b.heading_2.rich_text)) === key(major));
  if (!maj) throw new HttpError(404, `Could not find the "${major}" section on this topic page.`,
    'Open the topic in Notion and check the NOTES / IMPORTANT POINTS / HOT QUESTIONS toggles still exist.');
  const kids = maj.has_children ? await children(maj.id) : [];
  const subs = kids.filter(k => isToggle(k, 'heading_3'));
  if (!subs.length && !DEFAULT_MINORS[key(major)]) {
    await syncChildren(maj.id, text);           // section without sub-sections
    return;
  }
  let sub = subs.find(s => key(plain(s.heading_3.rich_text)) === key(minor));
  if (!sub) {
    const made = await notion(`/blocks/${maj.id}/children`, {
      method: 'PATCH',
      body: { children: [{ object: 'block', type: 'heading_3', heading_3: { rich_text: rich(minor), is_toggleable: true } }] },
    });
    sub = (made.results || []).find(r => r.type === 'heading_3');
    if (!sub) throw new HttpError(502, 'Could not create the sub-section.');
  }
  await syncChildren(sub.id, text);
}

module.exports = wrap(async (req, res) => {
  if (req.method === 'GET') {
    const url = new URL(req.url, 'http://local');
    const action = url.searchParams.get('action') || 'topics';
    if (action === 'topics') return res.status(200).json(await topics());
    if (action === 'page') return res.status(200).json(await readPage(url.searchParams.get('id')));
    throw new HttpError(400, 'Unknown action.');
  }
  if (req.method === 'POST') {
    await save(readBody(req));
    return res.status(200).json({ ok: true, savedAt: new Date().toISOString() });
  }
  throw new HttpError(405, 'Use GET or POST.');
});
