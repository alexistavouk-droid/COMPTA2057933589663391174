// Manuel intégré : affiche le contenu de window.MANUAL (manual-content.js) avec ses captures réelles.
(function () {
  views.help = () => {
    const M = window.MANUAL;
    if (!M) return '<h1>Aide & manuel</h1><div class="empty">Manuel en cours de rédaction.</div>';
    return `<h1>Aide & manuel</h1><p class="sub">${esc(M.intro)} <a href="manual/Manuel-Compta-Elina.pdf" target="_blank" rel="noopener">Télécharger le manuel PDF</a></p>
    <div class="manual"><nav class="toc" aria-label="Sommaire du manuel">${M.sections.map((s, i) => `<a data-act="manualGo" data-i="${i}">${i + 1}. ${esc(s.title)}</a>`).join('')}</nav>
    <div>${M.sections.map((s, i) => `<section id="man-${i}"><h2>${i + 1}. ${esc(s.title)}</h2>
      <div class="meta"><div><b>Objectif</b><br>${esc(s.goal)}</div><div><b>Prérequis</b><br>${esc(s.prereq)}</div></div>
      <ol class="steps">${s.steps.map(x => `<li>${esc(x)}</li>`).join('')}</ol>
      ${(s.shots || []).map(sh => `<figure><img src="manual/img/${esc(sh.file)}" alt="${esc(sh.caption)}" loading="lazy"><figcaption>${esc(sh.caption)}</figcaption></figure>`).join('')}
      <div class="result"><b>Résultat attendu :</b> ${esc(s.result)}</div>
      ${s.avoid ? `<div class="avoid" style="margin-top:8px"><b>À éviter :</b> ${esc(s.avoid)}</div>` : ''}
      ${s.recover ? `<div class="recover"><b>En cas de problème :</b> ${esc(s.recover)}</div>` : ''}</section>`).join('')}</div></div>`;
  };
  actions.manualGo = ({ i }) => { const el = document.getElementById('man-' + i); if (el) el.scrollIntoView({ behavior: motionReduced() ? 'auto' : 'smooth' }); };
})();
