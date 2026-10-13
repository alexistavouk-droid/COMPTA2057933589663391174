// Mise en page imprimable du manuel (source unique : manual-content.js), utilisée pour produire le PDF.
(function () {
  const M = window.MANUAL;
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const date = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  document.getElementById('doc').innerHTML = `
  <section class="cover"><div class="logo"></div><h1>Compta Elina</h1><p class="subtitle">Mode opératoire illustré · version ${esc(M.version)}</p><p>${esc(M.intro)}</p><p class="date">Édition du ${date}</p>
    <h2>Sommaire</h2><ol class="toc">${M.sections.map(s => `<li>${esc(s.title)}</li>`).join('')}</ol>
    <p class="note">Les captures montrent des données fictives de démonstration. Ce manuel décrit le fonctionnement du logiciel ; il ne remplace pas l'avis d'un expert-comptable et ne garantit pas la conformité fiscale de vos déclarations.</p></section>
  ${M.sections.map((s, i) => `<section class="chap"><h2><span>${i + 1}</span>${esc(s.title)}</h2>
    <table class="meta"><tr><th>Objectif</th><td>${esc(s.goal)}</td></tr><tr><th>Prérequis</th><td>${esc(s.prereq)}</td></tr></table>
    <h3>Étapes</h3><ol class="steps">${s.steps.map(x => `<li>${esc(x)}</li>`).join('')}</ol>
    ${(s.shots || []).map(sh => `<figure><img src="manual/img/${esc(sh.file)}" alt="${esc(sh.caption)}"><figcaption>${esc(sh.caption)}</figcaption></figure>`).join('')}
    <div class="box ok"><b>Résultat attendu</b>${esc(s.result)}</div>
    <div class="box warn"><b>Erreurs à éviter</b>${esc(s.avoid)}</div>
    <div class="box info"><b>Procédure de récupération</b>${esc(s.recover)}</div></section>`).join('')}`;
})();
