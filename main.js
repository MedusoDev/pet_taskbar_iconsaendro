const { app, BrowserWindow, screen, ipcMain } = require('electron');
const path = require('path');
const activeWin = require('active-win');

// Altura da "pista" onde o pet vive, logo acima da taskbar. Aumentada (era
// 160) pra dar mais espaço vertical de arrasto — o gem continua com o mesmo
// tamanho em pixels (scene.js escala a câmera na mesma proporção).
const WINDOW_HEIGHT = 480;

// Ico_Eye: o único navegador que o pet "observa" — janelas de outros
// processos são ignoradas (nem o título chega no renderer).
const TARGET_BROWSER_NAME = 'brave';

let win = null;

// "Chão" de um monitor, em pixels de tela: topo da taskbar quando ela está
// visível na borda de baixo; senão (oculta/auto-hide ou em outra borda), o
// próprio rodapé da tela — ali o pet fica flutuando rente à borda.
function displayFloorY(display) {
  const { bounds, workArea } = display;
  const taskbarHeight = bounds.height - workArea.height;
  const taskbarAtBottom = workArea.y === bounds.y && taskbarHeight > 0;
  return taskbarAtBottom ? workArea.y + workArea.height : bounds.y + bounds.height;
}

function getWindowBounds() {
  // A janela cobre TODOS os monitores na horizontal (largura do desktop
  // virtual), pro pet poder passear até a segunda tela.
  const displays = screen.getAllDisplays();
  const minX = Math.min(...displays.map((d) => d.bounds.x));
  const maxX = Math.max(...displays.map((d) => d.bounds.x + d.bounds.width));

  // Cada monitor tem seu próprio chão (monitores de altura diferente ou com
  // taskbar oculta têm rodapés em Y diferentes). A janela precisa cobrir da
  // pista mais ALTA (chão mais alto − WINDOW_HEIGHT) até o chão mais BAIXO —
  // senão o pet "some" ao viajar pra um monitor cujo chão fica fora da faixa.
  const floors = displays.map(displayFloorY);
  const y = Math.min(...floors) - WINDOW_HEIGHT;
  const height = Math.max(...floors) - y;

  return { x: minX, y, width: maxX - minX, height };
}

// Geometria que o renderer precisa pra saber onde é o chão em cada trecho
// horizontal da janela (chão por monitor).
function getScreenConfig() {
  return {
    displays: screen.getAllDisplays().map((d) => ({
      x: d.bounds.x,
      width: d.bounds.width,
      floorY: displayFloorY(d),
    })),
  };
}

function createWindow() {
  const bounds = getWindowBounds();

  win = new BrowserWindow({
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
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // O Windows CLAMPA janelas não-redimensionáveis ao tamanho do monitor na
  // criação — por isso ela ficava presa na tela 1. Forçar os bounds depois
  // de criada aplica a largura do desktop virtual inteiro (todas as telas).
  win.setBounds(bounds);
  win.once('ready-to-show', () => win.setBounds(getWindowBounds()));
  win.webContents.on('did-finish-load', () => {
    win.webContents.send('screen-config', getScreenConfig());
  });

  console.log(
    `[pet] janela: pedido ${bounds.width}x${bounds.height} @ (${bounds.x},${bounds.y})` +
      ` | real ${JSON.stringify(win.getBounds())}` +
      ` | monitores: ${screen.getAllDisplays().length}`
  );

  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setIgnoreMouseEvents(true, { forward: true });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // O pet "vê" o mouse na tela inteira (curiosidade + relógio de tédio),
  // não só dentro da própria janela — daí o polling global aqui no main.
  const cursorPoll = setInterval(() => {
    if (!win) return;
    const p = screen.getCursorScreenPoint();
    win.webContents.send('cursor-pos', { x: p.x, y: p.y });
  }, 50);

  // Ico_Eye: a cada segundo, pergunta ao Windows qual é a janela ativa.
  // Só repassa o título ao renderer se for do navegador configurado —
  // qualquer outro app/navegador fica de fora, o pet nem chega a "ver".
  let lastTitle = null;
  const windowPoll = setInterval(async () => {
    if (!win) return;
    let result;
    try {
      result = await activeWin();
    } catch {
      return;
    }
    const isTarget =
      result && result.owner && result.owner.name
        ? result.owner.name.toLowerCase().includes(TARGET_BROWSER_NAME)
        : false;

    const title = isTarget ? result.title : null;
    if (title !== lastTitle) {
      lastTitle = title;
      win.webContents.send('active-site', { title });
    }
  }, 1000);

  win.on('closed', () => {
    clearInterval(cursorPoll);
    clearInterval(windowPoll);
    win = null;
  });
}

// Renderer avisa quando o mouse está sobre o icosaedro (captura clique) ou
// sobre área vazia (deixa o clique passar para o que estiver por baixo).
ipcMain.on('set-ignore-mouse-events', (event, ignore) => {
  if (!win) return;
  win.setIgnoreMouseEvents(ignore, { forward: true });

  // A janela é `focusable: false` de propósito (não deve roubar foco do
  // resto do sistema flutuando por aí). Mas com isso ela nunca recebe
  // teclado — então liberamos foco só no instante em que o mouse está de
  // fato em cima do gem (mesmo gatilho do click-through), pra atalhos como
  // o Z (gatilho manual do modo Zen) funcionarem sem grudar foco o tempo
  // todo.
  win.setFocusable(!ignore);
  if (!ignore) win.focus();
});

// Diário do pet: o renderer manda cada reação/estado pra cá, e a gente
// imprime no terminal com hora — pro usuário acompanhar a "vida" dele.
ipcMain.on('pet-log', (event, line) => {
  const ts = new Date().toLocaleTimeString('pt-BR');
  console.log(`${ts} ${line}`);
});

app.whenReady().then(() => {
  createWindow();

  // Monitor plugado/removido/reconfigurado → reposiciona a "pista"
  const reposition = () => {
    if (!win) return;
    win.setBounds(getWindowBounds());
    win.webContents.send('screen-config', getScreenConfig());
  };
  screen.on('display-added', reposition);
  screen.on('display-removed', reposition);
  screen.on('display-metrics-changed', reposition);
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
