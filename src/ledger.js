// Cœur comptable : pur JS, utilisé par l'interface et par les tests Node. Montants en centimes (entiers).
(function () {
  const R = Math.round;

  const PCG = [
    ['101000', 'Capital social'], ['106100', 'Réserve légale'], ['110000', 'Report à nouveau'], ['120000', 'Résultat de l\'exercice'],
    ['164000', 'Emprunts auprès des établissements de crédit'], ['218300', 'Matériel informatique'], ['205000', 'Logiciels, brevets, licences'],
    ['281830', 'Amortissement matériel informatique'], ['370000', 'Stocks de marchandises'],
    ['401000', 'Fournisseurs'], ['411000', 'Clients'], ['421000', 'Personnel - rémunérations dues'], ['431000', 'Sécurité sociale (URSSAF)'],
    ['437000', 'Autres organismes sociaux'], ['444000', 'État - impôt sur les bénéfices'], ['445510', 'TVA à décaisser'],
    ['445660', 'TVA déductible sur ABS'], ['445620', 'TVA déductible sur immobilisations'], ['445670', 'Crédit de TVA à reporter'],
    ['445710', 'TVA collectée'], ['455000', 'Associés - comptes courants'], ['467000', 'Autres débiteurs ou créditeurs'],
    ['471000', 'Compte d\'attente'], ['512000', 'Banque'], ['530000', 'Caisse'], ['580000', 'Virements internes'],
    ['601000', 'Achats de matières premières'], ['604000', 'Achats de prestations de services'], ['606100', 'Fournitures non stockables (eau, énergie)'],
    ['606400', 'Fournitures administratives'], ['607000', 'Achats de marchandises'], ['603700', 'Variation des stocks de marchandises'],
    ['609000', 'Rabais, remises, ristournes obtenus'], ['613200', 'Locations immobilières'], ['615000', 'Entretien et réparations'],
    ['616000', 'Primes d\'assurance'], ['622600', 'Honoraires'], ['622700', 'Frais d\'actes et de contentieux'], ['623000', 'Publicité, marketing'],
    ['624000', 'Transports sur achats et ventes'], ['625100', 'Voyages et déplacements'], ['625600', 'Missions et réceptions'],
    ['626000', 'Frais postaux et télécommunications'], ['627000', 'Services bancaires'], ['651000', 'Redevances logiciels / SaaS'],
    ['635000', 'Autres impôts et taxes (CFE)'], ['641000', 'Rémunérations du personnel'], ['645000', 'Charges de sécurité sociale'],
    ['661000', 'Charges d\'intérêts'], ['671000', 'Charges exceptionnelles'], ['681100', 'Dotations aux amortissements'],
    ['695000', 'Impôts sur les bénéfices'], ['706000', 'Prestations de services'], ['707000', 'Ventes de marchandises'],
    ['708500', 'Ports et frais facturés'], ['709000', 'Rabais, remises, ristournes accordés'], ['740000', 'Subventions d\'exploitation'],
    ['758000', 'Produits divers de gestion'], ['768000', 'Autres produits financiers'], ['771000', 'Produits exceptionnels']
  ];
  const JOURNALS = { VT: 'Ventes', HA: 'Achats', BQ: 'Banque', CA: 'Caisse', OD: 'Opérations diverses' };

  function empty() {
    return {
      company: { name: 'Ma Startup', siren: '', vatNumber: '', address: '', email: '', iban: '', lockedUntil: '' },
      accounts: PCG.map(([num, label]) => ({ num, label })),
      tiers: [], products: [], docs: [], payments: [], entries: [], movements: [], seq: {}, version: 2
    };
  }

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  function nextNumber(db, prefix, date) {
    const key = prefix + date.slice(0, 4);
    db.seq[key] = (db.seq[key] || 0) + 1;
    return `${prefix}-${date.slice(0, 4)}-${String(db.seq[key]).padStart(5, '0')}`;
  }

  function lineTotals(l) {
    const ht = R(l.qty * l.price * (1 - (l.disc || 0) / 100));
    return { ht, tva: R(ht * l.vat / 100) };
  }

  function docTotals(d) {
    let ht = 0, tva = 0;
    for (const l of d.lines) { const t = lineTotals(l); ht += t.ht; tva += t.tva; }
    ht -= R(ht * (d.globalDisc || 0) / 100);
    tva -= R(tva * (d.globalDisc || 0) / 100);
    return { ht, tva, ttc: ht + tva };
  }

  const dc = (acc, amount, label, tier) => ({ acc, label, tier: tier || '', debit: Math.max(amount, 0), credit: Math.max(-amount, 0) });

  // Écriture validée = définitive : on ne modifie jamais, on contre-passe.
  function post(db, journal, date, ref, label, lines, src) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Date invalide');
    if (db.company.lockedUntil && date <= db.company.lockedUntil) throw new Error('Période clôturée jusqu\'au ' + db.company.lockedUntil);
    lines = lines.filter(l => l.debit || l.credit);
    if (lines.length < 2) throw new Error('Une écriture doit compter au moins deux lignes');
    for (const l of lines) {
      if (!db.accounts.some(a => a.num === l.acc)) throw new Error('Compte inconnu : ' + l.acc);
      if (l.debit < 0 || l.credit < 0 || !Number.isInteger(l.debit) || !Number.isInteger(l.credit)) throw new Error('Montant invalide');
    }
    const d = lines.reduce((s, l) => s + l.debit, 0), c = lines.reduce((s, l) => s + l.credit, 0);
    if (d !== c) throw new Error(`Écriture déséquilibrée (débit ${d / 100} ≠ crédit ${c / 100})`);
    db.seq.entry = (db.seq.entry || 0) + 1;
    const e = { id: uid(), num: db.seq.entry, journal, date, ref, label, lines, src: src || '', validatedAt: new Date().toISOString().slice(0, 10) };
    db.entries.push(e);
    return e;
  }

  function issue(db, doc) {
    if (doc.status !== 'DRAFT') throw new Error('Document déjà émis');
    if (!['INVOICE', 'CREDIT'].includes(doc.type)) throw new Error('Seules les factures et avoirs s\'émettent');
    if (!doc.lines.length) throw new Error('Document vide');
    const tier = db.tiers.find(t => t.id === doc.tierId);
    if (!tier) throw new Error('Tiers manquant');
    const sale = doc.kind === 'SALE', s = doc.type === 'CREDIT' ? -1 : 1;
    const prefix = sale ? (s > 0 ? 'FA' : 'AV') : (s > 0 ? 'AC' : 'AF');
    const tot = docTotals(doc);
    const byAcc = {};
    const factor = 1 - (doc.globalDisc || 0) / 100;
    for (const l of doc.lines) {
      const p = db.products.find(x => x.id === l.productId);
      const acc = l.acc || (p && p.account) || (sale ? (p && p.type === 'GOODS' ? '707000' : '706000') : (p && p.type === 'GOODS' ? '607000' : '604000'));
      byAcc[acc] = (byAcc[acc] || 0) + R(lineTotals(l).ht * factor);
    }
    // l'écart d'arrondi de la remise globale va sur le premier compte de produit/charge
    const first = Object.keys(byAcc)[0];
    byAcc[first] += tot.ht - Object.values(byAcc).reduce((a, b) => a + b, 0);

    doc.number = nextNumber(db, prefix, doc.date);
    const label = `${doc.number} ${tier.name}`;
    const lines = sale
      ? [dc('411000', tot.ttc * s, label, tier.code), ...Object.entries(byAcc).map(([a, v]) => dc(a, -v * s, label)), dc('445710', -tot.tva * s, label)]
      : [...Object.entries(byAcc).map(([a, v]) => dc(a, v * s, label)), dc('445660', tot.tva * s, label), dc('401000', -tot.ttc * s, label, tier.code)];
    const e = post(db, sale ? 'VT' : 'HA', doc.date, doc.number, label, lines, doc.id);

    // Stock et coût de revient (CMUP), chaque ligne d'article produit un mouvement unique
    doc.lines.forEach((l, i) => {
      const p = db.products.find(x => x.id === l.productId);
      if (!p || p.type !== 'GOODS') return;
      let q, unit;
      if (sale) { l.cost = p.cost; q = -l.qty * s; unit = p.cost; }
      else {
        unit = R(l.price * (1 - (l.disc || 0) / 100) * factor);
        q = l.qty * s;
        if (s > 0 && p.stock + q > 0) p.cost = R((Math.max(p.stock, 0) * p.cost + q * unit) / (Math.max(p.stock, 0) + q));
      }
      movement(db, { date: doc.date, productId: p.id, qty: q, unitCost: unit, docId: doc.id, line: i, kind: doc.kind });
    });
    doc.status = 'ISSUED';
    doc.totals = tot;
    doc.paid = 0;
    doc.entryId = e.id;
    return doc;
  }

  // Mouvement de stock : un seul par ligne de document (clé docId + ligne), le stock de l'article suit
  function movement(db, m) {
    db.movements = db.movements || [];
    if (m.docId && db.movements.some(x => x.docId === m.docId && x.line === m.line)) throw new Error('Mouvement de stock déjà enregistré pour cette ligne');
    const p = db.products.find(x => x.id === m.productId);
    if (!p) throw new Error('Article inconnu');
    if (!Number.isFinite(m.qty) || !m.qty) throw new Error('Quantité de mouvement invalide');
    const mv = { id: uid(), date: m.date, productId: p.id, qty: m.qty, unitCost: m.unitCost ?? p.cost, docId: m.docId || '', line: m.line ?? null, kind: m.kind || 'ADJUST', reason: m.reason || '', stockAfter: p.stock + m.qty };
    p.stock = mv.stockAfter;
    db.movements.push(mv);
    return mv;
  }

  // Inventaire : on enregistre l'écart entre le stock compté et le stock théorique
  function adjustStock(db, productId, counted, date, reason) {
    const p = db.products.find(x => x.id === productId);
    if (!p || p.type !== 'GOODS') throw new Error('Article stocké inconnu');
    if (!Number.isFinite(counted) || counted < 0) throw new Error('Quantité comptée invalide');
    if (counted === p.stock) return null;
    return movement(db, { date, productId, qty: counted - p.stock, kind: 'ADJUST', reason: reason || 'Inventaire' });
  }

  // Devis -> commande -> facture : le document source est marqué « transformé » et relié au nouveau
  const CHAIN = { QUOTE: ['ORDER', 'INVOICE'], ORDER: ['INVOICE'] };
  function convert(db, docId, toType, date) {
    const src = db.docs.find(d => d.id === docId);
    if (!src) throw new Error('Document introuvable');
    if (!(CHAIN[src.type] || []).includes(toType)) throw new Error('Transformation impossible');
    if (src.status !== 'DRAFT' || src.convertedTo) throw new Error('Ce document a déjà été transformé');
    const doc = { ...JSON.parse(JSON.stringify(src)), id: uid(), type: toType, status: 'DRAFT', number: '', date, origin: src.id, convertedTo: '' };
    delete doc.totals; delete doc.paid; delete doc.entryId;
    if (toType === 'ORDER') doc.number = nextNumber(db, src.kind === 'SALE' ? 'BC' : 'BCF', date);
    src.status = 'ACCEPTED';
    src.convertedTo = doc.id;
    db.docs.push(doc);
    return doc;
  }
  const draftNumber = (db, doc) => doc.number || (doc.type === 'QUOTE' ? nextNumber(db, 'DE', doc.date) : doc.type === 'ORDER' ? nextNumber(db, doc.kind === 'SALE' ? 'BC' : 'BCF', doc.date) : '');

  // Chaîne complète d'un document : ses origines puis ses descendants (transformations, avoirs)
  function links(db, docId) {
    const byId = id => db.docs.find(d => d.id === id);
    const up = [];
    for (let d = byId(docId); d && d.origin; d = byId(d.origin)) up.unshift(byId(d.origin));
    const down = [];
    const walk = id => db.docs.filter(d => d.origin === id).forEach(d => { down.push(d); walk(d.id); });
    walk(docId);
    return { up: up.filter(Boolean), down };
  }

  function pay(db, docId, date, amount, method, opts = {}) {
    const doc = db.docs.find(d => d.id === docId);
    if (!doc || doc.status === 'DRAFT') throw new Error('Document non émis');
    if (!Number.isInteger(amount) || amount <= 0) throw new Error('Montant invalide');
    if (amount > doc.totals.ttc - doc.paid) throw new Error('Montant supérieur au reste dû');
    if (!opts.allowDuplicate && db.payments.some(p => p.docId === docId && p.amount === amount && p.date === date)) {
      const err = new Error('Un règlement identique (même date, même montant) existe déjà pour ce document');
      err.code = 'DUPLICATE';
      throw err;
    }
    const tier = db.tiers.find(t => t.id === doc.tierId);
    const bank = method === 'CASH' ? '530000' : '512000';
    const s = doc.type === 'CREDIT' ? -1 : 1;
    const label = `Règlement ${doc.number} ${tier.name}`;
    const lines = doc.kind === 'SALE'
      ? [dc(bank, amount * s, label), dc('411000', -amount * s, label, tier.code)]
      : [dc('401000', amount * s, label, tier.code), dc(bank, -amount * s, label)];
    const e = post(db, method === 'CASH' ? 'CA' : 'BQ', date, doc.number, label, lines, doc.id);
    db.payments.push({ id: uid(), docId, date, amount, method, entryId: e.id });
    doc.paid += amount;
    if (doc.paid >= doc.totals.ttc) doc.status = 'PAID';
    return e;
  }

  function inRange(e, from, to) { return (!from || e.date >= from) && (!to || e.date <= to); }

  function balance(db, from, to) {
    const map = {};
    for (const e of db.entries) if (inRange(e, from, to)) for (const l of e.lines) {
      const m = map[l.acc] || (map[l.acc] = { debit: 0, credit: 0 });
      m.debit += l.debit; m.credit += l.credit;
    }
    return Object.keys(map).sort().map(acc => ({ acc, label: (db.accounts.find(a => a.num === acc) || {}).label || '', ...map[acc], solde: map[acc].debit - map[acc].credit }));
  }

  const sumClass = (bal, re) => bal.filter(b => re.test(b.acc)).reduce((s, b) => s + b.solde, 0);

  function income(db, from, to) {
    const bal = balance(db, from, to);
    const produits = -sumClass(bal, /^7/), charges = sumClass(bal, /^6/);
    const ventesMarch = -sumClass(bal, /^70[7]/), achatsMarch = sumClass(bal, /^60[37]/);
    return { produits, charges, resultat: produits - charges, margeCommerciale: ventesMarch - achatsMarch, lignes: bal.filter(b => /^[67]/.test(b.acc)) };
  }

  function sheet(db, to) {
    const bal = balance(db, '', to);
    const res = income(db, '', to).resultat;
    const actif = bal.filter(b => /^[2-5]/.test(b.acc) && b.solde > 0);
    const passif = bal.filter(b => /^[1-5]/.test(b.acc) && b.solde < 0).map(b => ({ ...b, solde: -b.solde }));
    return { actif, passif, resultat: res, totalActif: actif.reduce((s, b) => s + b.solde, 0), totalPassif: passif.reduce((s, b) => s + b.solde, 0) + res };
  }

  function vat(db, from, to) {
    // la liquidation passée en OD ne doit pas s'annuler elle-même : on l'exclut
    const raw = balance({ ...db, entries: db.entries.filter(e => e.src !== 'VAT') }, from, to);
    const g = acc => (raw.find(b => b.acc === acc) || { solde: 0 }).solde;
    const collectee = -g('445710'), deductible = g('445660') + g('445620');
    return { collectee, deductible, net: collectee - deductible };
  }

  function settleVat(db, from, to) {
    const v = vat(db, from, to);
    if (!v.collectee && !v.deductible) throw new Error('Aucune TVA sur la période');
    const label = `Liquidation TVA ${from} au ${to}`;
    return post(db, 'OD', to, 'TVA' + to.slice(0, 7).replace('-', ''), label, [
      dc('445710', v.collectee, label), dc('445660', -v.deductible, label),
      v.net >= 0 ? dc('445510', -v.net, label) : dc('445670', -v.net, label)
    ], 'VAT');
  }

  // Séries mensuelles pour les graphiques : produits, charges et trésorerie (512 + 53) en fin de mois.
  function monthly(db, year) {
    const m = Array.from({ length: 12 }, () => ({ produits: 0, charges: 0, flux: 0, treso: 0 }));
    let cash = 0;
    for (const e of db.entries) for (const l of e.lines) {
      const amt = l.debit - l.credit, y = e.date.slice(0, 4);
      if (/^5(12|3)/.test(l.acc)) { if (y < year) cash += amt; else if (y === year) m[+e.date.slice(5, 7) - 1].flux += amt; }
      if (y !== year) continue;
      const i = +e.date.slice(5, 7) - 1;
      if (/^7/.test(l.acc)) m[i].produits -= amt; else if (/^6/.test(l.acc)) m[i].charges += amt;
    }
    for (const x of m) { cash += x.flux; x.treso = cash; }
    return m;
  }

  // Fichier des Écritures Comptables, art. A47 A-1 du LPF (18 colonnes, séparateur tabulation)
  function fec(db, from, to) {
    const ymd = d => d.replace(/-/g, '');
    const amt = n => (n / 100).toFixed(2).replace('.', ',');
    const head = 'JournalCode\tJournalLib\tEcritureNum\tEcritureDate\tCompteNum\tCompteLib\tCompAuxNum\tCompAuxLib\tPieceRef\tPieceDate\tEcritureLib\tDebit\tCredit\tEcritureLet\tDateLet\tValidDate\tMontantdevise\tIdevise';
    const rows = [head];
    const clean = s => String(s || '').replace(/[\t\r\n]/g, ' ');
    for (const e of db.entries.filter(e => inRange(e, from, to)).sort((a, b) => a.num - b.num)) for (const l of e.lines) {
      const acc = db.accounts.find(a => a.num === l.acc);
      const tier = l.tier ? db.tiers.find(t => t.code === l.tier) : null;
      rows.push([e.journal, JOURNALS[e.journal], e.num, ymd(e.date), l.acc, clean(acc && acc.label), l.tier, clean(tier && tier.name),
        clean(e.ref), ymd(e.date), clean(l.label || e.label), amt(l.debit), amt(l.credit), '', '', ymd(e.validatedAt), '', ''].join('\t'));
    }
    return rows.join('\r\n');
  }

  const L = { PCG, JOURNALS, empty, uid, lineTotals, docTotals, post, issue, pay, movement, adjustStock, convert, draftNumber, links, nextNumber, balance, income, sheet, vat, settleVat, monthly, fec, dc };
  if (typeof module !== 'undefined') module.exports = L; else window.Ledger = L;
})();
