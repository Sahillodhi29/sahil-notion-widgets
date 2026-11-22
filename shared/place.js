/* Notion Widgets: place.  Loaded in <head> of every sky widget (Sky, Sail, Ship, Status, Home).
   Reads the place picked in the Studio (localStorage "nw-studio-v1" -> place) and gives the widgets:
     NWPlace.active          true when a place was picked (and the URL has no lat= / lon= / city= of its own)
     NWPlace.lat / lon / name / tz
     NWPlace.now()           a Date whose local getters (getHours...) show that place's wall clock
     NWPlace.offsetMin()     the place's UTC offset in minutes (for the sunrise estimate)
   With no place picked everything stays on the device clock and the widgets' own default (Gwalior).
   When the Studio changes the place, open widgets reload themselves once. */
(() => {
  const KEY = 'nw-studio-v1', q = new URLSearchParams(location.search);
  const read = () => { try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); return s && s.place || null; } catch (e) { return null; } };
  const valid = p => { if (!p || !Number.isFinite(+p.lat) || !Number.isFinite(+p.lon) || typeof p.tz !== 'string') return false;
    try { new Intl.DateTimeFormat('en-US', { timeZone: p.tz }); return true; } catch (e) { return false; } };
  let p = read(); if (!valid(p) || q.has('lat') || q.has('lon') || q.has('city')) p = null;
  const sig = JSON.stringify(p);
  const fmt = p && new Intl.DateTimeFormat('en-US', { timeZone: p.tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
  const now = () => {
    if (!p) return new Date();
    const o = {}; for (const x of fmt.formatToParts(new Date())) o[x.type] = +x.value;
    return new Date(o.year, o.month - 1, o.day, o.hour % 24, o.minute, o.second);
  };
  const offsetMin = () => {
    if (!p) return -new Date().getTimezoneOffset();
    const o = {}; for (const x of fmt.formatToParts(new Date())) o[x.type] = +x.value;
    const t = Math.floor(Date.now() / 1000) * 1000;
    return Math.round((Date.UTC(o.year, o.month - 1, o.day, o.hour % 24, o.minute, o.second) - t) / 60000);
  };
  window.NWPlace = { active: !!p, lat: p ? +p.lat : null, lon: p ? +p.lon : null, name: p ? p.name : '', tz: p ? p.tz : '', now, offsetMin };
  const check = () => { let n = read(); if (!valid(n) || q.has('lat') || q.has('lon') || q.has('city')) n = null; if (JSON.stringify(n) !== sig) location.reload(); };
  addEventListener('storage', e => { if (e.key === KEY || e.key === null) check(); });
  try { new BroadcastChannel('nw-studio').onmessage = () => check(); } catch (e) { /* storage events still work */ }
})();
