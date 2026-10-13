// Centre de règles : alertes, relances à valider, contrôles, échéances de sauvegarde et d'export, affectations comptables.
// Le moteur ne passe jamais d'écriture, de paiement ni de déclaration : il signale et propose.
(function () {
  const A = typeof module !== 'undefined' ? require('./analytics.js') : window.Analytics;
  const DAY = 864e5;
  const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  const DEFAULTS = {
    dueSoon: { on: true, days: 3 },
    overdue: { on: true, levels: [7, 15, 30] },
    stock: { on: true, defaultMin: 0 },
    checks: { on: true },
    backup: { on: true, everyHours: 24, keep: 10 },
    exports: { on: false, everyDays: 30 },
    assign: [
      { id: 'r1', contains: 'loyer', account: '613200' }, { id: 'r2', contains: 'assurance', account: '616000' },
      { id: 'r3', contains: 'telephone|internet|mobile', account: '626000' }, { id: 'r4', contains: 'logiciel|abonnement|saas|hebergement', account: '651000' },
      { id: 'r5', contains: 'publicite|campagne|marketing', account: '623000' }, { id: 'r6', contains: 'honoraires|expert-comptable|avocat', account: '622600' },
      { id: 'r7', contains: 'transport|livraison|port', account: '624000' }, { id: 'r8', contains: 'fournitures|papeterie', account: '606400' },
      { id: 'r9', contains: 'electricite|energie|eau|carburant', account: '606100' }, { id: 'r10', contains: 'frais bancaires|commission', account: '627000' }
    ]
  };

  function state(db) {
    db.rules = { ...JSON.parse(JSON.stringify(DEFAULTS)), ...(db.rules || {}) };
    db.automation = db.automation || {};
    const a = db.automation;
    a.log = a.log || []; a.notes = a.notes || []; a.pending = a.pending || []; a.fired = a.fired || {};
    return a;
  }

  function log(db, status, rule, message) {
    const a = state(db);
    a.log.unshift({ at: new Date().toISOString(), status, rule, message });
    a.log.length = Math.min(a.log.length, 300);
  }

  // Une alerte par clé tant que la situation dure ; elle peut revenir quand la situation a disparu puis réapparu
  let counts = { created: 0, dup: 0 };
  function notify(db, active, key, level, title, body, link) {
    const a = state(db);
    active.add(key);
    if (a.fired[key]) { counts.dup++; return; }
    a.fired[key] = new Date().toISOString();
    a.notes.unshift({ id: key + ':' + Date.now(), key, at: new Date().toISOString(), level, title, body, link: link || null, read: false });
    a.notes.length = Math.min(a.notes.length, 100);
    counts.created++;
  }

  function run(db, today) {
    const a = state(db), r = db.rules, active = new Set();
    counts = { created: 0, dup: 0 };
    const tier = id => (db.tiers.find(t => t.id === id) || {}).name || '?';
    try {
      const open = db.docs.filter(d => d.kind === 'SALE' && d.status === 'ISSUED' && d.type === 'INVOICE' && d.due);
      if (r.dueSoon.on) for (const d of open) {
        const n = days(today, d.due);
        if (n >= 0 && n <= r.dueSoon.days) notify(db, active, 'due:' + d.id, 'info', `Échéance ${n ? 'dans ' + n + ' j' : 'aujourd\'hui'} : ${d.number}`, `${tier(d.tierId)} · reste ${((d.totals.ttc - d.paid) / 100).toFixed(2)} €`, { view: 'doc', id: d.id });
      }
      if (r.overdue.on) for (const d of open) {
        const late = days(d.due, today);
        const level = r.overdue.levels.filter(x => late >= x).length;
        if (level > (d.reminderLevel || 0) && !a.pending.some(p => p.docId === d.id && p.level === level)) {
          a.pending.unshift({ id: 'rel:' + d.id + ':' + level, type: 'REMINDER', docId: d.id, level, createdAt: today, status: 'pending', title: `Relance niveau ${level} : ${d.number} (${late} j de retard)`, body: tier(d.tierId) });
          counts.created++;
          log(db, 'pending', 'Relances', `Relance niveau ${level} proposée pour ${d.number}, en attente de validation`);
        }
      }
      // une relance devient sans objet si la facture a été réglée entre-temps
      for (const p of a.pending.filter(p => p.status === 'pending' && p.type === 'REMINDER')) { const d = db.docs.find(x => x.id === p.docId); if (!d || d.status !== 'ISSUED') { p.status = 'obsolete'; log(db, 'ok', 'Relances', p.title + ' : sans objet, facture réglée'); } }
      a.pending = a.pending.filter((p, i) => p.status === 'pending' || i < 200);
      if (r.stock.on) for (const p of db.products.filter(p => p.type === 'GOODS')) {
        const min = p.min || r.stock.defaultMin;
        if (p.stock <= min) notify(db, active, 'stock:' + p.id, p.stock < 0 ? 'bad' : 'warn', `Stock bas : ${p.label}`, `${p.stock} en stock (seuil ${min})`, { view: 'products' });
      }
      if (r.checks.on) for (const c of A.checks(db, today).filter(c => !c.ok)) notify(db, active, 'check:' + c.label, c.level, 'Contrôle : ' + c.label, c.detail, { view: 'tools', t: 'checks' });
    } catch (err) {
      log(db, 'error', 'Moteur de règles', err.message);
    }
    // les situations résolues sont réarmées
    for (const k of Object.keys(a.fired)) if (!active.has(k)) delete a.fired[k];
    const { created, dup } = counts;
    // on ne journalise les doublons que lorsque leur nombre change, pour ne pas noyer l'historique
    if (created || dup !== a.lastDup) log(db, 'ok', 'Alertes', `${created} nouvelle(s) alerte(s)${dup ? `, ${dup} déjà signalée(s) non répétée(s)` : ''}`);
    a.lastDup = dup;
    a.lastRun = new Date().toISOString();
    return { created, duplicates: dup, backupDue: backupDue(db), exportDue: exportDue(db, today) };
  }

  const backupDue = db => { const r = db.rules.backup, last = db.automation.lastBackup; return !!(r.on && (!last || Date.now() - Date.parse(last) >= r.everyHours * 3600e3)); };
  const exportDue = (db, today) => { const r = db.rules.exports, last = db.automation.lastExport; return !!(r.on && (!last || days(last.slice(0, 10), today) >= r.everyDays)); };

  // Compte proposé pour une ligne sans article : première règle dont un mot-clé apparaît dans le libellé
  function assign(db, label, tierId) {
    const rules = (db.rules && db.rules.assign) || DEFAULTS.assign, text = norm(label);
    for (const r of rules) {
      if (r.tierId && r.tierId !== tierId) continue;
      if (norm(r.contains).split('|').map(s => s.trim()).filter(Boolean).some(w => text.includes(w))) return r;
    }
    return null;
  }

  function resolve(db, id, status) {
    const a = state(db), p = a.pending.find(x => x.id === id);
    if (!p || p.status !== 'pending') throw new Error('Action déjà traitée');
    p.status = status; p.doneAt = new Date().toISOString();
    if (status === 'done' && p.type === 'REMINDER') {
      const d = db.docs.find(x => x.id === p.docId);
      if (d) { d.reminderLevel = Math.max(d.reminderLevel || 0, p.level); (d.reminders = d.reminders || []).push({ level: p.level, date: p.doneAt.slice(0, 10) }); }
    }
    log(db, status === 'done' ? 'ok' : 'skipped', 'Validation', `${p.title} : ${status === 'done' ? 'validée' : 'ignorée'}`);
    return p;
  }

  const R = { DEFAULTS, state, run, assign, resolve, log, backupDue, exportDue };
  if (typeof module !== 'undefined') module.exports = R; else window.Rules = R;
})();
