// Chargé dans <head> : applique les préférences avant le premier affichage pour éviter un flash de thème.
(function () {
  const dark = matchMedia('(prefers-color-scheme: dark)'), reduce = matchMedia('(prefers-reduced-motion: reduce)');
  window.prefs = Prefs.load();
  window.applyPrefs = p => Prefs.apply(p || window.previewPrefs || window.prefs, document, dark.matches);
  window.motionReduced = () => { const m = (window.previewPrefs || window.prefs).motion; return m === 'off' || m === 'reduced' || (m === 'auto' && reduce.matches); };
  window.savePrefs = () => { try { Prefs.save(window.prefs); return true; } catch { return false; } };
  applyPrefs();
  dark.addEventListener('change', () => applyPrefs());
})();
