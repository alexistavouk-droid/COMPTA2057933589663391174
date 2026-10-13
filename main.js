const { app, BrowserWindow, ipcMain, dialog, shell, session } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL, fileURLToPath } = require('node:url');

// Dossier de données isolé pour les tests et les captures du manuel (jamais les données réelles)
if (process.env.COMPTA_ELINA_DATA) app.setPath('userData', path.resolve(process.env.COMPTA_ELINA_DATA));

const SRC = path.join(__dirname, 'src');
const dataFile = () => path.join(app.getPath('userData'), 'compta.json');
const backupDir = () => path.join(app.getPath('userData'), 'backups');
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
const MAX = 50 * 1024 * 1024;
let win;

const readSettings = () => { try { return JSON.parse(fs.readFileSync(settingsFile(), 'utf8')); } catch { return {}; } };
const writeSettings = s => fs.writeFileSync(settingsFile(), JSON.stringify(s, null, 1));
const text = (v, max = MAX) => { if (typeof v !== 'string' || v.length > max) throw new Error('Contenu refusé'); return v; };
const atomicWrite = (f, content, enc) => { const tmp = f + '.tmp'; fs.writeFileSync(tmp, content, enc); fs.renameSync(tmp, f); };

app.whenReady().then(() => {
  // Aucune permission matérielle (caméra, micro, notifications système…) n'est accordée à la page
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  win = new BrowserWindow({
    width: 1360, height: 860, minWidth: 980, minHeight: 640, title: 'Compta Elina',
    backgroundColor: '#161618', autoHideMenuBar: true, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false }
  });
  win.once('ready-to-show', () => win.show());
  // Pas de nouvelles fenêtres ; le manuel PDF local s'ouvre dans le lecteur PDF du système
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('file:')) {
      const f = fileURLToPath(url);
      if (f.startsWith(SRC) && f.endsWith('.pdf') && fs.existsSync(f)) shell.openPath(f);
    }
    return { action: 'deny' };
  });
  // La page ne peut pas quitter l'application
  win.webContents.on('will-navigate', (e, url) => { if (url !== pathToFileURL(path.join(SRC, 'index.html')).href) e.preventDefault(); });
  win.loadFile(path.join(SRC, 'index.html'));
});
app.on('window-all-closed', () => app.quit());

ipcMain.handle('load', () => fs.existsSync(dataFile()) ? fs.readFileSync(dataFile(), 'utf8') : null);

// Écriture atomique + copie de la version précédente : un crash en cours d'écriture ne détruit rien.
ipcMain.handle('save', (_e, json) => {
  JSON.parse(text(json));
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  const f = dataFile();
  if (fs.existsSync(f)) fs.copyFileSync(f, f + '.bak');
  atomicWrite(f, json);
  return true;
});

ipcMain.handle('export', async (_e, name, content, encoding) => {
  const { canceled, filePath } = await dialog.showSaveDialog(win, { defaultPath: path.basename(String(name)) });
  if (canceled) return false;
  fs.writeFileSync(filePath, text(content), encoding === 'latin1' ? 'latin1' : 'utf8');
  return filePath;
});

ipcMain.handle('import', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, { filters: [{ name: 'Sauvegarde', extensions: ['json'] }] });
  if (canceled) return null;
  if (fs.statSync(filePaths[0]).size > MAX) throw new Error('Fichier trop volumineux');
  return fs.readFileSync(filePaths[0], 'utf8');
});

ipcMain.handle('pdf', async (_e, name) => {
  const { canceled, filePath } = await dialog.showSaveDialog(win, { defaultPath: path.basename(String(name)), filters: [{ name: 'PDF', extensions: ['pdf'] }] });
  if (canceled) return false;
  fs.writeFileSync(filePath, await win.webContents.printToPDF({ pageSize: 'A4', printBackground: true, margins: { marginType: 'none' } }));
  return filePath;
});

// ---------- Historique des sauvegardes : fichiers dans userData/backups + index ----------
const indexFile = () => path.join(backupDir(), 'index.json');
const readIndex = () => { try { return JSON.parse(fs.readFileSync(indexFile(), 'utf8')); } catch { return []; } };
const ID = /^b\d{10,16}[a-z0-9]{0,8}$/;

ipcMain.handle('snapshot', (_e, json, label, keep) => {
  JSON.parse(text(json));
  fs.mkdirSync(backupDir(), { recursive: true });
  const id = 'b' + Date.now() + Math.random().toString(36).slice(2, 6);
  atomicWrite(path.join(backupDir(), id + '.json'), json);
  let list = [{ id, at: new Date().toISOString(), label: String(label || 'Manuelle').slice(0, 60), size: json.length }, ...readIndex()];
  // la rotation ne supprime que les sauvegardes planifiées ; les copies de sécurité sont conservées
  const planned = list.filter(s => s.label === 'Planifiée');
  const limit = Math.min(50, Math.max(2, Number(keep) || 10));
  for (const old of planned.slice(limit)) { try { fs.unlinkSync(path.join(backupDir(), old.id + '.json')); } catch { /* déjà absent */ } list = list.filter(s => s.id !== old.id); }
  atomicWrite(indexFile(), JSON.stringify(list, null, 1));
  return id;
});
ipcMain.handle('listSnapshots', () => readIndex().filter(s => fs.existsSync(path.join(backupDir(), s.id + '.json'))));
ipcMain.handle('readSnapshot', (_e, id) => {
  if (!ID.test(String(id))) throw new Error('Identifiant de sauvegarde invalide');
  const f = path.join(backupDir(), id + '.json');
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null;
});

// ---------- Exports récurrents : uniquement dans le dossier choisi par l'utilisateur ----------
ipcMain.handle('chooseExportFolder', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, { title: 'Dossier des exports automatiques', properties: ['openDirectory', 'createDirectory'] });
  if (canceled) return null;
  writeSettings({ ...readSettings(), exportFolder: filePaths[0] });
  return filePaths[0];
});
ipcMain.handle('autoExport', (_e, files) => {
  const folder = readSettings().exportFolder;
  if (!folder || !fs.existsSync(folder)) throw new Error('Aucun dossier d\'export autorisé : choisissez-le dans Automatisations');
  if (!Array.isArray(files) || files.length > 10) throw new Error('Export refusé');
  for (const f of files) {
    const name = path.basename(String(f.name));
    if (!/^[\w.-]{1,80}\.(txt|csv|json)$/i.test(name)) throw new Error('Nom de fichier refusé : ' + name);
    atomicWrite(path.join(folder, name), text(f.content), f.encoding === 'latin1' ? 'latin1' : 'utf8');
  }
  return files.length;
});
