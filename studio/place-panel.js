/* Studio: the Location panel.  Saves {name, lat, lon, tz} as "place" inside nw-studio-v1 (same store as the colours),
   which /shared/place.js reads in every sky widget.  Search uses Open-Meteo's free geocoding (no key). */
(() => {
  'use strict';
  const KEY = 'nw-studio-v1', $ = id => document.getElementById(id), DEF = { name: 'Gwalior', lat: 26.2183, lon: 78.1828, tz: 'Asia/Kolkata' };
  if (!$('placePanel')) return;
  const bc = (() => { try { return new BroadcastChannel('nw-studio'); } catch (e) { return null; } })();
  const read = () => { try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s && s.pages) return s; } catch (e) { /* none yet */ } return { v: 1, pages: {} }; };
  const write = place => {
    const s = read(); if (place) s.place = place; else delete s.place;
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { $('plNote').textContent = 'This browser blocked saving here. Open the Studio in its own tab and try again.'; return false; }
    if (bc) bc.postMessage(Date.now()); return true;
  };
  const cur = () => read().place || null;
  const WX = c => c === 0 ? 'Clear sky' : c === 1 ? 'Mostly clear' : c === 2 ? 'Partly cloudy' : c === 3 ? 'Overcast' : c === 45 || c === 48 ? 'Fog' : c >= 51 && c <= 57 ? 'Drizzle' : (c >= 61 && c <= 67) || (c >= 80 && c <= 82) ? 'Rain' : (c >= 71 && c <= 77) || c === 85 || c === 86 ? 'Snow' : c >= 95 ? 'Thunderstorm' : '';
  let tick, run = 0;
  async function show() {
    const p = cur() || DEF, me = ++run; clearInterval(tick);
    const box = $('plNow'), set = (wx) => {
      let t = ''; try { t = new Intl.DateTimeFormat([], { timeZone: p.tz, hour: 'numeric', minute: '2-digit', weekday: 'short' }).format(new Date()); } catch (e) { /* bad tz */ }
      box.innerHTML = ''; const b = document.createElement('b'); b.textContent = p.name; box.appendChild(b);
      for (const x of [t, wx, cur() ? '' : 'default']) if (x) { const s = document.createElement('span'); s.textContent = x; box.appendChild(s); }
    };
    let wx = ''; set(wx); tick = setInterval(() => set(wx), 20000);
    $('plReset').hidden = !cur();
    try {
      const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lon}&current=temperature_2m,weather_code&timezone=auto`);
      const d = await r.json(); if (me !== run) return;
      wx = `${WX(d.current.weather_code)} · ${Math.round(d.current.temperature_2m)}°C`; set(wx);
    } catch (e) { /* offline: time alone is fine */ }
  }
  $('plForm').addEventListener('submit', async e => {
    e.preventDefault(); const v = $('plIn').value.trim(), res = $('plRes'), note = $('plNote'); res.innerHTML = ''; note.textContent = '';
    if (v.length < 2) { note.textContent = 'Type at least two letters of a city.'; return; }
    note.textContent = 'Searching…';
    try {
      const r = await fetch('https://geocoding-api.open-meteo.com/v1/search?count=6&language=en&format=json&name=' + encodeURIComponent(v));
      const d = await r.json(), list = (d.results || []).filter(x => x.timezone);
      note.textContent = list.length ? '' : 'No city found. Try another spelling.';
      for (const x of list) {
        const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'listitem');
        const a = document.createElement('span'); a.textContent = x.name; const m = document.createElement('small'); m.textContent = [x.admin1, x.country].filter(Boolean).join(', ');
        b.append(a, m);
        b.onclick = () => { if (write({ name: x.name, lat: +x.latitude.toFixed(4), lon: +x.longitude.toFixed(4), tz: x.timezone })) { res.innerHTML = ''; $('plIn').value = ''; note.textContent = 'Saved. Open sky widgets switch to ' + x.name + ' by themselves.'; show(); } };
        res.appendChild(b);
      }
    } catch (err) { note.textContent = 'Could not search right now. Check your connection and try again.'; }
  });
  $('plReset').addEventListener('click', () => { if (write(null)) { $('plNote').textContent = 'Back to Gwalior.'; show(); } });
  addEventListener('storage', e => { if (e.key === KEY) show(); });
  show();
})();
