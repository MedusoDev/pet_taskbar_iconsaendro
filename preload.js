const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('petAPI', {
  setIgnoreMouseEvents: (ignore, keepFocus = false) => {
    ipcRenderer.send('set-ignore-mouse-events', { ignore, keepFocus });
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
  // Monitor de sistema: RAM/CPU/uptime a cada 5s (main.js)
  onSysStats: (callback) => {
    ipcRenderer.on('sys-stats', (_event, stats) => callback(stats));
  },
  // AI_Chat: status da IA (chave configurada?) + envio de mensagem
  onAIStatus: (callback) => {
    ipcRenderer.on('ai-status', (_event, status) => callback(status));
  },
  sendChat: (text, context) => {
    return ipcRenderer.invoke('chat-message', { text, context });
  },
  log: (line) => {
    ipcRenderer.send('pet-log', line);
  },
});
