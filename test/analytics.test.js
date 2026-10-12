const assert = require('node:assert');
const L = require('../src/ledger.js');
const A = require('../src/analytics.js');
global.window = { Ledger: L };
require('../src/demo.js');

// Prix : coût 40 €, coefficient 2,5 -> 100 € HT, marque 60 %, marge 150 %
const p = A.pricing({ cost: 4000, coef: 2.5, vat: 20 });
assert.strictEqual(p.ht, 10000); assert.strictEqual(p.ttc, 12000);
assert.strictEqual(Math.round(p.tauxMarque), 60); assert.strictEqual(Math.round(p.tauxMarge), 150);
assert.strictEqual(A.pricing({ cost: 4000, marque: 60, vat: 20 }).ht, 10000);
// Remise de 10 % avec 40 % de marque : il faut vendre 33 % de plus
assert.strictEqual(Math.round(A.discountVolume(40, 10)), 33);
assert.strictEqual(A.discountVolume(10, 10), Infinity);

const db = window.demoData();
const today = new Date().toISOString().slice(0, 10), from = today.slice(0, 4) + '-01-01';

// Balance âgée = total des créances 411
const aged = A.aged(db, today);
const total411 = L.balance(db).find(b => b.acc === '411000').solde;
assert.strictEqual(aged.reduce((s, r) => s + r.total, 0), total411);
for (const r of aged) assert.strictEqual(r.notDue + r.d30 + r.d60 + r.d90 + r.more, r.total);

// ABC : 100 % cumulé, classes ordonnées
const abc = A.abc(db, from, today);
assert.ok(Math.abs(abc.at(-1).cum - 100) < 1e-9);
assert.strictEqual(abc[0].cls, 'A');

// Seuil de rentabilité cohérent
const be = A.breakEven(db, from, today);
assert.ok(be.rate > 0 && be.rate < 1 && be.seuil > 0);

// Prévisionnel : solde final = départ + flux
const fc = A.forecast(db, today);
assert.strictEqual(fc.end, fc.start + fc.flows.reduce((s, f) => s + f.amount, 0));

// Écriture d'inventaire : le compte 37 prend la valeur du stock, et la balance reste équilibrée
const value = db.products.filter(x => x.type === 'GOODS').reduce((s, x) => s + Math.round(Math.max(x.stock, 0) * x.cost), 0);
A.stockEntry(db, today);
assert.strictEqual(L.balance(db).find(b => b.acc === '370000').solde, value);
assert.strictEqual(L.balance(db).reduce((s, b) => s + b.solde, 0), 0);
assert.throws(() => A.stockEntry(db, today), /déjà à jour/);

const r = A.bfr(db, from, today);
assert.strictEqual(r.bfr, r.clients + r.stock - r.fournisseurs);
console.log('OK analytics - ' + aged.length + ' clients en balance âgée, ' + abc.length + ' articles ABC, seuil ' + Math.round(be.seuil / 100) + ' €');
