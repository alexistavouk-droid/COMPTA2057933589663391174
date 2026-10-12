// Boîte à outils du commerçant : s'appuie sur app.js (views, actions, helpers) et analytics.js.
(function () {
  const A = window.Analytics;
  const pct = n => n === null || !isFinite(n) ? '—' : (Math.round(n * 10) / 10).toLocaleString('fr-FR') + ' %';
  const j = n => n === null ? '—' : n + ' j';
  const back = '<div class="bar"><button data-act="go" data-v="tools">← Boîte à outils</button></div>';
  const num0 = s => { const n = Number(String(s).replace(/\s/g, '').replace(',', '.')); return isFinite(n) ? n : 0; };

  const TOOLS = [
    { t: 'pricing', ico: '€', title: 'Calculateur de prix', desc: 'Coefficient, taux de marque, taux de marge et prix TTC à partir du coût d\'achat.' },
    { t: 'discount', ico: '%', title: 'Simulateur de remise', desc: 'Combien vendre en plus pour qu\'une promotion ne vous coûte rien.' },
    { t: 'aged', ico: '⏱', title: 'Balance âgée & relances', desc: 'Créances clients par ancienneté de retard, texte de relance prêt à envoyer.' },
    { t: 'forecast', ico: '↗', title: 'Prévisionnel de trésorerie', desc: 'Votre solde bancaire projeté sur 90 jours, point bas inclus.' },
    { t: 'abc', ico: 'A', title: 'Analyse ABC des ventes', desc: 'Les 20 % d\'articles qui font 80 % de votre chiffre d\'affaires.' },
    { t: 'stock', ico: '▦', title: 'Rotation & inventaire', desc: 'Couverture de stock, articles dormants, écriture d\'inventaire en un clic.' },
    { t: 'breakeven', ico: '◎', title: 'Seuil de rentabilité', desc: 'Le chiffre d\'affaires à atteindre pour couvrir vos charges, et la date du point mort.' },
    { t: 'bfr', ico: '⇄', title: 'BFR & délais de paiement', desc: 'DSO clients, DPO fournisseurs, rotation du stock et besoin en fonds de roulement.' }
  ];

  const page = {
    hub() {
      return `<h1>Boîte à outils</h1><p class="sub">Les outils d'analyse et de pilotage d'une entreprise qui vend. Tout est calculé à partir de vos factures et de votre comptabilité.</p>
      <div class="tools">${TOOLS.map((x, i) => `<button class="tool" data-act="tool" data-t="${x.t}" style="--i:${i}"><span class="ico">${x.ico}</span><b>${x.title}</b><small>${x.desc}</small></button>`).join('')}</div>`;
    },

    pricing() {
      return `<h1>Calculateur de prix</h1><p class="sub">Saisissez un coût d'achat HT puis un coefficient ou un taux de marque : tout se recalcule en direct.</p>${back}
      <div class="dash"><div class="card span-6" data-calc="pricing"><div class="grid">
        <label>Coût d'achat HT (€)<input id="pc-cost" value="40" inputmode="decimal"></label>
        <label>TVA (%)<select id="pc-vat"><option>20</option><option>10</option><option>5.5</option><option>2.1</option><option>0</option></select></label>
        <label>Mode<select id="pc-mode"><option value="coef">Coefficient multiplicateur</option><option value="marque">Taux de marque visé</option></select></label>
        <label>Valeur<input id="pc-val" value="2,5" inputmode="decimal"></label></div></div>
      <div class="card span-6" id="pc-out"></div></div>
      <div class="card" style="margin-top:14px"><div class="card-title">Rappel</div><p class="sub" style="margin:0">Taux de marque = marge ÷ prix de vente HT. Taux de marge = marge ÷ coût d'achat. Coefficient = prix de vente ÷ coût d'achat. Un taux de marque de 50 % correspond à un coefficient de 2.</p></div>`;
    },

    discount() {
      return `<h1>Simulateur de remise</h1><p class="sub">Une remise réduit votre marge bien plus que votre prix. Voici le volume supplémentaire nécessaire pour gagner autant qu'avant.</p>${back}
      <div class="dash"><div class="card span-6" data-calc="discount"><div class="grid">
        <label>Taux de marque actuel (%)<input id="ds-t" value="${Math.round(currentMarque() || 40)}" inputmode="decimal"></label>
        <label>Remise accordée (%)<input id="ds-r" value="10" inputmode="decimal"></label>
        <label>Ventes actuelles (unités / mois)<input id="ds-q" value="100" inputmode="decimal"></label></div></div>
      <div class="card span-6" id="ds-out"></div></div>`;
    },

    aged() {
      const rows = A.aged(db, today());
      const tot = k => rows.reduce((s, r) => s + r[k], 0);
      const cell = v => `<td class="n ${v ? '' : 'muted'}">${v ? eur(v) : '—'}</td>`;
      return `<h1>Balance âgée clients</h1><p class="sub">Créances non réglées classées par retard par rapport à l'échéance. Le retard au-delà de 60 jours dépasse le plafond légal (art. L441-10 du Code de commerce).</p>${back}
      <div class="cards">${[['Non échu', 'notDue'], ['1 à 30 j', 'd30'], ['31 à 60 j', 'd60'], ['61 à 90 j', 'd90'], ['Plus de 90 j', 'more']].map(([k, key], i) => `<div class="card kpi ${i > 2 && tot(key) ? 'neg' : ''}"><div class="k">${k}</div><div class="v" data-count="${tot(key)}">${eur(tot(key))}</div></div>`).join('')}</div>
      <h2>Par client</h2>${rows.length ? `<table><tr><th>Client</th><th class="n">Non échu</th><th class="n">1-30 j</th><th class="n">31-60 j</th><th class="n">61-90 j</th><th class="n">+ 90 j</th><th class="n">Total</th><th></th></tr>
      ${rows.map(r => `<tr><td>${esc(tierName(r.tierId))}</td>${cell(r.notDue)}${cell(r.d30)}${cell(r.d60)}${cell(r.d90)}${cell(r.more)}<td class="n"><b>${eur(r.total)}</b></td><td>${r.total - r.notDue > 0 ? `<button class="link" data-act="copyDunning" data-id="${r.tierId}">Copier la relance</button>` : ''}</td></tr>`).join('')}
      <tfoot><tr><td>Total</td><td class="n">${eur(tot('notDue'))}</td><td class="n">${eur(tot('d30'))}</td><td class="n">${eur(tot('d60'))}</td><td class="n">${eur(tot('d90'))}</td><td class="n">${eur(tot('more'))}</td><td class="n">${eur(tot('total'))}</td><td></td></tr></tfoot></table>` : '<div class="empty">Toutes vos factures clients sont réglées.</div>'}`;
    },

    forecast() {
      const f = A.forecast(db, today());
      return `<h1>Prévisionnel de trésorerie</h1><p class="sub">Projection à 90 jours : factures ouvertes à leur échéance (une facture client en retard est supposée payée sous 15 jours) et dépenses récurrentes hors factures, estimées sur la moyenne des 3 derniers mois.</p>${back}
      <div class="cards"><div class="card kpi"><div class="k">Aujourd'hui</div><div class="v" data-count="${f.start}">${eur(f.start)}</div></div>
      <div class="card kpi pos"><div class="k">Encaissements attendus</div><div class="v" data-count="${f.in}">${eur(f.in)}</div></div>
      <div class="card kpi neg"><div class="k">Décaissements prévus</div><div class="v" data-count="${f.out}">${eur(f.out)}</div></div>
      <div class="card kpi ${f.low.cash < 0 ? 'neg' : ''}"><div class="k">Point bas · ${fdate(f.low.date)}</div><div class="v" data-count="${f.low.cash}">${eur(f.low.cash)}</div></div>
      <div class="card kpi"><div class="k">Dans 90 jours</div><div class="v" data-count="${f.end}">${eur(f.end)}</div></div></div>
      ${f.low.cash < 0 ? '<div class="alert">Votre trésorerie passerait sous zéro : relancez les clients en retard, négociez un délai fournisseur ou prévoyez un découvert autorisé.</div>' : ''}
      <div class="card" style="margin-top:14px"><div class="card-title">Solde projeté<span class="k">90 jours</span></div>${stepChart(f.points)}</div>
      <h2>Mouvements prévus</h2>${f.flows.length ? `<table><tr><th>Date</th><th>Origine</th><th class="n">Montant</th></tr>${f.flows.map(x => `<tr><td>${fdate(x.date)}</td><td>${esc(x.label)}</td><td class="n ${x.amount < 0 ? 'neg' : 'pos'}">${eur(x.amount)}</td></tr>`).join('')}</table>` : '<div class="empty">Aucun mouvement prévu.</div>'}`;
    },

    abc() {
      const from = param.from ?? yearStart(), to = param.to ?? today();
      const list = A.abc(db, from, to), count = c => list.filter(x => x.cls === c).length;
      return `<h1>Analyse ABC des ventes</h1><p class="sub">Classe A : les articles qui font 80 % du CA, à ne jamais laisser en rupture. Classe C : la longue traîne, à rationaliser.</p>${back}
      <div class="bar">${period(from, to)}</div>
      <div class="cards"><div class="card kpi"><div class="k">Classe A</div><div class="v">${count('A')} article${count('A') > 1 ? 's' : ''}</div></div><div class="card kpi"><div class="k">Classe B</div><div class="v">${count('B')}</div></div><div class="card kpi"><div class="k">Classe C</div><div class="v">${count('C')}</div></div></div>
      <h2>Classement</h2>${list.length ? `<table><tr><th>Classe</th><th>Article</th><th class="n">Qté</th><th class="n">CA HT</th><th class="n">Part</th><th style="width:28%">Cumul</th><th class="n">Marge</th></tr>
      ${list.map((x, i) => `<tr><td><span class="abc ${x.cls}">${x.cls}</span></td><td>${esc(x.label)}</td><td class="n">${x.qty}</td><td class="n">${eur(x.ht)}</td><td class="n">${pct(x.share)}</td><td><div class="track"><div class="fillbar" style="width:${x.cum.toFixed(1)}%;--i:${i}"></div></div></td><td class="n">${eur(x.marge)}</td></tr>`).join('')}</table>` : '<div class="empty">Aucune vente sur la période.</div>'}`;
    },

    stock() {
      const from = param.from ?? A.addDays(today(), -90), to = param.to ?? today();
      const list = A.rotation(db, from, to), value = list.reduce((s, p) => s + p.value, 0);
      const bal37 = (L.balance(db, '', today()).find(b => b.acc === '370000') || { solde: 0 }).solde;
      return `<h1>Rotation des stocks & inventaire</h1><p class="sub">Couverture = nombre de jours de ventes que votre stock permet de tenir au rythme de la période. Dormant = aucune vente depuis 90 jours.</p>${back}
      <div class="bar">${period(from, to)}</div>
      <div class="cards"><div class="card kpi"><div class="k">Valeur du stock (CMUP)</div><div class="v" data-count="${value}">${eur(value)}</div></div>
      <div class="card kpi"><div class="k">Compte 37 en comptabilité</div><div class="v">${eur(bal37)}</div>${value !== bal37 ? `<div class="trend down">Écart ${eur(value - bal37)}</div>` : '<div class="trend up">À jour</div>'}</div>
      <div class="card kpi ${list.some(p => p.dormant) ? 'neg' : ''}"><div class="k">Articles dormants</div><div class="v">${list.filter(p => p.dormant).length}</div></div></div>
      <div class="bar" style="margin-top:14px"><button class="primary" data-act="stockEntry" ${value === bal37 ? 'disabled' : ''}>Passer l'écriture d'inventaire (37 / 6037)</button><span class="k">À faire à la clôture, après comptage physique.</span></div>
      ${list.length ? `<table><tr><th>Article</th><th class="n">Stock</th><th class="n">Valeur</th><th class="n">Vendus</th><th class="n">Couverture</th><th class="n">Rotation / an</th><th>Dernière vente</th><th></th></tr>
      ${list.map(p => `<tr><td>${esc(p.label)}</td><td class="n">${p.stock}</td><td class="n">${eur(p.value)}</td><td class="n">${p.sold}</td><td class="n ${p.cover !== null && p.cover < 15 ? 'neg' : ''}">${j(p.cover)}</td><td class="n">${p.turns === null ? '—' : p.turns.toFixed(1)}</td><td>${fdate(p.last) || '—'}</td><td>${p.dormant ? '<span class="pill LATE">Dormant</span>' : p.cover !== null && p.cover < 15 ? '<span class="pill ISSUED">À commander</span>' : ''}</td></tr>`).join('')}</table>` : '<div class="empty">Aucune marchandise.</div>'}`;
    },

    breakeven() {
      const from = param.from ?? yearStart(), to = param.to ?? today();
      const b = A.breakEven(db, from, to);
      const progress = b.seuil ? Math.min(100, b.ca / b.seuil * 100) : 0;
      return `<h1>Seuil de rentabilité</h1><p class="sub">Charges variables = achats de marchandises et transports. Charges fixes = tout le reste (loyer, salaires, logiciels…). Seuil = charges fixes ÷ taux de marge sur coûts variables.</p>${back}
      <div class="bar">${period(from, to)}</div>
      <div class="dash"><div class="card span-8"><div class="card-title">${b.reached ? 'Seuil atteint' : 'Progression vers le seuil'}<span class="k">${pct(progress)}</span></div>
        <div class="meter big"><i style="width:${progress.toFixed(1)}%"></i></div>
        <div class="cards" style="margin-top:14px"><div class="card kpi"><div class="k">CA réalisé</div><div class="v" data-count="${b.ca}">${eur(b.ca)}</div></div><div class="card kpi"><div class="k">Seuil de rentabilité</div><div class="v">${b.seuil === null ? '—' : eur(b.seuil)}</div></div></div></div>
      <div class="card span-4 kpi ${b.reached ? 'pos' : ''}"><div class="k">Point mort</div><div class="v">${b.date ? fdate(b.date) : '—'}</div><div class="k" style="margin-top:12px">${b.date ? (b.reached ? 'Depuis cette date, chaque vente dégage du bénéfice.' : 'Date estimée au rythme actuel des ventes.') : 'Pas assez de données.'}</div></div>
      <div class="card span-4 kpi"><div class="k">Charges fixes</div><div class="v">${eur(b.fixed)}</div></div>
      <div class="card span-4 kpi"><div class="k">Charges variables</div><div class="v">${eur(b.cv)}</div></div>
      <div class="card span-4 kpi"><div class="k">Taux de marge sur coûts variables</div><div class="v">${pct(b.rate * 100)}</div></div></div>`;
    },

    bfr() {
      const from = param.from ?? yearStart(), to = param.to ?? today();
      const r = A.bfr(db, from, to);
      return `<h1>BFR & délais de paiement</h1><p class="sub">Le besoin en fonds de roulement, c'est l'argent immobilisé dans le cycle de vente : stock + créances clients − dettes fournisseurs.</p>${back}
      <div class="bar">${period(from, to)}</div>
      <div class="cards"><div class="card kpi"><div class="k">Créances clients</div><div class="v" data-count="${r.clients}">${eur(r.clients)}</div></div><div class="card kpi"><div class="k">+ Stock</div><div class="v" data-count="${r.stock}">${eur(r.stock)}</div></div>
      <div class="card kpi"><div class="k">− Dettes fournisseurs</div><div class="v" data-count="${r.fournisseurs}">${eur(r.fournisseurs)}</div></div><div class="card kpi ${r.bfr > 0 ? 'neg' : 'pos'}"><div class="k">= BFR</div><div class="v" data-count="${r.bfr}">${eur(r.bfr)}</div></div></div>
      <h2>Délais</h2><div class="cards">
      <div class="card kpi"><div class="k">DSO · délai moyen d'encaissement</div><div class="v">${j(r.dso)}</div><div class="trend ${r.dso !== null && r.dso > 60 ? 'down' : 'up'}">${r.dso !== null && r.dso > 60 ? 'Au-delà du plafond légal de 60 jours' : 'Dans les délais légaux'}</div></div>
      <div class="card kpi"><div class="k">DPO · délai moyen de paiement fournisseurs</div><div class="v">${j(r.dpo)}</div></div>
      <div class="card kpi"><div class="k">DIO · durée de stockage</div><div class="v">${j(r.dio)}</div></div>
      <div class="card kpi"><div class="k">Cycle de trésorerie (DSO + DIO − DPO)</div><div class="v">${r.dso === null || r.dio === null || r.dpo === null ? '—' : j(r.dso + r.dio - r.dpo)}</div></div></div>`;
    }
  };

  function stepChart(points) {
    const W = 900, H = 220, x0 = 60, y0 = 12, h = 170, t0 = Date.parse(points[0].date), span = 90 * 864e5;
    const vals = points.map(p => p.cash), lo = Math.min(0, ...vals), hi = Math.max(1, ...vals), rng = hi - lo || 1;
    const X = d => x0 + (Date.parse(d) - t0) / span * (W - x0 - 10), Y = v => y0 + h - (v - lo) / rng * h;
    let d = `M${X(points[0].date)} ${Y(points[0].cash)}`;
    for (let i = 1; i < points.length; i++) d += `H${X(points[i].date)}V${Y(points[i].cash)}`;
    d += `H${W - 10}`;
    const ticks = [0, 30, 60, 90].map(n => { const dt = A.addDays(points[0].date, n); return `<text x="${X(dt)}" y="${H + 4}" class="axis" text-anchor="middle">${fdate(dt).slice(0, 5)}</text>`; }).join('');
    const grid = [lo, (lo + hi) / 2, hi].map(v => `<line x1="${x0}" x2="${W - 10}" y1="${Y(v)}" y2="${Y(v)}" class="grid"/><text x="${x0 - 8}" y="${Y(v) + 4}" class="axis" text-anchor="end">${eur(v).replace(/,\d+/, '')}</text>`).join('');
    const zero = lo < 0 ? `<line x1="${x0}" x2="${W - 10}" y1="${Y(0)}" y2="${Y(0)}" class="zero"/>` : '';
    return `<svg viewBox="0 0 ${W} ${H + 12}" class="chart" role="img" aria-label="Solde de trésorerie projeté">${grid}${zero}<path class="draw treso" pathLength="1" d="${d}"/>${ticks}</svg>`;
  }

  function currentMarque() {
    const ventes = db.products.filter(p => p.type === 'GOODS' && p.price);
    return ventes.length ? ventes.reduce((s, p) => s + (p.price - p.cost) / p.price * 100, 0) / ventes.length : null;
  }

  const calcs = {
    pricing() {
      const cost = num0($('#pc-cost').value) * 100, v = num0($('#pc-val').value), vat = num0($('#pc-vat').value);
      if ($('#pc-mode').value === 'marque' && v >= 100) return $('#pc-out').innerHTML = '<div class="alert">Un taux de marque doit rester sous 100 %.</div>';
      const r = A.pricing($('#pc-mode').value === 'coef' ? { cost, coef: v, vat } : { cost, marque: v, vat });
      const line = (k, val, big) => `<div class="calc-line ${big ? 'big' : ''}"><span>${k}</span><b>${val}</b></div>`;
      $('#pc-out').innerHTML = line('Prix de vente HT', eur(Math.round(r.ht))) + line('Prix de vente TTC', eur(Math.round(r.ttc)), true) + line('Marge par unité', eur(Math.round(r.marge))) +
        line('Coefficient HT', r.coef.toFixed(2).replace('.', ',')) + line('Coefficient TTC', r.coefTTC.toFixed(2).replace('.', ',')) + line('Taux de marque', pct(r.tauxMarque)) + line('Taux de marge', pct(r.tauxMarge));
    },
    discount() {
      const t = num0($('#ds-t').value), r = num0($('#ds-r').value), q = num0($('#ds-q').value), need = A.discountVolume(t, r);
      $('#ds-out').innerHTML = !isFinite(need) ? '<div class="alert">Avec cette remise vous vendez à perte : la remise dépasse votre taux de marque.</div>'
        : `<div class="k">Pour garder la même marge totale, il faut vendre</div><div class="v xl">+${pct(need)}</div>
          <div class="calc-line"><span>Soit</span><b>${Math.ceil(q * (1 + need / 100))} unités au lieu de ${q}</b></div>
          <div class="calc-line"><span>Nouveau taux de marque</span><b>${pct((t - r) / (100 - r) * 100)}</b></div>
          <div class="meter big"><i style="width:${Math.min(100, need / 2).toFixed(1)}%"></i></div><p class="sub">Une remise de ${pct(r)} sur une marque de ${pct(t)} demande ${need > 50 ? 'beaucoup' : 'un peu'} plus de volume : réservez-la aux articles à forte marge ou au déstockage.</p>`;
    }
  };

  views.tools = () => (page[param.t] || page.hub)();
  Object.assign(actions, {
    tool: ({ t }) => go('tools', { t }),
    async copyDunning({ id }) {
      const t = db.tiers.find(x => x.id === id), docs = A.aged(db, today()).find(r => r.tierId === id).docs.filter(d => d.late > 0);
      const txt = `Objet : relance - factures échues\n\nBonjour,\n\nSauf erreur de notre part, les factures suivantes restent impayées à ce jour :\n${docs.map(d => `- ${d.number} du ${fdate(d.date)}, échue le ${fdate(d.due)} : ${eur(d.left)}`).join('\n')}\n\nTotal dû : ${eur(docs.reduce((s, d) => s + d.left, 0))}\n\nMerci de bien vouloir procéder au règlement dans les meilleurs délais${db.company.iban ? ' par virement sur l\'IBAN ' + db.company.iban : ''}. Si le paiement a déjà été effectué, merci de ne pas tenir compte de ce message.\n\nNous vous rappelons qu'en cas de retard, des pénalités ainsi qu'une indemnité forfaitaire de 40 € pour frais de recouvrement sont exigibles (art. L441-10 du Code de commerce).\n\nCordialement,\n${db.company.name}`;
      try { await navigator.clipboard.writeText(txt); toast(`Relance pour ${t.name} copiée : collez-la dans votre email${t.email ? ' à ' + t.email : ''}`); }
      catch { toast('Copie impossible dans ce navigateur', true); }
    },
    async stockEntry() {
      if (!confirm('Passer l\'écriture d\'inventaire au ' + fdate(today()) + ' ? Le compte 37 prendra la valeur actuelle du stock.')) return;
      await mutate(() => A.stockEntry(db, today())); toast('Écriture d\'inventaire comptabilisée');
    }
  });

  document.addEventListener('input', e => { const c = e.target.closest('[data-calc]'); if (c) calcs[c.dataset.calc](); });
  document.addEventListener('change', e => { const c = e.target.closest('[data-calc]'); if (c) calcs[c.dataset.calc](); });
  // les calculateurs s'affichent dès l'ouverture de leur page
  new MutationObserver(() => { const c = document.querySelector('#main [data-calc]'); if (c && !c._done) { c._done = true; calcs[c.dataset.calc](); } }).observe($('#main'), { childList: true });
})();
