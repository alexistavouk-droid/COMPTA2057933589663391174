const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const dataFile = () => path.join(app.getPath('userData'), 'compta.json');
let win;

app.whenReady().then(() => {
  win = new BrowserWindow({
    width: 1360, height: 860, minWidth: 980, minHeight: 640, title: 'Compta Elina',
    backgroundColor: '#f7f7f5', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true }
  });
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
});
app.on('window-all-closed', () => app.quit());

ipcMain.handle('load', () => fs.existsSync(dataFile()) ? fs.readFileSync(dataFile(), 'utf8') : null);

// Écriture atomique + copie de la version précédente : un crash en cours d'écriture ne détruit rien.
ipcMain.handle('save', (_e, json) => {
  JSON.parse(json);
  const f = dataFile(), tmp = f + '.tmp';
  fs.writeFileSync(tmp, json);
  if (fs.existsSync(f)) fs.copyFileSync(f, f + '.bak');
  fs.renameSync(tmp, f);
  return true;
});

ipcMain.handle('export', async (_e, name, content, encoding) => {
  const { canceled, filePath } = await dialog.showSaveDialog(win, { defaultPath: name });
  if (canceled) return false;
  fs.writeFileSync(filePath, content, encoding === 'latin1' ? 'latin1' : 'utf8');
  return filePath;
});

ipcMain.handle('import', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, { filters: [{ name: 'Sauvegarde', extensions: ['json'] }] });
  return canceled ? null : fs.readFileSync(filePaths[0], 'utf8');
});

ipcMain.handle('pdf', async (_e, name) => {
  const { canceled, filePath } = await dialog.showSaveDialog(win, { defaultPath: name, filters: [{ name: 'PDF', extensions: ['pdf'] }] });
  if (canceled) return false;
  fs.writeFileSync(filePath, await win.webContents.printToPDF({ pageSize: 'A4', printBackground: true, margins: { marginType: 'none' } }));
  return filePath;
});
