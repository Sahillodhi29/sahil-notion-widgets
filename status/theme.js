/* Current Status: theme chooser.
   &theme=enhance          the enhanced captain's log
   no theme, or &theme=original    exactly the original (nothing extra is loaded)
   Works alongside every other option (key=, cards=, range=, demo=, time= ...). */
(() => {
  const t = (new URLSearchParams(location.search).get('theme') || 'original').toLowerCase();
  const on = t === 'enhance' || t === 'enhanced';
  document.documentElement.dataset.theme = on ? 'enhance' : 'original';
  if (!on) return;
  const base = document.currentScript.src;
  const url = f => new URL(f, base).href;
  document.write('<link rel="stylesheet" href="' + url('enhance.css') + '">');          // after style.css, so it layers on top
  document.write('<script src="' + url('enhance.js') + '"><\/script>');                  // defines the hook script.js calls after each draw
})();
