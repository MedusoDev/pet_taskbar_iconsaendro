// Ponto de entrada: só faz o boot (nome do app, config, tuning, IPC, janela
// de Configurações e bandeja) e delega o resto pros módulos em ./main/ —
// ver main/state.js pro mapa do estado compartilhado entre eles.
const { app, screen, BrowserWindow } = require('electron');
const state = require('./main/state');
const { loadConfig, loadTuning } = require('./main/config');
const ai = require('./main/ai');
const { getWindowBounds, getScreenConfig } = require('./main/screen');
const petWindow = require('./main/petWindow');
const settingsWindow = require('./main/settingsWindow');
const { createTray } = require('./main/tray');

// Nome fixo ANTES de qualquer getPath: garante a mesma pasta de dados
// (%APPDATA%/Icozinho) rodando pelo npm start OU pelo .exe empacotado.
app.setName('Icozinho');

// ── pet.tuning.json: ajustes "salvos como padrão" pela janela de
// Configurações (aba "Sistema") — hidrata `state` ANTES de qualquer janela
// nascer. `renderer` fica guardado pra petWindow.createWindow() repassar ao
// pet via IPC assim que a página carregar.
state.tuning = loadTuning();
if (state.tuning.main) {
  const t = state.tuning.main;
  if (Number.isFinite(t.windowHeight)) state.windowHeight = t.windowHeight;
  if (Number.isFinite(t.sysPollMs)) state.sysPollMs = t.sysPollMs;
  if (Number.isFinite(t.windowPollMs)) state.windowPollMs = t.windowPollMs;
  if (Array.isArray(t.watchedApps) && t.watchedApps.length) {
    state.watchedApps.length = 0;
    state.watchedApps.push(...t.watchedApps);
  }
}

// ── pet.config.json: escolhe o cérebro de IA e hidrata petName/groqApiKey ──
ai.init(loadConfig());

petWindow.registerIpc();
settingsWindow.registerIpc();

app.whenReady().then(() => {
  // A PRIMEIRA janela é sempre a de Configurações — o pet só nasce quando o
  // usuário clicar "Iniciar o pet" nela (ver petWindow.startPet()). A
  // bandeja já existe desde o boot (dá outro jeito de reabrir Configurações
  // a qualquer momento, mesmo antes do pet existir).
  createTray();
  settingsWindow.createSettingsWindow();

  // Monitor plugado/removido/reconfigurado → reposiciona a "pista" (só faz
  // sentido depois que o pet existir)
  const reposition = () => {
    if (!state.win) return;
    state.win.setBounds(getWindowBounds());
    state.win.webContents.send('screen-config', getScreenConfig());
  };
  screen.on('display-added', reposition);
  screen.on('display-removed', reposition);
  screen.on('display-metrics-changed', reposition);
});

// A janela de Configurações some sozinha se fechada antes do "Iniciar o
// pet" (nenhuma outra janela existe ainda) — este handler já cobre isso
// nativamente: fecha a última janela → encerra o processo. Nenhuma lógica
// extra precisa distinguir "fechou sem iniciar" de "fechou depois de
// iniciar": se o pet já está rodando, a janela dele conta como aberta e o
// app continua vivo mesmo com Configurações fechada.
app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) settingsWindow.createSettingsWindow();
});
