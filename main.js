const { app, BrowserWindow, screen, ipcMain } = require('electron');
const path = require('path');

// Altura da "pista" onde o pet anda, logo acima da taskbar.
const WINDOW_HEIGHT = 160;

let win = null;

function getWindowBounds() {
  const display = screen.getPrimaryDisplay();
  const { bounds, workArea } = display;

  // workArea exclui a taskbar; a diferença entre bounds e workArea nos diz
  // onde a taskbar está e qual sua espessura, sem precisar hardcodar nada.
  const taskbarHeight = bounds.height - workArea.height;
  const taskbarAtBottom = workArea.y === bounds.y && taskbarHeight > 0;

  const width = bounds.width;
  const x = bounds.x;

  // Posiciona a janela logo acima da taskbar (ou encostada no topo da tela,
  // se a taskbar não estiver embaixo — fallback simples para essa v1).
  const y = taskbarAtBottom
    ? workArea.y + workArea.height - WINDOW_HEIGHT
    : bounds.y;

  return { x, y, width, height: WINDOW_HEIGHT };
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

  win.on('closed', () => {
    clearInterval(cursorPoll);
    win = null;
  });
}

// Renderer avisa quando o mouse está sobre o icosaedro (captura clique) ou
// sobre área vazia (deixa o clique passar para o que estiver por baixo).
ipcMain.on('set-ignore-mouse-events', (event, ignore) => {
  if (!win) return;
  win.setIgnoreMouseEvents(ignore, { forward: true });
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
