const assert = require('node:assert');
const L = require('../src/ledger.js');
const R = require('../src/rules.js');

const db = L.empty();
db.tiers.push({ id: 'c1', code: 'C0001', type: 'C', name: 'Client' });
db.products.push({ id: 'p1', sku: 'A', label: 'Lampe', type: 'GOODS', price: 10000, vat: 20, stock: 0, cost: 0, min: 2 });
const inv = { id: 'i1', kind: 'SALE', type: 'INVOICE', status: 'DRAFT', date: '2026-01-01', due: '2026-01-31', tierId: 'c1', lines: [{ label: 'Service', qty: 1, price: 10000, vat: 20 }] };
db.docs.push(inv); L.issue(db, inv);
const entriesBefore = db.entries.length;

// 1er passage, 10 jours après l'échéance : relance niveau 1 en attente, alerte stock, aucune écriture passée
let r = R.run(db, '2026-02-10');
assert.ok(r.created >= 2);
assert.strictEqual(db.automation.pending.length, 1);
assert.strictEqual(db.automation.pending[0].level, 1);
assert.ok(db.automation.notes.some(n => n.key === 'stock:p1'));
assert.strictEqual(db.entries.length, entriesBefore);

// 2e passage le même jour : rien de nouveau, doublons détectés et non répétés
r = R.run(db, '2026-02-10');
assert.strictEqual(r.created, 0);
assert.ok(r.duplicates >= 1);
assert.strictEqual(db.automation.notes.filter(n => n.key === 'stock:p1').length, 1);

// Validation humaine : la relance est marquée envoyée, pas recréée ; niveau 2 au-delà de 15 jours
R.resolve(db, db.automation.pending[0].id, 'done');
assert.strictEqual(inv.reminderLevel, 1);
assert.throws(() => R.resolve(db, db.automation.pending[0].id, 'done'), /déjà traitée/);
R.run(db, '2026-02-11');
assert.strictEqual(db.automation.pending.filter(p => p.status === 'pending').length, 0);
R.run(db, '2026-02-20');
assert.strictEqual(db.automation.pending.filter(p => p.status === 'pending')[0].level, 2);

// Paiement : la relance en attente devient sans objet
L.pay(db, 'i1', '2026-02-21', 12000, 'TRANSFER');
R.run(db, '2026-02-21');
assert.strictEqual(db.automation.pending.filter(p => p.status === 'pending').length, 0);

// Stock réapprovisionné : l'alerte est réarmée puis peut revenir
db.products[0].stock = 10; R.run(db, '2026-02-22');
assert.ok(!db.automation.fired['stock:p1']);
db.products[0].stock = 1; R.run(db, '2026-02-23');
assert.strictEqual(db.automation.notes.filter(n => n.key === 'stock:p1').length, 2);

// Affectations comptables
assert.strictEqual(R.assign(db, 'Loyer boutique mars').account, '613200');
assert.strictEqual(R.assign(db, 'Abonnement logiciel').account, '651000');
assert.strictEqual(R.assign(db, 'Électricité').account, '606100');
assert.strictEqual(R.assign(db, 'Achat divers'), null);
db.rules.assign.unshift({ id: 'x', contains: 'loyer', tierId: 'f9', account: '613500' });
assert.strictEqual(R.assign(db, 'Loyer', 'f9').account, '613500');
assert.strictEqual(R.assign(db, 'Loyer', 'f1').account, '613200');

// Échéances de sauvegarde / export
assert.strictEqual(R.backupDue(db), true);
db.automation.lastBackup = new Date().toISOString();
assert.strictEqual(R.backupDue(db), false);
assert.strictEqual(R.exportDue(db, '2026-02-23'), false);
console.log('OK rules - alertes, doublons, relances validées, réarmement, affectations');
