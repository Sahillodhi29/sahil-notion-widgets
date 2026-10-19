/* Wardrobe theme switch: "classic" (the original cream-and-wine room) or "sanji" (same room + Sanji).
   Runs in <head> so the right theme is on screen before first paint.
   URL:  &theme=classic | &theme=sanji   force a theme for this embed
         &toggle=off | &toggle=on        hide / show the switch (shown by default on the full page)
   Change DEFAULT to flip which theme people get the first time. */
(() => {
  const DEFAULT = 'classic', STORE = 'wardrobe-theme', THEMES = ['classic', 'sanji'];
  const root = document.documentElement, q = new URLSearchParams(location.search);
  const read = () => { try { return localStorage.getItem(STORE); } catch (e) { return null; } };
  const write = v => { try { localStorage.setItem(STORE, v); } catch (e) { /* embedded and blocked: fine, URL param still works */ } };
  const forced = THEMES.includes(q.get('theme')) ? q.get('theme') : null;
  let cur = forced || (THEMES.includes(read()) ? read() : DEFAULT);
  root.dataset.theme = cur;

  let box;
  const paint = () => box && box.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.t === cur)));
  const apply = t => { if (!THEMES.includes(t) || t === cur) return; cur = t; root.dataset.theme = t; paint(); };
  const swap = t => {
    if (t === cur) return; write(t);
    const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (document.startViewTransition && !calm) document.startViewTransition(() => apply(t)); else apply(t);
  };
  addEventListener('storage', e => { if (e.key === STORE && !forced) apply(e.newValue); });   // other open embeds follow along

  document.addEventListener('DOMContentLoaded', () => {
    const stage = document.getElementById('stage'), t = q.get('toggle');
    const full = document.body.dataset.mode === 'multi' && stage && !stage.classList.contains('solo');
    if (t === 'off' || t === '0' || (!full && t !== 'on' && t !== '1')) return;
    box = document.createElement('div');
    box.className = 'theme-toggle'; box.setAttribute('role', 'group'); box.setAttribute('aria-label', 'Theme');
    box.innerHTML = '<button type="button" data-t="classic">Classic</button><button type="button" data-t="sanji"><i aria-hidden="true"></i>Sanji</button>';
    box.addEventListener('click', e => { const b = e.target.closest('button[data-t]'); if (b) swap(b.dataset.t); });
    document.body.appendChild(box); document.body.classList.add('has-theme-toggle'); paint();
  });
})();
