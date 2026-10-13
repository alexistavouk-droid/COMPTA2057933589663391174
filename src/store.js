// Format du dossier comptable : version, migration, sauvegardes avec empreinte, validation avant import.
(function () {
  const SCHEMA = 2;
  const APP = 'compta-elina';

  // Empreinte FNV-1a 32 bits : détecte un fichier tronqué ou modifié par erreur (pas une signature de sécurité)
  function checksum(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(16).padStart(8, '0');
  }

  // v1 -> v2 : préférences sorties du dossier, mouvements de stock reconstitués depuis les factures émises
  function migrate(db) {
    const extracted = {};
    if (!db.version || db.version < 2) {
      if (db.prefs) { extracted.dash = db.prefs.dash; delete db.prefs; }
      db.movements = db.movements || [];
      if (!db.movements.length) for (const d of db.docs || []) {
        if (!d.totals || d.status === 'DRAFT') continue;
        const s = d.type === 'CREDIT' ? -1 : 1;
        d.lines.forEach((l, i) => {
          const p = (db.products || []).find(x => x.id === l.productId);
          if (!p || p.type !== 'GOODS') return;
          db.movements.push({ id: 'mig-' + d.id + '-' + i, date: d.date, productId: p.id, qty: d.kind === 'SALE' ? -l.qty * s : l.qty * s, unitCost: d.kind === 'SALE' ? (l.cost || 0) : l.price, docId: d.id, line: i, kind: d.kind, reason: 'Reconstitué à la migration', stockAfter: null });
        });
      }
      db.version = 2;
    }
    for (const k of ['tiers', 'products', 'docs', 'payments', 'entries', 'movements', 'accounts']) if (!Array.isArray(db[k])) db[k] = [];
    db.seq = db.seq || {};
    return { db, extracted };
  }

  // Contrôle de structure : refuse un fichier qui casserait le dossier
  function validate(db) {
    const errors = [];
    if (!db || typeof db !== 'object' || Array.isArray(db)) return ['Le fichier ne contient pas un dossier'];
    for (const k of ['accounts', 'tiers', 'products', 'docs', 'payments', 'entries']) if (!Array.isArray(db[k])) errors.push(`Liste « ${k} » manquante`);
    if (!db.company || typeof db.company.name !== 'string') errors.push('Informations société manquantes');
    if (errors.length) return errors;
    const accs = new Set(db.accounts.map(a => a.num));
    const ids = new Set();
    for (const e of db.entries) {
      if (!e || !Array.isArray(e.lines) || !/^\d{4}-\d{2}-\d{2}$/.test(e.date)) { errors.push('Écriture illisible'); continue; }
      if (ids.has(e.id)) errors.push(`Écriture en double : ${e.id}`); ids.add(e.id);
      let d = 0, c = 0;
      for (const l of e.lines) {
        if (!Number.isInteger(l.debit) || !Number.isInteger(l.credit) || l.debit < 0 || l.credit < 0) errors.push(`Montant invalide dans l'écriture ${e.num}`);
        if (!accs.has(l.acc)) errors.push(`Compte ${l.acc} inconnu (écriture ${e.num})`);
        d += l.debit; c += l.credit;
      }
      if (d !== c) errors.push(`Écriture ${e.num} déséquilibrée`);
    }
    for (const d of db.docs) if (!d || !d.id || !['SALE', 'PURCHASE'].includes(d.kind) || !Array.isArray(d.lines)) errors.push('Document illisible');
    const tierIds = new Set(db.tiers.map(t => t.id));
    if (tierIds.size !== db.tiers.length) errors.push('Tiers en double');
    return errors.slice(0, 20);
  }

  // Avertissements non bloquants : cohérence entre documents et comptabilité
  function integrity(db) {
    const warn = [];
    const entryIds = new Set(db.entries.map(e => e.id));
    for (const d of db.docs) if (d.totals && d.status !== 'DRAFT' && !entryIds.has(d.entryId)) warn.push(`${d.number || d.id} n'a pas d'écriture comptable`);
    for (const p of db.payments) if (!entryIds.has(p.entryId)) warn.push(`Règlement du ${p.date} sans écriture`);
    const seen = new Set();
    for (const p of db.payments) { const k = p.docId + p.date + p.amount; if (seen.has(k)) warn.push(`Règlement possiblement en double le ${p.date}`); seen.add(k); }
    return warn.slice(0, 20);
  }

  function envelope(db, appVersion) {
    const data = JSON.stringify(db);
    return JSON.stringify({ app: APP, kind: 'dossier', schema: SCHEMA, appVersion: appVersion || '', createdAt: new Date().toISOString(), demo: !!db.demo, company: db.company && db.company.name, checksum: checksum(data), data: db });
  }

  // Lit une sauvegarde (nouveau format avec empreinte, ou ancien fichier brut) ; lève une erreur claire si elle est inutilisable
  function parseBackup(text) {
    let raw;
    try { raw = JSON.parse(text); } catch { throw new Error('Fichier illisible : ce n\'est pas un JSON valide'); }
    let db = raw, meta = { legacy: true };
    if (raw && raw.app === APP) {
      if (raw.kind !== 'dossier') throw new Error('Ce fichier est une sauvegarde de « ' + raw.kind + ' », pas un dossier comptable');
      if (raw.schema > SCHEMA) throw new Error('Sauvegarde créée par une version plus récente du logiciel : mettez à jour Compta Elina');
      if (checksum(JSON.stringify(raw.data)) !== raw.checksum) throw new Error('Empreinte incorrecte : le fichier a été modifié ou est incomplet');
      db = raw.data; meta = { legacy: false, createdAt: raw.createdAt, appVersion: raw.appVersion, demo: raw.demo };
    }
    const errors = validate(db);
    if (errors.length) throw new Error('Sauvegarde refusée :\n- ' + errors.join('\n- '));
    const { extracted } = migrate(db);
    return { db, meta, extracted, warnings: integrity(db) };
  }

  const S = { SCHEMA, checksum, migrate, validate, integrity, envelope, parseBackup };
  if (typeof module !== 'undefined') module.exports = S; else window.Store = S;
})();
