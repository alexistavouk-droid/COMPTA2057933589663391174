// Produit les captures RÉELLES du manuel et le PDF : lance le vrai logiciel (main.js) dans un dossier de données
// temporaire, charge la démo fictive, prépare chaque écran décrit dans manual-content.js, dessine les repères numérotés
// par-dessus l'écran réel, capture, puis imprime le manuel en PDF.
// Usage : npm run manual            (option --web=URL pour capturer aussi la version site)
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'compta-elina-manuel-'));
process.env.COMPTA_ELINA_DATA = dir;
const { app, BrowserWindow } = require('electron');
require('../main.js');

const ROOT = path.join(__dirname, '..');
const IMG = path.join(ROOT, 'src', 'manual', 'img');
const PDF = path.join(ROOT, 'src', 'manual', 'Manuel-Compta-Elina.pdf');
const WEB = (process.argv.find(a => a.startsWith('--web=')) || '').slice(6);
const wait = ms => new Promise(r => setTimeout(r, ms));
const W = 1280, H = 820;

// Repères : cadre et pastille numérotée posés au-dessus de l'élément réel (dans la fenêtre modale si elle est ouverte)
const ANNOTATE = `window.__annotate = marks => {
  document.getElementById('__marks')?.remove();
  const host = document.querySelector('dialog[open]') || document.body, layer = document.createElement('div'), problems = [];
  layer.id = '__marks'; layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647';
  for (const [sel, n] of marks) {
    const el = document.querySelector(sel);
    if (!el) { problems.push(sel + ' : introuvable'); continue; }
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) { problems.push(sel + ' : invisible'); continue; }
    if (r.top > innerHeight - 10 || r.bottom < 0) { problems.push(sel + ' : hors écran'); continue; }
    const top = Math.max(2, r.top - 4), bottom = Math.min(innerHeight - 2, r.bottom + 4);
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;left:' + (r.left - 4) + 'px;top:' + top + 'px;width:' + (r.width + 8) + 'px;height:' + (bottom - top) + 'px;border:3px solid #ff2d55;border-radius:8px;box-shadow:0 0 0 2px rgba(255,255,255,.85)';
    const b = document.createElement('div');
    b.textContent = n;
    b.style.cssText = 'position:fixed;left:' + Math.max(2, r.left - 15) + 'px;top:' + Math.max(2, top - 13) + 'px;width:28px;height:28px;border-radius:50%;background:#ff2d55;color:#fff;font:700 16px/28px Arial,sans-serif;text-align:center;box-shadow:0 2px 6px rgba(0,0,0,.45),0 0 0 2px #fff';
    layer.append(box, b);
  }
  host.appendChild(layer);
  return problems;
};
window.__reset = () => {
  document.getElementById('__marks')?.remove();
  if (document.querySelector('dialog[open]')) closeModal();
  document.getElementById('custom')?.classList.remove('open'); window.previewPrefs = null; applyPrefs();
  document.getElementById('palette')?.classList.remove('show');
  document.getElementById('main').scrollTop = 0;
  document.getElementById('toast').className = '';
};`;

// Réglages communs aux captures : mode clair, thème d'origine, animations coupées (écran stable)
const PREFS = "localStorage.setItem('compta-elina-prefs', JSON.stringify(Prefs.sanitize({ mode: 'light', motion: 'off' })));";

async function prepare(wc) {
  for (let i = 0; i < 100; i++) { if (await wc.executeJavaScript('typeof db !== "undefined" && !!db').catch(() => false)) break; await wait(100); }
  await wc.executeJavaScript(PREFS);
  wc.reload();
  for (let i = 0; i < 100; i++) { if (await wc.executeJavaScript('typeof db !== "undefined" && !!db').catch(() => false)) break; await wait(100); }
  await wc.executeJavaScript(`(async () => { window.confirm = () => true; window.alert = () => {}; ${ANNOTATE} await actions.demo(); await Automation.tick(); await window.api.snapshot(Store.envelope(db, APP_VERSION), 'Manuelle'); })()`);
}

async function shoot(wc, shot) {
  const problems = await wc.executeJavaScript(`(async () => { __reset(); ${shot.setup || ''}; await new Promise(r => setTimeout(r, ${shot.wait || 250})); return __annotate(${JSON.stringify(shot.marks || [])}); })()`);
  await wait(150);
  const img = (await wc.capturePage()).resize({ width: W });
  fs.writeFileSync(path.join(IMG, shot.file), img.toJPEG(84));
  await wc.executeJavaScript(`(async () => { document.getElementById('__marks')?.remove(); ${shot.after || ''} })()`);
  return problems;
}

app.whenReady().then(async () => {
  fs.mkdirSync(IMG, { recursive: true });
  let win;
  for (let i = 0; i < 50 && !(win = BrowserWindow.getAllWindows()[0]); i++) await wait(100);
  win.setContentSize(W, H);
  const wc = win.webContents;
  const report = [];
  try {
    await prepare(wc);
    const sections = await wc.executeJavaScript('MANUAL.sections.map(s => ({ title: s.title, shots: s.shots }))');
    for (const s of sections) for (const shot of s.shots || []) {
      if (shot.web) continue;
      const problems = await shoot(wc, shot);
      report.push({ file: shot.file, problems });
      console.log(`${problems.length ? '⚠' : '✔'} ${shot.file}${problems.length ? ' — ' + problems.join(' ; ') : ''}`);
    }
    // Version site : capturée depuis l'adresse publique, dans une session de navigateur vierge, sans le pont Electron
    const webShots = sections.flatMap(s => (s.shots || []).filter(x => x.web));
    if (WEB && webShots.length) {
      const web = new BrowserWindow({ width: W, height: H, useContentSize: true, show: true, webPreferences: { partition: 'capture-web', contextIsolation: true, sandbox: true } });
      await web.loadURL(WEB);
      await prepare(web.webContents);
      for (const shot of webShots) {
        const problems = await shoot(web.webContents, { ...shot, setup: 'go("backups");', wait: 700 });
        const platform = await web.webContents.executeJavaScript('window.api.platform');
        report.push({ file: shot.file, problems: platform === 'web' ? problems : ['la page capturée n\'est pas la version web'] });
        console.log(`${platform === 'web' ? '✔' : '⚠'} ${shot.file} (version ${platform}, ${WEB})`);
      }
      web.destroy();
    } else if (webShots.length) console.log('⚠ Capture de la version site non faite : relancez avec --web=URL');

    // PDF du manuel
    const pdfWin = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, sandbox: true } });
    await pdfWin.loadFile(path.join(ROOT, 'src', 'manual-print.html'));
    await wait(800);
    fs.writeFileSync(PDF, await pdfWin.webContents.printToPDF({ pageSize: 'A4', printBackground: true, displayHeaderFooter: true, headerTemplate: '<span></span>', footerTemplate: '<div style="width:100%;font-size:8px;color:#888;text-align:center">Compta Elina · Mode opératoire · page <span class="pageNumber"></span> / <span class="totalPages"></span></div>', margins: { top: 0.5, bottom: 0.6, left: 0.5, right: 0.5 } }));
    console.log(`✔ PDF : ${path.relative(ROOT, PDF)} (${Math.round(fs.statSync(PDF).size / 1024)} Ko)`);
  } catch (e) {
    console.error('✘ ' + e.stack);
    report.push({ file: '-', problems: [e.message] });
  }
  fs.writeFileSync(path.join(IMG, 'rapport-captures.json'), JSON.stringify(report, null, 1));
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* fichiers verrouillés par Chromium */ }
  app.exit(report.some(r => r.problems.length) ? 1 : 0);
});
