'use strict';
/* Theme switch: Classic <-> Shanks.
   &theme=shanks forces one, &toggle=1 shows the switch.
   The choice is remembered in localStorage and shared between embeds. */
(() => {
  const THEMES = ['classic', 'shanks'];
  const STORE = 'mustdo-theme';
  const params = new URLSearchParams(location.search);

  const read = () => {
    try { return localStorage.getItem(STORE) || ''; } catch (e) { return ''; }
  };
  const save = v => { try { localStorage.setItem(STORE, v); } catch (e) { /* private mode */ } };

  const forced = (params.get('theme') || '').toLowerCase();
  const theme = THEMES.includes(forced) ? forced : (THEMES.includes(read()) ? read() : 'classic');

  const apply = v => {
    document.documentElement.setAttribute('data-theme', v);
    document.querySelectorAll('.theme-toggle button').forEach(b => {
      b.setAttribute('aria-pressed', String(b.dataset.theme === v));
    });
  };

  apply(theme);
  if (forced) save(forced);

  const wantSwitch = params.get('toggle') !== '0';
  if (!wantSwitch) return;

  const build = () => {
    if (document.querySelector('.theme-toggle')) return;
    const bar = document.createElement('div');
    bar.className = 'theme-toggle';
    bar.setAttribute('role', 'group');
    bar.setAttribute('aria-label', 'Theme');
    bar.innerHTML = THEMES.map(t =>
      `<button type="button" data-theme="${t}" aria-pressed="${(document.documentElement.getAttribute('data-theme') || 'classic') === t}">` +
      `<i aria-hidden="true"></i>${t === 'classic' ? 'Classic' : 'Shanks'}</button>`
    ).join('');
    document.body.appendChild(bar);
    document.body.classList.add('has-theme-toggle');
    bar.addEventListener('click', e => {
      const b = e.target.closest('button[data-theme]');
      if (!b) return;
      const next = b.dataset.theme;
      const go = () => { apply(next); save(next); };
      if (document.startViewTransition) document.startViewTransition(go); else go();
      try { new BroadcastChannel('mustdo-theme').postMessage(next); } catch (err) { /* ignore */ }
      try { localStorage.setItem(STORE + ':ping', String(Date.now())); } catch (err) { /* ignore */ }
    });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();

  // other widgets on the same Notion page follow along
  try {
    const bc = new BroadcastChannel('mustdo-theme');
    bc.onmessage = e => { if (THEMES.includes(e.data)) { apply(e.data); save(e.data); } };
  } catch (e) { /* not available */ }
  addEventListener('storage', e => {
    if (e.key === STORE + ':ping') { const v = read(); if (THEMES.includes(v)) apply(v); }
  });
})();
