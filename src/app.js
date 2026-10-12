const L = window.Ledger;

// Version site web (GitHub Pages) : pas d'Electron, les données restent dans le navigateur.
if (!window.api) window.api = {
  load: async () => localStorage.getItem('compta'),
  save: async json => (localStorage.setItem('compta', json), true),
  exportFile: async (name, content) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([content])); a.download = name; a.click(); return name; },
  importFile: () => new Promise(res => { const i = document.createElement('input'); i.type = 'file'; i.accept = '.json'; i.onchange = () => i.files[0].text().then(res); i.click(); }),
  pdf: async () => (window.print(), true)
};
let db, view = 'dashboard', param = {};

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eur = c => ((c || 0) / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
const parseEur = s => { const n = Number(String(s).replace(/\s/g, '').replace(',', '.')); if (!isFinite(n)) throw new Error('Montant invalide : ' + s); return Math.round(n * 100); };
const num = s => { const n = Number(String(s).replace(',', '.')); if (!isFinite(n)) throw new Error('Nombre invalide : ' + s); return n; };
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
const fdate = d => d ? d.split('-').reverse().join('/') : '';
const yearStart = () => today().slice(0, 4) + '-01-01';
const tierName = id => (db.tiers.find(t => t.id === id) || {}).name || '—';
const accLabel = n => (db.accounts.find(a => a.num === n) || {}).label || '';
const KIND = { SALE: 'Ventes', PURCHASE: 'Achats' };
const TYPE = { QUOTE: 'Devis', ORDER: 'Bon de commande', INVOICE: 'Facture', CREDIT: 'Avoir' };
const STATUS = { DRAFT: 'Brouillon', ISSUED: 'À régler', PAID: 'Réglée', ACCEPTED: 'Transformé', LATE: 'En retard' };
const METHOD = { TRANSFER: 'Virement', CARD: 'Carte bancaire', SEPA: 'Prélèvement SEPA', CHECK: 'Chèque', CASH: 'Espèces' };

function toast(msg, err) { const t = $('#toast'); t.textContent = msg; t.className = 'show' + (err ? ' err' : ''); clearTimeout(t._h); t._h = setTimeout(() => t.className = '', 3200); }

async function save() { await window.api.save(JSON.stringify(db)); }

// Toute action qui touche aux données passe ici : en cas d'erreur, on recharge l'état disque (rien de partiellement écrit).
async function mutate(fn) {
  const snapshot = JSON.stringify(db);
  try { const r = fn(); await save(); render(); return r; }
  catch (e) { db = JSON.parse(snapshot); toast(e.message, true); throw e; }
}

function go(v, p = {}) { view = v; param = p; render(); }

function render() {
  document.querySelectorAll('nav a').forEach(a => a.classList.toggle('on', a.dataset.view === view || (view === 'ledger' && a.dataset.view === 'balance')));
  $('#company').textContent = db.company.name + (db.company.siren ? ' · ' + db.company.siren : '');
  $('#main').innerHTML = views[view]();
  $('#main').scrollTop = 0;
  countUp();
}

function countUp() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  document.querySelectorAll('[data-count]').forEach(el => {
    const end = +el.dataset.count, t0 = performance.now(), dur = 900;
    const step = t => { const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3); el.textContent = eur(Math.round(end * e)); if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  });
}

const statusOf = d => d.status === 'ISSUED' && d.due && d.due < today() ? 'LATE' : d.status;
const pill = d => `<span class="pill ${statusOf(d)}">${STATUS[statusOf(d)]}</span>`;
const docTotal = d => d.totals || L.docTotals(d);
const accOptions = (sel, re) => db.accounts.filter(a => !re || re.test(a.num)).map(a => `<option value="${a.num}" ${a.num === sel ? 'selected' : ''}>${a.num} · ${esc(a.label)}</option>`).join('');

/* ---------- Vues ---------- */
const views = {
  // tableau de bord : voir dashboard.js

  sales() { return docsView('SALE'); },
  purchases() { return docsView('PURCHASE'); },

  tiers() {
    const list = db.tiers.filter(t => !param.q || (t.name + t.code + (t.email || '')).toLowerCase().includes(param.q.toLowerCase()));
    return `<h1>Clients &amp; fournisseurs</h1><p class="sub">${db.tiers.length} tiers</p>
    <div class="bar"><input id="q" placeholder="Rechercher…" value="${esc(param.q || '')}" style="max-width:280px"><span class="grow"></span>
      <button data-act="tierForm" data-type="C" class="primary">Nouveau client</button><button data-act="tierForm" data-type="F">Nouveau fournisseur</button></div>
    ${list.length ? `<table><tr><th>Code</th><th>Nom</th><th>Type</th><th>SIREN</th><th>Email</th><th class="n">Solde</th></tr>
    ${list.map(t => { const s = tierBalance(t); return `<tr class="click" data-act="tierForm" data-id="${t.id}"><td>${t.code}</td><td>${esc(t.name)}</td><td>${t.type === 'C' ? 'Client' : 'Fournisseur'}</td><td>${esc(t.siren)}</td><td>${esc(t.email)}</td><td class="n">${eur(s)}</td></tr>`; }).join('')}</table>`
      : '<div class="empty">Ajoutez votre premier client ou fournisseur.</div>'}`;
  },

  products() {
    return `<h1>Articles &amp; stock</h1><p class="sub">Coût de revient au coût moyen unitaire pondéré (CMUP), mis à jour à chaque facture d'achat.</p>
    <div class="bar"><span class="grow"></span><button data-act="productForm" class="primary">Nouvel article</button><button data-act="stockAdjust">Ajuster un stock</button></div>
    ${db.products.length ? `<table><tr><th>Réf.</th><th>Article</th><th>Type</th><th class="n">Prix HT</th><th class="n">TVA</th><th class="n">Coût</th><th class="n">Marque</th><th class="n">Stock</th></tr>
    ${db.products.map(p => `<tr class="click" data-act="productForm" data-id="${p.id}"><td>${esc(p.sku)}</td><td>${esc(p.label)}</td><td>${p.type === 'GOODS' ? 'Marchandise' : 'Service'}</td><td class="n">${eur(p.price)}</td><td class="n">${p.vat} %</td><td class="n">${p.type === 'GOODS' ? eur(p.cost) : ''}</td><td class="n">${p.type === 'GOODS' && p.price ? Math.round((p.price - p.cost) / p.price * 1000) / 10 + ' %' : ''}</td><td class="n ${p.type === 'GOODS' && p.stock <= (p.min || 0) ? 'neg' : ''}">${p.type === 'GOODS' ? p.stock : ''}</td></tr>`).join('')}</table>`
      : '<div class="empty">Créez vos articles et services vendus ou achetés.</div>'}`;
  },

  treasury() {
    const bal = L.balance(db);
    const s = acc => (bal.find(b => b.acc === acc) || { solde: 0 }).solde;
    const pays = [...db.payments].sort((a, b) => b.date.localeCompare(a.date));
    return `<h1>Trésorerie</h1><p class="sub">Encaissements et décaissements enregistrés depuis les factures.</p>
    <div class="cards"><div class="card"><div class="k">Banque 512</div><div class="v">${eur(s('512000'))}</div></div><div class="card"><div class="k">Caisse 530</div><div class="v">${eur(s('530000'))}</div></div>
    <div class="card"><div class="k">Clients 411</div><div class="v">${eur(s('411000'))}</div></div><div class="card"><div class="k">Fournisseurs 401</div><div class="v">${eur(-s('401000'))}</div></div></div>
    <h2>Règlements</h2>
    ${pays.length ? `<table><tr><th>Date</th><th>Pièce</th><th>Tiers</th><th>Mode</th><th class="n">Montant</th></tr>${pays.map(p => { const d = db.docs.find(x => x.id === p.docId); const out = (d.kind === 'PURCHASE') !== (d.type === 'CREDIT'); return `<tr><td>${fdate(p.date)}</td><td>${d.number}</td><td>${esc(tierName(d.tierId))}</td><td>${METHOD[p.method]}</td><td class="n ${out ? 'neg' : 'pos'}">${out ? '−' : '+'}${eur(p.amount)}</td></tr>`; }).join('')}</table>` : '<div class="empty">Aucun règlement. Ouvrez une facture émise et cliquez « Enregistrer un règlement ».</div>'}`;
  },

  journal() {
    const j = param.j || '';
    const list = db.entries.filter(e => !j || e.journal === j).slice().reverse();
    return `<h1>Écritures comptables</h1><p class="sub">Générées automatiquement par les factures et règlements. Une écriture validée ne se modifie pas : corrigez par une écriture inverse.</p>
    <div class="bar"><select id="jf" style="max-width:220px"><option value="">Tous les journaux</option>${Object.entries(L.JOURNALS).map(([k, v]) => `<option value="${k}" ${k === j ? 'selected' : ''}>${k} · ${v}</option>`).join('')}</select>
      <span class="grow"></span><button data-act="odForm" class="primary">Saisie manuelle (OD)</button></div>
    ${list.length ? `<table><tr><th>N°</th><th>Jnl</th><th>Date</th><th>Pièce</th><th>Compte</th><th>Libellé</th><th class="n">Débit</th><th class="n">Crédit</th></tr>
    ${list.map(e => e.lines.map((l, i) => `<tr><td>${i ? '' : e.num}</td><td>${i ? '' : e.journal}</td><td>${i ? '' : fdate(e.date)}</td><td>${i ? '' : esc(e.ref)}</td><td title="${esc(accLabel(l.acc))}">${l.acc}${l.tier ? ' · ' + l.tier : ''}</td><td>${esc(l.label || e.label)}</td><td class="n">${l.debit ? eur(l.debit) : ''}</td><td class="n">${l.credit ? eur(l.credit) : ''}</td></tr>`).join('')).join('')}</table>` : '<div class="empty">Aucune écriture.</div>'}`;
  },

  balance() {
    const from = param.from ?? yearStart(), to = param.to ?? today();
    const bal = L.balance(db, from, to);
    const t = bal.reduce((s, b) => ({ d: s.d + b.debit, c: s.c + b.credit }), { d: 0, c: 0 });
    return `<h1>Balance générale</h1><p class="sub">Cliquez un compte pour ouvrir son grand livre.</p>
    <div class="bar">${period(from, to)}<span class="grow"></span><button data-act="exportBalance">Export CSV / Excel</button></div>
    ${bal.length ? `<table><tr><th>Compte</th><th>Libellé</th><th class="n">Débit</th><th class="n">Crédit</th><th class="n">Solde débiteur</th><th class="n">Solde créditeur</th></tr>
    ${bal.map(b => `<tr class="click" data-act="ledger" data-acc="${b.acc}"><td>${b.acc}</td><td>${esc(b.label)}</td><td class="n">${eur(b.debit)}</td><td class="n">${eur(b.credit)}</td><td class="n">${b.solde > 0 ? eur(b.solde) : ''}</td><td class="n">${b.solde < 0 ? eur(-b.solde) : ''}</td></tr>`).join('')}
    <tfoot><tr><td colspan="2">Total</td><td class="n">${eur(t.d)}</td><td class="n">${eur(t.c)}</td><td colspan="2" class="n">${t.d === t.c ? 'Équilibrée ✓' : 'Écart ' + eur(t.d - t.c)}</td></tr></tfoot></table>` : '<div class="empty">Aucun mouvement sur la période.</div>'}`;
  },

  ledger() {
    const acc = param.acc;
    let run = 0;
    const rows = db.entries.filter(e => e.lines.some(l => l.acc === acc)).sort((a, b) => a.date.localeCompare(b.date) || a.num - b.num)
      .flatMap(e => e.lines.filter(l => l.acc === acc).map(l => { run += l.debit - l.credit; return `<tr><td>${fdate(e.date)}</td><td>${e.journal}</td><td>${esc(e.ref)}</td><td>${esc(l.label || e.label)}</td><td>${l.tier}</td><td class="n">${l.debit ? eur(l.debit) : ''}</td><td class="n">${l.credit ? eur(l.credit) : ''}</td><td class="n">${eur(run)}</td></tr>`; }));
    return `<h1>Grand livre · ${acc}</h1><p class="sub">${esc(accLabel(acc))}</p><div class="bar"><button data-act="go" data-v="balance">← Balance</button></div>
    <table><tr><th>Date</th><th>Jnl</th><th>Pièce</th><th>Libellé</th><th>Tiers</th><th class="n">Débit</th><th class="n">Crédit</th><th class="n">Solde</th></tr>${rows.join('')}</table>`;
  },

  states() {
    const from = param.from ?? yearStart(), to = param.to ?? today();
    const inc = L.income(db, from, to), sh = L.sheet(db, to);
    const row = (b, v) => `<tr><td>${b.acc}</td><td>${esc(b.label)}</td><td class="n">${eur(v)}</td></tr>`;
    return `<h1>Bilan &amp; compte de résultat</h1><p class="sub">États simplifiés, à faire valider par votre expert-comptable avant dépôt de la liasse.</p>
    <div class="bar">${period(from, to)}<span class="grow"></span><button data-act="exportStates">Export CSV / Excel</button></div>
    <div class="cards"><div class="card"><div class="k">Produits</div><div class="v">${eur(inc.produits)}</div></div><div class="card"><div class="k">Charges</div><div class="v">${eur(inc.charges)}</div></div>
    <div class="card"><div class="k">Marge commerciale</div><div class="v">${eur(inc.margeCommerciale)}</div></div><div class="card"><div class="k">Résultat</div><div class="v ${inc.resultat < 0 ? 'neg' : 'pos'}">${eur(inc.resultat)}</div></div></div>
    <h2>Compte de résultat</h2>
    <table><tr><th>Compte</th><th>Libellé</th><th class="n">Montant</th></tr>${inc.lignes.map(b => row(b, /^7/.test(b.acc) ? -b.solde : b.solde)).join('')}<tfoot><tr><td colspan="2">Résultat</td><td class="n">${eur(inc.resultat)}</td></tr></tfoot></table>
    <h2>Bilan au ${fdate(to)}</h2>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
      <table><tr><th colspan="2">Actif</th><th class="n"></th></tr>${sh.actif.map(b => row(b, b.solde)).join('')}<tfoot><tr><td colspan="2">Total actif</td><td class="n">${eur(sh.totalActif)}</td></tr></tfoot></table>
      <table><tr><th colspan="2">Passif</th><th class="n"></th></tr>${sh.passif.map(b => row(b, b.solde)).join('')}<tr><td>120000</td><td>Résultat de l'exercice</td><td class="n">${eur(sh.resultat)}</td></tr><tfoot><tr><td colspan="2">Total passif</td><td class="n">${eur(sh.totalPassif)}</td></tr></tfoot></table>
    </div>`;
  },

  vat() {
    const m = today().slice(0, 7);
    const from = param.from ?? m + '-01', to = param.to ?? today();
    const v = L.vat(db, from, to);
    const done = db.entries.filter(e => e.src === 'VAT');
    return `<h1>TVA</h1><p class="sub">TVA sur les débits (à la facture). Reportez ces montants sur votre CA3 (impots.gouv.fr), puis passez l'écriture de liquidation.</p>
    <div class="bar">${period(from, to)}</div>
    <div class="cards"><div class="card"><div class="k">TVA collectée (ligne 16)</div><div class="v">${eur(v.collectee)}</div></div>
    <div class="card"><div class="k">TVA déductible (ligne 20)</div><div class="v">${eur(v.deductible)}</div></div>
    <div class="card"><div class="k">${v.net >= 0 ? 'TVA nette due (ligne 28)' : 'Crédit de TVA (ligne 25)'}</div><div class="v">${eur(Math.abs(v.net))}</div></div></div>
    <div class="bar" style="margin-top:16px"><button class="primary" data-act="settleVat">Passer l'écriture de liquidation</button></div>
    <h2>Liquidations passées</h2>${done.length ? `<table><tr><th>Date</th><th>Libellé</th></tr>${done.map(e => `<tr><td>${fdate(e.date)}</td><td>${esc(e.label)}</td></tr>`).join('')}</table>` : '<div class="empty">Aucune.</div>'}`;
  },

  settings() {
    const c = db.company;
    return `<h1>Paramètres &amp; exports</h1><p class="sub">Informations imprimées sur vos factures et utilisées pour le FEC.</p>
    <div class="card"><form id="companyForm" class="grid">
      <label>Raison sociale<input name="name" value="${esc(c.name)}" required></label>
      <label>SIREN<input name="siren" value="${esc(c.siren)}" pattern="\\d{9}" title="9 chiffres"></label>
      <label>N° TVA intracom.<input name="vatNumber" value="${esc(c.vatNumber)}"></label>
      <label>Email<input name="email" type="email" value="${esc(c.email)}"></label>
      <label>Adresse<input name="address" value="${esc(c.address)}"></label>
      <label>IBAN<input name="iban" value="${esc(c.iban)}"></label>
      <label>Période clôturée jusqu'au<input name="lockedUntil" type="date" value="${esc(c.lockedUntil)}"></label>
      <label>&nbsp;<button class="primary">Enregistrer</button></label>
    </form></div>
    <h2>Exports légaux et sauvegarde</h2>
    <div class="bar"><button data-act="exportFec" class="primary">Exporter le FEC</button><button data-act="backup">Sauvegarder le dossier (.json)</button><button data-act="restore">Restaurer une sauvegarde</button><button data-act="demo">Charger la démo</button><button data-act="reset" class="danger">Effacer toutes les données</button></div>
    <h2>Plan comptable</h2>
    <div class="bar"><button data-act="accountForm">Ajouter un compte</button></div>
    <table><tr><th>Compte</th><th>Libellé</th></tr>${db.accounts.slice().sort((a, b) => a.num.localeCompare(b.num)).map(a => `<tr><td>${a.num}</td><td>${esc(a.label)}</td></tr>`).join('')}</table>`;
  }
};

const period = (from, to) => `<label style="flex-direction:row;align-items:center;gap:6px">Du <input type="date" id="pfrom" value="${from}"></label><label style="flex-direction:row;align-items:center;gap:6px">au <input type="date" id="pto" value="${to}"></label>`;

function tierBalance(t) {
  return db.entries.reduce((s, e) => s + e.lines.filter(l => l.tier === t.code).reduce((x, l) => x + l.debit - l.credit, 0), 0) * (t.type === 'F' ? -1 : 1);
}

function docTable(list) {
  return `<table><tr><th>Numéro</th><th>Type</th><th>Date</th><th>Tiers</th><th>Échéance</th><th class="n">HT</th><th class="n">TTC</th><th>Statut</th></tr>
  ${list.map(d => { const t = docTotal(d); return `<tr class="click" data-act="docForm" data-id="${d.id}"><td>${d.number || '<i>brouillon</i>'}</td><td>${TYPE[d.type]}</td><td>${fdate(d.date)}</td><td>${esc(tierName(d.tierId))}</td><td>${fdate(d.due)}</td><td class="n">${eur(t.ht)}</td><td class="n">${eur(t.ttc)}</td><td>${pill(d)}</td></tr>`; }).join('')}${(() => { const f = list.filter(d => d.type === 'INVOICE' || d.type === 'CREDIT'), s = k => f.reduce((x, d) => x + docTotal(d)[k] * (d.type === 'CREDIT' ? -1 : 1), 0); return f.length > 1 ? `<tfoot><tr><td colspan="5">${f.length} factures et avoirs</td><td class="n">${eur(s('ht'))}</td><td class="n">${eur(s('ttc'))}</td><td></td></tr></tfoot>` : ''; })()}</table>`;
}

function docsView(kind) {
  const f = param.f || '';
  const list = db.docs.filter(d => d.kind === kind && (!f || d.type === f || statusOf(d) === f)).sort((a, b) => b.date.localeCompare(a.date));
  const sale = kind === 'SALE';
  return `<h1>${KIND[kind]}</h1><p class="sub">${sale ? 'Devis, factures et avoirs clients. Une facture émise génère son écriture, met à jour le stock et ne peut plus être modifiée.' : 'Factures fournisseurs : la saisie génère l\'écriture d\'achat et met à jour stock et coût moyen.'}</p>
  <div class="bar"><select id="df" style="max-width:200px"><option value="">Tout</option>${(sale ? ['QUOTE', 'ORDER', 'INVOICE', 'CREDIT'] : ['ORDER', 'INVOICE', 'CREDIT']).map(k => `<option value="${k}" ${f === k ? 'selected' : ''}>${TYPE[k]}</option>`).join('')}<option value="ISSUED" ${f === 'ISSUED' ? 'selected' : ''}>À régler</option><option value="LATE" ${f === 'LATE' ? 'selected' : ''}>En retard</option></select>
  <span class="grow"></span>
  ${sale ? '<button data-act="newDoc" data-kind="SALE" data-type="QUOTE">Nouveau devis</button>' : ''}<button data-act="newDoc" data-kind="${kind}" data-type="ORDER">Bon de commande</button>
  <button data-act="newDoc" data-kind="${kind}" data-type="INVOICE" class="primary">Nouvelle facture</button><button data-act="newDoc" data-kind="${kind}" data-type="CREDIT">Avoir</button></div>
  ${list.length ? docTable(list) : '<div class="empty">Aucun document.</div>'}`;
}

/* ---------- Formulaires ---------- */
let onSubmit = null;
function modal(html, submit) {
  $('#modalForm').innerHTML = html;
  onSubmit = submit;
  $('#modal').showModal();
  const first = $('#modalForm').querySelector('input,select'); if (first) first.focus();
}
const closeModal = () => $('#modal').close();
const fd = form => Object.fromEntries(new FormData(form));

function tierForm({ id, type }) {
  const t = db.tiers.find(x => x.id === id) || { type, name: '', siren: '', vatNumber: '', email: '', address: '', terms: 30 };
  modal(`<h3>${id ? esc(t.name) : t.type === 'C' ? 'Nouveau client' : 'Nouveau fournisseur'}</h3><div class="grid">
    <label>Nom / raison sociale<input name="name" value="${esc(t.name)}" required></label>
    <label>SIREN<input name="siren" value="${esc(t.siren)}" pattern="\\d{9}" title="9 chiffres"></label>
    <label>N° TVA intracom.<input name="vatNumber" value="${esc(t.vatNumber)}"></label>
    <label>Email<input name="email" type="email" value="${esc(t.email)}"></label>
    <label>Adresse<input name="address" value="${esc(t.address)}"></label>
    <label>Délai de paiement (jours, max 60)<input name="terms" type="number" min="0" max="60" value="${t.terms ?? 30}"></label></div>
    <div class="actions"><button type="button" data-act="close">Annuler</button><button class="primary">Enregistrer</button></div>`,
  v => mutate(() => {
    if (id) Object.assign(t, v, { terms: +v.terms });
    else {
      const n = db.tiers.filter(x => x.type === t.type).length + 1;
      db.tiers.push({ ...t, ...v, terms: +v.terms, id: L.uid(), code: (t.type === 'C' ? 'C' : 'F') + String(n).padStart(4, '0') });
    }
  }));
}

function productForm({ id }) {
  const p = db.products.find(x => x.id === id) || { sku: '', label: '', type: 'GOODS', price: 0, vat: 20, cost: 0, stock: 0, min: 0, account: '' };
  modal(`<h3>${id ? esc(p.label) : 'Nouvel article'}</h3><div class="grid">
    <label>Référence<input name="sku" value="${esc(p.sku)}" required></label>
    <label>Désignation<input name="label" value="${esc(p.label)}" required></label>
    <label>Type<select name="type"><option value="GOODS" ${p.type === 'GOODS' ? 'selected' : ''}>Marchandise (stockée)</option><option value="SERVICE" ${p.type === 'SERVICE' ? 'selected' : ''}>Service</option></select></label>
    <label>Prix de vente HT (€)<input name="price" value="${(p.price / 100).toFixed(2).replace('.', ',')}"></label>
    <label>TVA<select name="vat">${[20, 10, 5.5, 2.1, 0].map(r => `<option ${r === p.vat ? 'selected' : ''}>${r}</option>`).join('')}</select></label>
    <label>Seuil d'alerte stock<input name="min" type="number" value="${p.min || 0}"></label>
    ${id ? '' : '<label>Coût d\'achat initial HT (€)<input name="cost" value="0"></label><label>Stock initial<input name="stock" type="number" value="0"></label>'}
    <label>Compte de vente (optionnel)<select name="account"><option value="">Automatique (707 / 706)</option>${accOptions(p.account, /^7/)}</select></label></div>
    <div class="actions"><button type="button" data-act="close">Annuler</button><button class="primary">Enregistrer</button></div>`,
  v => mutate(() => {
    const data = { sku: v.sku, label: v.label, type: v.type, price: parseEur(v.price), vat: num(v.vat), min: +v.min, account: v.account };
    if (id) Object.assign(p, data);
    else db.products.push({ ...data, id: L.uid(), cost: parseEur(v.cost || 0), stock: num(v.stock || 0) });
  }));
}

function stockAdjust() {
  const goods = db.products.filter(p => p.type === 'GOODS');
  if (!goods.length) return toast('Aucune marchandise', true);
  modal(`<h3>Ajuster un stock (inventaire)</h3><div class="grid">
    <label>Article<select name="pid">${goods.map(p => `<option value="${p.id}">${esc(p.label)} (stock ${p.stock})</option>`).join('')}</select></label>
    <label>Quantité réelle comptée<input name="qty" type="number" step="any" required></label></div>
    <p class="sub">Le stock comptable (compte 37 / 6037) est régularisé à la clôture par une écriture d'inventaire (OD).</p>
    <div class="actions"><button type="button" data-act="close">Annuler</button><button class="primary">Valider</button></div>`,
  v => mutate(() => { db.products.find(p => p.id === v.pid).stock = num(v.qty); }));
}

function accountForm() {
  modal(`<h3>Nouveau compte</h3><div class="grid"><label>Numéro (6 à 10 chiffres)<input name="num" pattern="[1-8]\\d{5,9}" required></label><label>Libellé<input name="label" required></label></div>
    <div class="actions"><button type="button" data-act="close">Annuler</button><button class="primary">Ajouter</button></div>`,
  v => mutate(() => { if (db.accounts.some(a => a.num === v.num)) throw new Error('Compte déjà existant'); db.accounts.push({ num: v.num, label: v.label }); }));
}

function newDoc({ kind, type }) {
  const tiers = db.tiers.filter(t => t.type === (kind === 'SALE' ? 'C' : 'F'));
  if (!tiers.length) return toast(`Créez d'abord un ${kind === 'SALE' ? 'client' : 'fournisseur'}`, true);
  docForm({ doc: { id: '', kind, type, status: 'DRAFT', date: today(), due: addDays(today(), tiers[0].terms ?? 30), tierId: tiers[0].id, lines: [], globalDisc: 0, ref: '', notes: '' } });
}

function lineRow(l, editable) {
  const dis = editable ? '' : 'disabled';
  return `<tr><td><select name="productId" ${dis}><option value="">— libre —</option>${db.products.map(p => `<option value="${p.id}" ${p.id === l.productId ? 'selected' : ''}>${esc(p.sku)} · ${esc(p.label)}</option>`).join('')}</select></td>
  <td><input name="label" value="${esc(l.label)}" ${dis}></td><td style="width:80px"><input name="qty" value="${l.qty ?? 1}" ${dis}></td>
  <td style="width:110px"><input name="price" value="${((l.price || 0) / 100).toFixed(2).replace('.', ',')}" ${dis}></td>
  <td style="width:70px"><input name="disc" value="${l.disc || 0}" ${dis}></td>
  <td style="width:80px"><select name="vat" ${dis}>${[20, 10, 5.5, 2.1, 0].map(r => `<option ${r === (l.vat ?? 20) ? 'selected' : ''}>${r}</option>`).join('')}</select></td>
  <td class="n" style="width:110px">${eur(L.lineTotals({ qty: l.qty ?? 1, price: l.price || 0, disc: l.disc, vat: l.vat ?? 20 }).ht)}</td>
  <td style="width:30px">${editable ? '<button type="button" class="link danger" data-act="delLine">✕</button>' : ''}</td></tr>`;
}

function readLines(form) {
  return [...form.querySelectorAll('#lines tr')].map(tr => {
    const g = n => tr.querySelector(`[name=${n}]`).value;
    return { productId: g('productId'), label: g('label'), qty: num(g('qty')), price: parseEur(g('price')), disc: num(g('disc') || 0), vat: num(g('vat')) };
  }).filter(l => l.label || l.productId);
}

function docForm({ id, doc }) {
  const d = doc || db.docs.find(x => x.id === id);
  const editable = d.status === 'DRAFT';
  const tiers = db.tiers.filter(t => t.type === (d.kind === 'SALE' ? 'C' : 'F'));
  const t = docTotal(d);
  const remaining = d.totals ? d.totals.ttc - d.paid : 0;
  const pays = db.payments.filter(p => p.docId === d.id);
  modal(`<h3>${TYPE[d.type]} ${d.kind === 'SALE' ? 'client' : 'fournisseur'} ${d.number || ''} ${d.id ? pill(d) : ''}</h3>
    <div class="grid">
      <label>${d.kind === 'SALE' ? 'Client' : 'Fournisseur'}<select name="tierId" ${editable ? '' : 'disabled'}>${tiers.map(x => `<option value="${x.id}" ${x.id === d.tierId ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
      <label>Date<input type="date" name="date" value="${d.date}" ${editable ? '' : 'disabled'} required></label>
      <label>Échéance<input type="date" name="due" value="${d.due || ''}" ${editable ? '' : 'disabled'}></label>
      <label>Remise globale (%)<input name="globalDisc" value="${d.globalDisc || 0}" ${editable ? '' : 'disabled'}></label>
      ${d.kind === 'PURCHASE' ? `<label>N° facture fournisseur<input name="ref" value="${esc(d.ref)}" ${editable ? '' : 'disabled'}></label>` : ''}
    </div>
    <table><thead><tr><th>Article</th><th>Désignation</th><th>Qté</th><th>PU HT €</th><th>Rem. %</th><th>TVA %</th><th class="n">Total HT</th><th></th></tr></thead>
    <tbody id="lines">${(d.lines.length ? d.lines : editable ? [{}] : []).map(l => lineRow(l, editable)).join('')}</tbody></table>
    ${editable ? '<div><button type="button" data-act="addLine">+ Ajouter une ligne</button></div>' : ''}
    <div class="totals" id="tot"><div><span>Total HT</span><span>${eur(t.ht)}</span></div><div><span>TVA</span><span>${eur(t.tva)}</span></div><div class="big"><span>Total TTC</span><span>${eur(t.ttc)}</span></div>
    ${d.totals ? `<div><span>Déjà réglé</span><span>${eur(d.paid)}</span></div><div><span>Reste dû</span><span>${eur(remaining)}</span></div>` : ''}</div>
    ${pays.length ? `<table><tr><th>Règlement</th><th>Mode</th><th class="n">Montant</th></tr>${pays.map(p => `<tr><td>${fdate(p.date)}</td><td>${METHOD[p.method]}</td><td class="n">${eur(p.amount)}</td></tr>`).join('')}</table>` : ''}
    <label>Notes (imprimées)<textarea name="notes" rows="2" ${editable ? '' : 'disabled'}>${esc(d.notes)}</textarea></label>
    <div class="actions">
      ${d.id && editable ? '<button type="button" class="danger" data-act="delDoc">Supprimer le brouillon</button>' : ''}<span style="flex:1"></span>
      ${d.id ? '<button type="button" data-act="printDoc">PDF</button>' : ''}
      ${d.id && ['QUOTE', 'ORDER'].includes(d.type) && d.status === 'DRAFT' ? '<button type="button" data-act="convert">Transformer en facture</button>' : ''}
      ${d.status === 'ISSUED' ? '<button type="button" data-act="payForm">Enregistrer un règlement</button>' : ''}
      ${d.status !== 'DRAFT' && d.type === 'INVOICE' ? '<button type="button" data-act="creditFrom">Créer un avoir</button>' : ''}
      <button type="button" data-act="close">Fermer</button>
      ${editable ? `<button class="primary" value="save">Enregistrer${['INVOICE', 'CREDIT'].includes(d.type) ? ' le brouillon' : ''}</button>` : ''}
      ${editable && ['INVOICE', 'CREDIT'].includes(d.type) ? '<button type="button" class="primary" data-act="issueDoc">Valider et émettre</button>' : ''}
    </div>`,
  () => mutate(() => storeDoc(d)));
  $('#modalForm')._doc = d;
}

function storeDoc(d) {
  const f = $('#modalForm'), v = fd(f);
  Object.assign(d, { tierId: v.tierId, date: v.date, due: v.due, globalDisc: num(v.globalDisc || 0), ref: v.ref || '', notes: v.notes || '', lines: readLines(f) });
  if (!d.id) { d.id = L.uid(); db.docs.push(d); }
  return d;
}

function payForm() {
  const d = $('#modalForm')._doc;
  const rest = d.totals.ttc - d.paid;
  modal(`<h3>Règlement ${d.number}</h3><div class="grid">
    <label>Date<input type="date" name="date" value="${today()}" required></label>
    <label>Montant (€)<input name="amount" value="${(rest / 100).toFixed(2).replace('.', ',')}" required></label>
    <label>Mode<select name="method">${Object.entries(METHOD).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label></div>
    <div class="actions"><button type="button" data-act="close">Annuler</button><button class="primary">Enregistrer</button></div>`,
  v => mutate(() => {
    const amount = parseEur(v.amount);
    if (v.method === 'CASH' && d.kind === 'SALE' && amount > 100000) throw new Error('Paiement en espèces limité à 1 000 € (particulier résident)');
    L.pay(db, d.id, v.date, amount, v.method);
  }));
}

function odForm() {
  const row = () => `<tr><td><select name="acc">${accOptions()}</select></td><td><input name="label"></td><td><input name="debit"></td><td><input name="credit"></td></tr>`;
  modal(`<h3>Écriture manuelle (journal OD)</h3><p class="sub">Exemples : apport en capital (512 / 101), salaires, amortissements, abonnements payés par carte.</p>
    <div class="grid"><label>Date<input type="date" name="date" value="${today()}" required></label><label>Pièce<input name="ref" required></label>
    <label>Journal<select name="journal">${Object.entries(L.JOURNALS).map(([k, v]) => `<option value="${k}" ${k === 'OD' ? 'selected' : ''}>${k} · ${v}</option>`).join('')}</select></label></div>
    <table><thead><tr><th>Compte</th><th>Libellé</th><th>Débit €</th><th>Crédit €</th></tr></thead><tbody id="odl">${row()}${row()}</tbody></table>
    <div><button type="button" data-act="addOdLine">+ Ligne</button></div>
    <div class="actions"><button type="button" data-act="close">Annuler</button><button class="primary">Valider l'écriture</button></div>`,
  v => mutate(() => {
    const lines = [...document.querySelectorAll('#odl tr')].map(tr => {
      const g = n => tr.querySelector(`[name=${n}]`).value;
      return { acc: g('acc'), label: g('label') || v.ref, tier: '', debit: parseEur(g('debit') || 0), credit: parseEur(g('credit') || 0) };
    });
    L.post(db, v.journal, v.date, v.ref, lines[0].label, lines, 'MANUAL');
  }));
  $('#modalForm')._odRow = row;
}

function printDoc(d) {
  const tier = db.tiers.find(t => t.id === d.tierId), c = db.company, t = docTotal(d);
  const byVat = {};
  for (const l of d.lines) byVat[l.vat] = (byVat[l.vat] || 0) + L.lineTotals(l).tva;
  $('#print').innerHTML = `<div class="head"><div><h1>${TYPE[d.type]}</h1><div>N° ${esc(d.number || 'BROUILLON')}</div><div>Date : ${fdate(d.date)}</div>${d.due ? `<div>Échéance : ${fdate(d.due)}</div>` : ''}</div>
    <div style="text-align:right"><b>${esc(c.name)}</b><br>${esc(c.address)}<br>SIREN ${esc(c.siren)}${c.vatNumber ? '<br>TVA ' + esc(c.vatNumber) : ''}<br>${esc(c.email)}</div></div>
    <div style="margin-bottom:24px"><b>${d.kind === 'SALE' ? 'Client' : 'Fournisseur'} :</b><br>${esc(tier.name)}<br>${esc(tier.address)}${tier.siren ? '<br>SIREN ' + esc(tier.siren) : ''}${tier.vatNumber ? '<br>TVA ' + esc(tier.vatNumber) : ''}</div>
    <table><tr><th>Désignation</th><th class="n">Qté</th><th class="n">PU HT</th><th class="n">Remise</th><th class="n">TVA</th><th class="n">Total HT</th></tr>
    ${d.lines.map(l => `<tr><td>${esc(l.label)}</td><td class="n">${l.qty}</td><td class="n">${eur(l.price)}</td><td class="n">${l.disc ? l.disc + ' %' : ''}</td><td class="n">${l.vat} %</td><td class="n">${eur(L.lineTotals(l).ht)}</td></tr>`).join('')}</table>
    <div class="totals" style="margin-top:16px;width:280px">${d.globalDisc ? `<div><span>Remise globale</span><span>${d.globalDisc} %</span></div>` : ''}<div><span>Total HT</span><span>${eur(t.ht)}</span></div>
    ${Object.entries(byVat).map(([r, v]) => `<div><span>TVA ${r} %</span><span>${eur(Math.round(v * (1 - (d.globalDisc || 0) / 100)))}</span></div>`).join('')}<div class="big"><span>Total TTC</span><span>${eur(t.ttc)}</span></div></div>
    ${d.notes ? `<p>${esc(d.notes)}</p>` : ''}
    <div class="legal">Catégorie de l'opération : ${d.lines.every(l => (db.products.find(p => p.id === l.productId) || {}).type === 'SERVICE') ? 'prestation de services' : 'livraison de biens'}.
    ${c.iban ? 'Paiement par virement : IBAN ' + esc(c.iban) + '. ' : ''}Pas d'escompte pour paiement anticipé.
    En cas de retard de paiement : pénalités au taux de 3 fois le taux d'intérêt légal et indemnité forfaitaire pour frais de recouvrement de 40 € (art. L441-10 du Code de commerce).</div>`;
  return window.api.pdf(`${d.number || 'brouillon'}.pdf`).then(p => p && toast('PDF enregistré'));
}

const csv = rows => '﻿' + rows.map(r => r.map(x => typeof x === 'number' ? (x / 100).toFixed(2).replace('.', ',') : '"' + String(x ?? '').replace(/"/g, '""') + '"').join(';')).join('\r\n');

/* ---------- Actions ---------- */
const actions = {
  go: ({ v }) => go(v),
  close: closeModal,
  tierForm, productForm, stockAdjust, accountForm, newDoc, odForm,
  docForm: ({ id }) => docForm({ id }),
  ledger: ({ acc }) => go('ledger', { acc }),
  addLine: () => $('#lines').insertAdjacentHTML('beforeend', lineRow({}, true)),
  delLine: (_, el) => el.closest('tr').remove(),
  addOdLine: () => $('#odl').insertAdjacentHTML('beforeend', $('#modalForm')._odRow()),
  payForm,
  palette: () => window.openPalette(),
  async issueDoc() {
    const d = $('#modalForm')._doc;
    if (!confirm('Une fois émis, le document est définitif (numéro attribué, écriture comptable passée). Continuer ?')) return;
    await mutate(() => { storeDoc(d); L.issue(db, d); });
    closeModal(); toast(`${d.number} émis et comptabilisé`);
  },
  async convert() {
    const q = $('#modalForm')._doc;
    let inv;
    await mutate(() => {
      storeDoc(q); q.status = 'ACCEPTED';
      inv = { ...JSON.parse(JSON.stringify(q)), id: L.uid(), type: 'INVOICE', status: 'DRAFT', number: '', date: today(), origin: q.id };
      db.docs.push(inv);
    });
    docForm({ id: inv.id });
  },
  async creditFrom() {
    const src = $('#modalForm')._doc;
    let av;
    await mutate(() => {
      av = { id: L.uid(), kind: src.kind, type: 'CREDIT', status: 'DRAFT', date: today(), due: today(), tierId: src.tierId, globalDisc: src.globalDisc, ref: '', notes: 'Avoir sur facture ' + src.number, lines: JSON.parse(JSON.stringify(src.lines)), origin: src.id };
      db.docs.push(av);
    });
    docForm({ id: av.id });
  },
  async delDoc() {
    const d = $('#modalForm')._doc;
    if (!confirm('Supprimer ce brouillon ?')) return;
    await mutate(() => { db.docs = db.docs.filter(x => x.id !== d.id); });
    closeModal();
  },
  printDoc: () => printDoc($('#modalForm')._doc),
  async settleVat() {
    const from = $('#pfrom').value, to = $('#pto').value;
    if (!confirm(`Passer l'écriture de liquidation de TVA du ${fdate(from)} au ${fdate(to)} ?`)) return;
    await mutate(() => L.settleVat(db, from, to)); toast('Liquidation de TVA comptabilisée');
  },
  async exportFec() {
    if (!db.company.siren) return toast('Renseignez le SIREN avant d\'exporter le FEC', true);
    const y = prompt('Exercice (année) à exporter :', today().slice(0, 4));
    if (!y) return;
    const p = await window.api.exportFile(`${db.company.siren}FEC${y}1231.txt`, L.fec(db, y + '-01-01', y + '-12-31'), 'latin1');
    if (p) toast('FEC exporté');
  },
  async exportBalance() {
    const bal = L.balance(db, $('#pfrom').value, $('#pto').value);
    if (await window.api.exportFile('balance.csv', csv([['Compte', 'Libellé', 'Débit', 'Crédit', 'Solde'], ...bal.map(b => [b.acc, b.label, b.debit, b.credit, b.solde])]))) toast('Balance exportée');
  },
  async exportStates() {
    const inc = L.income(db, $('#pfrom').value, $('#pto').value);
    if (await window.api.exportFile('compte-de-resultat.csv', csv([['Compte', 'Libellé', 'Montant'], ...inc.lignes.map(b => [b.acc, b.label, /^7/.test(b.acc) ? -b.solde : b.solde]), ['', 'Résultat', inc.resultat]]))) toast('Export réalisé');
  },
  async demo() {
    if ((db.docs.length || db.entries.length) && !confirm('Remplacer le dossier actuel par la boutique de démonstration ? Faites une sauvegarde avant si besoin.')) return;
    db = window.demoData(); await save(); go('dashboard'); toast('Démo chargée : Elina Studio');
  },
  async reset() {
    if (!confirm('Effacer définitivement toutes les données de ce dossier ?')) return;
    db = L.empty(); await save(); go('dashboard'); toast('Dossier vide');
  },
  async backup() { if (await window.api.exportFile(`compta-${today()}.json`, JSON.stringify(db, null, 1))) toast('Sauvegarde créée'); },
  async restore() {
    const txt = await window.api.importFile();
    if (!txt) return;
    const data = JSON.parse(txt);
    if (!data.accounts || !data.entries) return toast('Fichier de sauvegarde invalide', true);
    if (!confirm('Remplacer le dossier actuel par cette sauvegarde ?')) return;
    db = data; await save(); render(); toast('Dossier restauré');
  }
};

document.addEventListener('click', e => {
  const nav = e.target.closest('nav a'); if (nav) return go(nav.dataset.view);
  const el = e.target.closest('[data-act]'); if (!el) return;
  e.preventDefault();
  Promise.resolve(actions[el.dataset.act](el.dataset, el)).catch(() => {});
});

document.addEventListener('submit', e => {
  e.preventDefault();
  if (e.target.id === 'companyForm') {
    const v = fd(e.target);
    return mutate(() => Object.assign(db.company, v)).then(() => toast('Paramètres enregistrés')).catch(() => {});
  }
  if (e.target.id === 'modalForm' && onSubmit) {
    if (!e.target.reportValidity()) return;
    Promise.resolve(onSubmit(fd(e.target))).then(closeModal).catch(() => {});
  }
});

document.addEventListener('change', e => {
  const id = e.target.id;
  if (id === 'q') return go('tiers', { q: e.target.value });
  if (id === 'jf') return go('journal', { j: e.target.value });
  if (id === 'df') return go(view, { f: e.target.value });
  if (id === 'pfrom' || id === 'pto') return go(view, { ...param, from: $('#pfrom').value, to: $('#pto').value });
  if (e.target.name === 'productId') {
    const p = db.products.find(x => x.id === e.target.value), tr = e.target.closest('tr');
    if (p) {
      const kind = $('#modalForm')._doc.kind;
      tr.querySelector('[name=label]').value = p.label;
      tr.querySelector('[name=price]').value = ((kind === 'SALE' ? p.price : p.cost) / 100).toFixed(2).replace('.', ',');
      tr.querySelector('[name=vat]').value = p.vat;
    }
  }
  if (e.target.closest('#lines') || ['globalDisc'].includes(e.target.name)) {
    try {
      const t = L.docTotals({ lines: readLines($('#modalForm')), globalDisc: num($('#modalForm').globalDisc.value || 0) });
      $('#tot').innerHTML = `<div><span>Total HT</span><span>${eur(t.ht)}</span></div><div><span>TVA</span><span>${eur(t.tva)}</span></div><div class="big"><span>Total TTC</span><span>${eur(t.ttc)}</span></div>`;
    } catch { /* saisie en cours */ }
  }
});

// après le chargement de tous les scripts (dashboard.js, tools.js… complètent les vues)
window.addEventListener('DOMContentLoaded', () => window.api.load().then(txt => { db = txt ? JSON.parse(txt) : L.empty(); render(); }));
