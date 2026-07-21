// ── AI_Chat: qual provider usar ──
// aiProvider no pet.config.json escolhe o "cérebro" de IA: "ollama" (local,
// grátis, precisa do app rodando), "groq" (nuvem, precisa de groqApiKey) ou
// "none" (força o cérebro local em brain.js). Sem aiProvider definido, cai
// no comportamento antigo: usa Groq se houver chave configurada.
const state = require('../state');
const { askGroq } = require('./groq');
const { askOllama } = require('./ollama');
const { buildSystemPrompt } = require('./systemPrompt');

const GROQ_MODEL = 'llama-3.3-70b-versatile';

let petName = 'Ico';
let userName = null;
let ollamaModel = 'llama3.2:3b';
let provider = 'none';
let systemPrompt = buildSystemPrompt(petName);

// Hidrata o módulo a partir do pet.config.json (ver config.js loadConfig())
// — chamado uma vez no boot, antes de qualquer janela ser criada.
function init(config) {
  petName = config.petName || 'Ico';
  userName = config.userName || null;
  ollamaModel = config.ollamaModel || 'llama3.2:3b';
  state.groqApiKey = config.groqApiKey || process.env.GROQ_API_KEY || null;
  provider = config.aiProvider || (state.groqApiKey ? 'groq' : 'none');
  systemPrompt = buildSystemPrompt(petName);

  // Diagnóstico de boot: roda sempre (não depende de "Iniciar o pet"/criar
  // janela) pra dar pra confirmar qual provider ficou ativo só olhando o
  // terminal do `npm start`.
  console.log(
    `[pet] provider: aiProvider no config=${JSON.stringify(config.aiProvider ?? null)}` +
      ` | efetivo=${provider} | ollamaModel=${ollamaModel} | groqApiKey=${state.groqApiKey ? 'configurada' : 'ausente'}`
  );
  console.log(
    `[pet] IA ativa: ${aiAvailable() ? `${provider} (${aiModelLabel()})` : 'nenhuma — cérebro local (brain.js)'}`
  );
}

// Ollama não tem chave pra checar — "disponível" aqui só significa "é o
// provider escolhido"; se o app não estiver rodando, askOllama devolve
// { error } e o renderer cai no cérebro local do mesmo jeito que o Groq.
function aiAvailable() {
  if (provider === 'ollama') return true;
  if (provider === 'groq') return !!state.groqApiKey;
  return false;
}

function aiModelLabel() {
  if (provider === 'ollama') return ollamaModel;
  if (provider === 'groq') return state.groqApiKey ? GROQ_MODEL : null;
  return null;
}

async function askAI(text, context) {
  if (provider === 'ollama') return askOllama(text, context, { model: ollamaModel, systemPrompt });
  if (provider === 'groq') return askGroq(text, context, { apiKey: state.groqApiKey, model: GROQ_MODEL, systemPrompt });
  return { unavailable: true };
}

// Chamado pela janela de Configurações (aba IA/Chat) — troca a chave em
// memória na hora; a próxima chamada já usa a nova (o Groq não guarda
// client, lê state.groqApiKey direto em askGroq via askAI).
function setApiKey(apiProvider, value) {
  const v = (value || '').trim() || null;
  if (apiProvider === 'groq') state.groqApiKey = v;
  if (state.win) {
    state.win.webContents.send('ai-status', {
      available: aiAvailable(),
      model: aiModelLabel(),
      petName,
      userName,
    });
  }
}

module.exports = {
  init,
  askAI,
  aiAvailable,
  aiModelLabel,
  setApiKey,
  get provider() {
    return provider;
  },
  get petName() {
    return petName;
  },
  get userName() {
    return userName;
  },
};
