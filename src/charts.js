// Graphiques SVG faits main : aucune dépendance, animés en CSS, couleurs prises dans les variables du thème.
(function () {
  const MONTHS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
  const k = c => { const v = c / 100; return Math.abs(v) >= 1000 ? (v / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' k€' : Math.round(v).toLocaleString('fr-FR') + ' €'; };
  const full = c => (c / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const nice = v => { if (v <= 0) return 1; const p = 10 ** Math.floor(Math.log10(v)), n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; };

  // Produits vs charges par mois : barres groupées + courbe du résultat
  function columns(months, upTo) {
    const W = 900, H = 250, x0 = 46, y0 = 16, h = 196, slot = (W - x0 - 8) / 12;
    const max = nice(Math.max(1, ...months.map(m => Math.max(m.produits, m.charges))));
    const y = v => y0 + h - Math.max(0, v) / max * h;
    const grid = [0, .25, .5, .75, 1].map(f => `<line x1="${x0}" x2="${W - 8}" y1="${y(max * f)}" y2="${y(max * f)}" class="grid"/><text x="${x0 - 8}" y="${y(max * f) + 4}" class="axis" text-anchor="end">${k(max * f)}</text>`).join('');
    const bw = slot * .32;
    const bars = months.map((m, i) => {
      const cx = x0 + slot * i + slot / 2, dim = i > upTo ? ' future' : '';
      return `<g class="col${dim}"><rect class="hit" x="${cx - slot / 2}" y="${y0}" width="${slot}" height="${h}"/>
        <rect class="bar a" style="--i:${i}" x="${cx - bw - 1}" y="${y(m.produits)}" width="${bw}" height="${y0 + h - y(m.produits)}" rx="4"/>
        <rect class="bar b" style="--i:${i}" x="${cx + 1}" y="${y(m.charges)}" width="${bw}" height="${y0 + h - y(m.charges)}" rx="4"/>
        <text x="${cx}" y="${H - 14}" class="axis" text-anchor="middle">${MONTHS[i]}</text>
        <title>${MONTHS[i]} · produits ${full(m.produits)} · charges ${full(m.charges)} · résultat ${full(m.produits - m.charges)}</title></g>`;
    }).join('');
    const pts = months.slice(0, upTo + 1).map((m, i) => [x0 + slot * i + slot / 2, y(Math.max(0, m.produits - m.charges))]);
    const line = pts.length > 1 ? `<path class="draw res" pathLength="1" d="M${pts.map(p => p.join(' ')).join('L')}"/>${pts.map(p => `<circle class="dot" cx="${p[0]}" cy="${p[1]}" r="3"/>`).join('')}` : '';
    return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Produits et charges par mois">${grid}${bars}${line}</svg>
      <div class="legend"><span><i class="sw a"></i>Produits</span><span><i class="sw b"></i>Charges</span><span><i class="sw res"></i>Résultat (si positif)</span></div>`;
  }

  // Trésorerie en fin de mois : aire + courbe
  function area(months, upTo) {
    const W = 680, H = 170, x0 = 8, y0 = 14, h = 130;
    const vals = months.slice(0, upTo + 1).map(m => m.treso);
    if (!vals.length) return '';
    const lo = Math.min(0, ...vals), hi = Math.max(1, ...vals), span = hi - lo || 1;
    const X = i => x0 + i * (W - 2 * x0) / 11, Y = v => y0 + h - (v - lo) / span * h;
    const pts = vals.map((v, i) => [X(i), Y(v)]);
    const d = 'M' + pts.map(p => p.map(n => n.toFixed(1)).join(' ')).join('L');
    const zero = lo < 0 ? `<line x1="${x0}" x2="${W - x0}" y1="${Y(0)}" y2="${Y(0)}" class="zero"/>` : '';
    return `<svg viewBox="0 0 ${W} ${H + 18}" class="chart area" role="img" aria-label="Trésorerie en fin de mois">
      <defs><linearGradient id="gArea" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".35"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>
      ${zero}<path class="fill" d="${d}L${pts.at(-1)[0]} ${y0 + h}L${pts[0][0]} ${y0 + h}Z" fill="url(#gArea)"/>
      <path class="draw treso" pathLength="1" d="${d}"/>
      ${pts.map((p, i) => `<g><circle class="dot big" cx="${p[0]}" cy="${p[1]}" r="${i === pts.length - 1 ? 5 : 3}"/><title>${MONTHS[i]} : ${full(vals[i])}</title></g>`).join('')}
      ${months.map((_, i) => `<text x="${X(i)}" y="${H + 12}" class="axis" text-anchor="middle">${MONTHS[i]}</text>`).join('')}</svg>`;
  }

  // Anneau de répartition (charges par poste)
  function donut(items, centerLabel) {
    const total = items.reduce((s, x) => s + x.value, 0);
    if (!total) return '<div class="empty small">Pas encore de charges.</div>';
    const r = 62, C = 2 * Math.PI * r;
    let off = 0;
    const segs = items.map((x, i) => {
      const len = x.value / total * C, s = `<circle class="seg c${i}" r="${r}" cx="80" cy="80" style="--i:${i}" stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}"><title>${esc(x.label)} : ${full(x.value)}</title></circle>`;
      off += len; return s;
    }).join('');
    return `<div class="donut"><svg viewBox="0 0 160 160" role="img" aria-label="Répartition des charges"><g transform="rotate(-90 80 80)">${segs}</g>
      <text x="80" y="76" text-anchor="middle" class="dk">${esc(centerLabel)}</text><text x="80" y="96" text-anchor="middle" class="dv">${k(total)}</text></svg>
      <ul>${items.map((x, i) => `<li><i class="sw c${i}"></i><span>${esc(x.label)}</span><b>${Math.round(x.value / total * 100)} %</b></li>`).join('')}</ul></div>`;
  }

  // Barres horizontales (classement)
  function ranking(items, fmt = k) {
    if (!items.length) return '<div class="empty small">Pas encore de ventes.</div>';
    const max = Math.max(...items.map(x => x.value));
    return `<div class="rank">${items.map((x, i) => `<div class="row" style="--i:${i}"><span>${esc(x.label)}</span><div class="track"><div class="fillbar" style="width:${(x.value / max * 100).toFixed(1)}%"></div></div><b>${fmt(x.value)}</b></div>`).join('')}</div>`;
  }

  // Mini-courbe pour les cartes KPI
  function spark(vals) {
    if (vals.length < 2) return '';
    const lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1;
    const d = 'M' + vals.map((v, i) => `${(i / (vals.length - 1) * 100).toFixed(1)} ${(28 - (v - lo) / span * 24).toFixed(1)}`).join('L');
    return `<svg viewBox="0 0 100 30" preserveAspectRatio="none" class="spark"><path class="draw" pathLength="1" d="${d}"/></svg>`;
  }

  window.Charts = { columns, area, donut, ranking, spark, MONTHS };
})();
