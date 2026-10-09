'use strict';
/* ============================================================
   Shared helpers for every widget that talks to Notion.
   The Notion token lives ONLY in Vercel environment variables
   (NOTION_TOKEN). Nothing in this file is secret.

   Environment variables
     NOTION_TOKEN   (required)  your integration's secret
     WIDGET_KEY     (required)  a long random password; widgets send it
     WIDGET_TZ      (optional)  default Asia/Kolkata
     NOTION_VERSION (optional)  default 2022-06-28
     DB_MUSTDO / DB_TODO_GENERAL / DB_TODO_SELF  (optional overrides)
   ============================================================ */
const crypto = require('crypto');

const API = 'https://api.notion.com/v1';
const VERSION = process.env.NOTION_VERSION || '2022-06-28';
const TZ = process.env.WIDGET_TZ || 'Asia/Kolkata';

const norm = id => String(id || '').replace(/-/g, '').toLowerCase();

// Database IDs come from your Notion page links.
const DBS = {
  mustdo:      norm(process.env.DB_MUSTDO       || '3eafa22169878083babcc69ebd3b48a1'),
  todoGeneral: norm(process.env.DB_TODO_GENERAL || '3ecfa221698780fd8b35db4b8eb33219'),
  todoSelf:    norm(process.env.DB_TODO_SELF    || '3ecfa221698780c880ace65899bb37f1'),
};

class HttpError extends Error {
  constructor(status, message, hint) {
    super(message);
    this.status = status;
    this.hint = hint;
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------- Notion REST call ---------- */
async function notion(path, { method = 'GET', body } = {}, attempt = 0) {
  const token = process.env.NOTION_TOKEN;
  if (!token) {
    throw new HttpError(500, 'NOTION_TOKEN is not set on the server.',
      'Add NOTION_TOKEN in Vercel > Settings > Environment Variables, then redeploy.');
  }
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 6000);
  let res;
  try {
    res = await fetch(API + path, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Notion-Version': VERSION,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctl.signal,
    });
  } catch (e) {
    throw new HttpError(504, 'Could not reach Notion (timed out or network error).');
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 429 && attempt < 2) {
    const wait = Math.min(1500, (parseFloat(res.headers.get('retry-after')) || 1) * 1000);
    await sleep(wait);
    return notion(path, { method, body }, attempt + 1);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) {
      throw new HttpError(502, 'Notion rejected the token.',
        'Copy the integration secret again and update NOTION_TOKEN in Vercel, then redeploy.');
    }
    if (res.status === 404) {
      throw new HttpError(502, 'Notion cannot find that page or database.',
        "Open your 'Sahil's Life' page > ... menu > Connections, and add your integration.");
    }
    throw new HttpError(502, `Notion error: ${data.message || res.status}`);
  }
  return data;
}

/* Query a database and follow pagination (up to `max` rows). */
async function queryAll(dbId, body = {}, max = 300) {
  const rows = [];
  let cursor;
  while (rows.length < max) {
    const data = await notion(`/databases/${dbId}/query`, {
      method: 'POST',
      body: { page_size: 100, ...body, ...(cursor ? { start_cursor: cursor } : {}) },
    });
    rows.push(...(data.results || []));
    if (!data.has_more || !data.next_cursor) break;
    cursor = data.next_cursor;
  }
  return rows.slice(0, max);
}

/* ---------- access control ---------- */
function authorized(req) {
  const expected = process.env.WIDGET_KEY;
  if (!expected) {
    throw new HttpError(500, 'WIDGET_KEY is not set on the server.',
      'Add WIDGET_KEY (a long random password) in Vercel > Settings > Environment Variables, then redeploy.');
  }
  const url = new URL(req.url || '/', 'http://local');
  const given = req.headers['x-widget-key'] || (req.method === 'GET' ? url.searchParams.get('key') : '') || '';
  const a = crypto.createHash('sha256').update(String(given)).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

/* Wraps a handler: auth, no-store caching, tidy JSON errors. */
function wrap(fn) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      if (!authorized(req)) {
        throw new HttpError(401, 'Missing or wrong key.', 'Open the widget with ?key=YOUR_WIDGET_KEY at the end of its URL.');
      }
      await fn(req, res);
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      if (!(e instanceof HttpError)) console.error(e);
      res.status(status).json({
        error: e instanceof HttpError ? e.message : 'Something went wrong on the server.',
        hint: e.hint,
      });
    }
  };
}

function readBody(req) {
  const b = req.body;
  if (!b) return {};
  if (typeof b === 'string') {
    try { return JSON.parse(b); } catch { throw new HttpError(400, 'Bad JSON body.'); }
  }
  return b;
}

/* A page may only be touched if it lives in one of the allowed databases. */
async function getAllowedPage(id, allowedDbs) {
  if (!/^[0-9a-f-]{32,36}$/i.test(String(id || ''))) throw new HttpError(400, 'Bad page id.');
  const page = await notion(`/pages/${id}`);
  if (page.archived || page.in_trash) throw new HttpError(404, 'That item was deleted.');
  const parent = norm(page.parent && page.parent.database_id);
  if (!parent || !allowedDbs.includes(parent)) {
    throw new HttpError(403, 'That page is not one of the widget databases.');
  }
  return page;
}

/* ---------- dates (all in your time zone) ---------- */
function tzOffsetMin(d) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(d);
  const o = {};
  parts.forEach(p => { o[p.type] = p.value; });
  const asUTC = Date.UTC(+o.year, +o.month - 1, +o.day, +o.hour, +o.minute, +o.second);
  return Math.round((asUTC - d.getTime()) / 60000);
}
function todayStr(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
function startOfDayISO(dateStr) {
  const guess = new Date(dateStr + 'T00:00:00Z');
  return new Date(guess.getTime() - tzOffsetMin(guess) * 60000).toISOString();
}
const pad = n => String(n).padStart(2, '0');
function fmtUTC(d) { return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; }
function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return fmtUTC(d);
}
function addMonths(dateStr, n) {
  const [y, m, day] = dateStr.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, last));
  return fmtUTC(target);
}
/* Add a recurrence step. Units match your Recur Unit options (including the "Quaters" spelling). */
function addInterval(dateStr, n, unit) {
  const u = String(unit || '').toLowerCase();
  if (u.startsWith('day'))  return addDays(dateStr, n);
  if (u.startsWith('week')) return addDays(dateStr, 7 * n);
  if (u.startsWith('month')) return addMonths(dateStr, n);
  if (u.startsWith('quat') || u.startsWith('quar')) return addMonths(dateStr, 3 * n);
  if (u.startsWith('year')) return addMonths(dateStr, 12 * n);
  return null;
}
function daysBetween(a, b) {
  return Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 864e5);
}

module.exports = {
  DBS, TZ, VERSION, HttpError, notion, queryAll, authorized, wrap, readBody, getAllowedPage,
  norm, todayStr, startOfDayISO, addDays, addMonths, addInterval, daysBetween,
};
