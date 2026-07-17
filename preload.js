const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('petAPI', {
  setIgnoreMouseEvents: (ignore) => {
    ipcRenderer.send('set-ignore-mouse-events', ignore);
  },
  onCursorMove: (callback) => {
    ipcRenderer.on('cursor-pos', (_event, point) => callback(point));
  },
  onScreenConfig: (callback) => {
    ipcRenderer.on('screen-config', (_event, config) => callback(config));
  },
  onActiveSite: (callback) => {
    ipcRenderer.on('active-site', (_event, data) => callback(data));
  },
  log: (line) => {
    ipcRenderer.send('pet-log', line);
  },
});
