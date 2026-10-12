// Outils supplémentaires de la boîte à outils. Un calculateur = des champs + une fonction de résultat.
(function () {
  const A = window.Analytics, { TOOLS, page, calcs, back, pct, num0 } = window.Toolbox;
  const line = (k, v, cls = '') => `<div class="calc-line ${cls}"><span>${k}</span><b>${v}</b></div>`;
  const e2c = v => Math.round(v * 100);
  const VAT = [['20', '20 %'], ['10', '10 %'], ['5.5', '5,5 %'], ['2.1', '2,1 %'], ['0', '0 %']];

  // ---------- Moteur de calculateurs ----------
  function calc(def) {
    TOOLS.push({ t: def.t, cat: def.cat, ico: def.ico, title: def.title, desc: def.desc });
    const field = f => {
      const v = typeof f.value === 'function' ? f.value() : f.value;
      if (f.options) return `<label>${f.label}<select id="f-${f.id}">${f.options.map(([o, l]) => `<option value="${o}" ${String(o) === String(v) ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`;
      return `<label>${f.label}<input id="f-${f.id}" ${f.type === 'date' ? 'type="date"' : 'inputmode="decimal"'} value="${esc(v)}"></label>`;
    };
    page[def.t] = () => `<h1>${def.title}</h1><p class="sub">${def.intro}</p>${back}
      <div class="dash"><div class="card ${def.wide ? 'span-12' : 'span-6'}" data-calc="g-${def.t}"><div class="grid">${def.fields.map(field).join('')}</div></div>
      <div class="card ${def.wide ? 'span-12' : 'span-6'}" id="g-out"></div></div>${def.note ? `<div class="card" style="margin-top:14px"><p class="sub" style="margin:0">${def.note}</p></div>` : ''}`;
    calcs['g-' + def.t] = () => {
      const v = {};
      for (const f of def.fields) { const el = document.getElementById('f-' + f.id); v[f.id] = f.options || f.type === 'date' ? el.value : num0(el.value); }
      try { $('#g-out').innerHTML = def.out(v); } catch (err) { $('#g-out').innerHTML = `<div class="alert">${esc(err.message)}</div>`; }
    };
  }

  // ---------- Pages qui analysent le dossier ----------
  function data(def) { TOOLS.push({ t: def.t, cat: def.cat, ico: def.ico, title: def.title, desc: def.desc }); page[def.t] = def.page; }

  /* ===== Prix & marges ===== */
  calc({ t: 'httc', cat: 'prix', ico: '⇆', title: 'Convertisseur HT ↔ TTC', desc: 'Passer d\'un prix HT à TTC et inversement, avec le montant de TVA.',
    intro: 'Pratique pour vérifier un ticket, un devis ou une facture fournisseur.',
    fields: [{ id: 'amount', label: 'Montant (€)', value: '100' }, { id: 'rate', label: 'Taux de TVA', value: '20', options: VAT }, { id: 'from', label: 'Le montant saisi est', value: 'HT', options: [['HT', 'Hors taxes'], ['TTC', 'Toutes taxes comprises']] }],
    out: v => { const r = A.htTtc(e2c(v.amount), num0(v.rate), v.from); return line('Hors taxes', eur(r.ht)) + line('TVA ' + v.rate.replace('.', ',') + ' %', eur(r.tva)) + line('Toutes taxes comprises', eur(r.ttc), 'big'); } });

  calc({ t: 'landed', cat: 'prix', ico: '⚖', title: 'Prix de revient & prix conseillé', desc: 'Du prix fournisseur au prix public : remise, transport, douane, coefficient, prix psychologique.',
    intro: 'Le vrai coût d\'un article inclut ses frais d\'approche. Le prix de vente se calcule sur ce coût, pas sur le prix catalogue du fournisseur.',
    fields: [{ id: 'price', label: 'Prix fournisseur HT (€)', value: '50' }, { id: 'disc', label: 'Remise fournisseur (%)', value: '10' }, { id: 'ship', label: 'Transport par unité (€)', value: '2' },
      { id: 'duty', label: 'Droits de douane (%)', value: '0' }, { id: 'other', label: 'Autres frais par unité (€)', value: '0' }, { id: 'coef', label: 'Coefficient de vente', value: '2,2' }, { id: 'vat', label: 'TVA', value: '20', options: VAT }],
    out: v => {
      const net = v.price * (1 - v.disc / 100), cost = net * (1 + v.duty / 100) + v.ship + v.other, ht = cost * v.coef, ttc = ht * (1 + num0(v.vat) / 100);
      const psy = Math.max(0.9, Math.ceil(ttc) - 0.1);
      return line('Prix net fournisseur', eur(e2c(net))) + line('Frais d\'approche', eur(e2c(cost - net))) + line('Coût de revient unitaire', eur(e2c(cost))) +
        line('Prix de vente HT', eur(e2c(ht))) + line('Prix de vente TTC', eur(e2c(ttc))) + line('Prix psychologique conseillé', eur(e2c(psy)), 'big') +
        line('Taux de marque au prix conseillé', pct((psy / (1 + num0(v.vat) / 100) - cost) / (psy / (1 + num0(v.vat) / 100)) * 100));
    } });

  calc({ t: 'escompte', cat: 'prix', ico: '↓', title: 'Escompte pour paiement anticipé', desc: 'Montant de l\'escompte, TVA à régulariser et net à payer.',
    intro: 'L\'escompte est une réduction financière accordée pour un paiement avant l\'échéance. Il se comptabilise en 665 (accordé) ou 765 (obtenu) et réduit la base de TVA.',
    fields: [{ id: 'ttc', label: 'Montant TTC de la facture (€)', value: '1200' }, { id: 'rate', label: 'Taux d\'escompte (%)', value: '2' }, { id: 'vat', label: 'TVA de la facture', value: '20', options: VAT }],
    out: v => {
      const ht = v.ttc / (1 + num0(v.vat) / 100), esc_ = ht * v.rate / 100, tva = esc_ * num0(v.vat) / 100;
      return line('Base HT', eur(e2c(ht))) + line('Escompte HT', eur(e2c(esc_))) + line('TVA à régulariser', eur(e2c(tva))) + line('Net à payer', eur(e2c(v.ttc - esc_ - tva)), 'big') +
        '<p class="sub">Émettez un avoir du montant de l\'escompte TTC pour régulariser la TVA collectée.</p>';
    } });

  /* ===== Encaissements ===== */
  calc({ t: 'penalties', cat: 'clients', ico: '⚠', title: 'Pénalités de retard', desc: 'Intérêts de retard et indemnité forfaitaire de 40 € dus par un client professionnel.',
    intro: 'Entre professionnels, tout retard de paiement entraîne de plein droit des pénalités et une indemnité forfaitaire de 40 € pour frais de recouvrement (art. L441-10 du Code de commerce).',
    fields: [{ id: 'amount', label: 'Montant TTC impayé (€)', value: '1500' }, { id: 'due', label: 'Date d\'échéance', type: 'date', value: () => A.addDays(today(), -45) },
      { id: 'paid', label: 'Date de paiement (ou aujourd\'hui)', type: 'date', value: () => today() }, { id: 'rate', label: 'Taux annuel des pénalités (%)', value: '12,15' }],
    note: 'À défaut de taux prévu dans vos conditions générales, le taux légal est celui de la BCE majoré de 10 points (12,15 % en prenant un taux BCE de 2,15 % : à vérifier). Le taux ne peut pas être inférieur à 3 fois le taux d\'intérêt légal.',
    out: v => { const r = A.penalties(e2c(v.amount), v.due, v.paid, v.rate); return r.late ? line('Jours de retard', r.late + ' j') + line('Intérêts de retard', eur(r.interest)) + line('Indemnité forfaitaire', eur(r.indemnity)) + line('Total à réclamer', eur(r.total), 'big') : '<div class="k">Aucun retard : rien à réclamer.</div>'; } });

  calc({ t: 'duedate', cat: 'clients', ico: '📅', title: 'Date d\'échéance', desc: 'Calculer la date limite de paiement selon le délai convenu, et vérifier qu\'il est légal.',
    intro: 'Entre professionnels, le délai ne peut pas dépasser 60 jours après la date de facture, ou 45 jours fin de mois s\'il est expressément prévu au contrat.',
    fields: [{ id: 'date', label: 'Date de la facture', type: 'date', value: () => today() }, { id: 'mode', label: 'Délai convenu', value: '30', options: [['cash', 'Comptant'], ['30', '30 jours'], ['30fdm', '30 jours fin de mois'], ['45fdm', '45 jours fin de mois'], ['60', '60 jours']] }],
    out: v => {
      const due = A.dueDate(v.date, v.mode), n = A.days(v.date, due);
      return line('Échéance', fdate(due), 'big') + line('Délai réel', n + ' jours') + line('Conformité', n <= 60 ? '<span class="pos">Dans le délai légal</span>' : '<span class="neg">Au-delà de 60 jours : délai illégal</span>') +
        '<h2>Toutes les options</h2>' + [['Comptant', 'cash'], ['30 jours', '30'], ['30 j fin de mois', '30fdm'], ['45 j fin de mois', '45fdm'], ['60 jours', '60']].map(([l, m]) => line(l, fdate(A.dueDate(v.date, m)))).join('');
    } });

  /* ===== Trésorerie & financement ===== */
  calc({ t: 'loan', cat: 'treso', ico: '🏦', title: 'Simulateur d\'emprunt', desc: 'Mensualité, coût total du crédit et tableau d\'amortissement annuel.', wide: true,
    intro: 'Pour un prêt professionnel à mensualités constantes (hors assurance et frais de dossier).',
    fields: [{ id: 'capital', label: 'Montant emprunté (€)', value: '20000' }, { id: 'rate', label: 'Taux annuel (%)', value: '4,5' }, { id: 'months', label: 'Durée (mois)', value: '60' }],
    out: v => {
      if (v.months < 1 || v.months > 360) throw new Error('Durée entre 1 et 360 mois');
      const r = A.loan(e2c(v.capital), v.rate, Math.round(v.months));
      const years = {};
      r.rows.forEach(x => { const y = Math.ceil(x.m / 12), o = years[y] || (years[y] = { pay: 0, interest: 0, principal: 0, left: 0 }); o.pay += x.pay; o.interest += x.interest; o.principal += x.principal; o.left = x.left; });
      return `<div class="cards"><div class="card kpi"><div class="k">Mensualité</div><div class="v">${eur(r.monthly)}</div></div><div class="card kpi"><div class="k">Coût des intérêts</div><div class="v">${eur(r.cost)}</div></div><div class="card kpi"><div class="k">Total remboursé</div><div class="v">${eur(e2c(v.capital) + r.cost)}</div></div></div>
        <table style="margin-top:14px"><tr><th>Année</th><th class="n">Remboursé</th><th class="n">dont intérêts (661)</th><th class="n">dont capital (164)</th><th class="n">Capital restant</th></tr>
        ${Object.entries(years).map(([y, o]) => `<tr><td>${y}</td><td class="n">${eur(o.pay)}</td><td class="n">${eur(o.interest)}</td><td class="n">${eur(o.principal)}</td><td class="n">${eur(o.left)}</td></tr>`).join('')}</table>`;
    } });

  /* ===== Stock & achats ===== */
  calc({ t: 'eoq', cat: 'stock', ico: '📦', title: 'Quantité économique de commande', desc: 'Combien commander à la fois et quand recommander (formule de Wilson, point de commande).',
    intro: 'Commander trop souvent coûte en frais de commande ; commander trop gros immobilise de l\'argent en stock. La formule de Wilson trouve l\'équilibre.',
    fields: [{ id: 'demand', label: 'Ventes annuelles (unités)', value: '1200' }, { id: 'order', label: 'Coût d\'une commande (€)', value: '50' }, { id: 'unit', label: 'Coût unitaire d\'achat (€)', value: '20' },
      { id: 'hold', label: 'Coût de stockage (% / an)', value: '20' }, { id: 'lead', label: 'Délai de livraison (jours)', value: '10' }, { id: 'safety', label: 'Stock de sécurité (jours)', value: '5' }],
    out: v => {
      const r = A.eoq(v.demand, v.order, v.unit, v.hold), daily = v.demand / 365;
      return line('Quantité par commande', r.q + ' unités', 'big') + line('Commandes par an', r.orders.toFixed(1).replace('.', ',')) + line('Une commande tous les', (r.orders ? Math.round(365 / r.orders) : 0) + ' jours') +
        line('Coût annuel (commandes + stockage)', eur(e2c(r.cost))) + line('Point de commande', Math.ceil(daily * (v.lead + v.safety)) + ' unités en stock') + line('Stock de sécurité', Math.ceil(daily * v.safety) + ' unités');
    } });

  /* ===== Pilotage ===== */
  calc({ t: 'target', cat: 'pilotage', ico: '🎯', title: 'Objectif de chiffre d\'affaires', desc: 'Le CA à réaliser pour atteindre le bénéfice que vous visez, par mois et par jour.',
    intro: 'Charges fixes et taux de marge sont pré-remplis à partir de votre comptabilité de l\'année (charges fixes ramenées à 12 mois). Ajustez-les librement.',
    fields: [{ id: 'fixed', label: 'Charges fixes annuelles (€)', value: () => { const b = A.breakEven(db, yearStart(), today()), n = Math.max(30, A.days(yearStart(), today())); return Math.round(b.fixed / 100 * 365 / n); } },
      { id: 'rate', label: 'Taux de marge sur coûts variables (%)', value: () => Math.round(A.breakEven(db, yearStart(), today()).rate * 1000) / 10 || 50 },
      { id: 'profit', label: 'Bénéfice visé sur l\'année (€)', value: '30000' }],
    out: v => {
      const ca = A.targetSales(v.fixed, v.rate / 100, v.profit);
      if (ca === null) throw new Error('Le taux de marge doit être positif');
      const done = L.income(db, yearStart(), today()).produits / 100, n = Math.max(1, A.days(yearStart(), today())), pace = done / n * 365;
      return line('Chiffre d\'affaires annuel nécessaire', eur(e2c(ca)), 'big') + line('Par mois', eur(e2c(ca / 12))) + line('Par jour ouvré (253 j)', eur(e2c(ca / 253))) +
        line('Rythme actuel (projeté sur 12 mois)', eur(e2c(pace))) + `<div class="meter big"><i style="width:${Math.min(100, pace / ca * 100).toFixed(1)}%"></i></div>` +
        `<div class="k">${pace >= ca ? 'Au rythme actuel, l\'objectif est atteint.' : 'Il manque ' + eur(e2c(ca - pace)) + ' de chiffre d\'affaires sur l\'année au rythme actuel.'}</div>`;
    } });

  /* ===== Comptabilité & fiscalité ===== */
  calc({ t: 'amort', cat: 'compta', ico: '⏳', title: 'Plan d\'amortissement', desc: 'Dotations annuelles d\'une immobilisation, en linéaire ou dégressif, avec prorata.', wide: true,
    intro: 'Pour un ordinateur, un véhicule, un aménagement… La dotation se passe en fin d\'exercice : 6811 au débit, 28xx au crédit.',
    fields: [{ id: 'value', label: 'Valeur HT (€)', value: '3000' }, { id: 'years', label: 'Durée (années)', value: '3' }, { id: 'start', label: 'Mise en service', type: 'date', value: () => today() },
      { id: 'method', label: 'Mode', value: 'L', options: [['L', 'Linéaire'], ['D', 'Dégressif fiscal']] }],
    note: 'Durées d\'usage courantes : matériel informatique 3 ans, mobilier 10 ans, véhicule 5 ans, agencements 10 ans. Les biens de moins de 500 € HT peuvent être passés directement en charges.',
    out: v => {
      if (v.years < 1 || v.years > 50) throw new Error('Durée entre 1 et 50 ans');
      const rows = A.amortization(e2c(v.value), Math.round(v.years), v.start, v.method);
      return `<table><tr><th>Exercice</th><th class="n">Dotation</th><th class="n">Cumul</th><th class="n">Valeur nette comptable</th></tr>${rows.map(r => `<tr><td>${r.year}</td><td class="n">${eur(r.dot)}</td><td class="n">${eur(r.cum)}</td><td class="n">${eur(r.vnc)}</td></tr>`).join('')}</table>`;
    } });

  data({ t: 'checks', cat: 'compta', ico: '✓', title: 'Contrôles comptables', desc: 'Dix vérifications automatiques de votre dossier avant une déclaration ou une clôture.',
    page: () => {
      const list = A.checks(db, today()), ok = list.filter(c => c.ok).length;
      return `<h1>Contrôles comptables</h1><p class="sub">Les points qu'un expert-comptable vérifie en premier. À relancer avant chaque déclaration de TVA et à la clôture.</p>${back}
      <div class="dash"><div class="card span-4 kpi ${ok === list.length ? 'pos' : ''}"><div class="k">Score du dossier</div><div class="v xl">${ok} / ${list.length}</div><div class="meter big"><i style="width:${(ok / list.length * 100).toFixed(0)}%"></i></div></div>
      <div class="card span-8"><ul class="checks">${list.map((c, i) => `<li class="${c.level}" style="--i:${i}"><span class="dot"></span><div><b>${c.label}</b><small>${esc(c.detail)}</small></div></li>`).join('')}</ul></div></div>`;
    } });

  data({ t: 'calendar', cat: 'compta', ico: '🗓', title: 'Calendrier fiscal', desc: 'Les prochaines échéances : TVA, acomptes d\'impôt sur les sociétés, CFE, liasse.',
    page: () => {
      const regime = param.regime || 'RN', y = today().slice(0, 4);
      const list = [...A.fiscalCalendar(y, regime), ...A.fiscalCalendar(String(+y + 1), regime)].filter(x => x.date >= today()).slice(0, 14);
      return `<h1>Calendrier fiscal</h1><p class="sub">Dates indicatives pour une société à l'IS dont l'exercice suit l'année civile. Vérifiez vos dates exactes dans votre espace professionnel sur impots.gouv.fr.</p>${back}
      <div class="bar"><select id="regime" style="max-width:320px"><option value="RN" ${regime === 'RN' ? 'selected' : ''}>TVA réel normal (CA3 mensuelle)</option><option value="RS" ${regime === 'RS' ? 'selected' : ''}>TVA réel simplifié (CA12 annuelle)</option></select></div>
      <div class="timeline">${list.map((x, i) => { const n = A.days(today(), x.date); return `<div class="tl ${n <= 15 ? 'soon' : ''}" style="--i:${i}"><div class="tl-date"><b>${fdate(x.date).slice(0, 5)}</b><small>${x.date.slice(0, 4)}</small></div><div class="tl-body"><b>${esc(x.label)}</b><small>${n === 0 ? 'Aujourd\'hui' : 'Dans ' + n + ' jour' + (n > 1 ? 's' : '')}</small></div></div>`; }).join('')}</div>`;
    } });

  /* ===== Personnel ===== */
  calc({ t: 'salary', cat: 'rh', ico: '👤', title: 'Coût d\'un salarié', desc: 'Du salaire brut au net estimé et au coût total pour l\'entreprise.',
    intro: 'Estimation rapide avec des taux moyens de cotisations. Pour un vrai bulletin, passez par votre logiciel de paie ou votre expert-comptable.',
    fields: [{ id: 'gross', label: 'Salaire brut mensuel (€)', value: '2200' }, { id: 'status', label: 'Statut', value: 'nc', options: [['nc', 'Non-cadre'], ['c', 'Cadre']] }],
    note: 'Taux moyens retenus : environ 22 % (non-cadre) ou 25 % (cadre) de cotisations salariales, 42 % ou 45 % de cotisations patronales. Près du SMIC, la réduction générale de cotisations patronales baisse fortement le coût réel : elle n\'est pas prise en compte ici.',
    out: v => { const r = A.salary(e2c(v.gross), v.status === 'c'); return line('Net avant impôt (estimé)', eur(r.net)) + line('Cotisations patronales', eur(r.employer)) + line('Coût mensuel employeur', eur(r.cost), 'big') + line('Coût annuel (12 mois)', eur(r.yearly)) + line('CA HT à générer pour le financer (marge de 50 %)', eur(r.yearly * 2)); } });

  /* ===== Ventes & clients ===== */
  data({ t: 'customers', cat: 'ventes', ico: '★', title: 'Rentabilité par client', desc: 'CA, marge, panier moyen et délai de paiement réel de chaque client.',
    page: () => {
      const from = param.from ?? yearStart(), to = param.to ?? today(), list = A.customers(db, from, to);
      return `<h1>Rentabilité par client</h1><p class="sub">Un gros client n'est pas forcément le plus rentable : regardez sa marge et le temps qu'il met à payer.</p>${back}
      <div class="bar">${period(from, to)}</div>
      ${list.length ? `<table><tr><th>Client</th><th class="n">CA HT</th><th class="n">Marge</th><th class="n">Taux</th><th class="n">Factures</th><th class="n">Panier moyen</th><th class="n">Paie en</th><th>Dernier achat</th></tr>
      ${list.map(c => `<tr><td>${esc(tierName(c.tierId))}</td><td class="n">${eur(c.ht)}</td><td class="n">${eur(c.marge)}</td><td class="n">${pct(c.rate)}</td><td class="n">${c.count}</td><td class="n">${eur(c.basket)}</td><td class="n ${c.delay > 45 ? 'neg' : ''}">${c.delay === null ? '—' : c.delay + ' j'}</td><td>${fdate(c.last)}</td></tr>`).join('')}</table>` : '<div class="empty">Aucune vente sur la période.</div>'}`;
    } });

  data({ t: 'basket', cat: 'ventes', ico: '🛒', title: 'Panier moyen & habitudes', desc: 'Nombre de ventes, panier moyen, jours de la semaine les plus forts.',
    page: () => {
      const from = param.from ?? yearStart(), to = param.to ?? today(), s = A.salesStats(db, from, to);
      const days7 = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
      return `<h1>Panier moyen & habitudes d'achat</h1><p class="sub">Pour savoir quand vos clients achètent et combien ils dépensent à chaque fois.</p>${back}
      <div class="bar">${period(from, to)}</div>
      <div class="cards"><div class="card kpi"><div class="k">Factures</div><div class="v">${s.count}</div></div><div class="card kpi"><div class="k">Chiffre d'affaires HT</div><div class="v" data-count="${s.ht}">${eur(s.ht)}</div></div>
      <div class="card kpi"><div class="k">Panier moyen HT</div><div class="v" data-count="${s.basket}">${eur(s.basket)}</div></div><div class="card kpi"><div class="k">Articles par facture</div><div class="v">${s.linesPer.toFixed(1).replace('.', ',')}</div></div>
      <div class="card kpi"><div class="k">Clients actifs</div><div class="v">${s.clients}</div></div></div>
      <div class="dash" style="margin-top:14px"><div class="card span-6"><div class="card-title">CA par jour de la semaine</div>${window.Charts.ranking(days7.map((label, i) => ({ label, value: s.weekday[i] })).filter(x => x.value))}</div>
      <div class="card span-6"><div class="card-title">Nombre de factures par mois</div>${window.Charts.ranking(window.Charts.MONTHS.map((label, i) => ({ label, value: s.byMonth[i] })).filter(x => x.value), n => n)}</div></div>`;
    } });

  document.addEventListener('change', e => { if (e.target.id === 'regime') go('tools', { t: 'calendar', regime: e.target.value }); });
})();
