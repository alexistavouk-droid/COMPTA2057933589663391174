const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  load: () => ipcRenderer.invoke('load'),
  save: json => ipcRenderer.invoke('save', json),
  exportFile: (name, content, encoding) => ipcRenderer.invoke('export', name, content, encoding),
  importFile: () => ipcRenderer.invoke('import'),
  pdf: name => ipcRenderer.invoke('pdf', name)
});
