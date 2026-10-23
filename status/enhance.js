/* ============================================================
   Current Status: ENHANCED theme helper
   Loaded only with &theme=enhance. script.js calls
   window.__statusAfterDraw() after every draw; this adds:
     - an average ring in each card header
     - three KPI chips under each header
     - a "n/days" count at the end of every habit row
   It only reads numbers script.js already worked out.
   ============================================================ */
(() => {
  'use strict';
  const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const short = s => `${WD[(new Date(s + 'T00:00:00Z').getUTCDay() + 6) % 7]} ${+s.slice(8)}`;

  function ring(inner, comp) {
    const old = inner.querySelector('.count');
    if (!old) return;
    const avg = comp.avg;
    const el = document.createElement('div');
    el.className = 'ring';
    el.title = `Average ${comp.per.label}`;
    el.innerHTML = `<svg viewBox="0 0 36 36" aria-hidden="true"><circle class="rt" cx="18" cy="18" r="15.5"/>` +
      (avg ? `<circle class="rv" cx="18" cy="18" r="15.5" pathLength="100" stroke-dasharray="${avg} 100"/>` : '') + `</svg>` +
      `<b>${avg == null ? '–' : avg}${avg == null ? '' : '<small>%</small>'}</b>`;
    old.replaceWith(el);
  }

  function kpis(inner, kind, comp) {
    const head = inner.querySelector('.card-head');
    if (!head) return;
    const real = comp.days.filter(d => d.state === 'row' && !d.noRow);
    const best = real.reduce((a, d) => (!a || d.pct > a.pct ? d : a), null);
    const bestTxt = best && best.pct > 0 ? [`<i>${short(best.date)}</i> <em>${Math.round(best.pct * 100)}%</em>`, `${short(best.date)} ${Math.round(best.pct * 100)}%`] : ['–', ''];
    const arr = [...comp.tally.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    let items = [];

    if (kind === 'mustdo') {
      const perfect = real.filter(d => d.total && d.done === d.total).length;
      const weak = (comp.habits || []).filter(h => comp.counted > 0).sort((a, b) => a.n - b.n)[0];
      const weakOk = weak && weak.n < comp.counted;
      items = [
        ['Perfect days', `<i>${perfect}</i> <em>of ${comp.counted}</em>`, `${perfect} of ${comp.counted}`],
        ['Best day', bestTxt[0], bestTxt[1]],
        ['Needs love', weakOk ? `${esc(weak.label)} <em>${weak.n}/${comp.counted}</em>` : '–', weakOk ? weak.label : ''],
      ];
    } else if (kind === 'workout') {
      const low = comp.rowsUsed > 0 ? arr[arr.length - 1] : null;
      items = [
        ['Sessions', `<i>${comp.sessions}</i> done${comp.planned ? ` <em>· ${comp.planned} planned</em>` : ''}`, `${comp.sessions} done`],
        ['Best session', bestTxt[0], bestTxt[1]],
        ['Skipped most', low && low[1] < comp.rowsUsed ? `${esc(low[0])} <em>${low[1]}/${comp.rowsUsed}</em>` : '–', low ? low[0] : ''],
      ];
    } else {
      const top = comp.rowsUsed > 0 ? arr[0] : null;
      items = [
        ['Days logged', `<i>${comp.logged}</i>`, `${comp.logged}`],
        ['Best day', bestTxt[0], bestTxt[1]],
        ['Top food', top && top[1] > 0 ? `${esc(top[0])} <em>${top[1]}/${comp.rowsUsed}</em>` : '–', top ? top[0] : ''],
      ];
    }
    const k = document.createElement('div');
    k.className = 'kpis';
    k.innerHTML = items.map(([l, v, t]) => `<div class="kpi"><small>${l}</small><b title="${esc(t)}">${v}</b></div>`).join('');
    head.after(k);
  }

  function habitCounts(inner, kind, comp) {
    if (kind !== 'mustdo' || !comp.habits || !comp.counted) return;
    const rows = inner.querySelectorAll('.hgrid .hrow');
    rows.forEach((row, i) => {
      const n = document.createElement('div');
      if (i === 0) { n.className = 'hn'; }
      else {
        const hb = comp.habits[i - 1];
        if (!hb) return;
        const r = hb.n / comp.counted;
        n.className = 'hn' + (r >= 0.8 ? ' hi' : r <= 0.3 ? ' lo' : '');
        n.textContent = `${hb.n}/${comp.counted}`;
      }
      row.appendChild(n);
    });
  }

  window.__statusAfterDraw = ({ COMPS, SHOW }) => {
    SHOW.forEach(kind => {
      const comp = COMPS[kind];
      const inner = document.getElementById('in-' + kind);
      if (!inner || !comp || comp.error) return;
      ring(inner, comp);
      kpis(inner, kind, comp);
      habitCounts(inner, kind, comp);
    });
  };
})();
