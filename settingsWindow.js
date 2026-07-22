// Janela de Configurações do Icozinho. Janela normal (com moldura, aparece na
// barra de tarefas) — separada do overlay transparente do pet. Carrega
// renderer/settings.html e conversa com o main pelos canais config:get /
// config:save (ver main.js e preload.js).
const { app, BrowserWindow } = require('electron');
const path = require('path');

let settingsWin = null;

// No "X" da janela, ela só MINIMIZA — o ícone continua na barra de tarefas
// (minimizado) e o processo (e o pet) segue rodando. Só fecha de verdade
// quando o app está de fato encerrando (before-quit), senão reabrir seria
// sempre um reload do zero.
let appQuitting = false;
app.on('before-quit', () => {
  appQuitting = true;
});

function createSettingsWindow() {
  // Já aberta → restaura da minimização e traz pra frente
  if (settingsWin && !settingsWin.isDestroyed()) {
    if (settingsWin.isMinimized()) settingsWin.restore();
    settingsWin.show();
    settingsWin.focus();
    return settingsWin;
  }

  settingsWin = new BrowserWindow({
    width: 920,
    height: 760,
    minWidth: 640,
    minHeight: 540,
    title: 'Icozinho — Configurações',
    autoHideMenuBar: true,
    backgroundColor: '#140e20',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  settingsWin.loadFile(path.join(__dirname, 'renderer', 'settings.html'));

  settingsWin.on('close', (event) => {
    if (appQuitting) return;
    event.preventDefault();
    settingsWin.minimize();
  });
  settingsWin.on('closed', () => {
    settingsWin = null;
  });
  return settingsWin;
}

module.exports = { createSettingsWindow };
