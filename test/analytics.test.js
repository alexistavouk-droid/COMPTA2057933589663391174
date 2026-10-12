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
// Calculateurs
assert.deepStrictEqual(A.htTtc(12000, 20, 'TTC'), { ht: 10000, tva: 2000, ttc: 12000 });
assert.deepStrictEqual(A.htTtc(10000, 5.5, 'HT'), { ht: 10000, tva: 550, ttc: 10550 });
const pen = A.penalties(100000, '2026-01-01', '2026-03-02', 12.15);
assert.strictEqual(pen.late, 60); assert.strictEqual(pen.interest, Math.round(100000 * 0.1215 * 60 / 365)); assert.strictEqual(pen.indemnity, 4000);
assert.strictEqual(A.penalties(100000, '2026-01-10', '2026-01-05', 12).total, 0);
assert.strictEqual(A.dueDate('2026-01-15', '45fdm'), '2026-03-31');
assert.strictEqual(A.dueDate('2026-01-31', '30'), '2026-03-02');
const lo = A.loan(1000000, 4, 60);
assert.strictEqual(lo.rows.at(-1).left, 0);
assert.strictEqual(lo.rows.reduce((s, r) => s + r.principal, 0), 1000000);
assert.ok(Math.abs(lo.monthly - 18416) <= 1);
for (const m of ['L', 'D']) { const am = A.amortization(300000, 5, '2026-04-01', m); assert.strictEqual(am.at(-1).cum, 300000); assert.strictEqual(am.at(-1).vnc, 0); }
assert.strictEqual(A.amortization(300000, 3, '2026-01-01', 'L').length, 3);
assert.strictEqual(A.amortization(300000, 3, '2026-07-01', 'L').length, 4);
assert.strictEqual(A.eoq(1200, 5000, 2000, 20).q, Math.round(Math.sqrt(2 * 1200 * 5000 / 400)));
assert.strictEqual(A.targetSales(50000, 0.5, 10000), 120000);
const ck = A.checks(db, today);
assert.ok(ck.find(c => c.label === 'Balance équilibrée').ok);
assert.ok(ck.find(c => c.label.startsWith('Numérotation')).ok);
const cu = A.customers(db, from, today);
assert.strictEqual(cu.reduce((s, c) => s + c.ht, 0), A.abc(db, from, today).reduce((s, x) => s + x.ht, 0));
assert.strictEqual(A.fiscalCalendar('2026', 'RN').filter(x => x.vat).length, 12);
console.log('OK analytics - ' + aged.length + ' clients en balance âgée, ' + abc.length + ' articles ABC, seuil ' + Math.round(be.seuil / 100) + ' €');
