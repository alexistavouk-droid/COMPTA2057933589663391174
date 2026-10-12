// Graphiques en relief (perspective cavalière) en SVG pur : barres 3D et camembert 3D.
(function () {
  const MONTHS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
  const k = c => { const v = c / 100; return Math.abs(v) >= 1000 ? (v / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' k€' : Math.round(v).toLocaleString('fr-FR') + ' €'; };
  const full = c => (c / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const nice = v => { if (v <= 0) return 1; const p = 10 ** Math.floor(Math.log10(v)), n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; };
  const f = n => n.toFixed(1);

  // Un pavé : face avant, dessus, côté droit
  function box(x, y, w, h, dx, dy, cls, i, tip) {
    return `<g class="b3 ${cls}" style="--i:${i}">
      <path class="side" d="M${f(x + w)} ${f(y)}l${dx} ${dy}v${f(h)}l${-dx} ${-dy}z"/>
      <path class="top" d="M${f(x)} ${f(y)}l${dx} ${dy}h${f(w)}l${-dx} ${-dy}z"/>
      <rect class="front" x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}"/><title>${tip}</title></g>`;
  }

  function bars(months, upTo) {
    const W = 900, H = 300, x0 = 54, base = 250, h = 200, dx = 12, dy = -9, slot = (W - x0 - 30) / 12, bw = slot * 0.3;
    const max = nice(Math.max(1, ...months.map(m => Math.max(m.produits, m.charges))));
    const Y = v => Math.max(0, v) / max * h;
    // sol et mur du fond en perspective
    const floor = `<path class="floor" d="M${x0} ${base}l${dx} ${dy}H${W - 18}l${-dx} ${-dy}z"/>`;
    const grid = [0.25, 0.5, 0.75, 1].map(t => `<path class="grid" d="M${x0} ${f(base - t * h)}l${dx} ${dy}H${W - 18}"/><text x="${x0 - 8}" y="${f(base - t * h + 4)}" class="axis" text-anchor="end">${k(max * t)}</text>`).join('');
    const cols = months.map((m, i) => {
      const cx = x0 + slot * i + slot * 0.18, dim = i > upTo ? ' future' : '';
      return `<g class="m3${dim}">${box(cx, base - Y(m.produits), bw, Y(m.produits), dx, dy, 'a', i, `${MONTHS[i]} · produits ${full(m.produits)}`)}
        ${box(cx + bw + 3, base - Y(m.charges), bw, Y(m.charges), dx, dy, 'b', i, `${MONTHS[i]} · charges ${full(m.charges)}`)}
        <text x="${f(cx + bw + dx / 2)}" y="${base + 18}" class="axis" text-anchor="middle">${MONTHS[i]}</text></g>`;
    }).join('');
    return `<svg viewBox="0 0 ${W} ${H}" class="chart c3d" role="img" aria-label="Produits et charges par mois, en 3D">
      <defs><linearGradient id="g3a" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#8b8cf8"/><stop offset="1" stop-color="#4f46e5"/></linearGradient>
      <linearGradient id="g3b" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#f9a8d4"/><stop offset="1" stop-color="#db2777"/></linearGradient></defs>
      ${floor}${grid}${cols}</svg>
      <div class="legend"><span><i class="sw a"></i>Produits</span><span><i class="sw b"></i>Charges</span></div>`;
  }

  function pie(items, label) {
    const total = items.reduce((s, x) => s + x.value, 0);
    if (!total) return '<div class="empty small">Pas encore de données.</div>';
    const cx = 160, cy = 92, rx = 132, ry = 74, depth = 26;
    const P = (a, d = 0) => `${f(cx + rx * Math.cos(a))} ${f(cy + ry * Math.sin(a) + d)}`;
    let a = -Math.PI / 2;
    const slices = items.map((x, i) => { const a1 = a; a += x.value / total * Math.PI * 2; return { ...x, i, a1, a2: a }; });
    // flancs visibles : partie de l'arc située devant (angle entre 0 et π, à 2π près)
    const sides = slices.flatMap(s => [0, 2 * Math.PI].map(off => {
      const st = Math.max(s.a1, off), en = Math.min(s.a2, off + Math.PI);
      return en > st ? `<path class="pside c${s.i}" d="M${P(st)}A${rx} ${ry} 0 0 1 ${P(en)}L${P(en, depth)}A${rx} ${ry} 0 0 0 ${P(st, depth)}Z"/>` : '';
    })).join('');
    const tops = slices.map(s => {
      const mid = (s.a1 + s.a2) / 2, large = s.a2 - s.a1 > Math.PI ? 1 : 0;
      return `<g class="ptop" style="--i:${s.i};--mx:${f(Math.cos(mid) * 10)}px;--my:${f(Math.sin(mid) * 6)}px"><path class="c${s.i}" d="M${cx} ${cy}L${P(s.a1)}A${rx} ${ry} 0 ${large} 1 ${P(s.a2)}Z"/><title>${esc(s.label)} : ${full(s.value)} (${Math.round(s.value / total * 100)} %)</title></g>`;
    }).join('');
    return `<div class="pie3d"><svg viewBox="0 0 320 ${cy + ry + depth + 12}" role="img" aria-label="${esc(label)} en 3D"><g class="pie-in">${sides}${tops}</g></svg>
      <ul>${slices.map(s => `<li><i class="sw c${s.i}"></i><span>${esc(s.label)}</span><b>${k(s.value)}</b><em>${Math.round(s.value / total * 100)} %</em></li>`).join('')}</ul></div>`;
  }

  window.Charts3D = { bars, pie };
})();
