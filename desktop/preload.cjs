const { contextBridge, ipcRenderer, webUtils } = require('electron');

const on = (channel) => (fn) => {
  const handler = (_e, payload) => fn(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.off(channel, handler);
};

contextBridge.exposeInMainWorld('kimo', {
  status: () => ipcRenderer.invoke('status'),
  library: () => ipcRenderer.invoke('library'),
  log: (id) => ipcRenderer.invoke('project:log', id),
  pathsOf: (files) => [...files].map((f) => webUtils.getPathForFile(f)).filter(Boolean),
  expand: (paths) => ipcRenderer.invoke('expand', paths),
  pick: (folders) => ipcRenderer.invoke('pick', folders),
  create: (opts) => ipcRenderer.invoke('create', opts),
  rerun: (opts) => ipcRenderer.invoke('rerun', opts),
  stop: (id) => ipcRenderer.invoke('stop', id),
  remove: (id) => ipcRenderer.invoke('remove', id),
  save: (opts) => ipcRenderer.invoke('save', opts),
  reveal: (file) => ipcRenderer.invoke('reveal', file),
  downloadModel: () => ipcRenderer.invoke('model:download'),
  openLog: () => ipcRenderer.invoke('openLog'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onProject: on('project'),
  onEvent: on('event'),
  onProgress: on('progress'),
  onUpdate: on('update'),
});
