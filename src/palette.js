// Recherche rapide Ctrl/Cmd + K : pages, outils, factures, tiers et articles.
(function () {
  const box = document.createElement('div');
  box.id = 'palette';
  box.innerHTML = '<div class="pal"><input placeholder="Rechercher une facture, un client, un article, un outil…" aria-label="Recherche rapide"><ul role="listbox"></ul><div class="pal-hint">↑ ↓ pour naviguer · Entrée pour ouvrir · Échap pour fermer</div></div>';
  document.body.appendChild(box);
  const input = box.querySelector('input'), ul = box.querySelector('ul');
  let items = [], sel = 0;

  function all() {
    const out = [...document.querySelectorAll('nav a')].map(a => ({ k: 'Page', label: a.textContent, run: () => go(a.dataset.view) }));
    window.Toolbox.TOOLS.forEach(x => out.push({ k: 'Outil', label: x.title, run: () => go('tools', { t: x.t }) }));
    out.push({ k: 'Action', label: 'Nouvelle facture client', run: () => { go('sales'); actions.newDoc({ kind: 'SALE', type: 'INVOICE' }); } },
      { k: 'Action', label: 'Nouvelle facture fournisseur', run: () => { go('purchases'); actions.newDoc({ kind: 'PURCHASE', type: 'INVOICE' }); } },
      { k: 'Action', label: 'Nouveau devis', run: () => { go('sales'); actions.newDoc({ kind: 'SALE', type: 'QUOTE' }); } });
    for (const d of db.docs) out.push({ k: (d.kind === 'SALE' ? 'Vente' : 'Achat'), label: `${d.number || 'Brouillon'} · ${tierName(d.tierId)} · ${eur((d.totals || L.docTotals(d)).ttc)}`, run: () => { go(d.kind === 'SALE' ? 'sales' : 'purchases'); docForm({ id: d.id }); } });
    for (const t of db.tiers) out.push({ k: t.type === 'C' ? 'Client' : 'Fournisseur', label: `${t.name} · ${t.code}`, run: () => { go('tiers'); actions.tierForm({ id: t.id }); } });
    for (const p of db.products) out.push({ k: 'Article', label: `${p.label} · ${p.sku}`, run: () => { go('products'); actions.productForm({ id: p.id }); } });
    return out;
  }

  const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  function draw() {
    const q = norm(input.value.trim());
    items = all().filter(x => !q || q.split(/\s+/).every(w => norm(x.k + ' ' + x.label).includes(w))).slice(0, 40);
    sel = Math.min(sel, Math.max(0, items.length - 1));
    ul.innerHTML = items.length ? items.map((x, i) => `<li role="option" data-i="${i}" class="${i === sel ? 'on' : ''}"><small>${esc(x.k)}</small>${esc(x.label)}</li>`).join('') : '<li class="none">Aucun résultat</li>';
    const on = ul.querySelector('.on'); if (on) on.scrollIntoView({ block: 'nearest' });
  }
  const open = () => { box.classList.add('show'); input.value = ''; sel = 0; draw(); input.focus(); };
  const close = () => box.classList.remove('show');
  const run = i => { const x = items[i]; if (!x) return; close(); if ($('#modal').open) $('#modal').close(); x.run(); };

  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); box.classList.contains('show') ? close() : open(); return; }
    if (!box.classList.contains('show')) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowDown') { sel = Math.min(items.length - 1, sel + 1); draw(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); draw(); e.preventDefault(); }
    else if (e.key === 'Enter') { run(sel); e.preventDefault(); }
  });
  input.addEventListener('input', () => { sel = 0; draw(); });
  ul.addEventListener('click', e => { const li = e.target.closest('li[data-i]'); if (li) run(+li.dataset.i); });
  box.addEventListener('mousedown', e => { if (e.target === box) close(); });
  window.openPalette = open;
})();
