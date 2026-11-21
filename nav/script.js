/* Harbour: sea + sky that follow the time of day, a greeting, and signs to the other places.
   URL options (all optional):
     link=Name|https://…   add another sign (repeat up to 6 times), e.g. link=Workout|https://www.notion.so/your-page
     studio=/studio/       where the Studio lives (default /studio/)
     time=18:30  demo=60   preview a time of day / play a whole day in 60 seconds
     lat= lon=             where you are, for sunrise and sunset */
(() => {
  const q = new URLSearchParams(location.search), $ = id => document.getElementById(id);
  const num = (k, d) => { const v = parseFloat(q.get(k)); return Number.isFinite(v) ? v : d; };
  const sky = NWSky.mount($('banner'), { lat: num('lat', 26.2183), lon: num('lon', 78.1828), shipX: 76, shipH: 44 });

  const st = q.get('studio'); if (st && /^(\/|https?:)/.test(st)) $('studio').href = st;
  q.getAll('link').slice(0, 6).forEach(raw => {
    const i = raw.indexOf('|'), name = (i > 0 ? raw.slice(0, i) : raw).trim(), url = i > 0 ? raw.slice(i + 1).trim() : '';
    if (!name || !/^https?:\/\//i.test(url)) return;
    const a = document.createElement('a'); a.className = 'plank'; a.href = url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = name; $('dock').appendChild(a);
  });

})();
