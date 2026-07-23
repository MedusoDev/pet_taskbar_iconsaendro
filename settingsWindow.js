// Janela de Configurações do Icozinho. Janela normal (com moldura, aparece na
// barra de tarefas) — separada do overlay transparente do pet. Carrega
// renderer/settings.html e conversa com o main pelos canais config:get /
// config:save (ver main.js e preload.js).
const { app, BrowserWindow, Tray, Menu, nativeImage } = require('electron');
const path = require('path');

let settingsWin = null;
let tray = null;

// No "X" da janela, ela ESCONDE de vez — some da barra de tarefas e vai pro
// system tray (bandeja ao lado do relógio). O processo (e o pet) segue rodando;
// clicar no ícone da bandeja reabre. Só fecha de verdade quando o app está
// encerrando (before-quit), senão reabrir seria sempre um reload do zero.
let appQuitting = false;
app.on('before-quit', () => {
  appQuitting = true;
});

// Ícone persistente na bandeja do sistema: garante que o app nunca "some" sem
// deixar como reabri-lo depois que a janela de Configurações é fechada.
function ensureTray() {
  if (tray && !tray.isDestroyed()) return tray;

  const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray.png'));
  tray = new Tray(icon);
  tray.setToolTip('Icozinho');

  const menu = Menu.buildFromTemplate([
    { label: 'Abrir Configurações', click: () => createSettingsWindow() },
    { type: 'separator' },
    { label: 'Sair', click: () => { appQuitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu);

  // Clique simples/duplo na bandeja também reabre as Configurações.
  tray.on('click', () => createSettingsWindow());
  tray.on('double-click', () => createSettingsWindow());
  return tray;
}

function createSettingsWindow() {
  ensureTray();

  // Já aberta → restaura (se minimizada), mostra (se escondida) e traz pra frente
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
    settingsWin.hide(); // some da barra de tarefas; segue vivo no system tray
  });
  settingsWin.on('closed', () => {
    settingsWin = null;
  });
  return settingsWin;
}

module.exports = { createSettingsWindow };
