// Ponte da janela de Configurações — mesmo espírito do preload.js do pet:
// contextIsolation ligado, então settings.js só enxerga o que expomos aqui.
// Esta janela NÃO fala com o renderer do pet diretamente (são processos
// separados) — tudo passa pelo main, que faz o relé (ver main.js
// "settings:cmd" / "settings:pet-event" / "settings:main-event").
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('settingsAPI', {
  /** scope: 'main' (janela/pollers/apps/chaves — dono é o main.js) ou
   * 'pet' (personalidade/ritmo/interações/testes — dono é o renderer do
   * pet, via settingsBridge.js). */
  send: (scope, type, payload) => {
    ipcRenderer.send('settings:cmd', { scope, type, payload });
  },
  onPetEvent: (callback) => {
    ipcRenderer.on('settings:pet-event', (_event, msg) => callback(msg));
  },
  onMainEvent: (callback) => {
    ipcRenderer.on('settings:main-event', (_event, msg) => callback(msg));
  },
});
