const { contextBridge, ipcRenderer } = require('electron');

// Seules ces fonctions sont exposées à la page : aucun accès direct au système de fichiers.
contextBridge.exposeInMainWorld('api', {
  platform: 'desktop',
  load: () => ipcRenderer.invoke('load'),
  save: json => ipcRenderer.invoke('save', json),
  exportFile: (name, content, encoding) => ipcRenderer.invoke('export', name, content, encoding),
  importFile: () => ipcRenderer.invoke('import'),
  pdf: name => ipcRenderer.invoke('pdf', name),
  snapshot: (json, label, keep) => ipcRenderer.invoke('snapshot', json, label, keep),
  listSnapshots: () => ipcRenderer.invoke('listSnapshots'),
  readSnapshot: id => ipcRenderer.invoke('readSnapshot', id),
  chooseExportFolder: () => ipcRenderer.invoke('chooseExportFolder'),
  autoExport: files => ipcRenderer.invoke('autoExport', files)
});
