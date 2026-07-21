// ── Bandeja do sistema: o "painel de controle" do programa ──
// A janela do pet não aparece na taskbar (de propósito), então é a bandeja
// que dá ao usuário um jeito civilizado de fechar, reiniciar, abrir a pasta
// de configuração e ligar o "iniciar com o Windows".
const { app, Tray, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const state = require('./state');
const ai = require('./ai');
const { createSettingsWindow } = require('./settingsWindow');

let tray = null;

function createTray() {
  const iconPath = path.join(__dirname, '..', 'assets', 'icon.ico');
  if (!fs.existsSync(iconPath)) return;
  tray = new Tray(iconPath);
  tray.setToolTip('Icozinho — seu pet de taskbar 💜');

  // Autostart: no exe PORTÁTIL, process.execPath aponta pra cópia extraída
  // em %TEMP% (muda a cada execução) — o caminho certo é o do .exe original,
  // que o electron-builder entrega em PORTABLE_EXECUTABLE_FILE. Instalado
  // (NSIS) ou em dev, o execPath normal serve.
  const loginPath = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
  const loginOpts = { path: loginPath };

  const rebuildMenu = () => {
    const login = app.getLoginItemSettings(loginOpts).openAtLogin;
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: `Icozinho 💜  v${app.getVersion()}`, enabled: false },
        { label: ai.aiAvailable() ? `IA: ${ai.aiModelLabel()}` : 'IA: cérebro local', enabled: false },
        { type: 'separator' },
        {
          label: 'Iniciar com o Windows',
          type: 'checkbox',
          checked: login,
          click: (item) => {
            app.setLoginItemSettings({ openAtLogin: item.checked, path: loginPath });
            rebuildMenu();
          },
        },
        { label: 'Reiniciar o pet', click: () => { if (state.win) state.win.webContents.reload(); } },
        { label: 'Configurações...', click: () => createSettingsWindow() },
        {
          label: 'Abrir pasta de configuração',
          click: () => shell.openPath(app.getPath('userData')),
        },
        { type: 'separator' },
        { label: 'Fechar o Icozinho', click: () => app.quit() },
      ])
    );
  };
  rebuildMenu();
}

module.exports = { createTray };
