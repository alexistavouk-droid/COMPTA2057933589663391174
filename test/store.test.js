const assert = require('node:assert');
const L = require('../src/ledger.js');
const S = require('../src/store.js');

const base = () => {
  const db = L.empty();
  db.tiers.push({ id: 'c1', code: 'C0001', type: 'C', name: 'Client' }, { id: 'f1', code: 'F0001', type: 'F', name: 'Fournisseur' });
  db.products.push({ id: 'p1', sku: 'A', label: 'Article', type: 'GOODS', price: 10000, vat: 20, stock: 0, cost: 0 });
  return db;
};

// --- Chaîne devis -> commande -> facture, sans double transformation
{
  const db = base();
  const q = { id: 'q1', kind: 'SALE', type: 'QUOTE', status: 'DRAFT', date: '2026-05-02', tierId: 'c1', lines: [{ productId: 'p1', label: 'Article', qty: 2, price: 10000, vat: 20 }] };
  q.number = L.draftNumber(db, q); db.docs.push(q);
  assert.strictEqual(q.number, 'DE-2026-00001');
  const o = L.convert(db, 'q1', 'ORDER', '2026-05-03');
  assert.strictEqual(o.number, 'BC-2026-00001');
  assert.strictEqual(q.status, 'ACCEPTED');
  assert.throws(() => L.convert(db, 'q1', 'INVOICE', '2026-05-03'), /déjà été transformé/);
  const f = L.convert(db, o.id, 'INVOICE', '2026-05-04');
  assert.strictEqual(f.origin, o.id);
  const ln = L.links(db, f.id);
  assert.deepStrictEqual(ln.up.map(d => d.id), ['q1', o.id]);
  assert.deepStrictEqual(L.links(db, 'q1').down.map(d => d.type), ['ORDER', 'INVOICE']);
  assert.throws(() => L.convert(db, f.id, 'ORDER', '2026-05-04'), /impossible/);
}

// --- Mouvements de stock uniques, inventaire, règlement en double bloqué
{
  const db = base();
  const buy = { id: 'a1', kind: 'PURCHASE', type: 'INVOICE', status: 'DRAFT', date: '2026-05-01', tierId: 'f1', lines: [{ productId: 'p1', qty: 5, price: 4000, vat: 20 }] };
  db.docs.push(buy); L.issue(db, buy);
  assert.strictEqual(db.movements.length, 1);
  assert.strictEqual(db.movements[0].stockAfter, 5);
  assert.throws(() => L.movement(db, { date: '2026-05-01', productId: 'p1', qty: 5, docId: 'a1', line: 0 }), /déjà enregistré/);
  assert.throws(() => L.issue(db, buy), /déjà émis/);
  const sale = { id: 's1', kind: 'SALE', type: 'INVOICE', status: 'DRAFT', date: '2026-05-02', tierId: 'c1', lines: [{ productId: 'p1', qty: 2, price: 10000, vat: 20 }] };
  db.docs.push(sale); L.issue(db, sale);
  assert.strictEqual(db.products[0].stock, 3);
  const adj = L.adjustStock(db, 'p1', 2, '2026-05-03', 'Casse');
  assert.strictEqual(adj.qty, -1);
  assert.strictEqual(L.adjustStock(db, 'p1', 2, '2026-05-03'), null);
  assert.strictEqual(db.products[0].stock, 2);
  L.pay(db, 's1', '2026-05-10', 12000, 'TRANSFER');
  assert.throws(() => L.pay(db, 's1', '2026-05-10', 12000, 'TRANSFER'), e => e.code === 'DUPLICATE');
  L.pay(db, 's1', '2026-05-10', 12000, 'TRANSFER', { allowDuplicate: true });
  assert.strictEqual(sale.status, 'PAID');
}

// --- Sauvegarde : aller-retour, empreinte, validation, migration v1
{
  const db = base();
  const s1 = { id: 's1', kind: 'SALE', type: 'INVOICE', status: 'DRAFT', date: '2026-05-02', tierId: 'c1', lines: [{ productId: 'p1', qty: 1, price: 10000, vat: 20 }] };
  db.docs.push(s1); L.issue(db, s1);
  const file = S.envelope(db, '2.0.0');
  const back = S.parseBackup(file);
  assert.deepStrictEqual(back.db, db);
  assert.strictEqual(back.meta.legacy, false);

  const tampered = JSON.parse(file); tampered.data.entries[0].lines[0].debit += 100;
  assert.throws(() => S.parseBackup(JSON.stringify(tampered)), /Empreinte incorrecte/);
  assert.throws(() => S.parseBackup('{pas du json'), /illisible/);
  assert.throws(() => S.parseBackup(JSON.stringify({ app: 'compta-elina', kind: 'preferences', schema: 1 })), /pas un dossier/);
  const unbalanced = JSON.parse(JSON.stringify(db)); unbalanced.entries[0].lines[0].debit += 1;
  assert.throws(() => S.parseBackup(JSON.stringify(unbalanced)), /déséquilibrée/);
  const future = JSON.parse(file); future.schema = 99;
  assert.throws(() => S.parseBackup(JSON.stringify(future)), /plus récente/);

  // Ancien format v1 : préférences dans le dossier, pas de mouvements
  const v1 = JSON.parse(JSON.stringify(db)); delete v1.version; delete v1.movements; v1.prefs = { dash: [{ id: 'treso', size: 8 }] };
  const mig = S.parseBackup(JSON.stringify(v1));
  assert.strictEqual(mig.db.version, 2);
  assert.strictEqual(mig.db.prefs, undefined);
  assert.deepStrictEqual(mig.extracted.dash, [{ id: 'treso', size: 8 }]);
  assert.strictEqual(mig.db.movements.length, 1);
  assert.strictEqual(mig.db.movements[0].qty, -1);
  assert.deepStrictEqual(S.integrity(mig.db), []);
}
console.log('OK store - chaîne documentaire, stock, doublons, sauvegardes et migration');
