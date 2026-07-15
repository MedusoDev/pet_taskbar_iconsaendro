const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('petAPI', {
  setIgnoreMouseEvents: (ignore) => {
    ipcRenderer.send('set-ignore-mouse-events', ignore);
  },
  onCursorMove: (callback) => {
    ipcRenderer.on('cursor-pos', (_event, point) => callback(point));
  },
});
