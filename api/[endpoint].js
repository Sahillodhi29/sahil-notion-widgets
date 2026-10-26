'use strict';
/* ============================================================
   ONE Vercel Function for every /api/* endpoint.

   Vercel's free (Hobby) plan allows 12 Serverless Functions per deployment, and every .js file inside /api counts as one.
   The handler code now lives in /lib/handlers (Vercel does not count that folder) and this single file hands each request to the right one.

   The URLs are exactly the same as before:
     /api/workout   /api/meal   /api/status   /api/sail   /api/todo   /api/health
     /api/wardrobe  /api/wardrobe-health  /api/wardrobe-photo
     /api/finance   /api/finance-health   /api/learning  /api/learning-health   /api/sbi

   To add a new endpoint: put its file in lib/handlers/ and add one line to ROUTES below. It never counts against the 12.
   Handlers load only when first used, so a problem in one endpoint cannot take down the others.
   ============================================================ */
const ROUTES = {
  'finance':          () => require('../lib/handlers/finance'),
  'finance-health':   () => require('../lib/handlers/finance-health'),
  'health':           () => require('../lib/handlers/health'),
  'learning':         () => require('../lib/handlers/learning'),
  'learning-health':  () => require('../lib/handlers/learning-health'),
  'meal':             () => require('../lib/handlers/meal'),
  'sail':             () => require('../lib/handlers/sail'),
  'sbi':              () => require('../lib/handlers/sbi'),
  'status':           () => require('../lib/handlers/status'),
  'todo':             () => require('../lib/handlers/todo'),
  'wardrobe':         () => require('../lib/handlers/wardrobe'),
  'wardrobe-health':  () => require('../lib/handlers/wardrobe-health'),
  'wardrobe-photo':   () => require('../lib/handlers/wardrobe-photo'),
  'workout':          () => require('../lib/handlers/workout'),
};
const has = k => Object.prototype.hasOwnProperty.call(ROUTES, k);
const json = (res, code, body) => {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
};

module.exports = async (req, res) => {
  const u = new URL(req.url || '/', 'http://local');
  const last = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() || '');
  const viaParam = u.searchParams.get('endpoint') || '';
  const name = has(last) ? last : (has(viaParam) ? viaParam : '');
  if (!name) return json(res, 404, { error: `No such endpoint: ${u.pathname}` });

  // Hand the handler exactly the request it always got: /api/<name>?<its own query>,
  // without the routing parameter Vercel may add for dynamic routes.
  u.searchParams.delete('endpoint');
  const qs = u.searchParams.toString();
  req.url = `/api/${name}${qs ? '?' + qs : ''}`;
  try { if (req.query && 'endpoint' in req.query) delete req.query.endpoint; } catch (e) { /* read-only query: harmless */ }

  let handler;
  try { handler = ROUTES[name](); }
  catch (e) {
    console.error(`Could not load /api/${name}:`, e);
    return json(res, 500, { error: `The ${name} endpoint failed to start.`, detail: String((e && e.message) || e) });
  }
  return handler(req, res);
};
