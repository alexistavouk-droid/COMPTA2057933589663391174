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

  const A = { aged, abc, rotation, breakEven, bfr, forecast, stockEntry, pricing, discountVolume, addDays, days };
  if (typeof module !== 'undefined') module.exports = A; else window.Analytics = A;
})();
