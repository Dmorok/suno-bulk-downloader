const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  login: () => ipcRenderer.invoke('auth:login'),
  checkAuth: () => ipcRenderer.invoke('auth:check'),
  logout: () => ipcRenderer.invoke('auth:logout'),
  toggleAuthWindow: () => ipcRenderer.invoke('auth:toggleWindow'),
  listWorkspaces: () => ipcRenderer.invoke('workspaces:list'),
  refreshWorkspaces: () => ipcRenderer.invoke('workspaces:refresh'),
  selectFolder: () => ipcRenderer.invoke('folder:select'),
  startDownload: (payload) => ipcRenderer.invoke('download:start', payload),
  cancelDownload: () => ipcRenderer.invoke('download:cancel'),
  onLog: (cb) => ipcRenderer.on('log', (_e, msg) => cb(msg)),
  onProgress: (cb) => ipcRenderer.on('progress', (_e, data) => cb(data)),
  onWorkspacesUpdate: (cb) => ipcRenderer.on('workspaces:update', (_e, list) => cb(list)),
});
