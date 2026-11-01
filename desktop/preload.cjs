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
  followup: (opts) => ipcRenderer.invoke('followup', opts),
  apply: (opts) => ipcRenderer.invoke('apply', opts),
  addMusic: (opts) => ipcRenderer.invoke('audio:add-music', opts),
  setColor: (opts) => ipcRenderer.invoke('color:set', opts),
  regenerateVisuals: (opts) => ipcRenderer.invoke('explain:regenerate', opts),
  edl: (id) => ipcRenderer.invoke('edl:get', id),
  saveThumb: (id) => ipcRenderer.invoke('saveThumb', id),
  copy: (text) => ipcRenderer.invoke('copy', text),
  reveal: (file) => ipcRenderer.invoke('reveal', file),
  downloadModel: () => ipcRenderer.invoke('model:download'),
  openLog: () => ipcRenderer.invoke('openLog'),
  samPreview: (opts) => ipcRenderer.invoke('sam:preview', opts),
  pickImage: () => ipcRenderer.invoke('pickImage'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  // AI access: owner sign-in (system browser) or your own key, held in memory only
  authStatus: () => ipcRenderer.invoke('auth:status'),
  signIn: (provider) => ipcRenderer.invoke('auth:signin', provider),
  signOut: () => ipcRenderer.invoke('auth:signout'),
  setKey: (input) => ipcRenderer.invoke('byok:set', input),
  clearKey: () => ipcRenderer.invoke('byok:clear'),
  onProject: on('project'),
  onEvent: on('event'),
  onProgress: on('progress'),
  onUpdate: on('update'),
});
