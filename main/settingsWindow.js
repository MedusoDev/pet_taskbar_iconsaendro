// ── Janela de Configurações/Playground ──
// BrowserWindow separada da janela do pet: tem frame normal, é
// redimensionável, não é transparent nem alwaysOnTop — um painel de
// controle "de verdade". Só existe uma por vez (reaproveita/foca se já
// estiver aberta). Ela NÃO enxerga o renderer do pet diretamente — este
// módulo faz de relé entre as duas via os canais 'settings:cmd' (settings →
// pet) e 'settings:pet-event' (pet → settings); tudo que é "dono" do main
// (janela, pollers, chaves de API) é tratado aqui mesmo, sem ir até o pet.
const { BrowserWindow, ipcMain, app } = require('electron');
const path = require('path');
const fs = require('fs');
const state = require('./state');
const ai = require('./ai');
const petWindow = require('./petWindow');
const brainStore = require('./brainStore');
const { saveTuning } = require('./config');
const { getConversationLog } = require('./conversationLog');

function createSettingsWindow() {
  if (state.settingsWin) {
    state.settingsWin.show();
    state.settingsWin.focus();
    return;
  }
  state.settingsWin = new BrowserWindow({
    width: 760,
    height: 640,
    minWidth: 560,
    minHeight: 420,
    title: 'Icozinho — Configurações',
    icon: path.join(__dirname, '..', 'assets', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, '..', 'settings', 'settings-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  state.settingsWin.setMenuBarVisibility(false);
  state.settingsWin.loadFile(path.join(__dirname, '..', 'settings', 'settings.html'));
  state.settingsWin.on('closed', () => {
    state.settingsWin = null;
  });
}

function mainSnapshotPayload() {
  return {
    windowHeight: state.windowHeight,
    sysPollMs: state.sysPollMs,
    windowPollMs: state.windowPollMs,
    watchedApps: [...state.watchedApps],
    groqApiKey: state.groqApiKey || '',
    aiProvider: ai.provider,
    aiAvailable: ai.aiAvailable(),
    aiModel: ai.aiModelLabel(),
    petRunning: state.petStarted,
  };
}

// ── Aba "Cérebro e Falas": lê/grava direto em personalities/*.js,
// lorebook.js e curiosity.js via brainStore.js (edição segura por AST, com
// backup .bak e validação — ver sourceEditor.js). Cada operação mutante
// responde com 'brainOpResult' ({ok,error}) e, se deu certo, reenvia o
// 'brainData' inteiro (é pequeno, mais simples que fazer merge parcial no
// lado da UI e garante que a UI nunca fica com uma cópia desatualizada).
function sendBrainData() {
  if (!state.settingsWin) return;
  const moods = {};
  for (const m of brainStore.MOOD_IDS) moods[m] = brainStore.readPersonalityLines(m);
  state.settingsWin.webContents.send('settings:main-event', {
    type: 'brainData',
    payload: { moods, lorebook: brainStore.readLorebook(), curiosity: brainStore.readCuriosity() },
  });
}
function sendBrainOpResult(result) {
  if (!state.settingsWin) return;
  state.settingsWin.webContents.send('settings:main-event', { type: 'brainOpResult', payload: result });
  if (result.ok) sendBrainData();
}

// "Salvar como padrão": grava tudo que está valendo AGORA (main + o que a
// janela de Settings já tem espelhado do pet — ver settings/settings.js
// "model") em pet.tuning.json, pra sobreviver a um restart. Chaves de API
// vão pro pet.config.json (mesmo arquivo/lugar que config.js loadConfig()
// já lê — NUNCA committado, ver .gitignore), fundidas com o que já existia
// lá (não pisa em petName/userName etc. configurados manualmente).
function saveAsDefault(payload) {
  const bundle = {
    main: {
      windowHeight: state.windowHeight,
      sysPollMs: state.sysPollMs,
      windowPollMs: state.windowPollMs,
      watchedApps: [...state.watchedApps],
    },
    renderer: (payload && payload.renderer) || {},
  };
  try {
    saveTuning(bundle);
  } catch (err) {
    console.log(`[pet] falha ao salvar pet.tuning.json: ${err && err.message}`);
  }

  if (payload && payload.groqApiKey !== undefined) {
    const configPath = path.join(app.getPath('userData'), 'pet.config.json');
    let onDisk = {};
    try {
      onDisk = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch {}
    onDisk.groqApiKey = payload.groqApiKey || undefined;
    try {
      fs.writeFileSync(configPath, JSON.stringify(onDisk, null, 2));
    } catch (err) {
      console.log(`[pet] falha ao salvar pet.config.json: ${err && err.message}`);
    }
  }

  if (state.settingsWin) {
    state.settingsWin.webContents.send('settings:main-event', { type: 'savedDefault', payload: { ok: true } });
  }
}

// Comandos "donos do main" (scope: 'main') — tudo que a janela de pet não
// controla: tamanho/posição da janela, frequência dos pollers, apps
// observados e as chaves de API. Responde pelo canal 'settings:main-event'.
function handleMainScopedCommand(msg) {
  const { type, payload } = msg;
  switch (type) {
    case 'getMainSnapshot':
      if (state.settingsWin) {
        state.settingsWin.webContents.send('settings:main-event', { type: 'mainSnapshot', payload: mainSnapshotPayload() });
      }
      break;
    case 'setWindowHeight':
      if (Number.isFinite(payload.value)) petWindow.applyWindowHeight(payload.value);
      break;
    case 'setSysPollMs':
      if (Number.isFinite(payload.value)) petWindow.setSysPollMs(payload.value);
      break;
    case 'setWindowPollMs':
      if (Number.isFinite(payload.value)) petWindow.setWindowPollMs(payload.value);
      break;
    case 'addWatchedApp':
      if (payload.value && !state.watchedApps.includes(payload.value)) {
        state.watchedApps.push(payload.value.toLowerCase());
      }
      break;
    case 'removeWatchedApp':
      {
        const i = state.watchedApps.indexOf(payload.value);
        if (i >= 0) state.watchedApps.splice(i, 1);
      }
      break;
    case 'setApiKey':
      ai.setApiKey(payload.provider, payload.value);
      if (state.settingsWin) {
        state.settingsWin.webContents.send('settings:main-event', { type: 'mainSnapshot', payload: mainSnapshotPayload() });
      }
      break;
    case 'startPet':
      petWindow.startPet();
      break;
    case 'getConversationLog':
      if (state.settingsWin) {
        state.settingsWin.webContents.send('settings:main-event', {
          type: 'conversationLog',
          payload: getConversationLog((payload && payload.limit) || 30),
        });
      }
      break;
    case 'saveAsDefault':
      saveAsDefault(payload);
      break;
    case 'getBrainData':
      sendBrainData();
      break;
    case 'savePersonalityPhrases':
      sendBrainOpResult(brainStore.savePersonalityTriggerPhrases(payload.mood, payload.trigger, payload.phrases));
      break;
    case 'saveLorebookEntry':
      sendBrainOpResult(brainStore.saveLorebookEntry(payload.index, payload.entry));
      break;
    case 'addLorebookEntry':
      sendBrainOpResult(brainStore.addLorebookEntry(payload.entry, payload.atIndex));
      break;
    case 'removeLorebookEntry':
      sendBrainOpResult(brainStore.removeLorebookEntry(payload.index));
      break;
    case 'moveLorebookEntry':
      sendBrainOpResult(brainStore.moveLorebookEntry(payload.index, payload.direction));
      break;
    case 'saveCuriosityQuestion':
      sendBrainOpResult(brainStore.saveCuriosityQuestion(payload.bank, payload.index, payload.question));
      break;
    case 'addCuriosityQuestion':
      sendBrainOpResult(brainStore.addCuriosityQuestion(payload.bank, payload.question, payload.atIndex));
      break;
    case 'removeCuriosityQuestion':
      sendBrainOpResult(brainStore.removeCuriosityQuestion(payload.bank, payload.index));
      break;
    case 'saveSiteQuestion':
      sendBrainOpResult(brainStore.saveSiteQuestion(payload.siteId, payload.question));
      break;
    case 'removeSiteQuestion':
      sendBrainOpResult(brainStore.removeSiteQuestion(payload.siteId));
      break;
    default:
      break;
  }
}

function registerIpc() {
  // Relé: janela de Configurações → main. scope 'main' é tratado aqui mesmo;
  // scope 'pet' segue pro renderer do pet (que responde por 'settings:pet-event').
  ipcMain.on('settings:cmd', (event, msg) => {
    if (!msg || typeof msg.type !== 'string') return;
    if (msg.scope === 'main') {
      handleMainScopedCommand(msg);
    } else if (state.win) {
      state.win.webContents.send('settings:cmd', msg);
    }
  });

  // Relé: renderer do pet → janela de Configurações (respostas de snapshot,
  // resultado do teste de chat, etc).
  ipcMain.on('settings:pet-event', (event, msg) => {
    if (state.settingsWin) state.settingsWin.webContents.send('settings:pet-event', msg);
  });
}

module.exports = { createSettingsWindow, registerIpc };
