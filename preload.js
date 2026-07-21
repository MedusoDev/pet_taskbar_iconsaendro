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

  // ── Config / Configurações (usado pelo pet e pela janela de Configurações) ──
  // Lê a config salva (mesclada sobre os defaults).
  getConfig: () => ipcRenderer.invoke('config:get'),
  // Grava um patch e devolve a config resultante; o main também reemite pro
  // pet aplicar ao vivo (onConfig).
  saveConfig: (patch) => ipcRenderer.invoke('config:save', patch),
  // Pet: recebe a config atualizada quando ela muda (aplica ao vivo).
  onConfig: (callback) => {
    ipcRenderer.on('config:changed', (_event, config) => callback(config));
  },
  // Abre a janela de Configurações (usado por um eventual botão/atalho).
  openSettings: () => ipcRenderer.send('settings:open'),
});
