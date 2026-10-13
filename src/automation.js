// Centre d'automatisation : réglage des règles, actions à valider, alertes, historique, exécution périodique.
// Rien n'est payé, déclaré ni comptabilisé automatiquement : le moteur signale, l'utilisateur décide.
(function () {
  const R = window.Rules;
  const EVERY = 5 * 60e3;
  const STATUS = { ok: 'Réussi', error: 'Erreur', pending: 'À valider', duplicate: 'Doublon', skipped: 'Ignoré' };
  let running = false;

  const fecFiles = () => {
    const y = today().slice(0, 4);
    return [
      { name: `${db.company.siren}FEC${y}1231.txt`, content: L.fec(db, y + '-01-01', y + '-12-31'), encoding: 'latin1' },
      { name: `balance-${today()}.csv`, content: csv([['Compte', 'Libellé', 'Débit', 'Crédit', 'Solde'], ...L.balance(db, y + '-01-01', today()).map(b => [b.acc, b.label, b.debit, b.credit, b.solde])]) }
    ];
  };

  // Un passage du moteur : alertes, relances proposées, sauvegarde et export si leur échéance est passée
  async function tick() {
    if (!db || running) return;
    running = true;
    try {
      const r = R.run(db, today());
      if (r.backupDue) {
        try { await window.api.snapshot(Store.envelope(db, APP_VERSION), 'Planifiée', db.rules.backup.keep); db.automation.lastBackup = new Date().toISOString(); R.log(db, 'ok', 'Sauvegarde planifiée', 'Copie du dossier enregistrée'); }
        catch (e) { R.log(db, 'error', 'Sauvegarde planifiée', e.message); }
      }
      if (r.exportDue && !db.automation.pending.some(p => p.type === 'EXPORT' && p.status === 'pending')) {
        if (!db.company.siren) R.log(db, 'error', 'Export récurrent', 'SIREN manquant : export impossible');
        else if (window.api.autoExport && db.rules.exports.folder) {
          // sur Windows, l'utilisateur a choisi et autorisé le dossier : l'export s'écrit sans autre action
          try { await window.api.autoExport(fecFiles()); db.automation.lastExport = new Date().toISOString(); R.log(db, 'ok', 'Export récurrent', 'FEC et balance écrits dans le dossier autorisé'); }
          catch (e) { R.log(db, 'error', 'Export récurrent', e.message); }
        } else {
          db.automation.pending.unshift({ id: 'exp:' + today(), type: 'EXPORT', createdAt: today(), status: 'pending', title: 'Export récurrent à télécharger (FEC et balance)', body: 'Le navigateur ne peut pas écrire de fichier sans votre accord.' });
          R.log(db, 'pending', 'Export récurrent', 'Export prêt, en attente de votre clic');
        }
      }
      await save();
      updateBell();
      if (view === 'automation' && !$('#modal').open) render();
    } catch (e) { console.error(e); }
    running = false;
  }

  function updateBell() {
    const a = (db && db.automation) || {}, n = (a.notes || []).filter(x => !x.read).length + (a.pending || []).filter(p => p.status === 'pending').length;
    let b = $('#bell');
    if (!b) { b = document.createElement('button'); b.id = 'bell'; b.dataset.act = 'go'; b.dataset.v = 'automation'; $('#nav .brand').after(b); }
    b.innerHTML = `<span aria-hidden="true">🔔</span><span class="lbl">Alertes</span>${n ? `<span class="badge">${n > 99 ? '99+' : n}</span>` : ''}`;
    b.setAttribute('aria-label', n ? `${n} alerte(s) ou action(s) à traiter` : 'Aucune alerte');
  }

  const ruleRow = (r, i) => `<tr><td><input name="contains" value="${esc(r.contains)}" aria-label="Mots-clés de la règle ${i + 1}"></td>
    <td><select name="tierId" aria-label="Fournisseur"><option value="">Tous</option>${db.tiers.filter(t => t.type === 'F').map(t => `<option value="${t.id}" ${t.id === r.tierId ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></td>
    <td><select name="account" aria-label="Compte">${accOptions(r.account, /^[267]/)}</select></td><td><button type="button" class="link danger" data-act="delRule" aria-label="Supprimer la règle">✕</button></td></tr>`;

  views.automation = () => {
    R.state(db);
    const a = db.automation, r = db.rules, f = param.f || '';
    const pend = a.pending.filter(p => p.status === 'pending'), notes = a.notes;
    const log = a.log.filter(x => !f || x.status === f).slice(0, 150);
    const desktop = window.api.platform === 'desktop';
    const chk = (name, on) => `<input type="checkbox" name="${name}" ${on ? 'checked' : ''}>`;
    return `<h1>Automatisations</h1><p class="sub">Alertes, relances, contrôles, sauvegardes et exports. Le moteur tourne à l'ouverture puis toutes les 5 minutes tant que l'application est ouverte. Il ne paie, ne déclare et ne comptabilise jamais rien seul : tout ce qui engage le dossier attend votre validation.</p>
    <div class="bar"><button class="primary" data-act="runRules">Lancer les contrôles maintenant</button><span class="k">Dernier passage : ${a.lastRun ? new Date(a.lastRun).toLocaleString('fr-FR') : 'jamais'}</span></div>

    <h2>À valider <span class="count">${pend.length}</span></h2>
    ${pend.length ? `<div class="pending">${pend.map(p => `<div class="card pend"><div><b>${esc(p.title)}</b><div class="k">${esc(p.body || '')} · proposé le ${fdate(p.createdAt)}</div></div><div class="bar">
      ${p.type === 'REMINDER' ? `<button data-act="pendCopy" data-id="${esc(p.id)}">Copier le texte de relance</button><button class="primary" data-act="pendDone" data-id="${esc(p.id)}">Marquer comme envoyée</button>` : ''}
      ${p.type === 'EXPORT' ? `<button class="primary" data-act="pendExport" data-id="${esc(p.id)}">Télécharger l'export</button>` : ''}
      <button data-act="pendSkip" data-id="${esc(p.id)}">Ignorer</button></div></div>`).join('')}</div>` : '<div class="empty small">Rien à valider.</div>'}

    <h2>Alertes <span class="count">${notes.filter(n => !n.read).length}</span></h2>
    ${notes.length ? `<div class="bar"><button data-act="readAll">Tout marquer comme lu</button></div><ul class="notes">${notes.slice(0, 60).map(n => `<li class="${n.level} ${n.read ? 'read' : ''}"><span class="dot"></span><div><b>${esc(n.title)}</b><small>${esc(n.body)} · ${new Date(n.at).toLocaleString('fr-FR')}</small></div>
      ${n.link ? `<button class="link" data-act="openNote" data-id="${esc(n.id)}">Ouvrir</button>` : ''}${n.read ? '' : `<button class="link" data-act="readNote" data-id="${esc(n.id)}">Lu</button>`}</li>`).join('')}</ul>` : '<div class="empty small">Aucune alerte.</div>'}

    <h2>Règles</h2>
    <form id="rulesForm" class="card rules-form">
      <fieldset><legend>${chk('dueSoon.on', r.dueSoon.on)} Alerte d'échéance proche</legend><label>Prévenir combien de jours avant l'échéance<input name="dueSoon.days" type="number" min="0" max="60" value="${r.dueSoon.days}"></label></fieldset>
      <fieldset><legend>${chk('overdue.on', r.overdue.on)} Relances des factures impayées</legend><label>Proposer une relance après (jours de retard, séparés par des virgules)<input name="overdue.levels" value="${r.overdue.levels.join(', ')}" pattern="\\s*\\d+(\\s*,\\s*\\d+){0,4}\\s*"></label></fieldset>
      <fieldset><legend>${chk('stock.on', r.stock.on)} Seuils de stock</legend><label>Seuil par défaut pour les articles sans seuil<input name="stock.defaultMin" type="number" min="0" value="${r.stock.defaultMin}"></label></fieldset>
      <fieldset><legend>${chk('checks.on', r.checks.on)} Contrôles de cohérence comptable</legend><p class="k">Les dix contrôles de la boîte à outils, signalés dès qu'un point devient anormal.</p></fieldset>
      <fieldset><legend>${chk('backup.on', r.backup.on)} Sauvegarde planifiée</legend><label>Toutes les (heures)<input name="backup.everyHours" type="number" min="1" max="720" value="${r.backup.everyHours}"></label><label>Copies conservées<input name="backup.keep" type="number" min="2" max="50" value="${r.backup.keep}"></label>
        <p class="k">${desktop ? 'Copies écrites dans le dossier de l\'application.' : 'Sur le site, copies gardées dans ce navigateur (8 au plus).'} Dernière : ${a.lastBackup ? new Date(a.lastBackup).toLocaleString('fr-FR') : 'aucune'}.</p></fieldset>
      <fieldset><legend>${chk('exports.on', r.exports.on)} Export récurrent du FEC et de la balance</legend><label>Tous les (jours)<input name="exports.everyDays" type="number" min="1" max="365" value="${r.exports.everyDays}"></label>
        <p class="k">${desktop ? (r.exports.folder ? 'Dossier autorisé : ' + esc(r.exports.folder) : 'Choisissez un dossier pour autoriser l\'écriture automatique.') + ` <button type="button" class="link" data-act="chooseExportFolder">Choisir le dossier…</button>` : 'Sur le site, l\'export vous est proposé en « À valider » : le navigateur exige un clic pour télécharger.'}</p></fieldset>
      <div class="bar"><button class="primary">Enregistrer les règles</button></div>
    </form>

    <h2>Règles d'affectation comptable</h2>
    <p class="sub">Pour une ligne sans article et sans compte choisi, le premier mot-clé trouvé dans le libellé donne le compte (plusieurs mots-clés séparés par « | »). Chaque affectation est tracée dans l'historique et visible sur la ligne.</p>
    <form id="assignForm"><table><thead><tr><th>Mots-clés du libellé</th><th>Fournisseur</th><th>Compte</th><th></th></tr></thead><tbody id="assignRows">${r.assign.map(ruleRow).join('')}</tbody></table>
      <div class="bar" style="margin-top:10px"><button type="button" data-act="addRule">+ Règle</button><button class="primary">Enregistrer les affectations</button>
      <input id="assignTest" placeholder="Tester un libellé, ex. « Loyer mars »" style="max-width:280px"><span id="assignOut" class="k"></span></div></form>

    <h2>Historique</h2>
    <div class="bar"><select id="logf" style="max-width:220px"><option value="">Tous les événements</option>${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${k === f ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
    ${log.length ? `<table><tr><th>Date</th><th>Règle</th><th>Statut</th><th>Détail</th></tr>${log.map(x => `<tr><td>${new Date(x.at).toLocaleString('fr-FR')}</td><td>${esc(x.rule)}</td><td><span class="pill st-${x.status}">${STATUS[x.status] || x.status}</span></td><td>${esc(x.message)}</td></tr>`).join('')}</table>` : '<div class="empty small">Aucun événement.</div>'}`;
  };

  const find = (list, id) => list.find(x => x.id === id);
  Object.assign(actions, {
    runRules: async () => { await tick(); render(); toast('Contrôles effectués'); },
    pendCopy: ({ id }) => { const p = find(db.automation.pending, id), d = db.docs.find(x => x.id === p.docId); if (d) actions.copyDunning({ id: d.tierId }); },
    pendDone: ({ id }) => mutate(() => R.resolve(db, id, 'done')).then(updateBell).catch(() => {}),
    pendSkip: ({ id }) => mutate(() => R.resolve(db, id, 'skipped')).then(updateBell).catch(() => {}),
    async pendExport({ id }) {
      if (!db.company.siren) return toast('Renseignez le SIREN dans les paramètres', true);
      for (const f of fecFiles()) await window.api.exportFile(f.name, f.content, f.encoding);
      await mutate(() => { R.resolve(db, id, 'done'); db.automation.lastExport = new Date().toISOString(); }); updateBell();
    },
    readNote: ({ id }) => mutate(() => { find(db.automation.notes, id).read = true; }).then(updateBell).catch(() => {}),
    readAll: () => mutate(() => db.automation.notes.forEach(n => { n.read = true; })).then(updateBell).catch(() => {}),
    openNote: ({ id }) => {
      const n = find(db.automation.notes, id); n.read = true; save(); updateBell();
      const l = n.link || {};
      if (l.view === 'doc') { go('sales'); docForm({ id: l.id }); } else go(l.view, l.t ? { t: l.t } : {});
    },
    addRule: () => $('#assignRows').insertAdjacentHTML('beforeend', ruleRow({ contains: '', account: '606400' }, $('#assignRows').children.length)),
    delRule: (_, el) => el.closest('tr').remove(),
    async chooseExportFolder() {
      const folder = await window.api.chooseExportFolder();
      if (folder) await mutate(() => { R.state(db); db.rules.exports = { ...db.rules.exports, folder }; R.log(db, 'ok', 'Export récurrent', 'Dossier autorisé : ' + folder); });
    }
  });

  document.addEventListener('submit', e => {
    if (e.target.id === 'rulesForm') {
      const f = e.target, v = n => f.elements[n], on = n => v(n).checked, int = (n, lo, hi) => Math.min(hi, Math.max(lo, Math.round(Number(v(n).value) || lo)));
      const levels = v('overdue.levels').value.split(',').map(x => parseInt(x, 10)).filter(x => x > 0).sort((a, b) => a - b).slice(0, 5);
      if (!levels.length) return toast('Indiquez au moins un délai de relance', true);
      mutate(() => {
        R.state(db);
        Object.assign(db.rules, {
          dueSoon: { on: on('dueSoon.on'), days: int('dueSoon.days', 0, 60) },
          overdue: { on: on('overdue.on'), levels },
          stock: { on: on('stock.on'), defaultMin: int('stock.defaultMin', 0, 1e6) },
          checks: { on: on('checks.on') },
          backup: { on: on('backup.on'), everyHours: int('backup.everyHours', 1, 720), keep: int('backup.keep', 2, 50) },
          exports: { ...db.rules.exports, on: on('exports.on'), everyDays: int('exports.everyDays', 1, 365) }
        });
        R.log(db, 'ok', 'Règles', 'Réglages des automatisations modifiés');
      }).then(() => toast('Règles enregistrées')).catch(() => {});
    }
    if (e.target.id === 'assignForm') {
      const rows = [...e.target.querySelectorAll('#assignRows tr')].map((tr, i) => ({ id: 'u' + i, contains: tr.querySelector('[name=contains]').value.trim().slice(0, 120), tierId: tr.querySelector('[name=tierId]').value, account: tr.querySelector('[name=account]').value }))
        .filter(r => r.contains);
      if (rows.some(r => !db.accounts.some(a => a.num === r.account))) return toast('Compte inconnu dans une règle', true);
      mutate(() => { R.state(db); db.rules.assign = rows; R.log(db, 'ok', 'Affectations', `${rows.length} règle(s) d'affectation enregistrée(s)`); }).then(() => toast('Affectations enregistrées')).catch(() => {});
    }
  });
  document.addEventListener('input', e => {
    if (e.target.id !== 'assignTest') return;
    const r = R.assign(db, e.target.value, '');
    $('#assignOut').textContent = e.target.value ? (r ? `→ ${r.account} · ${accLabel(r.account)} (règle « ${r.contains} »)` : '→ aucune règle : compte par défaut (604 ou 607)') : '';
  });
  document.addEventListener('change', e => { if (e.target.id === 'logf') go('automation', { f: e.target.value }); });

  window.addEventListener('compta:ready', () => { updateBell(); tick(); setInterval(tick, EVERY); });
  window.Automation = { tick, updateBell };
})();
