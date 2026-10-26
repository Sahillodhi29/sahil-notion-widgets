'use strict';
/* ============================================================
   /api/wardrobe-photo  (POST, x-widget-key header)
   Lets the Wardrobe widgets upload a photo straight into Notion, so you never
   need an image-hosting site. The widget shrinks the picture first, sends it
   here as { data: "data:image/jpeg;base64,..." }, and gets back { id }.
   The widget then saves that id in the Photo field ("upload:<id>").
   Uses the same NOTION_TOKEN as everything else.
   ============================================================ */
const { HttpError, wrap, VERSION } = require('../notion');

const BASE = process.env.NOTION_API_BASE || 'https://api.notion.com/v1';
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

module.exports = wrap(async (req, res) => {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); throw new HttpError(405, 'Method not allowed.'); }
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(body.data || ''));
  if (!m) throw new HttpError(400, 'That does not look like a photo (use a JPG, PNG or WebP).');
  const buf = Buffer.from(m[2], 'base64');
  if (!buf.length || buf.length > 3500000) throw new HttpError(413, 'That photo is too big. Try a smaller one.');
  const token = process.env.NOTION_TOKEN;
  if (!token) throw new HttpError(500, 'NOTION_TOKEN is not set on the server.');
  const H = { Authorization: `Bearer ${token}`, 'Notion-Version': VERSION || '2022-06-28' };
  const filename = `photo.${EXT[m[1]]}`;

  const made = await fetch(`${BASE}/file_uploads`, {
    method: 'POST', headers: { ...H, 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename, content_type: m[1] }),
  });
  const mj = await made.json().catch(() => ({}));
  if (!made.ok || !mj.id) {
    throw new HttpError(502, `Notion would not start the upload (${mj.message || 'HTTP ' + made.status}).`,
      'In notion.so/profile/integrations open your integration and make sure "Insert content" is ticked.');
  }
  const fd = new FormData();
  fd.append('file', new Blob([buf], { type: m[1] }), filename);
  const sent = await fetch(`${BASE}/file_uploads/${mj.id}/send`, { method: 'POST', headers: H, body: fd });
  const sj = await sent.json().catch(() => ({}));
  if (!sent.ok) throw new HttpError(502, `Notion rejected the photo (${sj.message || 'HTTP ' + sent.status}).`);
  res.status(200).json({ ok: true, id: mj.id });
});
