// Dossier de démonstration : une boutique déco fictive, de janvier au mois en cours, passée par le vrai moteur comptable.
window.demoData = function () {
  const L = window.Ledger, db = L.empty();
  let seed = 42;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const pick = a => a[Math.floor(rnd() * a.length)];
  const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const now = new Date(), year = now.getFullYear(), today = now.toISOString().slice(0, 10);
  const iso = (m, d) => new Date(Date.UTC(year, m, d)).toISOString().slice(0, 10);
  const plus = (date, n) => { const x = new Date(date); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

  Object.assign(db.company, { name: 'Elina Studio', siren: '912345678', vatNumber: 'FR12912345678', address: '12 rue des Arts, 75011 Paris', email: 'bonjour@elina-studio.fr', iban: 'FR76 3000 6000 0112 3456 7890 189' });
  const clients = ['Maison Lumière', 'Atelier Brun', 'Café Olive', 'Hôtel des Lices', 'Sophie Martin', 'Agence Nord', 'Bureau Céleste', 'Lucas Petit']
    .map((name, i) => ({ id: 'c' + i, code: 'C' + String(i + 1).padStart(4, '0'), type: 'C', name, terms: 30, email: '', siren: '', address: 'Paris' }));
  const suppliers = ['Déco Grossiste', 'Lumen Factory', 'Bureau Immo', 'Cloud Tools']
    .map((name, i) => ({ id: 'f' + i, code: 'F' + String(i + 1).padStart(4, '0'), type: 'F', name, terms: 30, email: '', siren: '', address: 'Lyon' }));
  db.tiers.push(...clients, ...suppliers);
  db.products.push(
    { id: 'p0', sku: 'LMP-01', label: 'Lampe Halo', type: 'GOODS', price: 8900, vat: 20, cost: 0, stock: 0, min: 5 },
    { id: 'p1', sku: 'FTL-02', label: 'Fauteuil Nova', type: 'GOODS', price: 49000, vat: 20, cost: 0, stock: 0, min: 2 },
    { id: 'p2', sku: 'BGF-03', label: 'Bougie parfumée', type: 'GOODS', price: 2400, vat: 20, cost: 0, stock: 0, min: 15 },
    { id: 'p3', sku: 'MIR-04', label: 'Miroir Soleil', type: 'GOODS', price: 15900, vat: 20, cost: 0, stock: 0, min: 3 },
    { id: 'p4', sku: 'CNS-H', label: 'Conseil déco (heure)', type: 'SERVICE', price: 7500, vat: 20, cost: 0, stock: 0 },
    { id: 'p5', sku: 'LIV', label: 'Livraison et installation', type: 'SERVICE', price: 4900, vat: 20, cost: 0, stock: 0 });
  const buyCost = { p0: 3600, p1: 23000, p2: 800, p3: 7200 };

  const ops = [];
  const at = (date, fn) => { if (date <= today) ops.push({ date, fn }); };
  let n = 0;
  const doc = (kind, tierId, date, lines) => {
    const d = { id: 'd' + (n++), kind, type: 'INVOICE', status: 'DRAFT', date, due: plus(date, 30), tierId, lines, globalDisc: 0, ref: '', notes: '' };
    at(date, () => { db.docs.push(d); L.issue(db, d); });
    return d;
  };
  const payLater = (d, days, method) => at(plus(d.date, days), () => { if (d.status === 'ISSUED') L.pay(db, d.id, plus(d.date, days), d.totals.ttc - d.paid, method); });

  at(iso(0, 2), () => L.post(db, 'BQ', iso(0, 2), 'APPORT', 'Apport en capital', [L.dc('512000', 3000000), L.dc('101000', -3000000)]));

  for (let m = 0; m <= now.getMonth(); m++) {
    const grow = 1 + m * 0.08;
    // réassort de marchandises
    const restock = doc('PURCHASE', 'f0', iso(m, int(1, 3)), Object.keys(buyCost).map(p => ({ productId: p, label: db.products.find(x => x.id === p).label, qty: int(10, 14) * (p === 'p2' ? 3 : 1), price: Math.round(buyCost[p] * (0.95 + rnd() * 0.1)), disc: 0, vat: 20 })));
    payLater(restock, 30, 'TRANSFER');
    // frais fixes
    payLater(doc('PURCHASE', 'f2', iso(m, 1), [{ label: 'Loyer boutique', qty: 1, price: 140000, vat: 20, acc: '613200' }]), 3, 'SEPA');
    payLater(doc('PURCHASE', 'f3', iso(m, 5), [{ label: 'Logiciels et hébergement', qty: 1, price: 8900, vat: 20, acc: '651000' }, { label: 'Téléphone et internet', qty: 1, price: 4500, vat: 20, acc: '626000' }]), 0, 'CARD');
    payLater(doc('PURCHASE', 'f1', iso(m, 12), [{ label: 'Campagne réseaux sociaux', qty: 1, price: int(25, 80) * 1000, vat: 20, acc: '623000' }]), 15, 'CARD');
    at(iso(m, 28), () => L.post(db, 'BQ', iso(m, 28), 'SAL' + (m + 1), 'Salaire et charges', [L.dc('641000', 230000), L.dc('645000', 95000), L.dc('512000', -325000)]));
    // ventes
    for (let s = 0, count = Math.round(int(12, 16) * grow); s < count; s++) {
      const date = iso(m, int(2, 27));
      const lines = Array.from({ length: int(1, 3) }, () => {
        const p = pick(db.products);
        return { productId: p.id, label: p.label, qty: p.id === 'p2' ? int(2, 8) : int(1, 3), price: p.price, disc: rnd() < 0.2 ? 10 : 0, vat: 20 };
      });
      const d = doc('SALE', pick(clients).id, date, lines);
      if (rnd() < 0.94) payLater(d, int(0, 40), pick(['TRANSFER', 'CARD', 'CARD', 'SEPA', 'CHECK']));
    }
    // TVA du mois précédent : liquidation puis paiement
    if (m > 0) {
      at(iso(m - 1, new Date(Date.UTC(year, m, 0)).getUTCDate()), () => L.settleVat(db, iso(m - 1, 1), iso(m, 0)));
      at(iso(m, 20), () => {
        const due = (L.balance(db).find(b => b.acc === '445510') || { solde: 0 }).solde;
        if (due < 0) L.post(db, 'BQ', iso(m, 20), 'TVA' + (m), 'Paiement TVA', [L.dc('445510', -due), L.dc('512000', due)]);
      });
    }
  }
  ops.sort((a, b) => a.date.localeCompare(b.date)).forEach(o => o.fn());
  return db;
};
