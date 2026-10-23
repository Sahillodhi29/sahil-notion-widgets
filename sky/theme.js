/* Sky banner: theme chooser.
   /sky/?theme=enhance    the enhanced scene
   /sky/  or  ?theme=original    exactly the original (nothing extra is loaded)
   Works alongside every other option (time=, weather=, demo= ...). */
(() => {
  const t = (new URLSearchParams(location.search).get('theme') || 'original').toLowerCase();
  const on = t === 'enhance' || t === 'enhanced';
  document.documentElement.dataset.theme = on ? 'enhance' : 'original';
  if (!on) return;
  const base = document.currentScript.src;
  const url = f => new URL(f, base).href;
  document.write('<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Pacifico&display=swap">');
  document.write('<link rel="stylesheet" href="' + url('enhance.css') + '">');       // after style.css, so it layers on top
  document.addEventListener('DOMContentLoaded', () => {                              // after script.js has built the scene
    const s = document.createElement('script'); s.src = url('enhance.js'); document.body.appendChild(s);
  });
})();
