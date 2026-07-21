// Janela de Configurações do Icozinho. Janela normal (com moldura, aparece na
// barra de tarefas) — separada do overlay transparente do pet. Carrega
// renderer/settings.html e conversa com o main pelos canais config:get /
// config:save (ver main.js e preload.js).
const { BrowserWindow } = require('electron');
const path = require('path');

let settingsWin = null;

function createSettingsWindow() {
  // Já aberta → só traz pra frente
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.show();
    settingsWin.focus();
    return settingsWin;
  }

  settingsWin = new BrowserWindow({
    width: 760,
    height: 640,
    minWidth: 560,
    minHeight: 480,
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
  settingsWin.on('closed', () => {
    settingsWin = null;
  });
  return settingsWin;
}

module.exports = { createSettingsWindow };
