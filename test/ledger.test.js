const assert = require('node:assert');
const L = require('../src/ledger.js');

const db = L.empty();
db.tiers.push({ id: 'c1', code: 'C0001', type: 'C', name: 'Dupont SAS' }, { id: 'f1', code: 'F0001', type: 'F', name: 'Grossiste' });
db.products.push({ id: 'p1', sku: 'CAN', label: 'Canapé', type: 'GOODS', price: 100000, vat: 20, stock: 0, cost: 0 },
  { id: 'p2', sku: 'POSE', label: 'Pose', type: 'SERVICE', price: 20000, vat: 20, stock: 0, cost: 0 });

// Achat de 2 canapés à 600 € HT
const buy = { id: 'd1', kind: 'PURCHASE', type: 'INVOICE', status: 'DRAFT', date: '2026-03-01', tierId: 'f1', lines: [{ productId: 'p1', qty: 2, price: 60000, vat: 20 }] };
db.docs.push(buy); L.issue(db, buy);
assert.strictEqual(db.products[0].stock, 2);
assert.strictEqual(db.products[0].cost, 60000);

// Vente : 1 canapé + pose, remise ligne 10 % sur le canapé
const sale = { id: 'd2', kind: 'SALE', type: 'INVOICE', status: 'DRAFT', date: '2026-03-10', tierId: 'c1',
  lines: [{ productId: 'p1', qty: 1, price: 100000, disc: 10, vat: 20 }, { productId: 'p2', qty: 1, price: 20000, vat: 20 }] };
db.docs.push(sale); L.issue(db, sale);
assert.strictEqual(sale.number, 'FA-2026-00001');
assert.deepStrictEqual(sale.totals, { ht: 110000, tva: 22000, ttc: 132000 });
assert.strictEqual(db.products[0].stock, 1);
assert.strictEqual(sale.lines[0].cost, 60000);

L.pay(db, 'd2', '2026-03-20', 100000, 'TRANSFER');
assert.strictEqual(sale.status, 'ISSUED');
L.pay(db, 'd2', '2026-03-25', 32000, 'CARD');
assert.strictEqual(sale.status, 'PAID');
assert.throws(() => L.pay(db, 'd2', '2026-03-26', 1, 'CARD'));

// Toute la comptabilité est équilibrée, le client est soldé
const bal = L.balance(db);
assert.strictEqual(bal.reduce((s, b) => s + b.solde, 0), 0);
assert.strictEqual(bal.find(b => b.acc === '411000').solde, 0);

// TVA : 220 collectée - 240 déductible = crédit 20
const v = L.vat(db, '2026-03-01', '2026-03-31');
assert.deepStrictEqual(v, { collectee: 22000, deductible: 24000, net: -2000 });
L.settleVat(db, '2026-03-01', '2026-03-31');
assert.strictEqual(L.balance(db).find(b => b.acc === '445670').solde, 2000);

// Résultat = 1100 de ventes - 1200 d'achats (stock non encore constaté à l'inventaire)
assert.strictEqual(L.income(db).resultat, -10000);
const sh = L.sheet(db, '2026-12-31');
assert.strictEqual(sh.totalActif, sh.totalPassif);

// Écriture déséquilibrée refusée, période verrouillée refusée
assert.throws(() => L.post(db, 'OD', '2026-04-01', 'X', 'x', [L.dc('512000', 100), L.dc('471000', -99)]));
db.company.lockedUntil = '2026-03-31';
assert.throws(() => L.post(db, 'OD', '2026-03-15', 'X', 'x', [L.dc('512000', 100), L.dc('471000', -100)]));

// Avoir partiel
const av = { id: 'd3', kind: 'SALE', type: 'CREDIT', status: 'DRAFT', date: '2026-04-02', tierId: 'c1', lines: [{ productId: 'p2', qty: 1, price: 20000, vat: 20 }] };
db.docs.push(av); L.issue(db, av);
assert.strictEqual(av.number, 'AV-2026-00001');
assert.strictEqual(L.balance(db).find(b => b.acc === '411000').solde, -24000);

const fec = L.fec(db).split('\r\n');
assert.strictEqual(fec[0].split('\t').length, 18);
assert.ok(fec.slice(1).every(r => r.split('\t').length === 18));
console.log('OK - ' + db.entries.length + ' écritures, ' + (fec.length - 1) + ' lignes FEC');
