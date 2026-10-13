// Centre de personnalisation : panneau latéral avec aperçu immédiat, menu reconfigurable, favoris, tableaux de bord.
// Les réglages sont modifiés sur un brouillon (previewPrefs) appliqué en direct ; « Enregistrer » le rend définitif.
(function () {
  const P = window.Prefs;
  const SECTIONS = [
    { label: '', items: ['dashboard'] },
    { label: 'Commercial', items: ['sales', 'purchases', 'tiers', 'products'] },
    { label: 'Comptabilité', items: ['treasury', 'journal', 'balance', 'states', 'vat'] },
    { label: 'Outils', items: ['tools', 'automation'] },
    { label: 'Dossier', items: ['settings', 'backups', 'help'] }
  ];
  const LABELS = { dashboard: 'Tableau de bord', sales: 'Ventes', purchases: 'Achats', tiers: 'Clients & fournisseurs', products: 'Articles & stock', treasury: 'Trésorerie', journal: 'Écritures', balance: 'Balance & grand livre', states: 'Bilan & résultat', vat: 'TVA', tools: 'Boîte à outils', automation: 'Automatisations', settings: 'Paramètres & exports', backups: 'Sauvegardes', help: 'Aide & manuel' };
  const LOCKED = ['dashboard', 'settings'];
  let tab = 'theme', navKey = '';

  const cur = () => window.previewPrefs || prefs;
  const ordered = items => { const o = cur().nav.order; return [...items].sort((a, b) => (o.indexOf(a) + 1 || 999) - (o.indexOf(b) + 1 || 999) || items.indexOf(a) - items.indexOf(b)); };

  // Menu construit depuis les préférences : favoris, ordre et pages masquées
  window.renderNav = () => {
    const p = cur(), key = JSON.stringify([p.nav, p.favorites]);
    if (key !== navKey) {
      navKey = key;
      const favs = p.favorites.map((f, i) => `<a data-view="${f.type === 'tool' ? 'tools' : esc(f.id)}" ${f.type === 'tool' ? `data-t="${esc(f.id)}"` : ''} class="fav" title="Alt + ${i + 1}">★ ${esc(f.label)}</a>`).join('');
      $('nav').innerHTML = (favs ? `<small>Favoris</small>${favs}` : '') + SECTIONS.map(s => {
        const items = ordered(s.items).filter(v => !p.nav.hidden.includes(v));
        return items.length ? (s.label ? `<small>${s.label}</small>` : '') + items.map(v => `<a data-view="${v}">${LABELS[v]}</a>`).join('') : '';
      }).join('');
    }
    document.querySelectorAll('nav a').forEach(a => a.classList.toggle('on', a.dataset.view === view && (!a.dataset.t || a.dataset.t === param.t)));
  };

  // ---------- Panneau ----------
  const get = (o, path) => path.split('.').reduce((x, k) => x && x[k], o);
  const set = (o, path, v) => { const ks = path.split('.'), last = ks.pop(); ks.reduce((x, k) => x[k], o)[last] = v; };
  const effective = () => { const p = cur(); return p.preset === 'custom' ? p.colors : { ...p.colors, ...P.PRESETS[p.preset] }; };
  const computed = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const toHex = c => { const m = /^#([0-9a-f]{6})$/i.exec(c); if (m) return c; const ctx = document.createElement('canvas').getContext('2d'); ctx.fillStyle = c || '#000'; return /^#/.test(ctx.fillStyle) ? ctx.fillStyle : '#000000'; };
  const radio = (k, val, label) => `<label class="opt"><input type="radio" name="${k}" data-k="${k}" value="${val}" ${String(get(cur(), k)) === String(val) ? 'checked' : ''}> ${label}</label>`;
  const color = (k, label, cssVar) => { const v = k === 'colors.primary' ? effective().primary : k === 'colors.secondary' ? effective().secondary : get(cur(), k); return `<div class="colr"><label>${label}<input type="color" data-k="${k}" value="${toHex(v || computed(cssVar))}"></label>${v !== undefined && cssVar ? `<button type="button" class="link" data-act="cReset" data-k="${k}" ${v ? '' : 'disabled'} title="Revenir à la couleur automatique">${v ? '↺ auto' : 'auto'}</button>` : ''}</div>`; };
  const range = (k, label, lo, hi, step, unit = '') => `<label>${label} <output>${get(cur(), k)}${unit}</output><input type="range" data-unit="${unit}" data-k="${k}" min="${lo}" max="${hi}" step="${step}" value="${get(cur(), k)}"></label>`;
  const check = (k, label) => `<label class="opt"><input type="checkbox" data-k="${k}" ${get(cur(), k) ? 'checked' : ''}> ${label}</label>`;

  const TABS = {
    theme: ['Thème', () => {
      const e = effective();
      return `<fieldset><legend>Affichage</legend><div class="opts">${radio('mode', 'auto', 'Automatique (système)')}${radio('mode', 'light', 'Clair')}${radio('mode', 'dark', 'Sombre')}</div></fieldset>
      <fieldset><legend>Thème de couleurs</legend><div class="swatches">${Object.entries(P.PRESETS).map(([k, x]) => `<button type="button" class="sw-btn ${cur().preset === k ? 'on' : ''}" data-act="cPreset" data-p="${k}" style="--a:${x.primary};--b:${x.secondary}" aria-pressed="${cur().preset === k}"><i></i>${x.label}</button>`).join('')}
        <button type="button" class="sw-btn ${cur().preset === 'custom' ? 'on' : ''}" data-act="cPreset" data-p="custom" style="--a:${e.primary};--b:${e.secondary}" aria-pressed="${cur().preset === 'custom'}"><i></i>Personnalisé</button></div>
        <div class="colors">${color('colors.primary', 'Principale')}${color('colors.secondary', 'Secondaire')}</div></fieldset>
      <fieldset><legend>Couleurs d'état</legend><div class="colors">${color('colors.success', 'Succès')}${color('colors.danger', 'Erreurs')}${color('colors.warning', 'Avertissements')}${color('colors.info', 'Informations')}</div></fieldset>
      <fieldset><legend>Surfaces <span class="k">(vide = automatique selon clair / sombre)</span></legend><div class="colors">${color('colors.bg', 'Arrière-plan', '--bg')}${color('colors.card', 'Cartes et boutons', '--panel')}${color('colors.border', 'Bordures', '--line')}${color('colors.tableHead', 'En-têtes de tableaux', '--th')}</div></fieldset>
      <fieldset><legend>Graphiques</legend><div class="colors">${color('colors.chart1', 'Série 1 (produits)', '--c0')}${color('colors.chart2', 'Série 2 (charges)', '--charges')}${color('colors.chart3', 'Série 3 (résultat)', '--c2')}</div></fieldset>`;
    }],
    text: ['Texte & confort', () => `<fieldset><legend>Texte</legend>${range('text.size', 'Taille générale', 12, 20, 1, ' px')}
      <label>Police<select data-k="text.font">${Object.entries(P.FONTS).map(([k, f]) => `<option value="${k}" ${cur().text.font === k ? 'selected' : ''}>${f.label}</option>`).join('')}</select></label>
      ${range('text.lineHeight', 'Hauteur de ligne', 1.2, 2, 0.05)}</fieldset>
      <fieldset><legend>Densité</legend><div class="opts">${radio('text.density', 'compact', 'Compacte')}${radio('text.density', 'comfortable', 'Confortable')}${radio('text.density', 'airy', 'Aérée')}</div></fieldset>
      <fieldset><legend>Formes et lisibilité</legend>${range('text.radius', 'Arrondis', 0, 24, 1, ' px')}${check('text.contrast', 'Contraste renforcé (bordures et textes secondaires plus marqués, verre désactivé)')}</fieldset>
      <fieldset><legend>Animations</legend><div class="opts">${radio('motion', 'auto', 'Selon le réglage du système')}${radio('motion', 'full', 'Complètes')}${radio('motion', 'reduced', 'Réduites')}${radio('motion', 'off', 'Aucune')}</div></fieldset>`],
    effects: ['Effets', () => `<fieldset><legend>Verre dépoli</legend>${check('effects.glass', 'Cartes en verre dépoli')}${range('effects.opacity', 'Opacité des cartes', 30, 100, 1, ' %')}${range('effects.blur', 'Flou', 0, 30, 1, ' px')}</fieldset>
      <fieldset><legend>Relief et couleurs</legend>${range('effects.shadows', 'Ombres', 0, 2, 0.25)}${check('effects.gradients', 'Dégradés (titres, boutons, jauges)')}${check('effects.halos', 'Halos colorés en arrière-plan')}</fieldset>`],
    nav: ['Menu & favoris', () => {
      const p = cur(), all = SECTIONS.flatMap(s => s.items);
      const pages = all.map(v => ({ type: 'view', id: v, label: LABELS[v] })), tools = window.Toolbox.TOOLS.map(t => ({ type: 'tool', id: t.t, label: t.title }));
      return `<fieldset><legend>Favoris <span class="k">(Alt + 1 à 9)</span></legend>
        ${p.favorites.length ? `<ul class="reorder">${p.favorites.map((f, i) => `<li><span>${i < 9 ? `<kbd>Alt ${i + 1}</kbd>` : ''} ${esc(f.label)}</span><button type="button" data-act="favMove" data-i="${i}" data-d="-1" aria-label="Monter">↑</button><button type="button" data-act="favMove" data-i="${i}" data-d="1" aria-label="Descendre">↓</button><button type="button" class="danger" data-act="favDel" data-i="${i}" aria-label="Retirer">✕</button></li>`).join('')}</ul>` : '<p class="k">Aucun favori.</p>'}
        <label>Ajouter<select id="favAdd"><option value="">Choisir une page ou un outil…</option><optgroup label="Pages">${pages.map(x => `<option value="view:${x.id}">${esc(x.label)}</option>`).join('')}</optgroup><optgroup label="Outils">${tools.map(x => `<option value="tool:${x.id}">${esc(x.label)}</option>`).join('')}</optgroup></select></label></fieldset>
      ${SECTIONS.filter(s => s.items.length > 1 || s.label).map(s => `<fieldset><legend>${s.label || 'Accueil'}</legend><ul class="reorder">${ordered(s.items).map((v, i, arr) => `<li><label class="opt"><input type="checkbox" data-nav-show="${v}" ${p.nav.hidden.includes(v) ? '' : 'checked'} ${LOCKED.includes(v) ? 'disabled' : ''}> ${LABELS[v]}</label>
        <button type="button" data-act="navMove" data-v="${v}" data-d="-1" ${i ? '' : 'disabled'} aria-label="Monter ${LABELS[v]}">↑</button><button type="button" data-act="navMove" data-v="${v}" data-d="1" ${i < arr.length - 1 ? '' : 'disabled'} aria-label="Descendre ${LABELS[v]}">↓</button></li>`).join('')}</ul></fieldset>`).join('')}`;
    }],
    dash: ['Tableaux de bord', () => {
      const p = cur(), D = window.Dashboards;
      return `<fieldset><legend>Mes tableaux de bord</legend><ul class="reorder">${p.dashboards.map((d, i) => `<li><label class="opt"><input type="radio" name="activeDash" data-k="activeDash" value="${esc(d.id)}" ${p.activeDash === d.id ? 'checked' : ''}></label>
        <input data-dash-name="${i}" value="${esc(d.name)}" aria-label="Nom du tableau ${i + 1}"><span class="k">${d.widgets.length} blocs</span>
        <button type="button" data-act="dMove" data-i="${i}" data-d="-1" aria-label="Monter">↑</button><button type="button" data-act="dMove" data-i="${i}" data-d="1" aria-label="Descendre">↓</button><button type="button" class="danger" data-act="dDel" data-i="${i}" ${p.dashboards.length > 1 ? '' : 'disabled'} aria-label="Supprimer">✕</button></li>`).join('')}</ul>
        <p class="k">La disposition des blocs se modifie sur le tableau de bord, bouton « Modifier la disposition ».</p></fieldset>
      <fieldset><legend>Créer depuis un profil</legend><div class="profiles">${Object.entries(D.PROFILES).map(([k, x]) => `<button type="button" data-act="dNew" data-p="${k}"><b>${x.name}</b><small>${x.desc}</small></button>`).join('')}</div></fieldset>`;
    }],
    file: ['Sauvegarde', () => `<fieldset><legend>Préférences d'interface</legend><p class="k">Les préférences (apparence, menu, favoris, tableaux de bord) sont enregistrées automatiquement dans ${window.api.platform === 'desktop' ? 'l\'application' : 'ce navigateur'}, séparément de vos données comptables. Exportez-les pour les retrouver sur un autre poste.</p>
      <div class="bar"><button type="button" data-act="pExport">Exporter (.json)</button><button type="button" data-act="pImport">Importer…</button></div></fieldset>
      <fieldset><legend>Réinitialiser</legend><div class="bar"><button type="button" data-act="pResetLook">Apparence d'origine</button><button type="button" data-act="pResetNav">Menu d'origine</button><button type="button" class="danger" data-act="pResetAll">Toutes les préférences</button></div></fieldset>`]
  };

  function panel() {
    let el = $('#custom');
    if (!el) { el = document.createElement('aside'); el.id = 'custom'; el.setAttribute('aria-label', 'Centre de personnalisation'); document.body.appendChild(el); }
    el.innerHTML = `<header><h3>Personnaliser</h3><button type="button" class="link" data-act="cClose" aria-label="Fermer">✕</button></header>
      <div class="ctabs" role="tablist">${Object.entries(TABS).map(([k, [l]]) => `<button type="button" role="tab" aria-selected="${tab === k}" class="${tab === k ? 'on' : ''}" data-act="cTab" data-t="${k}">${l}</button>`).join('')}</div>
      <div class="cbody">${TABS[tab][1]()}</div>
      <footer><span class="k">${changed() ? 'Aperçu non enregistré' : 'Aucune modification'}</span><button type="button" data-act="cCancel">Annuler</button><button type="button" class="primary" data-act="cSave" ${changed() ? '' : 'disabled'}>Enregistrer</button></footer>`;
    el.classList.add('open');
  }
  const changed = () => !!window.previewPrefs && JSON.stringify(P.sanitize(window.previewPrefs)) !== JSON.stringify(P.sanitize(prefs));
  const preview = (redraw = true) => { window.previewPrefs = P.sanitize(window.previewPrefs); applyPrefs(); renderNav(); if (redraw) panel(); else { const f = $('#custom footer'); if (f) { f.querySelector('.k').textContent = changed() ? 'Aperçu non enregistré' : 'Aucune modification'; f.querySelector('[data-act=cSave]').disabled = !changed(); } } if (view === 'dashboard') render(); };
  const draft = () => (window.previewPrefs = window.previewPrefs || P.clone(prefs));
  const close = () => { $('#custom') && $('#custom').classList.remove('open'); };

  function commit() { window.prefs = P.sanitize(window.previewPrefs); window.previewPrefs = null; if (!savePrefs()) toast('Préférences non enregistrées : stockage indisponible', true); applyPrefs(); renderNav(); render(); }

  Object.assign(actions, {
    customize: () => { draft(); panel(); },
    cTab: ({ t }) => { tab = t; panel(); },
    cClose: () => { if (changed() && !confirm('Abandonner les modifications non enregistrées ?')) return; window.previewPrefs = null; applyPrefs(); renderNav(); render(); close(); },
    cCancel: () => { window.previewPrefs = null; applyPrefs(); renderNav(); render(); close(); toast('Modifications annulées'); },
    cSave: () => { commit(); close(); toast('Préférences enregistrées'); },
    cPreset: ({ p }) => { const d = draft(); if (p === 'custom' && d.preset !== 'custom') { const e = effective(); d.colors.primary = e.primary; d.colors.secondary = e.secondary; } d.preset = p; preview(); },
    cReset: ({ k }) => { set(draft(), k, ''); preview(); },
    favMove: ({ i, d }) => { const f = draft().favorites, a = +i, b = a + +d; if (b < 0 || b >= f.length) return; [f[a], f[b]] = [f[b], f[a]]; preview(); },
    favDel: ({ i }) => { draft().favorites.splice(+i, 1); preview(); },
    navMove: ({ v, d }) => {
      const p = draft(), sec = SECTIONS.find(s => s.items.includes(v)), list = ordered(sec.items), i = list.indexOf(v), j = i + +d;
      if (j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
      p.nav.order = SECTIONS.flatMap(s => s === sec ? list : ordered(s.items));
      preview();
    },
    dMove: ({ i, d }) => { const l = draft().dashboards, a = +i, b = a + +d; if (b < 0 || b >= l.length) return; [l[a], l[b]] = [l[b], l[a]]; preview(); },
    dDel: ({ i }) => { const p = draft(); if (p.dashboards.length < 2) return; const [x] = p.dashboards.splice(+i, 1); if (p.activeDash === x.id) p.activeDash = p.dashboards[0].id; preview(); },
    dNew: ({ p: k }) => {
      const p = draft(), D = window.Dashboards, prof = D.PROFILES[k];
      if (p.dashboards.length >= 10) return toast('10 tableaux de bord au maximum', true);
      const d = { id: 'd' + Date.now().toString(36), name: prof.name, profile: k, widgets: prof.widgets.map(w => ({ id: w, size: D.W[w].size, tall: !!D.W[w].tall })) };
      p.dashboards.push(d); p.activeDash = d.id; preview();
    },
    pExport: async () => { if (await window.api.exportFile(`preferences-compta-elina-${today()}.json`, P.exportJSON(cur(), Store.checksum))) toast('Préférences exportées'); },
    pImport: async () => {
      const txt = await window.api.importFile();
      if (!txt) return;
      try { window.previewPrefs = P.importJSON(txt, Store.checksum); preview(); toast('Préférences chargées en aperçu : cliquez « Enregistrer » pour les garder'); }
      catch (e) { toast(e.message, true); }
    },
    pResetLook: () => { const d = draft(), z = P.DEFAULTS; Object.assign(d, { mode: z.mode, preset: z.preset, colors: P.clone(z.colors), effects: P.clone(z.effects), text: P.clone(z.text), motion: z.motion }); preview(); },
    pResetNav: () => { const d = draft(); d.nav = { order: [], hidden: [] }; d.favorites = []; preview(); },
    pResetAll: () => { if (!confirm('Revenir à toutes les préférences d\'origine (apparence, menu, favoris, tableaux de bord) ? Vous pourrez encore annuler avant d\'enregistrer.')) return; window.previewPrefs = P.clone(P.DEFAULTS); preview(); }
  });

  // Saisie dans le panneau : chaque modification est appliquée immédiatement en aperçu
  const onField = e => {
    const t = e.target;
    if (!t.closest || !t.closest('#custom')) return;
    const d = draft();
    if (t.dataset.k) {
      const k = t.dataset.k;
      let v = t.type === 'checkbox' ? t.checked : t.type === 'range' ? Number(t.value) : t.value;
      if (t.type === 'radio' && !t.checked) return;
      set(d, k, v);
      if (k === 'colors.primary' || k === 'colors.secondary') { if (d.preset !== 'custom') { const e2 = { ...d.colors, ...P.PRESETS[d.preset] }; d.colors.primary = k === 'colors.primary' ? v : e2.primary; d.colors.secondary = k === 'colors.secondary' ? v : e2.secondary; d.preset = 'custom'; } }
      const out = t.parentElement.querySelector('output'); if (out) out.textContent = v + (t.dataset.unit || '');
      preview(e.type === 'change' && (t.type === 'radio' || t.type === 'color' || k.startsWith('colors')));
    }
    if (t.dataset.navShow) { const h = d.nav.hidden, v = t.dataset.navShow; t.checked ? h.splice(h.indexOf(v), 1) : h.push(v); preview(false); }
    if (t.dataset.dashName !== undefined && e.type === 'change') { d.dashboards[+t.dataset.dashName].name = t.value.trim().slice(0, 40) || 'Tableau de bord'; preview(false); }
    if (t.id === 'favAdd' && t.value && e.type === 'change') {
      const [type, id] = t.value.split(':'), label = type === 'tool' ? window.Toolbox.TOOLS.find(x => x.t === id).title : LABELS[id];
      if (d.favorites.some(f => f.type === type && f.id === id)) return toast('Déjà dans les favoris');
      if (d.favorites.length >= 12) return toast('12 favoris au maximum', true);
      d.favorites.push({ type, id, label }); preview();
    }
  };
  document.addEventListener('input', onField);
  document.addEventListener('change', onField);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#custom.open') && !$('#modal').open) actions.cClose(); });
})();
