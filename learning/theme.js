/* Learning theme switch: "classic" (the reading room) or "robin" (the same room + Nico Robin).
   Runs in <head>, so the right theme is on screen before first paint.
   The choice is saved in this browser and shared live with every other Learning widget open on the same Notion page.
   URL options:  &theme=classic | &theme=robin   force a theme for this one embed
                 &toggle=on | &toggle=off           show / hide the floating pill (shown by default on the full page only)
   The standalone switch widget is theme.html (see README). Change DEFAULT to flip what people see the first time. */
(() => {
  const DEFAULT = 'classic', STORE = 'learning-theme', THEMES = ['classic', 'robin'];
  const root = document.documentElement, q = new URLSearchParams(location.search);
  const read = () => { try { return localStorage.getItem(STORE); } catch (e) { return null; } };
  const write = v => { try { localStorage.setItem(STORE, v); } catch (e) { /* storage blocked in this embed: the URL option still works */ } };
  const forced = THEMES.includes(q.get('theme')) ? q.get('theme') : null;
  let cur = forced || (THEMES.includes(read()) ? read() : DEFAULT);
  root.dataset.theme = cur;

  const boxes = [];
  const paint = () => boxes.forEach(b => b.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.t === cur))));
  const apply = t => { if (!THEMES.includes(t) || t === cur) return; cur = t; root.dataset.theme = t; paint(); if (document.readyState === 'complete') selfCheck(); };
  const go = t => {
    const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (document.startViewTransition && !calm) document.startViewTransition(() => apply(t)); else apply(t);
  };
  let bc = null; try { bc = new BroadcastChannel(STORE); bc.onmessage = e => { if (!forced) go(e.data); }; } catch (e) { /* no channel here */ }
  const swap = t => { if (t === cur) return; write(t); apply(t); try { bc && bc.postMessage(t); } catch (e) { /* ignore */ } };
  addEventListener('storage', e => { if (e.key === STORE && !forced) go(e.newValue); });
  const resync = () => { const v = read(); if (!forced && THEMES.includes(v) && v !== cur) go(v); };
  addEventListener('focus', resync); document.addEventListener('visibilitychange', () => { if (!document.hidden) resync(); });

  /* Self-check: if the Robin files did not reach the site, say so on the page instead of quietly looking like Classic. */
  const base = document.currentScript && document.currentScript.src ? new URL('.', document.currentScript.src).href : '/learning/';
  let checked = false;
  const selfCheck = () => {
    if (checked || cur !== 'robin' || document.querySelector('[data-theme-slot]')) return;
    checked = true;
    const missing = [];
    if (getComputedStyle(root).getPropertyValue('--robin-css').trim() !== '1') missing.push('learning/robin.css');
    const img = new Image();
    const done = () => {
      if (!missing.length) return;
      const n = document.createElement('div');
      n.setAttribute('role', 'alert');
      n.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:50;max-width:520px;padding:10px 14px;border-radius:12px;background:#191919;color:#BC96E6;border:2px solid #FFD166;font:600 13px/1.4 system-ui,sans-serif;cursor:pointer;box-shadow:0 14px 30px -12px #000';
      n.textContent = 'Robin theme: these files did not load: ' + missing.join(', ') + '. Make sure learning/robin.css and the whole learning/robin/ folder are uploaded, then hard refresh (Ctrl+Shift+R). Tap to dismiss.';
      n.addEventListener('click', () => n.remove());
      document.body.appendChild(n);
    };
    img.onload = done; img.onerror = () => { missing.push('learning/robin/ (the pictures)'); done(); };
    img.src = base + 'robin/eyes.webp';
  };
  addEventListener('load', selfCheck);

  const build = (host, cls) => {
    const box = document.createElement('div');
    box.className = 'theme-toggle ' + cls; box.setAttribute('role', 'group'); box.setAttribute('aria-label', 'Theme');
    box.innerHTML = '<button type="button" data-t="classic">Classic</button><button type="button" data-t="robin"><i aria-hidden="true"></i>Robin</button>';
    box.addEventListener('click', e => { const b = e.target.closest('button[data-t]'); if (b) swap(b.dataset.t); });
    host.appendChild(box); boxes.push(box); paint();
  };
  document.addEventListener('DOMContentLoaded', () => {
    const slot = document.querySelector('[data-theme-slot]');
    if (slot) {                                  // theme.html: the standalone widget
      const bg = q.get('bg');
      if (bg) { const v = bg === 'transparent' ? 'transparent' : /^[0-9a-f]{3,8}$/i.test(bg) ? '#' + bg : null; if (v) { root.style.background = v; document.body.style.background = v; } }
      build(slot, 'in-slot'); return;
    }
    const stage = document.getElementById('stage'), t = q.get('toggle');
    const full = document.body.dataset.mode === 'multi' && stage && !stage.classList.contains('solo');
    if (t === 'off' || t === '0' || (!full && t !== 'on' && t !== '1')) return;
    build(document.body, ''); document.body.classList.add('has-theme-toggle');
  });
})();
