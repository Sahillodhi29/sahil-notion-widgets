/* Learning theme switch: "classic" or "robin". Runs in <head>, so the right theme is on screen before first paint.
   The choice is saved in this browser and shared live with every other Learning widget open on the same Notion page.
   URL options:  &theme=classic | &theme=robin    force a theme for this one embed
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
  const onTheme = () => {};
  const apply = t => { if (!THEMES.includes(t) || t === cur) return; cur = t; root.dataset.theme = t; paint(); onTheme(); };
  const go = t => {
    const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (document.startViewTransition && !calm) document.startViewTransition(() => apply(t)); else apply(t);
  };
  let bc = null; try { bc = new BroadcastChannel(STORE); bc.onmessage = e => { if (!forced) go(e.data); }; } catch (e) { /* no channel here */ }
  const swap = t => { if (t === cur) return; write(t); apply(t); try { bc && bc.postMessage(t); } catch (e) { /* ignore */ } };
  addEventListener('storage', e => { if (e.key === STORE && !forced) go(e.newValue); });
  const resync = () => { const v = read(); if (!forced && THEMES.includes(v) && v !== cur) go(v); };
  addEventListener('focus', resync); document.addEventListener('visibilitychange', () => { if (!document.hidden) resync(); });

  const build = (host, cls) => {
    const box = document.createElement('div');
    box.className = 'theme-toggle ' + cls; box.setAttribute('role', 'group'); box.setAttribute('aria-label', 'Theme');
    box.innerHTML = '<button type="button" data-t="classic">Classic</button><button type="button" data-t="robin"><i aria-hidden="true"></i>Robin</button>';
    box.addEventListener('click', e => { const b = e.target.closest('button[data-t]'); if (b) swap(b.dataset.t); });
    host.appendChild(box); boxes.push(box); paint();
  };
  document.addEventListener('DOMContentLoaded', () => {
    onTheme();
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
