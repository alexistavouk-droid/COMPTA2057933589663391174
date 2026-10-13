// Tableaux de bord personnalisables : plusieurs tableaux (profils), blocs ajoutés, masqués, déplacés, redimensionnés.
// La disposition vit dans les préférences d'interface (prefs.js), jamais dans le dossier comptable.
(function () {
  const C = window.Charts, C3 = window.Charts3D, A = window.Analytics;
  const SIZES = [3, 4, 6, 8, 12];
  let editing = false, dragId = null;
  const undo = [];
  // pendant l'aperçu du panneau Personnaliser on travaille sur le brouillon, sinon sur les préférences enregistrées
  const dp = () => window.previewPrefs || prefs;
  const persist = () => { if (!window.previewPrefs) savePrefs(); };

  // Toutes les données du tableau de bord, calculées une fois par affichage
  function context() {
    const year = today().slice(0, 4), inc = L.income(db, year + '-01-01', today()), bal = L.balance(db);
    const solde = acc => (bal.find(b => b.acc === acc) || { solde: 0 }).solde;
    const open = k => db.docs.filter(d => d.kind === k && d.status === 'ISSUED');
    const due = k => open(k).reduce((s, d) => s + (d.totals.ttc - d.paid) * (d.type === 'CREDIT' ? -1 : 1), 0);
    const mo = L.monthly(db, year), cur = +today().slice(5, 7) - 1;
    const chargesBy = {};
    for (const b of inc.lignes.filter(b => /^6/.test(b.acc))) { const key = /^60[37]/.test(b.acc) ? 'Achats de marchandises' : /^64/.test(b.acc) ? 'Salaires et charges' : b.label; chargesBy[key] = (chargesBy[key] || 0) + b.solde; }
    const top = Object.entries(chargesBy).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]);
    const sales = db.docs.filter(d => d.kind === 'SALE' && d.totals && d.date.startsWith(year));
    const byClient = {};
    for (const d of sales) byClient[d.tierId] = (byClient[d.tierId] || 0) + d.totals.ht * (d.type === 'CREDIT' ? -1 : 1);
    // on compare le dernier mois complet au précédent : le mois en cours est forcément incomplet
    const prev = cur > 1 ? mo[cur - 2].produits : 0;
    return {
      year, inc, mo, cur, solde, due, treso: solde('512000') + solde('530000'),
      late: open('SALE').filter(d => d.due && d.due < today()),
      lowStock: db.products.filter(p => p.type === 'GOODS' && p.stock <= (p.min || 0)),
      stockVal: db.products.filter(p => p.type === 'GOODS').reduce((s, p) => s + Math.round(Math.max(p.stock, 0) * p.cost), 0),
      marge: sales.reduce((s, d) => s + (d.type === 'CREDIT' ? -1 : 1) * d.lines.reduce((m, l) => m + L.lineTotals(l).ht - Math.round(l.qty * (l.cost || 0)), 0), 0),
      charges: top.slice(0, 5).map(([label, value]) => ({ label, value })).concat(top.length > 5 ? [{ label: 'Autres', value: top.slice(5).reduce((s, x) => s + x[1], 0) }] : []),
      clients: Object.entries(byClient).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id, value]) => ({ label: tierName(id), value })),
      delta: prev ? Math.round((mo[cur - 1].produits - prev) / Math.abs(prev) * 100) : null
    };
  }

  const kpi = (label, cents, extra = '', cls = '') => `<div class="card kpi tilt ${cls}"><div class="k">${label}</div><div class="v" data-count="${cents}">${eur(cents)}</div>${extra}</div>`;
  const card = (title, sub, body, cls = '') => `<div class="card ${cls}"><div class="card-title">${title}<span class="k">${sub}</span></div>${body}</div>`;
  const plural = (n, w) => `${n} ${w}${n > 1 ? 's' : ''}`;

  // trace : la page qui détaille les données d'un indicateur
  const W = {
    treso: { title: 'Trésorerie disponible', size: 8, tall: true, trace: { v: 'ledger', p: { acc: '512000' } }, render: c => `<div class="card hero"><div class="hero-top"><div><div class="k">Trésorerie disponible</div><div class="v xl" data-count="${c.treso}">${eur(c.treso)}</div></div>
      <div class="chips"><span class="chip">Banque ${eur(c.solde('512000'))}</span><span class="chip">Caisse ${eur(c.solde('530000'))}</span></div></div>${C.area(c.mo, c.cur)}</div>` },
    kpi_ca: { title: 'Chiffre d\'affaires', size: 4, trace: { v: 'states' }, render: c => kpi('Chiffre d\'affaires HT', c.inc.produits, c.delta === null ? '' : `<div class="trend ${c.delta >= 0 ? 'up' : 'down'}">${c.delta >= 0 ? '▲' : '▼'} ${Math.abs(c.delta)} % en ${C.MONTHS[c.cur - 1]} vs ${C.MONTHS[c.cur - 2]}</div>`) },
    kpi_res: { title: 'Résultat', size: 4, trace: { v: 'states' }, render: c => kpi('Résultat de l\'exercice', c.inc.resultat, C.spark(c.mo.slice(0, c.cur + 1).reduce((a, m) => (a.push((a.at(-1) || 0) + m.produits - m.charges), a), [])), c.inc.resultat < 0 ? 'neg' : 'pos') },
    kpi_marge: { title: 'Marge brute', size: 3, trace: { v: 'tools', p: { t: 'customers' } }, render: c => kpi('Marge brute sur ventes', c.marge, c.inc.produits ? `<div class="meter"><i style="width:${Math.max(0, Math.min(100, c.marge / c.inc.produits * 100)).toFixed(0)}%"></i></div><div class="k">${Math.round(c.marge / c.inc.produits * 100)} % du CA</div>` : '') },
    kpi_due: { title: 'À encaisser', size: 3, trace: { v: 'tools', p: { t: 'aged' } }, render: c => kpi('À encaisser (clients)', c.due('SALE'), c.late.length ? `<div class="trend down">${plural(c.late.length, 'facture')} en retard</div>` : '<div class="trend up">Aucun retard</div>') },
    kpi_pay: { title: 'À payer', size: 3, trace: { v: 'purchases', p: { f: 'ISSUED' } }, render: c => kpi('À payer (fournisseurs)', c.due('PURCHASE')) },
    kpi_stock: { title: 'Valeur du stock', size: 3, trace: { v: 'tools', p: { t: 'stock' } }, render: c => kpi('Valeur du stock', c.stockVal, c.lowStock.length ? `<div class="trend down">${plural(c.lowStock.length, 'article')} sous le seuil</div>` : '') },
    vat: { title: 'TVA du mois', size: 3, trace: { v: 'vat' }, render: () => { const v = L.vat(db, today().slice(0, 7) + '-01', today()); return kpi('TVA nette du mois (estimation)', v.net, `<div class="k">Collectée ${eur(v.collectee)} · déductible ${eur(v.deductible)}</div>`); } },
    alerts: { title: 'Alertes et actions', size: 6, trace: { v: 'automation' }, render: () => {
      const a = db.automation || {}, notes = (a.notes || []).filter(n => !n.read), pend = (a.pending || []).filter(p => p.status === 'pending');
      return card('Alertes et actions à valider', plural(notes.length, 'alerte') + ' · ' + plural(pend.length, 'action'), notes.length || pend.length
        ? `<ul class="mini">${pend.slice(0, 3).map(p => `<li class="warn"><b>À valider</b> ${esc(p.title)}</li>`).join('')}${notes.slice(0, 5 - Math.min(3, pend.length)).map(n => `<li class="${n.level}">${esc(n.title)}</li>`).join('')}</ul>` : '<div class="empty small">Rien à signaler.</div>');
    } },
    favorites: { title: 'Mes raccourcis', size: 6, trace: null, render: () => card('Mes raccourcis', 'Alt + 1 à 9', dp().favorites.length
      ? `<div class="fav-grid">${dp().favorites.map((f, i) => `<button data-act="openFav" data-i="${i}"><kbd>${i < 9 ? 'Alt ' + (i + 1) : ''}</kbd>${esc(f.label)}</button>`).join('')}</div>`
      : '<div class="empty small">Ajoutez des favoris depuis « Personnaliser → Menu et favoris ».</div>') },
    bars3d: { title: 'Produits et charges en 3D', size: 12, trace: { v: 'states' }, render: c => card('Produits et charges par mois', '3D · ' + c.year, C3.bars(c.mo, c.cur), 'tilt soft') },
    columns: { title: 'Produits et charges (plat)', size: 12, trace: { v: 'states' }, render: c => card('Produits et charges par mois', c.year, C.columns(c.mo, c.cur)) },
    pie3d: { title: 'Charges en camembert 3D', size: 6, trace: { v: 'states' }, render: c => card('Où part l\'argent', '3D · charges ' + c.year, C3.pie(c.charges, 'Répartition des charges'), 'tilt soft') },
    donut: { title: 'Charges en anneau', size: 6, trace: { v: 'states' }, render: c => card('Où part l\'argent', 'charges ' + c.year, C.donut(c.charges, 'Charges')) },
    clients3d: { title: 'Clients en camembert 3D', size: 6, trace: { v: 'tools', p: { t: 'customers' } }, render: c => card('Part de chaque client', '3D · CA HT ' + c.year, C3.pie(c.clients, 'Chiffre d\'affaires par client'), 'tilt soft') },
    ranking: { title: 'Meilleurs clients', size: 6, trace: { v: 'tools', p: { t: 'customers' } }, render: c => card('Meilleurs clients', 'CA HT ' + c.year, C.ranking(c.clients)) },
    forecast: { title: 'Trésorerie à 90 jours', size: 6, trace: { v: 'tools', p: { t: 'forecast' } }, render: () => { const f = A.forecast(db, today()); return card('Trésorerie dans 90 jours', 'prévision', `<div class="v ${f.end < 0 ? 'neg' : ''}" data-count="${f.end}">${eur(f.end)}</div>${C.spark(f.points.map(p => p.cash))}<div class="k">Point bas ${eur(f.low.cash)} le ${fdate(f.low.date)}</div>`); } },
    seuil: { title: 'Seuil de rentabilité', size: 6, trace: { v: 'tools', p: { t: 'breakeven' } }, render: c => { const b = A.breakEven(db, c.year + '-01-01', today()), p = b.seuil ? Math.min(100, b.ca / b.seuil * 100) : 0; return card('Seuil de rentabilité', b.reached ? 'atteint' : Math.round(p) + ' %', `<div class="meter big"><i style="width:${p.toFixed(1)}%"></i></div><div class="k">CA ${eur(b.ca)} sur un seuil de ${b.seuil === null ? '—' : eur(b.seuil)}${b.date ? ' · point mort ' + fdate(b.date) : ''}</div>`); } },
    late: { title: 'Factures en retard', size: 12, trace: { v: 'sales', p: { f: 'LATE' } }, render: c => card('Factures clients en retard', plural(c.late.length, 'facture'), c.late.length ? docTable(c.late) : '<div class="empty small">Aucun retard de paiement.</div>', 'flat') },
    lowstock: { title: 'À réapprovisionner', size: 12, trace: { v: 'products' }, render: c => card('À réapprovisionner', plural(c.lowStock.length, 'article'), c.lowStock.length ? `<table><tr><th>Article</th><th class="n">Stock</th><th class="n">Seuil</th></tr>${c.lowStock.map(p => `<tr><td>${esc(p.label)}</td><td class="n neg">${p.stock}</td><td class="n">${p.min || 0}</td></tr>`).join('')}</table>` : '<div class="empty small">Tout est en stock.</div>', 'flat') }
  };

  const PROFILES = {
    bureau: { name: 'Bureau', desc: 'Le quotidien : trésorerie, encaissements, alertes, raccourcis', widgets: ['treso', 'kpi_ca', 'kpi_due', 'alerts', 'favorites', 'late', 'lowstock'] },
    compta: { name: 'Comptabilité', desc: 'Résultat, TVA, créances, dettes et contrôles', widgets: ['kpi_res', 'vat', 'kpi_due', 'kpi_pay', 'columns', 'pie3d', 'alerts', 'late'] },
    direction: { name: 'Direction', desc: 'Pilotage : chiffre d\'affaires, marge, prévisions, rentabilité', widgets: ['treso', 'kpi_ca', 'kpi_res', 'kpi_marge', 'vat', 'kpi_stock', 'bars3d', 'clients3d', 'forecast', 'seuil'] },
    perso: { name: 'Personnalisé', desc: 'Tous les indicateurs principaux, à arranger à votre goût', widgets: ['treso', 'kpi_ca', 'kpi_res', 'kpi_marge', 'kpi_due', 'kpi_pay', 'kpi_stock', 'bars3d', 'pie3d', 'ranking', 'forecast', 'seuil', 'late', 'lowstock'] }
  };
  const fromProfile = (key, name, id) => ({ id: id || 'd' + Date.now().toString(36), name: name || PROFILES[key].name, profile: key, widgets: PROFILES[key].widgets.map(w => ({ id: w, size: W[w].size, tall: !!W[w].tall })) });

  // Premier lancement : un tableau « Principal » ; un ancien tableau stocké dans le dossier (v1) est repris
  function dashboards() {
    if (!dp().dashboards.length) {
      const d = fromProfile('perso', 'Principal', 'main');
      if (window.legacyDash) d.widgets = window.legacyDash.filter(w => W[w.id]).map(w => ({ id: w.id, size: SIZES.includes(w.size) ? w.size : W[w.id].size, tall: !!W[w.id].tall }));
      dp().dashboards = [d]; dp().activeDash = d.id; persist();
    }
    return dp().dashboards;
  }
  const active = () => { const list = dashboards(); return list.find(d => d.id === dp().activeDash) || list[0]; };
  const widgets = () => active().widgets.filter(w => W[w.id]);

  // Toute modification de disposition : mémorisée pour « Annuler », enregistrée aussitôt
  function change(fn) {
    undo.push(JSON.stringify(dp().dashboards)); if (undo.length > 30) undo.shift();
    fn(active());
    persist(); render();
  }

  views.dashboard = () => {
    const hello = new Date().getHours() < 18 ? 'Bonjour' : 'Bonsoir';
    if (!db.docs.length && !db.entries.length) return `<div class="hero-empty"><div class="orb"></div><h1>${hello} et bienvenue</h1>
      <p class="sub">Votre dossier est vide. Créez vos premiers clients et factures, ou explorez une boutique fictive déjà remplie pour voir tous les graphiques en action.</p>
      <div class="bar" style="justify-content:center"><button class="primary big" data-act="demo">Explorer la démo</button><button class="big" data-act="go" data-v="settings">Configurer ma société</button></div></div>`;
    const c = context(), d = active(), list = widgets(), hidden = Object.keys(W).filter(id => !list.some(w => w.id === id));
    const tools = (w, i) => `<div class="w-tools"><span class="w-name">⠿ ${W[w.id].title}</span>
      <button data-act="dashMove" data-i="${i}" data-d="-1" aria-label="Avancer ${W[w.id].title}">←</button><button data-act="dashMove" data-i="${i}" data-d="1" aria-label="Reculer ${W[w.id].title}">→</button>
      <button data-act="dashSize" data-i="${i}" aria-label="Largeur de ${W[w.id].title}">${w.size}/12</button><button data-act="dashTall" data-i="${i}" aria-label="Hauteur de ${W[w.id].title}" aria-pressed="${w.tall}">${w.tall ? '↕ haut' : '↕'}</button>
      <button data-act="dashHide" data-i="${i}" class="danger" aria-label="Masquer ${W[w.id].title}">✕</button></div>`;
    const tabs = `<div class="dash-tabs" role="tablist">${dashboards().map(x => `<button role="tab" aria-selected="${x.id === d.id}" class="${x.id === d.id ? 'on' : ''}" data-act="dashOpen" data-id="${esc(x.id)}">${esc(x.name)}</button>`).join('')}
      <button class="add" data-act="dashNew" aria-label="Nouveau tableau de bord">+ Nouveau</button></div>`;
    return `<header class="dash-head"><div><h1>${hello}${db.company.name ? ', ' + esc(db.company.name) : ''}</h1><p class="sub">Exercice ${c.year} · situation au ${fdate(today())}</p></div>
      <div class="bar">${editing ? `<button data-act="dashUndo" ${undo.length ? '' : 'disabled'}>↶ Annuler</button><button data-act="dashRename">Renommer</button><button data-act="dashDuplicate">Dupliquer</button><button data-act="dashDelete" class="danger" ${dashboards().length > 1 ? '' : 'disabled'}>Supprimer</button><button data-act="dashReset">Réinitialiser</button><button class="primary" data-act="dashEdit">Terminé</button>`
        : '<button data-act="dashEdit">Modifier la disposition</button><button data-act="newDoc" data-kind="SALE" data-type="INVOICE" class="primary">+ Facture</button><button data-act="newDoc" data-kind="PURCHASE" data-type="INVOICE">+ Achat</button>'}</div></header>
    ${tabs}
    ${editing ? `<div class="dash-add"><b>Ajouter un bloc :</b> ${hidden.length ? hidden.map(id => `<button class="chip-btn" data-act="dashAdd" data-id="${id}">+ ${W[id].title}</button>`).join('') : '<span class="k">tous les blocs sont affichés</span>'}<span class="k">Glissez-déposez les blocs, ou utilisez ← → au clavier. Ctrl + Z annule.</span></div>` : ''}
    <div class="dash ${editing ? 'editing' : ''}">${list.map((w, i) => `<section class="w span-${w.size}${w.tall && w.size < 12 ? ' rows-2' : ''}" data-i="${i}" ${editing ? 'draggable="true"' : ''}>${editing ? tools(w, i) : W[w.id].trace ? `<button class="trace" data-act="trace" data-id="${w.id}" title="Voir les données qui composent cet indicateur" aria-label="Détail : ${W[w.id].title}">↗</button>` : ''}${W[w.id].render(c)}</section>`).join('')}</div>`;
  };

  const at = (l, i) => l.findIndex(w => w === widgets()[i]);
  Object.assign(actions, {
    dashEdit: () => { editing = !editing; render(); },
    dashOpen: ({ id }) => { dp().activeDash = id; persist(); render(); },
    dashNew: () => {
      const keys = Object.keys(PROFILES);
      const pick = prompt('Nouveau tableau de bord. Choisissez un profil :\n' + keys.map((k, i) => `${i + 1}. ${PROFILES[k].name} : ${PROFILES[k].desc}`).join('\n'), '1');
      const k = keys[Number(pick) - 1];
      if (!k) return;
      if (dp().dashboards.length >= 10) return toast('10 tableaux de bord au maximum', true);
      undo.push(JSON.stringify(dp().dashboards));
      const d = fromProfile(k, PROFILES[k].name + (dp().dashboards.some(x => x.name === PROFILES[k].name) ? ' 2' : ''));
      dp().dashboards.push(d); dp().activeDash = d.id; persist(); render(); toast(`Tableau « ${d.name} » créé`);
    },
    dashRename: () => { const n = prompt('Nom du tableau de bord :', active().name); if (n && n.trim()) change(d => { d.name = n.trim().slice(0, 40); }); },
    dashDuplicate: () => { undo.push(JSON.stringify(dp().dashboards)); const d = { ...JSON.parse(JSON.stringify(active())), id: 'd' + Date.now().toString(36), name: active().name + ' (copie)' }; dp().dashboards.push(d); dp().activeDash = d.id; persist(); render(); },
    dashDelete: () => {
      if (dp().dashboards.length < 2 || !confirm(`Supprimer le tableau « ${active().name} » ? (Annuler reste possible)`)) return;
      undo.push(JSON.stringify(dp().dashboards)); dp().dashboards = dp().dashboards.filter(d => d.id !== active().id); dp().activeDash = dp().dashboards[0].id; persist(); render();
    },
    dashUndo: () => { if (!undo.length) return; dp().dashboards = JSON.parse(undo.pop()); persist(); render(); toast('Modification annulée'); },
    dashReset: () => { if (confirm(`Remettre « ${active().name} » dans sa disposition de profil ?`)) change(d => { d.widgets = fromProfile(d.profile in PROFILES ? d.profile : 'perso').widgets; }); },
    dashAdd: ({ id }) => change(d => d.widgets.push({ id, size: W[id].size, tall: !!W[id].tall })),
    dashHide: ({ i }) => change(d => { d.widgets.splice(at(d.widgets, +i), 1); }),
    dashSize: ({ i }) => change(d => { const w = d.widgets[at(d.widgets, +i)]; w.size = SIZES[(SIZES.indexOf(w.size) + 1) % SIZES.length]; }),
    dashTall: ({ i }) => change(d => { const w = d.widgets[at(d.widgets, +i)]; w.tall = !w.tall; }),
    dashMove: ({ i, d: dir }) => change(d => { const a = at(d.widgets, +i), b = at(d.widgets, +i + +dir); if (a < 0 || b < 0) return; [d.widgets[a], d.widgets[b]] = [d.widgets[b], d.widgets[a]]; }),
    trace: ({ id }) => { const t = W[id].trace; go(t.v, t.p || {}); },
    openFav: ({ i }) => openFavorite(+i)
  });

  window.openFavorite = i => { const f = dp().favorites[i]; if (!f) return; f.type === 'tool' ? go('tools', { t: f.id }) : go(f.id); };
  window.Dashboards = { W, PROFILES };

  // Raccourcis : Alt + 1..9 ouvre un favori ; Ctrl + Z annule une modification de disposition
  document.addEventListener('keydown', e => {
    if (e.altKey && !e.ctrlKey && /^[1-9]$/.test(e.key) && dp().favorites[+e.key - 1]) { e.preventDefault(); openFavorite(+e.key - 1); }
    if (editing && view === 'dashboard' && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); actions.dashUndo(); }
  });

  // Glisser-déposer en mode disposition (souris) ; au clavier et au toucher, les boutons ← → font la même chose
  document.addEventListener('dragstart', e => { const s = e.target.closest && e.target.closest('.dash.editing .w'); if (s) { dragId = +s.dataset.i; s.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; } });
  document.addEventListener('dragend', () => document.querySelectorAll('.w.dragging,.w.over').forEach(x => x.classList.remove('dragging', 'over')));
  document.addEventListener('dragover', e => { const s = e.target.closest && e.target.closest('.dash.editing .w'); if (s && dragId !== null) { e.preventDefault(); document.querySelectorAll('.w.over').forEach(x => x.classList.remove('over')); s.classList.add('over'); } });
  document.addEventListener('drop', e => {
    const s = e.target.closest && e.target.closest('.dash.editing .w');
    if (!s || dragId === null) return;
    e.preventDefault();
    const from = dragId, to = +s.dataset.i; dragId = null;
    if (from !== to) change(d => { const l = widgets(), moved = l[from], target = l[to]; d.widgets.splice(d.widgets.indexOf(moved), 1); d.widgets.splice(d.widgets.indexOf(target) + (from < to ? 1 : 0), 0, moved); });
  });

  // Effet de relief : la carte s'incline légèrement vers le pointeur
  document.addEventListener('pointermove', e => {
    const t = e.target.closest && e.target.closest('.dash:not(.editing) .tilt');
    document.querySelectorAll('.tilt.tilting').forEach(x => { if (x !== t) { x.classList.remove('tilting'); x.style.removeProperty('--rx'); x.style.removeProperty('--ry'); } });
    if (!t || motionReduced() || e.pointerType !== 'mouse') return;
    const r = t.getBoundingClientRect(), max = t.classList.contains('soft') ? 3 : 6;
    t.classList.add('tilting');
    t.style.setProperty('--ry', (((e.clientX - r.left) / r.width - 0.5) * max * 2).toFixed(2) + 'deg');
    t.style.setProperty('--rx', ((0.5 - (e.clientY - r.top) / r.height) * max * 2).toFixed(2) + 'deg');
  });
})();
