// Analyses pour une entreprise de vente : calculs purs sur le dossier, montants en centimes.
(function () {
  const R = Math.round;
  const L = typeof module !== 'undefined' ? require('./ledger.js') : window.Ledger;
  const DAY = 864e5;
  const days = (a, b) => R((Date.parse(b) - Date.parse(a)) / DAY);
  const addDays = (d, n) => new Date(Date.parse(d) + n * DAY).toISOString().slice(0, 10);
  const sign = d => d.type === 'CREDIT' ? -1 : 1;
  const issued = (db, kind) => db.docs.filter(d => d.kind === kind && d.totals && d.status !== 'DRAFT');
  const soldeOf = (bal, re) => bal.filter(b => re.test(b.acc)).reduce((s, b) => s + b.solde, 0);

  // Balance âgée des créances clients, par tranche de retard
  function aged(db, today) {
    const rows = {};
    for (const d of issued(db, 'SALE').filter(d => d.status === 'ISSUED')) {
      const left = (d.totals.ttc - d.paid) * sign(d), late = days(d.due || d.date, today);
      const r = rows[d.tierId] || (rows[d.tierId] = { tierId: d.tierId, notDue: 0, d30: 0, d60: 0, d90: 0, more: 0, total: 0, docs: [] });
      const k = late <= 0 ? 'notDue' : late <= 30 ? 'd30' : late <= 60 ? 'd60' : late <= 90 ? 'd90' : 'more';
      r[k] += left; r.total += left; r.docs.push({ ...d, late, left });
    }
    return Object.values(rows).sort((a, b) => b.total - a.total);
  }

  // Analyse ABC (Pareto) du chiffre d'affaires par article
  function abc(db, from, to) {
    const by = {};
    for (const d of issued(db, 'SALE')) if (d.date >= from && d.date <= to) for (const l of d.lines) {
      const key = l.productId || 'libre:' + l.label;
      const r = by[key] || (by[key] = { key, label: l.label, productId: l.productId, ht: 0, qty: 0, marge: 0 });
      const ht = L.lineTotals(l).ht * sign(d);
      r.ht += ht; r.qty += l.qty * sign(d); r.marge += ht - R(l.qty * (l.cost || 0)) * sign(d);
    }
    const list = Object.values(by).sort((a, b) => b.ht - a.ht);
    const total = list.reduce((s, x) => s + x.ht, 0) || 1;
    let cum = 0;
    return list.map(x => { cum += x.ht; const pct = cum / total * 100; return { ...x, share: x.ht / total * 100, cum: pct, cls: pct - x.ht / total * 100 < 80 ? 'A' : pct - x.ht / total * 100 < 95 ? 'B' : 'C' }; });
  }

  // Rotation des stocks et articles dormants
  function rotation(db, from, to) {
    const period = Math.max(1, days(from, to));
    return db.products.filter(p => p.type === 'GOODS').map(p => {
      let sold = 0, last = '';
      for (const d of issued(db, 'SALE')) for (const l of d.lines) if (l.productId === p.id) {
        if (d.date >= from && d.date <= to) sold += l.qty * sign(d);
        if (d.date > last) last = d.date;
      }
      const perDay = sold / period;
      return { ...p, sold, value: R(Math.max(p.stock, 0) * p.cost), cover: perDay > 0 ? R(Math.max(p.stock, 0) / perDay) : null, last, dormant: p.stock > 0 && (!last || days(last, to) > 90), turns: p.stock > 0 ? sold / p.stock * 365 / period : null };
    }).sort((a, b) => b.value - a.value);
  }

  // Seuil de rentabilité : charges fixes / taux de marge sur coûts variables
  function breakEven(db, from, to) {
    const inc = L.income(db, from, to);
    const cv = soldeOf(inc.lignes, /^60[37]/) + soldeOf(inc.lignes, /^624/);
    const fixed = inc.charges - cv, ca = inc.produits;
    const rate = ca > 0 ? (ca - cv) / ca : 0;
    const seuil = rate > 0 ? R(fixed / rate) : null;
    const span = Math.max(1, days(from, to));
    return { ca, cv, fixed, rate, seuil, date: seuil !== null && ca > 0 ? addDays(from, R(seuil / ca * span)) : null, reached: seuil !== null && ca >= seuil };
  }

  // Indicateurs de BFR : délais clients, fournisseurs, stock
  function bfr(db, from, to) {
    const bal = L.balance(db, '', to), inc = L.income(db, from, to), span = Math.max(1, days(from, to));
    const clients = soldeOf(bal, /^411/), fournisseurs = -soldeOf(bal, /^401/);
    const stock = db.products.filter(p => p.type === 'GOODS').reduce((s, p) => s + R(Math.max(p.stock, 0) * p.cost), 0);
    const caTTC = issued(db, 'SALE').filter(d => d.date >= from && d.date <= to).reduce((s, d) => s + d.totals.ttc * sign(d), 0);
    const achTTC = issued(db, 'PURCHASE').filter(d => d.date >= from && d.date <= to).reduce((s, d) => s + d.totals.ttc * sign(d), 0);
    const camv = issued(db, 'SALE').filter(d => d.date >= from && d.date <= to).reduce((s, d) => s + d.lines.reduce((m, l) => m + R(l.qty * (l.cost || 0)), 0) * sign(d), 0);
    return { clients, fournisseurs, stock, bfr: clients + stock - fournisseurs,
      dso: caTTC > 0 ? R(clients / caTTC * span) : null, dpo: achTTC > 0 ? R(fournisseurs / achTTC * span) : null,
      dio: camv > 0 ? R(stock / camv * span) : null, ca: inc.produits };
  }

  // Prévisionnel de trésorerie : factures ouvertes à leur échéance + dépenses récurrentes moyennes (salaires, TVA…)
  function forecast(db, today, horizon = 90) {
    const bal = L.balance(db, '', today);
    let cash = soldeOf(bal, /^5(12|3)/);
    const flows = [];
    for (const d of db.docs.filter(d => d.totals && d.status === 'ISSUED')) {
      const left = (d.totals.ttc - d.paid) * sign(d) * (d.kind === 'SALE' ? 1 : -1);
      // une facture client en retard est supposée encaissée sous 15 jours
      const when = (d.due || d.date) < today ? addDays(today, d.kind === 'SALE' ? 15 : 3) : d.due;
      if (when <= addDays(today, horizon)) flows.push({ date: when, amount: left, label: d.number });
    }
    // dépenses hors factures (écritures de banque saisies) : moyenne mensuelle des 3 derniers mois
    const since = addDays(today, -90);
    const manual = db.entries.filter(e => e.date > since && e.date <= today && !db.docs.some(d => d.id === e.src))
      .reduce((s, e) => s + e.lines.filter(l => /^5(12|3)/.test(l.acc)).reduce((x, l) => x + l.credit, 0), 0);
    const monthly = R(manual / 3);
    for (let m = 1; m <= Math.ceil(horizon / 30); m++) { const dt = addDays(today, m * 30 - 5); if (monthly && dt <= addDays(today, horizon)) flows.push({ date: dt, amount: -monthly, label: 'Dépenses récurrentes estimées' }); }
    flows.sort((a, b) => a.date.localeCompare(b.date));
    const points = [{ date: today, cash }];
    let low = { date: today, cash };
    for (const f of flows) { cash += f.amount; points.push({ date: f.date, cash }); if (cash < low.cash) low = { date: f.date, cash }; }
    return { start: points[0].cash, end: cash, low, flows, points, monthly, in: flows.filter(f => f.amount > 0).reduce((s, f) => s + f.amount, 0), out: -flows.filter(f => f.amount < 0).reduce((s, f) => s + f.amount, 0) };
  }

  // Écriture d'inventaire : ajuste le compte 37 à la valeur réelle du stock (contrepartie 6037)
  function stockEntry(db, date) {
    const value = db.products.filter(p => p.type === 'GOODS').reduce((s, p) => s + R(Math.max(p.stock, 0) * p.cost), 0);
    const current = soldeOf(L.balance(db, '', date), /^37/);
    const delta = value - current;
    if (!delta) throw new Error('Le compte de stock est déjà à jour (' + (value / 100).toFixed(2) + ' €)');
    const label = 'Variation de stock au ' + date.split('-').reverse().join('/');
    return L.post(db, 'OD', date, 'INV' + date.replace(/-/g, ''), label, [L.dc('370000', delta, label), L.dc('603700', -delta, label)], 'STOCK');
  }

  // Calculs de prix d'un commerçant
  function pricing({ cost, coef, marque, vat }) {
    let ht;
    if (coef) ht = cost * coef; else if (marque !== undefined && marque < 100) ht = cost / (1 - marque / 100); else ht = cost;
    const marge = ht - cost;
    return { ht, ttc: ht * (1 + vat / 100), marge, coef: cost ? ht / cost : 0, tauxMarge: cost ? marge / cost * 100 : 0, tauxMarque: ht ? marge / ht * 100 : 0, coefTTC: cost ? ht * (1 + vat / 100) / cost : 0 };
  }

  // Hausse de volume nécessaire pour garder la même marge après une remise (taux de marque t, remise r, en %)
  const discountVolume = (t, r) => r >= t ? Infinity : t / (t - r) * 100 - 100;

  // ---------- Calculateurs ----------
  const htTtc = (amount, rate, from) => from === 'TTC'
    ? { ht: R(amount / (1 + rate / 100)), tva: amount - R(amount / (1 + rate / 100)), ttc: amount }
    : { ht: amount, tva: R(amount * rate / 100), ttc: amount + R(amount * rate / 100) };

  // Pénalités de retard entre professionnels (art. L441-10 C. com.) : intérêts au prorata + indemnité forfaitaire de 40 €
  function penalties(amount, due, paid, rate) {
    const late = Math.max(0, days(due, paid));
    const interest = R(amount * rate / 100 * late / 365);
    return { late, interest, indemnity: late > 0 ? 4000 : 0, total: interest + (late > 0 ? 4000 : 0) };
  }

  const endOfMonth = d => { const x = new Date(d + 'T00:00:00Z'); return new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0)).toISOString().slice(0, 10); };
  function dueDate(date, mode) {
    switch (mode) {
      case 'cash': return date;
      case '30': return addDays(date, 30);
      case '30fdm': return endOfMonth(addDays(date, 30));
      case '45fdm': return endOfMonth(addDays(date, 45));
      case '60': return addDays(date, 60);
      default: throw new Error('Délai inconnu');
    }
  }

  // Emprunt à mensualités constantes
  function loan(capital, rate, months) {
    const r = rate / 100 / 12;
    const pay = R(r ? capital * r / (1 - (1 + r) ** -months) : capital / months);
    const rows = [];
    let left = capital;
    // tout en centimes : la dernière échéance absorbe les arrondis pour solder exactement le capital
    for (let m = 1; m <= months; m++) {
      const interest = R(left * r), princ = m === months ? left : Math.min(left, pay - interest);
      left -= princ;
      rows.push({ m, pay: princ + interest, interest, principal: princ, left });
    }
    return { monthly: pay, cost: rows.reduce((s, x) => s + x.interest, 0), rows };
  }

  // Plan d'amortissement : linéaire (prorata au jour, base 360) ou dégressif fiscal (prorata au mois)
  function amortization(value, years, start, method) {
    const rows = [], y0 = +start.slice(0, 4);
    if (method === 'L') {
      const annual = value / years;
      const first = (360 - Math.min(360, (+start.slice(5, 7) - 1) * 30 + (+start.slice(8, 10) - 1))) / 360;
      let cum = 0, y = y0;
      for (let left = value; left > 0.5; y++) {
        const dot = R(Math.min(left, y === y0 ? annual * first : annual));
        cum += dot; left -= dot;
        rows.push({ year: y, dot, cum, vnc: R(value - cum) });
      }
      return rows;
    }
    const coef = years <= 4 ? 1.25 : years <= 6 ? 1.75 : 2.25, rate = coef / years;
    let vnc = value, cum = 0;
    for (let i = 0; vnc > 0.5; i++) {
      const remaining = years - i;
      const prorata = i === 0 ? (13 - +start.slice(5, 7)) / 12 : 1;
      // on bascule en linéaire quand il devient plus favorable sur la durée restante
      const dot = R(i >= years - 1 ? vnc : Math.max(vnc * rate, vnc / remaining) * prorata);
      cum += dot; vnc -= dot;
      rows.push({ year: y0 + i, dot, cum, vnc: R(vnc) });
    }
    return rows;
  }

  // Quantité économique de commande (formule de Wilson)
  function eoq(demand, orderCost, unitCost, holdingRate) {
    const h = unitCost * holdingRate / 100;
    const q = h > 0 ? Math.sqrt(2 * demand * orderCost / h) : 0;
    return { q: R(q), orders: q ? demand / q : 0, cost: q ? R(demand / q * orderCost + q / 2 * h) : 0 };
  }

  // Estimation simple du coût d'un salarié (hors réduction générale de cotisations)
  function salary(gross, cadre) {
    const employee = cadre ? 0.25 : 0.22, employer = cadre ? 0.45 : 0.42;
    return { gross, net: R(gross * (1 - employee)), employer: R(gross * employer), cost: R(gross * (1 + employer)), yearly: R(gross * (1 + employer) * 12) };
  }

  // CA nécessaire pour atteindre un résultat visé
  const targetSales = (fixed, rate, profit) => rate > 0 ? R((fixed + profit) / rate) : null;

  // ---------- Analyses de ventes ----------
  function customers(db, from, to) {
    const by = {};
    for (const d of issued(db, 'SALE')) if (d.date >= from && d.date <= to) {
      const r = by[d.tierId] || (by[d.tierId] = { tierId: d.tierId, ht: 0, marge: 0, count: 0, last: '', payDays: 0, paid: 0 });
      const s = sign(d);
      r.ht += d.totals.ht * s; r.count += d.type === 'INVOICE' ? 1 : 0;
      r.marge += d.lines.reduce((m, l) => m + L.lineTotals(l).ht - R(l.qty * (l.cost || 0)), 0) * s;
      if (d.date > r.last) r.last = d.date;
      for (const p of db.payments.filter(p => p.docId === d.id)) { r.payDays += days(d.date, p.date) * p.amount; r.paid += p.amount; }
    }
    return Object.values(by).map(r => ({ ...r, basket: r.count ? R(r.ht / r.count) : 0, delay: r.paid ? R(r.payDays / r.paid) : null, rate: r.ht ? r.marge / r.ht * 100 : 0 })).sort((a, b) => b.ht - a.ht);
  }

  function salesStats(db, from, to) {
    const inv = issued(db, 'SALE').filter(d => d.type === 'INVOICE' && d.date >= from && d.date <= to);
    const weekday = Array(7).fill(0), byMonth = Array(12).fill(0);
    for (const d of inv) { weekday[(new Date(d.date + 'T00:00:00Z').getUTCDay() + 6) % 7] += d.totals.ht; byMonth[+d.date.slice(5, 7) - 1]++; }
    const ht = inv.reduce((s, d) => s + d.totals.ht, 0), lines = inv.reduce((s, d) => s + d.lines.length, 0);
    return { count: inv.length, ht, basket: inv.length ? R(ht / inv.length) : 0, linesPer: inv.length ? lines / inv.length : 0, clients: new Set(inv.map(d => d.tierId)).size, weekday, byMonth };
  }

  // ---------- Contrôles de cohérence comptable ----------
  function checks(db, today) {
    const bal = L.balance(db), get = a => (bal.find(b => b.acc === a) || { solde: 0 }).solde;
    const total = bal.reduce((s, b) => s + b.solde, 0);
    const out = [];
    const add = (ok, label, detail, level) => out.push({ ok, label, detail, level: ok ? 'ok' : level || 'warn' });
    add(total === 0, 'Balance équilibrée', total === 0 ? 'Total des débits = total des crédits.' : 'Écart de ' + (total / 100).toFixed(2) + ' €.', 'bad');
    add(!get('471000'), 'Compte d\'attente 471 soldé', get('471000') ? 'Solde de ' + (get('471000') / 100).toFixed(2) + ' € à reclasser.' : 'Rien en attente.');
    const unposted = db.docs.filter(d => d.status !== 'DRAFT' && d.totals && !db.entries.some(e => e.id === d.entryId));
    add(!unposted.length, 'Chaque facture émise est comptabilisée', unposted.length ? unposted.length + ' document(s) sans écriture.' : 'Toutes les factures ont leur écriture.', 'bad');
    const gaps = [];
    for (const prefix of ['FA', 'AV']) {
      const nums = db.docs.filter(d => d.number && d.number.startsWith(prefix + '-')).map(d => d.number).sort();
      const byYear = {};
      for (const n of nums) { const [, y, k] = n.split('-'); (byYear[y] = byYear[y] || []).push(+k); }
      for (const [y, ks] of Object.entries(byYear)) ks.sort((a, b) => a - b).forEach((k, i) => { if (k !== i + 1 && !gaps.length) gaps.push(`${prefix}-${y}`); });
    }
    add(!gaps.length, 'Numérotation des factures continue', gaps.length ? 'Trou détecté dans la série ' + gaps[0] + '.' : 'Aucun trou dans les séries FA et AV.', 'bad');
    const neg = db.products.filter(p => p.type === 'GOODS' && p.stock < 0);
    add(!neg.length, 'Aucun stock négatif', neg.length ? neg.map(p => p.label).join(', ') + ' : vérifiez les achats non saisis.' : 'Tous les stocks sont positifs ou nuls.');
    const creditors = db.tiers.filter(t => t.type === 'C' && db.entries.reduce((s, e) => s + e.lines.filter(l => l.tier === t.code).reduce((x, l) => x + l.debit - l.credit, 0), 0) < 0);
    add(!creditors.length, 'Aucun client créditeur', creditors.length ? creditors.map(t => t.name).join(', ') + ' : avoir à rembourser ou à imputer.' : 'Pas de trop-perçu client.');
    add(get('512000') >= 0, 'Banque non débitrice', get('512000') < 0 ? 'La banque est à découvert dans la comptabilité : manque-t-il un encaissement ?' : 'Solde bancaire positif.');
    const lastVat = db.entries.filter(e => e.src === 'VAT').map(e => e.date).sort().at(-1);
    const vatOld = !lastVat || days(lastVat, today) > 45;
    add(!(vatOld && (get('445710') || get('445660'))), 'TVA liquidée récemment', lastVat ? 'Dernière liquidation le ' + lastVat.split('-').reverse().join('/') + '.' : 'Aucune liquidation de TVA passée.');
    const drafts = db.docs.filter(d => d.status === 'DRAFT' && ['INVOICE', 'CREDIT'].includes(d.type) && days(d.date, today) > 7);
    add(!drafts.length, 'Pas de facture oubliée en brouillon', drafts.length ? drafts.length + ' brouillon(s) de plus de 7 jours à émettre ou supprimer.' : 'Aucun brouillon ancien.');
    const late60 = issued(db, 'SALE').filter(d => d.status === 'ISSUED' && days(d.due || d.date, today) > 60);
    add(!late60.length, 'Pas de créance de plus de 60 jours de retard', late60.length ? late60.length + ' facture(s) : envisagez une dépréciation (491) ou une mise en demeure.' : 'Aucune créance très ancienne.');
    return out;
  }

  // ---------- Calendrier fiscal indicatif (exercice calé sur l'année civile) ----------
  function fiscalCalendar(year, regime) {
    const d = (m, j) => `${year}-${String(m).padStart(2, '0')}-${String(j).padStart(2, '0')}`;
    const list = [
      { date: d(3, 15), label: '1er acompte d\'impôt sur les sociétés' }, { date: d(6, 15), label: '2e acompte d\'IS' },
      { date: d(9, 15), label: '3e acompte d\'IS' }, { date: d(12, 15), label: '4e acompte d\'IS' },
      { date: d(5, 15), label: 'Liasse fiscale et solde d\'IS (date indicative pour la télé-déclaration)' },
      { date: d(12, 15), label: 'Cotisation foncière des entreprises (CFE)' },
      { date: d(6, 30), label: 'Approbation des comptes en assemblée (6 mois après la clôture)' }
    ];
    if (regime === 'RS') list.push({ date: d(5, 5), label: 'Déclaration annuelle de TVA CA12 (indicatif)' }, { date: d(7, 15), label: 'Acompte de TVA de juillet (55 %)' }, { date: d(12, 15), label: 'Acompte de TVA de décembre (40 %)' });
    else for (let m = 1; m <= 12; m++) list.push({ date: d(m, 19), label: 'Déclaration et paiement de TVA (CA3) du mois précédent', vat: true });
    return list.sort((a, b) => a.date.localeCompare(b.date));
  }

  const A = { aged, abc, rotation, breakEven, bfr, forecast, stockEntry, pricing, discountVolume, addDays, days,
    htTtc, penalties, dueDate, loan, amortization, eoq, salary, targetSales, customers, salesStats, checks, fiscalCalendar };
  if (typeof module !== 'undefined') module.exports = A; else window.Analytics = A;
})();
