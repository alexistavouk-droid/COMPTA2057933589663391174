// Test d'intégration de la version Windows : lance le vrai main.js dans un dossier de données temporaire.
// Usage : npm run e2e   (code de sortie 0 si tout passe)
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'compta-elina-e2e-'));
process.env.COMPTA_ELINA_DATA = dir;
const { app, BrowserWindow } = require('electron');
require('../main.js');

const wait = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? '✔' : '✘'} ${name}${detail ? ' — ' + detail : ''}`); };

app.whenReady().then(async () => {
  let win;
  for (let i = 0; i < 50 && !(win = BrowserWindow.getAllWindows()[0]); i++) await wait(100);
  const wc = win.webContents, errors = [];
  wc.on('console-message', (_e, level, msg) => { if (level >= 3) errors.push(msg); });
  const js = code => wc.executeJavaScript(`(async () => { ${code} })()`);
  const ready = async () => { for (let i = 0; i < 100; i++) { if (await wc.executeJavaScript('typeof db !== "undefined" && !!db')) return; await wait(100); } throw new Error('application non prête'); };
  try {
    await ready();
    check('Plateforme Windows détectée', await js('return window.api.platform') === 'desktop');
    await js('window.confirm = () => true; await actions.demo();');
    const counts = await js('return { docs: db.docs.length, entries: db.entries.length, demo: db.demo }');
    check('Démo chargée et comptabilisée', counts.docs > 50 && counts.entries > 100 && counts.demo, JSON.stringify(counts));
    check('Dossier écrit sur disque', fs.existsSync(path.join(dir, 'compta.json')));
    await js("prefs.preset = 'emeraude'; prefs.text.size = 15; savePrefs(); applyPrefs();");
    wc.reload(); await ready();
    const after = await js("return { docs: db.docs.length, preset: prefs.preset, size: prefs.text.size, accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() }");
    check('Données relues après redémarrage', after.docs === counts.docs);
    check('Préférences conservées après redémarrage', after.preset === 'emeraude' && after.size === 15 && after.accent === '#047857', JSON.stringify(after));
    const snaps = await js("await window.api.snapshot(Store.envelope(db, APP_VERSION), 'Test e2e'); return await window.api.listSnapshots()");
    check('Historique des sauvegardes', snaps.some(s => s.label === 'Test e2e') && snaps.some(s => s.label === 'Planifiée'), snaps.map(s => s.label).join(', '));
    const read = await js(`const t = await window.api.readSnapshot(${JSON.stringify(snaps[0].id)}); return Store.parseBackup(t).db.docs.length`);
    check('Relecture et validation d\'une sauvegarde', read === counts.docs);
    const badId = await js("try { await window.api.readSnapshot('../compta'); return 'lu'; } catch (e) { return 'refusé'; }");
    check('Lecture hors du dossier des sauvegardes refusée', badId === 'refusé');
    const exp = await js("try { await window.api.autoExport([{ name: 'x.txt', content: 'x' }]); return 'écrit'; } catch (e) { return 'refusé'; }");
    check('Export automatique refusé sans dossier autorisé', exp === 'refusé');
    const url0 = wc.getURL();
    await js("location.href = 'https://example.com'; return 1").catch(() => {});
    await wait(500);
    check('Navigation hors de l\'application bloquée', wc.getURL() === url0);
    await js("window.open('https://example.com'); return 1");
    await wait(300);
    check('Ouverture de nouvelle fenêtre bloquée', BrowserWindow.getAllWindows().length === 1);
    const views = await js("const out = []; for (const v of ['dashboard','sales','purchases','tiers','products','treasury','journal','balance','states','vat','tools','automation','backups','settings','help','movements','reconcile']) { go(v); await new Promise(r => setTimeout(r, 30)); out.push(document.querySelector('h1') ? 1 : 0); } return out.every(Boolean)");
    check('Toutes les pages s\'affichent', views);
    await js('await Automation.tick()');
    check('Moteur d\'automatisation exécuté', await js('return !!db.automation.lastRun'));
    check('Aucune erreur dans la console', !errors.length, errors.slice(0, 3).join(' | '));
  } catch (e) {
    check('Exécution du test', false, e.message);
  }
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} vérifications réussies`);
  // Chromium garde des fichiers ouverts jusqu'à la sortie : le dossier temporaire est laissé au nettoyage du système
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* fichiers verrouillés */ }
  app.exit(failed ? 1 : 0);
});
