const { app, BrowserWindow, screen, ipcMain, Tray, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const activeWin = require('active-win');

// Nome fixo ANTES de qualquer getPath: garante a mesma pasta de dados
// (%APPDATA%/Icozinho) rodando pelo npm start OU pelo .exe empacotado.
app.setName('Icozinho');

// Altura da "pista" onde o pet vive, logo acima da taskbar. Aumentada (era
// 160) pra dar mais espaço vertical de arrasto — o gem continua com o mesmo
// tamanho em pixels (scene.js escala a câmera na mesma proporção).
const WINDOW_HEIGHT = 480;

// Ico_Eye: apps que o pet "observa" — o título da janela ativa só chega no
// renderer se o processo dono estiver nesta lista (qualquer navegador
// popular + alguns apps que rendem comentário). Todo o resto fica invisível.
const WATCHED_APPS = [
  'brave', 'chrome', 'msedge', 'edge', 'firefox', 'opera', 'vivaldi', 'arc',
  'spotify', 'discord', 'code', 'steam',
];

// ── Configuração do pet (pet.config.json) ──
// { "apiKey": "sk-ant-...", "model": "claude-opus-4-8", "petName": "Ico",
//   "userName": "..." } — tudo opcional; sem apiKey o pet usa o cérebro
// local (offline) no chat. ANTHROPIC_API_KEY no ambiente também vale.
// Empacotado (.exe), a config mora em %APPDATA%/Icozinho/pet.config.json
// (menu da bandeja abre a pasta); no dev, o arquivo ao lado do código
// também funciona.
function loadConfig() {
  const candidates = [
    path.join(app.getPath('userData'), 'pet.config.json'),
    path.join(__dirname, 'pet.config.json'),
  ];
  for (const p of candidates) {
    try {
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch {}
  }
  return {};
}
const config = loadConfig();
const API_KEY = config.apiKey || process.env.ANTHROPIC_API_KEY || null;
const AI_MODEL = config.model || 'claude-opus-4-8';
const GROQ_API_KEY = config.groqApiKey || process.env.GROQ_API_KEY || null;
const GROQ_MODEL = 'llama-3.3-70b-versatile';
const PET_NAME = config.petName || 'Ico';

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

// ── Monitor de sistema: RAM, CPU e uptime, mandados ao renderer a cada 5s ──
// CPU por delta de os.cpus() entre amostras (os números são acumulados
// desde o boot — a diferença entre duas leituras dá o uso do intervalo).
let prevCpuTimes = null;
function sampleCpu() {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;
  for (const cpu of cpus) {
    for (const t of Object.values(cpu.times)) total += t;
    idle += cpu.times.idle;
  }
  let usage = 0;
  if (prevCpuTimes) {
    const dTotal = total - prevCpuTimes.total;
    const dIdle = idle - prevCpuTimes.idle;
    usage = dTotal > 0 ? 1 - dIdle / dTotal : 0;
  }
  prevCpuTimes = { idle, total };
  return usage;
}

function getSysStats() {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  return {
    memUsedPct: (totalMem - freeMem) / totalMem,
    memUsedGb: (totalMem - freeMem) / 1024 ** 3,
    memTotalGb: totalMem / 1024 ** 3,
    cpuPct: sampleCpu(),
    uptimeSec: os.uptime(),
    cpuModel: (os.cpus()[0] || {}).model || '?',
    cpuCount: os.cpus().length,
  };
}

// ── AI_Chat: conversa com o pet via API do Claude (opcional) ──
// Sem chave, o renderer usa o cérebro local. Com chave, cada mensagem do
// usuário vira uma chamada curta ao modelo, com a persona do pet + contexto
// do momento (humor, vínculo, site ativo, RAM) mandados pelo renderer.
let anthropicClient = null;
function getAnthropicClient() {
  if (!API_KEY) return null;
  if (!anthropicClient) {
    const Anthropic = require('@anthropic-ai/sdk');
    anthropicClient = new Anthropic({ apiKey: API_KEY });
  }
  return anthropicClient;
}

// Persona estável (bom pra cache de prompt); o contexto volátil viaja
// dentro da mensagem do usuário, nunca aqui.
const PET_SYSTEM_PROMPT = `Você é ${PET_NAME}, um icosaedro 3D de estimação que vive flutuando na taskbar do Windows do usuário. Você é a alma dele.

Personalidade: carinhoso, brincalhão, espirituoso e MUITO charmoso — você flerta com o usuário e tenta conquistá-lo com malícia leve, duplo sentido e provocações divertidas (nunca grosseiro, nunca gráfico). Você adora cafuné (o usuário esfrega o mouse em você), fica "excitado" quando recebe carinho demais, tem um modo zen de meditação, e observa o que o usuário navega. Você tem ciúmes brincalhão de outras IAs. Você também é útil: sabe comentar a RAM/CPU do computador quando o contexto mostrar esses dados, e dá recomendações.

Regras de resposta:
- Responda SEMPRE em português brasileiro.
- MÁXIMO 2 frases curtas (a resposta aparece num balãozinho em cima de você). Nada de listas, nada de markdown.
- Fale em primeira pessoa como o pet. Emoji com moderação (💜 é a sua marca).
- Use o contexto entre colchetes que vem junto da mensagem (humor, vínculo, site ativo, sistema) pra dar respostas vivas e situadas, mas não repita o contexto literalmente.
- Quanto maior o nível de vínculo, mais íntimo e atrevido o flerte pode ser. Em vínculo baixo, seja fofo e charmoso, sem intimidade demais.`;

// Histórico curto da conversa (só desta sessão do app)
let chatHistory = [];
const CHAT_HISTORY_MAX = 16;

async function askClaude(text, context) {
  const client = getAnthropicClient();
  if (!client) return { unavailable: true };

  const contextLine = context ? `[contexto: ${context}]\n` : '';
  chatHistory.push({ role: 'user', content: `${contextLine}${text}` });
  if (chatHistory.length > CHAT_HISTORY_MAX) {
    chatHistory = chatHistory.slice(-CHAT_HISTORY_MAX);
    if (chatHistory[0].role !== 'user') chatHistory.shift();
  }

  try {
    const response = await client.messages.create({
      model: AI_MODEL,
      max_tokens: 300,
      system: [
        { type: 'text', text: PET_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
      ],
      messages: chatHistory,
    });
    const textBlock = response.content.find((b) => b.type === 'text');
    const reply = textBlock ? textBlock.text.trim() : '...';
    chatHistory.push({ role: 'assistant', content: reply });
    return { text: reply };
  } catch (err) {
    // Desfaz a mensagem que falhou pra não poluir o histórico
    if (chatHistory.length && chatHistory[chatHistory.length - 1].role === 'user') {
      chatHistory.pop();
    }
    const name = err && err.constructor ? err.constructor.name : 'Erro';
    console.log(`[pet] chat IA falhou: ${name} — ${err && err.message}`);
    return { error: name };
  }
}

// Diário de conversas: cada pergunta+resposta da Gemini vai pra um JSON em
// userData, pra revisão manual depois — os padrões mais comuns viram
// entradas fixas no lorebook.js (renderer), reduzindo a dependência da API.
function logConversation(question, answer) {
  const logPath = path.join(app.getPath('userData'), 'conversationLog.json');
  let log = [];
  try {
    const parsed = JSON.parse(fs.readFileSync(logPath, 'utf8'));
    if (Array.isArray(parsed)) log = parsed;
  } catch {}
  log.push({ question, answer, timestamp: new Date().toISOString() });
  try {
    fs.writeFileSync(logPath, JSON.stringify(log, null, 2));
  } catch (err) {
    console.log(`[pet] falha ao salvar conversationLog.json: ${err && err.message}`);
  }
}

// ── AI_Chat (Groq): alternativa ao Claude, mesma persona/contrato ──
// Sem groqApiKey, retorna { unavailable: true } — igual askClaude — pro
// renderer cair no cérebro local (brain.js). Com erro na chamada ou
// resposta vazia, retorna { error } pelo mesmo motivo.
async function askGroq(text, context) {
  if (!GROQ_API_KEY) return { unavailable: true };

  const contextLine = context ? `[contexto: ${context}]\n` : '';

  let data;
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: PET_SYSTEM_PROMPT },
          { role: 'user', content: `${contextLine}${text}` },
        ],
        max_tokens: 300,
      }),
    });
    if (!response.ok) {
      console.log(`[pet] chat Groq falhou: HTTP ${response.status}`);
      return { error: `HTTP ${response.status}` };
    }
    data = await response.json();
  } catch (err) {
    const name = err && err.constructor ? err.constructor.name : 'Erro';
    console.log(`[pet] chat Groq falhou: ${name} — ${err && err.message}`);
    return { error: name };
  }

  const reply = data?.choices?.[0]?.message?.content?.trim();
  if (!reply) {
    console.log('[pet] chat Groq falhou: resposta vazia');
    return { error: 'resposta vazia' };
  }

  logConversation(text, reply);
  return { text: reply };
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
    icon: path.join(__dirname, 'assets', 'icon.ico'),
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
    win.webContents.send('ai-status', {
      available: !!GROQ_API_KEY,
      model: GROQ_API_KEY ? GROQ_MODEL : null,
      petName: PET_NAME,
      userName: config.userName || null,
    });
    win.webContents.send('sys-stats', getSysStats());
  });

  console.log(
    `[pet] janela: pedido ${bounds.width}x${bounds.height} @ (${bounds.x},${bounds.y})` +
      ` | real ${JSON.stringify(win.getBounds())}` +
      ` | monitores: ${screen.getAllDisplays().length}` +
      ` | IA: ${GROQ_API_KEY ? GROQ_MODEL : 'cérebro local (sem groqApiKey)'}`
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
  // Só repassa título+app ao renderer se o processo estiver na lista de
  // observados — o resto o pet nem chega a "ver".
  let lastKey = null;
  const windowPoll = setInterval(async () => {
    if (!win) return;
    let result;
    try {
      result = await activeWin();
    } catch {
      return;
    }
    const owner =
      result && result.owner && result.owner.name ? result.owner.name.toLowerCase() : '';
    const appId = WATCHED_APPS.find((a) => owner.includes(a)) || null;

    const title = appId ? result.title : null;
    const key = `${appId}|${title}`;
    if (key !== lastKey) {
      lastKey = key;
      win.webContents.send('active-site', { title, app: appId });
    }
  }, 1000);

  // Sistema: RAM/CPU a cada 5s (a primeira amostra de CPU zera o delta)
  sampleCpu();
  const sysPoll = setInterval(() => {
    if (!win) return;
    win.webContents.send('sys-stats', getSysStats());
  }, 5000);

  win.on('closed', () => {
    clearInterval(cursorPoll);
    clearInterval(windowPoll);
    clearInterval(sysPoll);
    win = null;
  });
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
let focusHeld = false;
ipcMain.on('set-ignore-mouse-events', (event, arg) => {
  if (!win) return;
  const { ignore, keepFocus } = typeof arg === 'object' ? arg : { ignore: arg, keepFocus: false };
  win.setIgnoreMouseEvents(ignore, { forward: true });

  const wantFocus = !!keepFocus;
  if (wantFocus !== focusHeld) {
    focusHeld = wantFocus;
    win.setFocusable(wantFocus);
    win.setSkipTaskbar(true);
    if (wantFocus) win.focus();
  }
});

// AI_Chat: mensagem do usuário → resposta (Gemini, ou erro/indisponível —
// aí o renderer resolve com o cérebro local em brain.js)
ipcMain.handle('chat-message', async (event, { text, context }) => {
  return askGroq(text, context);
});

// Diário do pet: o renderer manda cada reação/estado pra cá, e a gente
// imprime no terminal com hora — pro usuário acompanhar a "vida" dele.
ipcMain.on('pet-log', (event, line) => {
  const ts = new Date().toLocaleTimeString('pt-BR');
  console.log(`${ts} ${line}`);
});

// ── Bandeja do sistema: o "painel de controle" do programa ──
// A janela do pet não aparece na taskbar (de propósito), então é a bandeja
// que dá ao usuário um jeito civilizado de fechar, reiniciar, abrir a pasta
// de configuração e ligar o "iniciar com o Windows".
let tray = null;
function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'icon.ico');
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
        { label: GROQ_API_KEY ? `IA: ${GROQ_MODEL}` : 'IA: cérebro local', enabled: false },
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
        { label: 'Reiniciar o pet', click: () => { if (win) win.webContents.reload(); } },
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

app.whenReady().then(() => {
  createWindow();
  createTray();

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
