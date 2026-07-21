const { app, BrowserWindow, screen, ipcMain, Tray, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const activeWin = require('active-win');
const brainStore = require('./main/brainStore');

// Nome fixo ANTES de qualquer getPath: garante a mesma pasta de dados
// (%APPDATA%/Icozinho) rodando pelo npm start OU pelo .exe empacotado.
app.setName('Icozinho');

// Altura da "pista" onde o pet vive, logo acima da taskbar. Aumentada (era
// 160) pra dar mais espaço vertical de arrasto — o gem continua com o mesmo
// tamanho em pixels (scene.js escala a câmera na mesma proporção).
// `let` (não `const`): editável ao vivo pela janela de Configurações, aba
// "Sistema" — ver settings/ e applyWindowHeight() mais abaixo.
let WINDOW_HEIGHT = 480;

// Frequência dos pollers do main (ms) — também editável ao vivo (aba
// "Sistema" da janela de Configurações).
let SYS_POLL_MS = 5000;
let WINDOW_POLL_MS = 1000;

// Ico_Eye: apps que o pet "observa" — o título da janela ativa só chega no
// renderer se o processo dono estiver nesta lista (qualquer navegador
// popular + alguns apps que rendem comentário). Todo o resto fica invisível.
// Fica `const` (o array em si nunca é reatribuído) mas o CONTEÚDO é mutável
// — a aba "Sistema" da janela de Configurações adiciona/remove itens nele.
const WATCHED_APPS = [
  'brave', 'chrome', 'msedge', 'edge', 'firefox', 'opera', 'vivaldi', 'arc',
  'spotify', 'discord', 'code', 'steam',
];

// ── Ajustes salvos como padrão (pet.tuning.json) ──
// Tudo que a janela de Configurações deixa editar ao vivo (ver settings/ e
// renderer/behaviors/settingsBridge.js) pode ser "salvo como padrão" — em vez
// de reescrever arquivos-fonte (frágil e arriscado), os valores vão pra um
// JSON só, lido aqui no boot e reaplicado. `main` hidrata as constantes deste
// arquivo ANTES da janela ser criada; `renderer` é repassado pro pet via IPC
// (evento 'tuning-config') assim que a página carrega, reaproveitando o
// mesmo caminho que a edição ao vivo usa (settingsBridge.applyTuningConfig).
function loadTuning() {
  const p = path.join(app.getPath('userData'), 'pet.tuning.json');
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return {};
  }
}
function saveTuning(tuning) {
  const p = path.join(app.getPath('userData'), 'pet.tuning.json');
  fs.writeFileSync(p, JSON.stringify(tuning, null, 2));
}
const tuning = loadTuning();
if (tuning.main) {
  if (Number.isFinite(tuning.main.windowHeight)) WINDOW_HEIGHT = tuning.main.windowHeight;
  if (Number.isFinite(tuning.main.sysPollMs)) SYS_POLL_MS = tuning.main.sysPollMs;
  if (Number.isFinite(tuning.main.windowPollMs)) WINDOW_POLL_MS = tuning.main.windowPollMs;
  if (Array.isArray(tuning.main.watchedApps) && tuning.main.watchedApps.length) {
    WATCHED_APPS.length = 0;
    WATCHED_APPS.push(...tuning.main.watchedApps);
  }
}

// ── Configuração do pet (pet.config.json) ──
// { "aiProvider": "ollama"|"groq"|"none", "ollamaModel": "llama3.2:3b",
//   "groqApiKey": "gsk_...", "petName": "Ico", "userName": "..." } — tudo
// opcional. aiProvider escolhe o cérebro de IA (default: "groq" se houver
// groqApiKey, senão "none"); sem provider disponível, o pet usa o cérebro
// local (offline) no chat. GROQ_API_KEY no ambiente também vale.
//
// Os DOIS arquivos são lidos e MESCLADOS (não é "o primeiro que existir
// vence"): primeiro o que fica ao lado do código (base/dev — no .exe
// empacotado, dentro do asar, geralmente nem existe), depois o de
// %APPDATA%/Icozinho (editado ao vivo pela janela de Configurações via
// setApiKey()/saveAsDefault() — menu da bandeja abre essa pasta), que
// sobrescreve campo a campo por cima. Antes disso era "primeiro que existir
// vence" — um pet.config.json de %APPDATA% quase vazio (ex.: {} criado por
// "Salvar como padrão" sem chave nenhuma configurada) escondia por completo
// o arquivo da raiz do projeto, mesmo tendo aiProvider/ollamaModel corretos
// nele.
function loadConfig() {
  const candidates = [
    path.join(__dirname, 'pet.config.json'),
    path.join(app.getPath('userData'), 'pet.config.json'),
  ];
  let merged = {};
  let foundAny = false;
  for (const p of candidates) {
    let raw;
    try {
      raw = fs.readFileSync(p, 'utf8');
    } catch (err) {
      if (err.code !== 'ENOENT') console.log(`[pet] config: erro lendo ${p}: ${err.message}`);
      continue;
    }
    try {
      const parsed = JSON.parse(raw);
      console.log(`[pet] config carregada de: ${p}`);
      console.log(`[pet] config conteúdo: ${JSON.stringify(parsed)}`);
      merged = { ...merged, ...parsed };
      foundAny = true;
    } catch (err) {
      // Achou o arquivo mas o JSON é inválido — sem isto, esse candidato seria
      // pulado em silêncio (mesmo catch{} que trata "arquivo não existe") e o
      // próximo da lista assumiria sem ninguém saber por quê.
      console.log(`[pet] config: ${p} existe mas o JSON é inválido (${err.message}) — ignorando`);
    }
  }
  if (!foundAny) {
    console.log('[pet] config: nenhum pet.config.json encontrado em nenhum candidato — usando defaults ({})');
  } else {
    console.log(`[pet] config final (mesclada): ${JSON.stringify(merged)}`);
  }
  return merged;
}
const config = loadConfig();
// `let`: a aba "IA/Chat" da janela de Configurações edita e persiste essa
// chave ao vivo (ver setApiKey() mais abaixo) — sem reiniciar o app.
let GROQ_API_KEY = config.groqApiKey || process.env.GROQ_API_KEY || null;
const GROQ_MODEL = 'llama-3.3-70b-versatile';
const PET_NAME = config.petName || 'Ico';

let win = null;
// true assim que "Iniciar o pet" foi clicado (ver startPet()) — a janela do
// pet só é criada uma vez; cliques repetidos no botão viram no-op.
let petStarted = false;

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

// Chamado pela janela de Configurações (aba IA/Chat) — troca a chave em
// memória na hora; a próxima chamada já usa a nova (o Groq não guarda
// client, lê GROQ_API_KEY direto em askGroq).
function setApiKey(provider, value) {
  const v = (value || '').trim() || null;
  if (provider === 'groq') {
    GROQ_API_KEY = v;
  }
  if (win) {
    win.webContents.send('ai-status', {
      available: aiAvailable(),
      model: aiModelLabel(),
      petName: PET_NAME,
      userName: config.userName || null,
    });
  }
  if (settingsWin) {
    settingsWin.webContents.send('settings:main-event', { type: 'mainSnapshot', payload: mainSnapshotPayload() });
  }
}

function mainSnapshotPayload() {
  return {
    windowHeight: WINDOW_HEIGHT,
    sysPollMs: SYS_POLL_MS,
    windowPollMs: WINDOW_POLL_MS,
    watchedApps: [...WATCHED_APPS],
    groqApiKey: GROQ_API_KEY || '',
    aiProvider: AI_PROVIDER,
    aiAvailable: aiAvailable(),
    aiModel: aiModelLabel(),
    petRunning: petStarted,
  };
}

// Chamado pelo botão "Iniciar o pet" da janela de Configurações (boot-first
// flow — ver app.whenReady()). Idempotente: clique repetido não recria a
// janela do pet. Depois de nascer, o pet manda seu próprio snapshot quando
// o settingsBridge.js dele receber 'requestSnapshot' (settings.js reenvia
// assim que vê petRunning virar true, ver evento 'petStarted' abaixo).
//
// O aviso 'petStarted' só é mandado depois do 'did-finish-load' da janela
// do pet — mandar na hora (antes da página carregar) faz a mensagem se
// perder: settings.js pediria o snapshot ('requestSnapshot') antes do
// settingsBridge.js do pet sequer existir pra responder, e como é um pedido
// de disparo único (não fica tentando de novo), a aba ficava presa em
// "Carregando..." pra sempre.
function startPet() {
  if (petStarted) return;
  petStarted = true;
  createWindow();
  win.webContents.once('did-finish-load', () => {
    if (settingsWin) {
      settingsWin.webContents.send('settings:main-event', { type: 'petStarted', payload: {} });
    }
  });
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

// Diário de conversas: cada pergunta+resposta da API vai pra um JSON em
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

// Lê as últimas `limit` conversas salvas por logConversation() (mais
// recente primeiro) — alimenta a sub-seção "Histórico de conversas" da aba
// IA/Chat da janela de Configurações.
function getConversationLog(limit) {
  const logPath = path.join(app.getPath('userData'), 'conversationLog.json');
  try {
    const parsed = JSON.parse(fs.readFileSync(logPath, 'utf8'));
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(-limit).reverse();
  } catch {
    return [];
  }
}

// ── AI_Chat (Groq): a chamada de API do chat ao vivo ──
// Sem groqApiKey, retorna { unavailable: true } pro renderer cair no
// cérebro local (brain.js). Com erro na chamada ou resposta vazia, retorna
// { error } pelo mesmo motivo.
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

// ── AI_Chat (Ollama): cérebro rodando local (localhost:11434), alternativa
// grátis/offline ao Groq — precisa do app Ollama instalado e do modelo
// baixado (`ollama pull <modelo>`). Diferente do Groq (cada chamada é
// isolada), aqui a gente guarda um histórico de turnos da sessão pra dar
// continuidade — limitado, já que modelos pequenos (gemma2:2b, llama3.2:3b)
// têm janela de contexto curta.
const OLLAMA_URL = 'http://localhost:11434/api/chat';
const OLLAMA_MODEL = config.ollamaModel || 'llama3.2:3b';
const OLLAMA_HISTORY_LIMIT = 12; // mensagens (user+assistant), não tokens
let ollamaHistory = [];

async function askOllama(text, context) {
  const contextLine = context ? `[contexto: ${context}]\n` : '';
  const userMessage = { role: 'user', content: `${contextLine}${text}` };

  let data;
  try {
    const response = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages: [{ role: 'system', content: PET_SYSTEM_PROMPT }, ...ollamaHistory, userMessage],
        stream: false,
        // Modelos pequenos (3B) ignoram "máximo 2 frases" do prompt e viajam
        // — num_predict corta na marra pra manter a resposta do tamanho de
        // balãozinho de fala. repeat_penalty ajuda a não fixar num assunto
        // (tipo RAM/CPU) toda hora só porque apareceu no contexto uma vez.
        options: { num_predict: 70, temperature: 0.8, repeat_penalty: 1.2 },
      }),
    });
    if (!response.ok) {
      console.log(`[pet] chat Ollama falhou: HTTP ${response.status}`);
      return { error: `HTTP ${response.status}` };
    }
    data = await response.json();
  } catch (err) {
    const name = err && err.constructor ? err.constructor.name : 'Erro';
    console.log(`[pet] chat Ollama falhou: ${name} — ${err && err.message} (o app Ollama tá rodando?)`);
    return { error: name };
  }

  const reply = data?.message?.content?.trim();
  if (!reply) {
    console.log('[pet] chat Ollama falhou: resposta vazia');
    return { error: 'resposta vazia' };
  }

  ollamaHistory.push(userMessage, { role: 'assistant', content: reply });
  if (ollamaHistory.length > OLLAMA_HISTORY_LIMIT) ollamaHistory = ollamaHistory.slice(-OLLAMA_HISTORY_LIMIT);

  logConversation(text, reply);
  return { text: reply };
}

// ── AI_Chat: qual provider usar ──
// aiProvider no pet.config.json escolhe o "cérebro" de IA: "ollama" (local,
// grátis, precisa do app rodando), "groq" (nuvem, precisa de groqApiKey) ou
// "none" (força o cérebro local em brain.js). Sem aiProvider definido, cai
// no comportamento antigo: usa Groq se houver chave configurada.
const AI_PROVIDER = config.aiProvider || (GROQ_API_KEY ? 'groq' : 'none');

// Ollama não tem chave pra checar — "disponível" aqui só significa "é o
// provider escolhido"; se o app não estiver rodando, askOllama devolve
// { error } e o renderer cai no cérebro local do mesmo jeito que o Groq.
function aiAvailable() {
  if (AI_PROVIDER === 'ollama') return true;
  if (AI_PROVIDER === 'groq') return !!GROQ_API_KEY;
  return false;
}

function aiModelLabel() {
  if (AI_PROVIDER === 'ollama') return OLLAMA_MODEL;
  if (AI_PROVIDER === 'groq') return GROQ_API_KEY ? GROQ_MODEL : null;
  return null;
}

async function askAI(text, context) {
  if (AI_PROVIDER === 'ollama') return askOllama(text, context);
  if (AI_PROVIDER === 'groq') return askGroq(text, context);
  return { unavailable: true };
}

// Diagnóstico de boot: roda sempre (não depende de "Iniciar o pet"/criar
// janela) pra dar pra confirmar qual provider ficou ativo só olhando o
// terminal do `npm start`.
console.log(
  `[pet] provider: aiProvider no config=${JSON.stringify(config.aiProvider ?? null)}` +
    ` | efetivo=${AI_PROVIDER} | ollamaModel=${OLLAMA_MODEL} | groqApiKey=${GROQ_API_KEY ? 'configurada' : 'ausente'}`
);
console.log(
  `[pet] IA ativa: ${aiAvailable() ? `${AI_PROVIDER} (${aiModelLabel()})` : 'nenhuma — cérebro local (brain.js)'}`
);

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
      available: aiAvailable(),
      model: aiModelLabel(),
      petName: PET_NAME,
      userName: config.userName || null,
    });
    win.webContents.send('sys-stats', getSysStats());
    // pet.tuning.json salvo (ver "Salvar como padrão" na janela de
    // Configurações): mesmos valores que a edição ao vivo aplicaria,
    // hidratados uma vez no boot (settingsBridge.applyTuningConfig).
    if (tuning.renderer) win.webContents.send('tuning-config', tuning.renderer);
  });

  console.log(
    `[pet] janela: pedido ${bounds.width}x${bounds.height} @ (${bounds.x},${bounds.y})` +
      ` | real ${JSON.stringify(win.getBounds())}` +
      ` | monitores: ${screen.getAllDisplays().length}` +
      ` | IA: ${aiAvailable() ? `${AI_PROVIDER} (${aiModelLabel()})` : 'cérebro local (sem provider configurado)'}`
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

  // Ico_Eye: a cada segundo (por padrão — SYS_POLL_MS/WINDOW_POLL_MS são
  // editáveis ao vivo pela janela de Configurações, aba "Sistema", ver
  // setSysPollMs()/setWindowPollMs() mais abaixo), pergunta ao Windows qual
  // é a janela ativa. Só repassa título+app ao renderer se o processo
  // estiver na lista de observados — o resto o pet nem chega a "ver".
  let lastKey = null;
  async function pollActiveWindow() {
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
  }
  pollActiveWindowFn = pollActiveWindow;
  windowPollHandle = setInterval(pollActiveWindow, WINDOW_POLL_MS);

  // Sistema: RAM/CPU (a primeira amostra de CPU zera o delta)
  sampleCpu();
  sysPollHandle = setInterval(() => {
    if (!win) return;
    win.webContents.send('sys-stats', getSysStats());
  }, SYS_POLL_MS);

  win.on('closed', () => {
    clearInterval(cursorPoll);
    clearInterval(windowPollHandle);
    clearInterval(sysPollHandle);
    windowPollHandle = null;
    sysPollHandle = null;
    win = null;
  });
}

// Handles/funções dos pollers de janela ativa / sistema — module-level pra a
// janela de Configurações poder reagendá-los (setWindowPollMs/setSysPollMs)
// em tempo real, sem precisar recriar a janela do pet inteira.
let windowPollHandle = null;
let sysPollHandle = null;
let pollActiveWindowFn = null;

function setSysPollMs(ms) {
  SYS_POLL_MS = ms;
  if (sysPollHandle) {
    clearInterval(sysPollHandle);
    sysPollHandle = setInterval(() => {
      if (!win) return;
      win.webContents.send('sys-stats', getSysStats());
    }, SYS_POLL_MS);
  }
}

function setWindowPollMs(ms) {
  WINDOW_POLL_MS = ms;
  if (windowPollHandle && pollActiveWindowFn) {
    clearInterval(windowPollHandle);
    windowPollHandle = setInterval(pollActiveWindowFn, WINDOW_POLL_MS);
  }
}

// Recalcula os bounds da janela do pet com o WINDOW_HEIGHT atual — chamado
// pela aba "Sistema" da janela de Configurações (ver setWindowHeight()).
function applyWindowHeight(px) {
  WINDOW_HEIGHT = px;
  if (!win) return;
  win.setBounds(getWindowBounds());
  win.webContents.send('screen-config', getScreenConfig());
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

// AI_Chat: mensagem do usuário → resposta (Ollama ou Groq, conforme
// aiProvider — erro/indisponível e o renderer resolve com o cérebro local
// em brain.js)
ipcMain.handle('chat-message', async (event, { text, context }) => {
  return askAI(text, context);
});

// Diário do pet: o renderer manda cada reação/estado pra cá, e a gente
// imprime no terminal com hora — pro usuário acompanhar a "vida" dele.
ipcMain.on('pet-log', (event, line) => {
  const ts = new Date().toLocaleTimeString('pt-BR');
  console.log(`${ts} ${line}`);
});

// ── Janela de Configurações/Playground ──
// BrowserWindow separada da janela do pet: tem frame normal, é
// redimensionável, não é transparent nem alwaysOnTop — um painel de
// controle "de verdade". Só existe uma por vez (reaproveita/foca se já
// estiver aberta). Ela NÃO enxerga o renderer do pet diretamente — main.js
// faz de relé entre as duas via os canais 'settings:cmd' (settings → pet) e
// 'settings:pet-event' (pet → settings); tudo que é "dono" do main (janela,
// pollers, chaves de API) é tratado aqui mesmo, sem ir até o pet.
let settingsWin = null;
function createSettingsWindow() {
  if (settingsWin) {
    settingsWin.show();
    settingsWin.focus();
    return;
  }
  settingsWin = new BrowserWindow({
    width: 760,
    height: 640,
    minWidth: 560,
    minHeight: 420,
    title: 'Icozinho — Configurações',
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'settings', 'settings-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  settingsWin.setMenuBarVisibility(false);
  settingsWin.loadFile(path.join(__dirname, 'settings', 'settings.html'));
  settingsWin.on('closed', () => {
    settingsWin = null;
  });
}

// ── Aba "Cérebro e Falas": lê/grava direto em personalities/*.js,
// lorebook.js e curiosity.js via main/brainStore.js (edição segura por AST,
// com backup .bak e validação — ver main/sourceEditor.js). Cada operação
// mutante responde com 'brainOpResult' ({ok,error}) e, se deu certo, reenvia
// o 'brainData' inteiro (é pequeno, mais simples que fazer merge parcial no
// lado da UI e garante que a UI nunca fica com uma cópia desatualizada).
function sendBrainData() {
  if (!settingsWin) return;
  const moods = {};
  for (const m of brainStore.MOOD_IDS) moods[m] = brainStore.readPersonalityLines(m);
  settingsWin.webContents.send('settings:main-event', {
    type: 'brainData',
    payload: { moods, lorebook: brainStore.readLorebook(), curiosity: brainStore.readCuriosity() },
  });
}
function sendBrainOpResult(result) {
  if (!settingsWin) return;
  settingsWin.webContents.send('settings:main-event', { type: 'brainOpResult', payload: result });
  if (result.ok) sendBrainData();
}

// Comandos "donos do main" (scope: 'main') — tudo que a janela de pet não
// controla: tamanho/posição da janela, frequência dos pollers, apps
// observados e as chaves de API. Responde pelo canal 'settings:main-event'.
function handleMainScopedCommand(msg) {
  const { type, payload } = msg;
  switch (type) {
    case 'getMainSnapshot':
      if (settingsWin) {
        settingsWin.webContents.send('settings:main-event', { type: 'mainSnapshot', payload: mainSnapshotPayload() });
      }
      break;
    case 'setWindowHeight':
      if (Number.isFinite(payload.value)) applyWindowHeight(payload.value);
      break;
    case 'setSysPollMs':
      if (Number.isFinite(payload.value)) setSysPollMs(payload.value);
      break;
    case 'setWindowPollMs':
      if (Number.isFinite(payload.value)) setWindowPollMs(payload.value);
      break;
    case 'addWatchedApp':
      if (payload.value && !WATCHED_APPS.includes(payload.value)) {
        WATCHED_APPS.push(payload.value.toLowerCase());
      }
      break;
    case 'removeWatchedApp':
      {
        const i = WATCHED_APPS.indexOf(payload.value);
        if (i >= 0) WATCHED_APPS.splice(i, 1);
      }
      break;
    case 'setApiKey':
      setApiKey(payload.provider, payload.value);
      break;
    case 'startPet':
      startPet();
      break;
    case 'getConversationLog':
      if (settingsWin) {
        settingsWin.webContents.send('settings:main-event', {
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

// "Salvar como padrão": grava tudo que está valendo AGORA (main + o que a
// janela de Settings já tem espelhado do pet — ver settings/settings.js
// "model") em pet.tuning.json, pra sobreviver a um restart. Chaves de API
// vão pro pet.config.json (mesmo arquivo/lugar que loadConfig() já lê —
// NUNCA committado, ver .gitignore), fundidas com o que já existia lá (não
// pisa em petName/userName etc. configurados manualmente).
function saveAsDefault(payload) {
  const bundle = {
    main: {
      windowHeight: WINDOW_HEIGHT,
      sysPollMs: SYS_POLL_MS,
      windowPollMs: WINDOW_POLL_MS,
      watchedApps: [...WATCHED_APPS],
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

  if (settingsWin) {
    settingsWin.webContents.send('settings:main-event', { type: 'savedDefault', payload: { ok: true } });
  }
}

// Relé: janela de Configurações → main. scope 'main' é tratado aqui mesmo;
// scope 'pet' segue pro renderer do pet (que responde por 'settings:pet-event').
ipcMain.on('settings:cmd', (event, msg) => {
  if (!msg || typeof msg.type !== 'string') return;
  if (msg.scope === 'main') {
    handleMainScopedCommand(msg);
  } else if (win) {
    win.webContents.send('settings:cmd', msg);
  }
});

// Relé: renderer do pet → janela de Configurações (respostas de snapshot,
// resultado do teste de chat, etc).
ipcMain.on('settings:pet-event', (event, msg) => {
  if (settingsWin) settingsWin.webContents.send('settings:pet-event', msg);
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
        { label: aiAvailable() ? `IA: ${aiModelLabel()}` : 'IA: cérebro local', enabled: false },
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

app.whenReady().then(() => {
  // A PRIMEIRA janela é sempre a de Configurações — o pet só nasce quando o
  // usuário clicar "Iniciar o pet" nela (ver startPet() mais abaixo). A
  // bandeja já existe desde o boot (dá outro jeito de reabrir Configurações
  // a qualquer momento, mesmo antes do pet existir).
  createTray();
  createSettingsWindow();

  // Monitor plugado/removido/reconfigurado → reposiciona a "pista" (só faz
  // sentido depois que o pet existir)
  const reposition = () => {
    if (!win) return;
    win.setBounds(getWindowBounds());
    win.webContents.send('screen-config', getScreenConfig());
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
  if (BrowserWindow.getAllWindows().length === 0) createSettingsWindow();
});
