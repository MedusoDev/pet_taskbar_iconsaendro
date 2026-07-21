// ── Janela do pet: o icosaedro transparente que flutua sobre a taskbar ──
const { BrowserWindow, screen, ipcMain } = require('electron');
const path = require('path');
const activeWin = require('active-win');
const state = require('./state');
const ai = require('./ai');
const { getWindowBounds, getScreenConfig } = require('./screen');
const { sampleCpu, getSysStats } = require('./sysStats');

// Handles/funções dos pollers de janela ativa / sistema — module-level pra a
// janela de Configurações poder reagendá-los (setWindowPollMs/setSysPollMs)
// em tempo real, sem precisar recriar a janela do pet inteira.
let windowPollHandle = null;
let sysPollHandle = null;
let pollActiveWindowFn = null;

function createWindow() {
  const bounds = getWindowBounds();

  state.win = new BrowserWindow({
    ...bounds,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    fullscreenable: false,
    hasShadow: false,
    focusable: false,
    icon: path.join(__dirname, '..', 'assets', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  const win = state.win;

  // O Windows CLAMPA janelas não-redimensionáveis ao tamanho do monitor na
  // criação — por isso ela ficava presa na tela 1. Forçar os bounds depois
  // de criada aplica a largura do desktop virtual inteiro (todas as telas).
  win.setBounds(bounds);
  win.once('ready-to-show', () => win.setBounds(getWindowBounds()));
  win.webContents.on('did-finish-load', () => {
    win.webContents.send('screen-config', getScreenConfig());
    win.webContents.send('ai-status', {
      available: ai.aiAvailable(),
      model: ai.aiModelLabel(),
      petName: ai.petName,
      userName: ai.userName,
    });
    win.webContents.send('sys-stats', getSysStats());
    // pet.tuning.json salvo (ver "Salvar como padrão" na janela de
    // Configurações): mesmos valores que a edição ao vivo aplicaria,
    // hidratados uma vez no boot (settingsBridge.applyTuningConfig).
    if (state.tuning.renderer) win.webContents.send('tuning-config', state.tuning.renderer);
  });

  console.log(
    `[pet] janela: pedido ${bounds.width}x${bounds.height} @ (${bounds.x},${bounds.y})` +
      ` | real ${JSON.stringify(win.getBounds())}` +
      ` | monitores: ${screen.getAllDisplays().length}` +
      ` | IA: ${ai.aiAvailable() ? `${ai.provider} (${ai.aiModelLabel()})` : 'cérebro local (sem provider configurado)'}`
  );

  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setIgnoreMouseEvents(true, { forward: true });

  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  // O pet "vê" o mouse na tela inteira (curiosidade + relógio de tédio),
  // não só dentro da própria janela — daí o polling global aqui no main.
  const cursorPoll = setInterval(() => {
    if (!state.win) return;
    const p = screen.getCursorScreenPoint();
    state.win.webContents.send('cursor-pos', { x: p.x, y: p.y });
  }, 50);

  // Ico_Eye: a cada segundo (por padrão — state.sysPollMs/state.windowPollMs
  // são editáveis ao vivo pela janela de Configurações, aba "Sistema", ver
  // setSysPollMs()/setWindowPollMs() mais abaixo), pergunta ao Windows qual
  // é a janela ativa. Só repassa título+app ao renderer se o processo
  // estiver na lista de observados — o resto o pet nem chega a "ver".
  let lastKey = null;
  async function pollActiveWindow() {
    if (!state.win) return;
    let result;
    try {
      result = await activeWin();
    } catch {
      return;
    }
    const owner =
      result && result.owner && result.owner.name ? result.owner.name.toLowerCase() : '';
    const appId = state.watchedApps.find((a) => owner.includes(a)) || null;

    const title = appId ? result.title : null;
    const key = `${appId}|${title}`;
    if (key !== lastKey) {
      lastKey = key;
      state.win.webContents.send('active-site', { title, app: appId });
    }
  }
  pollActiveWindowFn = pollActiveWindow;
  windowPollHandle = setInterval(pollActiveWindow, state.windowPollMs);

  // Sistema: RAM/CPU (a primeira amostra de CPU zera o delta)
  sampleCpu();
  sysPollHandle = setInterval(() => {
    if (!state.win) return;
    state.win.webContents.send('sys-stats', getSysStats());
  }, state.sysPollMs);

  win.on('closed', () => {
    clearInterval(cursorPoll);
    clearInterval(windowPollHandle);
    clearInterval(sysPollHandle);
    windowPollHandle = null;
    sysPollHandle = null;
    state.win = null;
  });
}

// Chamado pelo botão "Iniciar o pet" da janela de Configurações (boot-first
// flow — ver app.whenReady() em ../main.js). Idempotente: clique repetido
// não recria a janela do pet. Depois de nascer, o pet manda seu próprio
// snapshot quando o settingsBridge.js dele receber 'requestSnapshot'
// (settings.js reenvia assim que vê petRunning virar true, ver evento
// 'petStarted' abaixo).
//
// O aviso 'petStarted' só é mandado depois do 'did-finish-load' da janela
// do pet — mandar na hora (antes da página carregar) faz a mensagem se
// perder: settings.js pediria o snapshot ('requestSnapshot') antes do
// settingsBridge.js do pet sequer existir pra responder, e como é um pedido
// de disparo único (não fica tentando de novo), a aba ficava presa em
// "Carregando..." pra sempre.
function startPet() {
  if (state.petStarted) return;
  state.petStarted = true;
  createWindow();
  state.win.webContents.once('did-finish-load', () => {
    if (state.settingsWin) {
      state.settingsWin.webContents.send('settings:main-event', { type: 'petStarted', payload: {} });
    }
  });
}

function setSysPollMs(ms) {
  state.sysPollMs = ms;
  if (sysPollHandle) {
    clearInterval(sysPollHandle);
    sysPollHandle = setInterval(() => {
      if (!state.win) return;
      state.win.webContents.send('sys-stats', getSysStats());
    }, state.sysPollMs);
  }
}

function setWindowPollMs(ms) {
  state.windowPollMs = ms;
  if (windowPollHandle && pollActiveWindowFn) {
    clearInterval(windowPollHandle);
    windowPollHandle = setInterval(pollActiveWindowFn, state.windowPollMs);
  }
}

// Recalcula os bounds da janela do pet com o windowHeight atual — chamado
// pela aba "Sistema" da janela de Configurações (ver setWindowHeight()).
function applyWindowHeight(px) {
  state.windowHeight = px;
  if (!state.win) return;
  state.win.setBounds(getWindowBounds());
  state.win.webContents.send('screen-config', getScreenConfig());
}

// Renderer avisa quando o mouse está sobre o icosaedro (captura clique) ou
// sobre área vazia (deixa o clique passar para o que estiver por baixo).
//
// FOCO: cliques, drag e cafuné funcionam SEM a janela ter foco — então o
// hover normal só liga/desliga o click-through e nunca chama focus() (era
// isso que fazia o ícone do Electron piscar na taskbar a cada passada de
// mouse). Foco de teclado só existe enquanto keepFocus=true (chat/pergunta
// abertos) — e o setSkipTaskbar é re-aplicado porque no Windows o
// setFocusable reseta o estado de "fora da taskbar".
function registerIpc() {
  ipcMain.on('set-ignore-mouse-events', (event, arg) => {
    if (!state.win) return;
    const { ignore, keepFocus } = typeof arg === 'object' ? arg : { ignore: arg, keepFocus: false };
    state.win.setIgnoreMouseEvents(ignore, { forward: true });

    const wantFocus = !!keepFocus;
    if (wantFocus !== state.focusHeld) {
      state.focusHeld = wantFocus;
      state.win.setFocusable(wantFocus);
      state.win.setSkipTaskbar(true);
      if (wantFocus) state.win.focus();
    }
  });

  // AI_Chat: mensagem do usuário → resposta (Ollama ou Groq, conforme
  // aiProvider — erro/indisponível e o renderer resolve com o cérebro local
  // em brain.js)
  ipcMain.handle('chat-message', async (event, { text, context }) => {
    return ai.askAI(text, context);
  });

  // Diário do pet: o renderer manda cada reação/estado pra cá, e a gente
  // imprime no terminal com hora — pro usuário acompanhar a "vida" dele.
  ipcMain.on('pet-log', (event, line) => {
    const ts = new Date().toLocaleTimeString('pt-BR');
    console.log(`${ts} ${line}`);
  });
}

module.exports = {
  createWindow,
  startPet,
  applyWindowHeight,
  setSysPollMs,
  setWindowPollMs,
  registerIpc,
};
