// Tableau de bord personnalisable : chaque bloc (widget) peut être ajouté, masqué, déplacé et redimensionné.
(function () {
  const C = window.Charts, C3 = window.Charts3D, A = window.Analytics;
  const SIZES = [3, 4, 6, 8, 12];
  let editing = false, dragId = null;

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
    const byClient = {};
    for (const d of db.docs) if (d.kind === 'SALE' && d.totals && d.date.startsWith(year)) byClient[d.tierId] = (byClient[d.tierId] || 0) + d.totals.ht * (d.type === 'CREDIT' ? -1 : 1);
    // on compare le dernier mois complet au précédent : le mois en cours est forcément incomplet
    const prev = cur > 1 ? mo[cur - 2].produits : 0;
    return {
      year, inc, mo, cur, solde, due, treso: solde('512000') + solde('530000'),
      late: open('SALE').filter(d => d.due && d.due < today()),
      lowStock: db.products.filter(p => p.type === 'GOODS' && p.stock <= (p.min || 0)),
      stockVal: db.products.filter(p => p.type === 'GOODS').reduce((s, p) => s + Math.round(Math.max(p.stock, 0) * p.cost), 0),
      marge: db.docs.filter(d => d.kind === 'SALE' && d.totals).reduce((s, d) => s + (d.type === 'CREDIT' ? -1 : 1) * d.lines.reduce((m, l) => m + L.lineTotals(l).ht - Math.round(l.qty * (l.cost || 0)), 0), 0),
      charges: top.slice(0, 5).map(([label, value]) => ({ label, value })).concat(top.length > 5 ? [{ label: 'Autres', value: top.slice(5).reduce((s, x) => s + x[1], 0) }] : []),
      clients: Object.entries(byClient).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id, value]) => ({ label: tierName(id), value })),
      delta: prev ? Math.round((mo[cur - 1].produits - prev) / Math.abs(prev) * 100) : null
    };
  }

  const kpi = (label, cents, extra = '', cls = '') => `<div class="card kpi tilt ${cls}"><div class="k">${label}</div><div class="v" data-count="${cents}">${eur(cents)}</div>${extra}</div>`;
  const card = (title, sub, body, cls = '') => `<div class="card ${cls}"><div class="card-title">${title}<span class="k">${sub}</span></div>${body}</div>`;
  const plural = (n, w) => `${n} ${w}${n > 1 ? 's' : ''}`;

  const W = {
    treso: { title: 'Trésorerie disponible', size: 8, rows: 2, render: c => `<div class="card hero"><div class="hero-top"><div><div class="k">Trésorerie disponible</div><div class="v xl" data-count="${c.treso}">${eur(c.treso)}</div></div>
      <div class="chips"><span class="chip">Banque ${eur(c.solde('512000'))}</span><span class="chip">Caisse ${eur(c.solde('530000'))}</span></div></div>${C.area(c.mo, c.cur)}</div>` },
    kpi_ca: { title: 'Chiffre d\'affaires', size: 4, render: c => kpi('Chiffre d\'affaires HT', c.inc.produits, c.delta === null ? '' : `<div class="trend ${c.delta >= 0 ? 'up' : 'down'}">${c.delta >= 0 ? '▲' : '▼'} ${Math.abs(c.delta)} % en ${C.MONTHS[c.cur - 1]} vs ${C.MONTHS[c.cur - 2]}</div>`) },
    kpi_res: { title: 'Résultat', size: 4, render: c => kpi('Résultat de l\'exercice', c.inc.resultat, C.spark(c.mo.slice(0, c.cur + 1).reduce((a, m) => (a.push((a.at(-1) || 0) + m.produits - m.charges), a), [])), c.inc.resultat < 0 ? 'neg' : 'pos') },
    kpi_marge: { title: 'Marge brute', size: 3, render: c => kpi('Marge brute sur ventes', c.marge, c.inc.produits ? `<div class="meter"><i style="width:${Math.max(0, Math.min(100, c.marge / c.inc.produits * 100)).toFixed(0)}%"></i></div><div class="k">${Math.round(c.marge / c.inc.produits * 100)} % du CA</div>` : '') },
    kpi_due: { title: 'À encaisser', size: 3, render: c => kpi('À encaisser (clients)', c.due('SALE'), c.late.length ? `<div class="trend down">${plural(c.late.length, 'facture')} en retard</div>` : '<div class="trend up">Aucun retard</div>') },
    kpi_pay: { title: 'À payer', size: 3, render: c => kpi('À payer (fournisseurs)', c.due('PURCHASE')) },
    kpi_stock: { title: 'Valeur du stock', size: 3, render: c => kpi('Valeur du stock', c.stockVal, c.lowStock.length ? `<div class="trend down">${plural(c.lowStock.length, 'article')} sous le seuil</div>` : '') },
    bars3d: { title: 'Produits et charges en 3D', size: 12, render: c => card('Produits et charges par mois', '3D · ' + c.year, C3.bars(c.mo, c.cur), 'tilt soft') },
    columns: { title: 'Produits et charges (plat)', size: 12, render: c => card('Produits et charges par mois', c.year, C.columns(c.mo, c.cur)) },
    pie3d: { title: 'Charges en camembert 3D', size: 6, render: c => card('Où part l\'argent', '3D · charges ' + c.year, C3.pie(c.charges, 'Répartition des charges'), 'tilt soft') },
    donut: { title: 'Charges en anneau', size: 6, render: c => card('Où part l\'argent', 'charges ' + c.year, C.donut(c.charges, 'Charges')) },
    clients3d: { title: 'Clients en camembert 3D', size: 6, render: c => card('Part de chaque client', '3D · CA HT ' + c.year, C3.pie(c.clients, 'Chiffre d\'affaires par client'), 'tilt soft') },
    ranking: { title: 'Meilleurs clients', size: 6, render: c => card('Meilleurs clients', 'CA HT ' + c.year, C.ranking(c.clients)) },
    forecast: { title: 'Trésorerie à 90 jours', size: 6, render: () => { const f = A.forecast(db, today()); return card('Trésorerie dans 90 jours', 'prévision', `<div class="v ${f.end < 0 ? 'neg' : ''}" data-count="${f.end}">${eur(f.end)}</div>${C.spark(f.points.map(p => p.cash))}<div class="k">Point bas ${eur(f.low.cash)} le ${fdate(f.low.date)} · <a data-act="tool" data-t="forecast">détail</a></div>`); } },
    seuil: { title: 'Seuil de rentabilité', size: 6, render: c => { const b = A.breakEven(db, c.year + '-01-01', today()), p = b.seuil ? Math.min(100, b.ca / b.seuil * 100) : 0; return card('Seuil de rentabilité', b.reached ? 'atteint' : Math.round(p) + ' %', `<div class="meter big"><i style="width:${p.toFixed(1)}%"></i></div><div class="k">CA ${eur(b.ca)} sur un seuil de ${b.seuil === null ? '—' : eur(b.seuil)}${b.date ? ' · point mort ' + fdate(b.date) : ''}</div>`); } },
    late: { title: 'Factures en retard', size: 12, render: c => card('Factures clients en retard', plural(c.late.length, 'facture'), c.late.length ? docTable(c.late) : '<div class="empty small">Aucun retard de paiement.</div>', 'flat') },
    lowstock: { title: 'À réapprovisionner', size: 12, render: c => card('À réapprovisionner', plural(c.lowStock.length, 'article'), c.lowStock.length ? `<table><tr><th>Article</th><th class="n">Stock</th><th class="n">Seuil</th></tr>${c.lowStock.map(p => `<tr><td>${esc(p.label)}</td><td class="n neg">${p.stock}</td><td class="n">${p.min || 0}</td></tr>`).join('')}</table>` : '<div class="empty small">Tout est en stock.</div>', 'flat') }
  };
  const DEFAULT = ['treso', 'kpi_ca', 'kpi_res', 'kpi_marge', 'kpi_due', 'kpi_pay', 'kpi_stock', 'bars3d', 'pie3d', 'ranking', 'forecast', 'seuil', 'late', 'lowstock'];

  const layout = () => ((db.prefs && db.prefs.dash) || DEFAULT.map(id => ({ id, size: W[id].size }))).filter(w => W[w.id]);
  const saveLayout = list => mutate(() => { db.prefs = { ...(db.prefs || {}), dash: list }; });

  views.dashboard = () => {
    const hello = new Date().getHours() < 18 ? 'Bonjour' : 'Bonsoir';
    if (!db.docs.length && !db.entries.length) return `<div class="hero-empty"><div class="orb"></div><h1>${hello} et bienvenue</h1>
      <p class="sub">Votre dossier est vide. Créez vos premiers clients et factures, ou explorez une boutique fictive déjà remplie pour voir tous les graphiques en action.</p>
      <div class="bar" style="justify-content:center"><button class="primary big" data-act="demo">Explorer la démo</button><button class="big" data-act="go" data-v="settings">Configurer ma société</button></div></div>`;
    const c = context(), list = layout(), hidden = Object.keys(W).filter(id => !list.some(w => w.id === id));
    const tools = (w, i) => `<div class="w-tools"><span class="w-name">⠿ ${W[w.id].title}</span>
      <button data-act="dashMove" data-i="${i}" data-d="-1" title="Avancer" aria-label="Avancer">←</button><button data-act="dashMove" data-i="${i}" data-d="1" title="Reculer" aria-label="Reculer">→</button>
      <button data-act="dashSize" data-i="${i}" title="Largeur" aria-label="Changer la largeur">${w.size}/12</button><button data-act="dashHide" data-i="${i}" class="danger" title="Masquer" aria-label="Masquer">✕</button></div>`;
    return `<header class="dash-head"><div><h1>${hello}${db.company.name ? ', ' + esc(db.company.name) : ''}</h1><p class="sub">Exercice ${c.year} · situation au ${fdate(today())}</p></div>
      <div class="bar">${editing ? '<button data-act="dashReset">Disposition par défaut</button><button class="primary" data-act="dashEdit">Terminé</button>'
        : '<button data-act="dashEdit">Personnaliser</button><button data-act="newDoc" data-kind="SALE" data-type="INVOICE" class="primary">+ Facture</button><button data-act="newDoc" data-kind="PURCHASE" data-type="INVOICE">+ Achat</button>'}</div></header>
    ${editing ? `<div class="dash-add"><b>Ajouter un bloc :</b> ${hidden.length ? hidden.map(id => `<button class="chip-btn" data-act="dashAdd" data-id="${id}">+ ${W[id].title}</button>`).join('') : '<span class="k">tous les blocs sont affichés</span>'}<span class="k">Glissez-déposez les blocs pour les réordonner.</span></div>` : ''}
    <div class="dash ${editing ? 'editing' : ''}">${list.map((w, i) => `<section class="w span-${w.size}${W[w.id].rows && w.size < 12 ? ' rows-2' : ''}" data-i="${i}" ${editing ? 'draggable="true"' : ''}>${editing ? tools(w, i) : ''}${W[w.id].render(c)}</section>`).join('')}</div>`;
  };

  Object.assign(actions, {
    dashEdit: () => { editing = !editing; render(); },
    dashReset: () => { if (confirm('Revenir à la disposition par défaut ?')) saveLayout(null); },
    dashAdd: ({ id }) => saveLayout([...layout(), { id, size: W[id].size }]),
    dashHide: ({ i }) => saveLayout(layout().filter((_, n) => n !== +i)),
    dashSize: ({ i }) => saveLayout(layout().map((w, n) => n === +i ? { ...w, size: SIZES[(SIZES.indexOf(w.size) + 1) % SIZES.length] } : w)),
    dashMove: ({ i, d }) => { const l = layout(), a = +i, b = a + +d; if (b < 0 || b >= l.length) return; [l[a], l[b]] = [l[b], l[a]]; saveLayout(l); }
  });

  // Glisser-déposer en mode personnalisation
  document.addEventListener('dragstart', e => { const s = e.target.closest && e.target.closest('.dash.editing .w'); if (s) { dragId = +s.dataset.i; s.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; } });
  document.addEventListener('dragend', () => document.querySelectorAll('.w.dragging,.w.over').forEach(x => x.classList.remove('dragging', 'over')));
  document.addEventListener('dragover', e => { const s = e.target.closest && e.target.closest('.dash.editing .w'); if (s && dragId !== null) { e.preventDefault(); document.querySelectorAll('.w.over').forEach(x => x.classList.remove('over')); s.classList.add('over'); } });
  document.addEventListener('drop', e => {
    const s = e.target.closest && e.target.closest('.dash.editing .w');
    if (!s || dragId === null) return;
    e.preventDefault();
    const l = layout(), [moved] = l.splice(dragId, 1);
    l.splice(+s.dataset.i, 0, moved); dragId = null; saveLayout(l);
  });

  // Effet de relief : la carte s'incline légèrement vers le pointeur
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  document.addEventListener('pointermove', e => {
    const t = e.target.closest && e.target.closest('.dash:not(.editing) .tilt');
    document.querySelectorAll('.tilt.tilting').forEach(x => { if (x !== t) { x.classList.remove('tilting'); x.style.removeProperty('--rx'); x.style.removeProperty('--ry'); } });
    if (!t || still.matches || e.pointerType !== 'mouse') return;
    const r = t.getBoundingClientRect(), max = t.classList.contains('soft') ? 3 : 6;
    t.classList.add('tilting');
    t.style.setProperty('--ry', (((e.clientX - r.left) / r.width - 0.5) * max * 2).toFixed(2) + 'deg');
    t.style.setProperty('--rx', ((0.5 - (e.clientY - r.top) / r.height) * max * 2).toFixed(2) + 'deg');
  });
})();
