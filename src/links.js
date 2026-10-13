// Liaisons entre modules : fiche tiers, mouvements de stock, rapprochement bancaire, contrôles de TVA, historique des sauvegardes.
(function () {
  const sign = d => d.type === 'CREDIT' ? -1 : 1;
  const plural = (n, w) => `${n} ${w}${n > 1 ? 's' : ''}`;

  /* ---------- Fiche tiers : coordonnées, solde, échéances, documents, règlements ---------- */
  views.tier = () => {
    const t = db.tiers.find(x => x.id === param.id);
    if (!t) return '<div class="empty">Tiers introuvable.</div>';
    const docs = db.docs.filter(d => d.tierId === t.id).sort((a, b) => b.date.localeCompare(a.date));
    const open = docs.filter(d => d.status === 'ISSUED');
    const pays = db.payments.filter(p => docs.some(d => d.id === p.docId)).sort((a, b) => b.date.localeCompare(a.date));
    const lines = db.entries.flatMap(e => e.lines.filter(l => l.tier === t.code).map(l => ({ e, l }))).sort((a, b) => a.e.date.localeCompare(b.e.date));
    const sens = t.type === 'F' ? -1 : 1;
    const balance = lines.reduce((s, x) => s + x.l.debit - x.l.credit, 0) * sens;
    const late = open.filter(d => d.due && d.due < today());
    const ca = docs.filter(d => d.totals && d.date.startsWith(today().slice(0, 4))).reduce((s, d) => s + d.totals.ht * sign(d), 0);
    return `<h1>${esc(t.name)}</h1><p class="sub">${t.type === 'C' ? 'Client' : 'Fournisseur'} ${t.code}${t.siren ? ' · SIREN ' + esc(t.siren) : ''}${t.email ? ' · ' + esc(t.email) : ''}${t.address ? ' · ' + esc(t.address) : ''}</p>
    <div class="bar"><button data-act="go" data-v="tiers">← Clients &amp; fournisseurs</button><button data-act="tierForm" data-id="${t.id}">Modifier les coordonnées</button>
      <button data-act="newDocFor" data-kind="${t.type === 'C' ? 'SALE' : 'PURCHASE'}" data-tier="${t.id}" class="primary">+ ${t.type === 'C' ? 'Facture' : 'Facture d\'achat'}</button>
      <button data-act="ledger" data-acc="${t.type === 'C' ? '411000' : '401000'}">Compte ${t.type === 'C' ? '411' : '401'} au grand livre</button></div>
    <div class="cards"><div class="card kpi"><div class="k">Solde comptable ${t.type === 'C' ? '(nous doit)' : '(nous lui devons)'}</div><div class="v ${balance > 0 && late.length ? 'neg' : ''}">${eur(balance)}</div></div>
      <div class="card kpi"><div class="k">Factures à régler</div><div class="v">${open.length}</div>${late.length ? `<div class="trend down">${plural(late.length, 'en retard')}</div>` : ''}</div>
      <div class="card kpi"><div class="k">${t.type === 'C' ? 'Chiffre d\'affaires' : 'Achats'} HT de l'année</div><div class="v">${eur(ca)}</div></div>
      <div class="card kpi"><div class="k">Délai de paiement convenu</div><div class="v">${t.terms ?? 30} j</div></div></div>
    <h2>Échéances ouvertes</h2>${open.length ? `<table><tr><th>Pièce</th><th>Échéance</th><th class="n">Montant TTC</th><th class="n">Déjà réglé</th><th class="n">Reste dû</th><th>Statut</th></tr>
      ${open.sort((a, b) => (a.due || '').localeCompare(b.due || '')).map(d => `<tr class="click" data-act="docForm" data-id="${d.id}"><td>${d.number}</td><td>${fdate(d.due)}</td><td class="n">${eur(d.totals.ttc * sign(d))}</td><td class="n">${eur(d.paid * sign(d))}</td><td class="n">${eur((d.totals.ttc - d.paid) * sign(d))}</td><td>${pill(d)}</td></tr>`).join('')}</table>` : '<div class="empty small">Aucune échéance ouverte.</div>'}
    <h2>Documents</h2>${docs.length ? docTable(docs) : '<div class="empty small">Aucun document.</div>'}
    <h2>Règlements</h2>${pays.length ? `<table><tr><th>Date</th><th>Pièce</th><th>Mode</th><th class="n">Montant</th></tr>${pays.map(p => { const d = db.docs.find(x => x.id === p.docId); return `<tr class="click" data-act="docForm" data-id="${d.id}"><td>${fdate(p.date)}</td><td>${d.number}</td><td>${METHOD[p.method]}</td><td class="n">${eur(p.amount)}</td></tr>`; }).join('')}</table>` : '<div class="empty small">Aucun règlement.</div>'}
    <h2>Historique comptable du tiers</h2>${lines.length ? (() => { let run = 0; return `<table><tr><th>Date</th><th>Jnl</th><th>Pièce</th><th>Libellé</th><th class="n">Débit</th><th class="n">Crédit</th><th class="n">Solde</th></tr>${lines.map(({ e, l }) => { run += (l.debit - l.credit) * sens; return `<tr><td>${fdate(e.date)}</td><td>${e.journal}</td><td>${esc(e.ref)}</td><td>${esc(l.label || e.label)}</td><td class="n">${l.debit ? eur(l.debit) : ''}</td><td class="n">${l.credit ? eur(l.credit) : ''}</td><td class="n">${eur(run)}</td></tr>`; }).join('')}</table>`; })() : '<div class="empty small">Aucune écriture.</div>'}`;
  };

  /* ---------- Mouvements de stock ---------- */
  views.movements = () => {
    const pid = param.pid || '';
    const list = (db.movements || []).filter(m => !pid || m.productId === pid).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 500);
    const KINDS = { SALE: 'Vente', PURCHASE: 'Achat', ADJUST: 'Ajustement' };
    const p = id => db.products.find(x => x.id === id) || {};
    return `<h1>Mouvements de stock</h1><p class="sub">Chaque entrée et sortie, reliée à sa facture ou à son motif d'inventaire. Un mouvement n'est jamais enregistré deux fois pour la même ligne de document.</p>
    <div class="bar"><button data-act="go" data-v="products">← Articles &amp; stock</button><select id="mvp" style="max-width:260px"><option value="">Tous les articles</option>${db.products.filter(x => x.type === 'GOODS').map(x => `<option value="${x.id}" ${x.id === pid ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}</select></div>
    ${list.length ? `<table><tr><th>Date</th><th>Article</th><th>Type</th><th>Pièce / motif</th><th class="n">Quantité</th><th class="n">Coût unitaire</th><th class="n">Stock après</th></tr>
    ${list.map(m => { const d = db.docs.find(x => x.id === m.docId); return `<tr><td>${fdate(m.date)}</td><td>${esc(p(m.productId).label || '?')}</td><td>${KINDS[m.kind] || m.kind}</td><td>${d ? `<button class="link" data-act="docForm" data-id="${d.id}">${esc(d.number)} ↗</button>` : esc(m.reason)}</td><td class="n ${m.qty < 0 ? 'neg' : 'pos'}">${m.qty > 0 ? '+' : ''}${m.qty}</td><td class="n">${eur(m.unitCost)}</td><td class="n">${m.stockAfter ?? '—'}</td></tr>`; }).join('')}</table>` : '<div class="empty">Aucun mouvement.</div>'}`;
  };

  /* ---------- Rapprochement bancaire et doublons ---------- */
  views.reconcile = () => {
    const rec = db.reconciled || {};
    const rows = db.entries.flatMap(e => e.lines.filter(l => l.acc === '512000').map((l, i) => ({ key: e.id + ':' + i, e, l, amt: l.debit - l.credit }))).sort((a, b) => b.e.date.localeCompare(a.e.date));
    const stmt = db.bankStatement || { date: today(), balance: 0 };
    const pointed = rows.filter(r => rec[r.key]).reduce((s, r) => s + r.amt, 0);
    const diff = stmt.balance - pointed;
    // doublons possibles : même date, même montant, même libellé sur la banque
    const seen = {}, dups = [];
    for (const r of rows) { const k = r.e.date + '|' + r.amt + '|' + (r.l.label || r.e.label); if (seen[k]) dups.push(r); else seen[k] = r; }
    return `<h1>Rapprochement bancaire</h1><p class="sub">Cochez les opérations qui figurent sur votre relevé. L'écart entre le solde du relevé et le total pointé doit être nul ; sinon, une opération manque d'un côté ou de l'autre.</p>
    <div class="bar"><button data-act="go" data-v="treasury">← Trésorerie</button></div>
    <div class="card"><form id="stmtForm" class="grid"><label>Date du relevé<input type="date" name="date" value="${stmt.date}" required></label><label>Solde du relevé (€)<input name="balance" value="${(stmt.balance / 100).toFixed(2).replace('.', ',')}" required></label><label>&nbsp;<button class="primary">Mettre à jour</button></label></form></div>
    <div class="cards" style="margin-top:14px"><div class="card kpi"><div class="k">Solde du relevé</div><div class="v">${eur(stmt.balance)}</div></div><div class="card kpi"><div class="k">Total pointé en comptabilité</div><div class="v">${eur(pointed)}</div></div>
      <div class="card kpi ${diff ? 'neg' : 'pos'}"><div class="k">Écart</div><div class="v">${eur(diff)}</div><div class="trend ${diff ? 'down' : 'up'}">${diff ? 'À expliquer' : 'Rapprochement équilibré'}</div></div>
      <div class="card kpi"><div class="k">Non pointées</div><div class="v">${rows.filter(r => !rec[r.key]).length}</div></div></div>
    ${dups.length ? `<div class="alert">${plural(dups.length, 'opération')} en double possible (même date, même montant, même libellé) : ${dups.slice(0, 5).map(r => fdate(r.e.date) + ' ' + eur(r.amt)).join(', ')}. Vérifiez avant de pointer.</div>` : ''}
    <h2>Opérations du compte 512</h2>${rows.length ? `<table><tr><th>Pointée</th><th>Date</th><th>Pièce</th><th>Libellé</th><th class="n">Montant</th></tr>
    ${rows.slice(0, 400).map(r => `<tr><td><input type="checkbox" class="rec" data-key="${r.key}" ${rec[r.key] ? 'checked' : ''} aria-label="Pointer l'opération du ${fdate(r.e.date)}"></td><td>${fdate(r.e.date)}</td><td>${esc(r.e.ref)}</td><td>${esc(r.l.label || r.e.label)}</td><td class="n ${r.amt < 0 ? 'neg' : 'pos'}">${eur(r.amt)}</td></tr>`).join('')}</table>` : '<div class="empty">Aucune opération bancaire.</div>'}`;
  };

  /* ---------- TVA : montants, concordance documents / comptabilité, anomalies ---------- */
  views.vat = () => {
    const m = today().slice(0, 7);
    const from = param.from ?? m + '-01', to = param.to ?? today();
    const v = L.vat(db, from, to);
    const done = db.entries.filter(e => e.src === 'VAT');
    const inP = d => d.totals && d.status !== 'DRAFT' && d.date >= from && d.date <= to;
    const docSale = db.docs.filter(d => d.kind === 'SALE' && inP(d)), docBuy = db.docs.filter(d => d.kind === 'PURCHASE' && inP(d));
    const fromDocs = { collectee: docSale.reduce((s, d) => s + d.totals.tva * sign(d), 0), deductible: docBuy.reduce((s, d) => s + d.totals.tva * sign(d), 0) };
    const byRate = {};
    for (const d of docSale) for (const l of d.lines) { const t = L.lineTotals(l), r = byRate[l.vat] || (byRate[l.vat] = { ht: 0, tva: 0 }); r.ht += t.ht * sign(d); r.tva += t.tva * sign(d); }
    const issues = [];
    if (fromDocs.collectee !== v.collectee) issues.push(`TVA collectée : ${eur(fromDocs.collectee)} sur les factures, ${eur(v.collectee)} en comptabilité (écritures manuelles sur le 445710 ?)`);
    if (fromDocs.deductible !== v.deductible) issues.push(`TVA déductible : ${eur(fromDocs.deductible)} sur les factures d'achat, ${eur(v.deductible)} en comptabilité`);
    const zero = docSale.filter(d => d.lines.some(l => !l.vat));
    if (zero.length) issues.push(`${plural(zero.length, 'facture')} de vente avec une ligne à 0 % : vérifiez l'exonération et sa mention obligatoire (${zero.slice(0, 3).map(d => d.number).join(', ')})`);
    const odd = docSale.concat(docBuy).filter(d => d.lines.some(l => ![20, 10, 5.5, 2.1, 0].includes(l.vat)));
    if (odd.length) issues.push(`${plural(odd.length, 'document')} avec un taux non standard`);
    const noRef = docBuy.filter(d => !d.ref);
    if (noRef.length) issues.push(`${plural(noRef.length, 'facture')} d'achat sans numéro de facture fournisseur : justificatif à rapprocher`);
    const drafts = db.docs.filter(d => d.status === 'DRAFT' && ['INVOICE', 'CREDIT'].includes(d.type) && d.date >= from && d.date <= to);
    if (drafts.length) issues.push(`${plural(drafts.length, 'facture')} encore en brouillon sur la période : non comptée(s)`);
    return `<h1>TVA</h1><p class="sub">TVA sur les débits (à la facture), calculée à partir des factures émises et de la comptabilité.</p>
    <div class="alert info">Estimation d'aide à la déclaration : ces montants ne constituent pas une déclaration fiscale validée. Vérifiez-les et déclarez sur impots.gouv.fr (ou faites-les contrôler par votre expert-comptable).</div>
    <div class="bar" style="margin-top:14px">${period(from, to)}</div>
    <div class="cards"><div class="card"><div class="k">TVA collectée (ligne 16)</div><div class="v">${eur(v.collectee)}</div></div>
    <div class="card"><div class="k">TVA déductible (ligne 20)</div><div class="v">${eur(v.deductible)}</div></div>
    <div class="card"><div class="k">${v.net >= 0 ? 'TVA nette due (ligne 28)' : 'Crédit de TVA (ligne 25)'}</div><div class="v">${eur(Math.abs(v.net))}</div></div></div>
    <h2>Ventes par taux</h2>${Object.keys(byRate).length ? `<table><tr><th>Taux</th><th class="n">Base HT</th><th class="n">TVA</th><th class="n">TTC</th></tr>${Object.entries(byRate).sort((a, b) => b[0] - a[0]).map(([r, x]) => `<tr><td>${String(r).replace('.', ',')} %</td><td class="n">${eur(x.ht)}</td><td class="n">${eur(x.tva)}</td><td class="n">${eur(x.ht + x.tva)}</td></tr>`).join('')}</table>` : '<div class="empty small">Aucune vente sur la période.</div>'}
    <h2>Contrôles</h2>${issues.length ? `<ul class="checks">${issues.map((x, i) => `<li class="warn" style="--i:${i}"><span class="dot"></span><div><b>${esc(x)}</b></div></li>`).join('')}</ul>` : '<ul class="checks"><li class="ok"><span class="dot"></span><div><b>Factures et comptabilité concordent</b><small>Aucune anomalie détectée sur la période.</small></div></li></ul>'}
    <div class="bar" style="margin-top:16px"><button class="primary" data-act="settleVat">Passer l'écriture de liquidation</button><span class="k">Écriture irréversible : à faire après vérification, une fois la déclaration déposée.</span></div>
    <h2>Liquidations passées</h2>${done.length ? `<table><tr><th>Date</th><th>Libellé</th></tr>${done.map(e => `<tr><td>${fdate(e.date)}</td><td>${esc(e.label)}</td></tr>`).join('')}</table>` : '<div class="empty small">Aucune.</div>'}`;
  };

  /* ---------- Historique des sauvegardes ---------- */
  views.backups = () => {
    setTimeout(async () => {
      const box = $('#snaps');
      if (!box) return;
      try {
        const list = await window.api.listSnapshots();
        box.innerHTML = list.length ? `<table><tr><th>Date</th><th>Origine</th><th class="n">Taille</th><th></th></tr>${list.map(s => `<tr><td>${new Date(s.at).toLocaleString('fr-FR')}</td><td>${esc(s.label)}</td><td class="n">${Math.round(s.size / 1024)} Ko</td><td><button class="link" data-act="restoreSnapshot" data-id="${esc(s.id)}">Restaurer…</button></td></tr>`).join('')}</table>` : '<div class="empty small">Aucune sauvegarde automatique pour l\'instant.</div>';
      } catch (e) { box.innerHTML = `<div class="alert">${esc(e.message)}</div>`; }
    });
    const desktop = window.api.platform === 'desktop';
    return `<h1>Sauvegardes</h1><p class="sub">${desktop ? 'Sauvegardes automatiques dans le dossier de l\'application, avec rotation.' : 'Sur le site, les sauvegardes automatiques sont gardées dans ce navigateur (8 au plus). Exportez régulièrement un fichier : vider le navigateur les efface.'} Une copie de sécurité est aussi faite avant chaque restauration, chargement de démo ou effacement.</p>
    <div class="bar">${db ? '<button class="primary" data-act="backup">Exporter une sauvegarde (.json)</button><button data-act="snapshotNow">Sauvegarde automatique maintenant</button>' : ''}<button data-act="restore">Restaurer depuis un fichier…</button></div>
    <h2>Historique</h2><div id="snaps"><div class="empty small">Chargement…</div></div>`;
  };

  Object.assign(actions, {
    tierSheet: ({ id }) => go('tier', { id }),
    newDocFor: ({ kind, tier }) => { const t = db.tiers.find(x => x.id === tier); docForm({ doc: { id: '', kind, type: 'INVOICE', status: 'DRAFT', date: today(), due: addDays(today(), t.terms ?? 30), tierId: t.id, lines: [], globalDisc: 0, ref: '', notes: '' } }); },
    async snapshotNow() { try { await window.api.snapshot(Store.envelope(db, APP_VERSION), 'Manuelle'); db.automation = db.automation || {}; db.automation.lastBackup = new Date().toISOString(); Rules.log(db, 'ok', 'Sauvegarde', 'Sauvegarde automatique déclenchée à la main'); await save(); render(); toast('Sauvegarde enregistrée'); } catch (e) { toast(e.message, true); } }
  });

  document.addEventListener('change', e => {
    if (e.target.id === 'mvp') go('movements', { pid: e.target.value });
    if (e.target.classList.contains('rec')) {
      const k = e.target.dataset.key, on = e.target.checked;
      mutate(() => { db.reconciled = db.reconciled || {}; if (on) db.reconciled[k] = today(); else delete db.reconciled[k]; }).catch(() => {});
    }
  });
  document.addEventListener('submit', e => {
    if (e.target.id !== 'stmtForm') return;
    const v = fd(e.target);
    mutate(() => { db.bankStatement = { date: v.date, balance: parseEur(v.balance) }; }).catch(() => {});
  });
})();
