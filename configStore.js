// Config persistente do Icozinho (processo main). Guarda os ajustes das abas
// de Configurações num JSON em userData, mescla sobre os defaults e serve
// tanto o pet (renderer) quanto a janela de Configurações.
//
// Decisão de armazenamento (seção 3 do escopo): as FALAS do usuário ficam aqui,
// num overlay JSON (`falas[personalidade][banco] = [linhas...]`), mesclado por
// cima das falas embutidas em personalities/*.js no runtime (ver
// renderer/config.js). Assim a janela de Configurações nunca precisa reescrever
// arquivo .js — só grava JSON, seguro e reversível.
const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  // Sistema
  openSettingsOnStart: true,
  openOnStartup: false, // iniciar o Icozinho junto com o Windows (login item)

  // Aba Personalidade — por personalidade
  personalidade: {
    normality: { msgSpeed: 1.0, travelSpeed: 1.0 },
    zen: { msgSpeed: 0.5, travelSpeed: 0.5 },
    excited: { msgSpeed: 1.5, travelSpeed: 1.5 },
  },

  // Aba Ritmo e Tempos — limiares das transições de humor (seções 4 e 5c)
  ritmo: {
    zenEntrySec: 270, // Normality parado → Zen
    breathingToAuraSec: 360, // respiração contínua no Zen → zen_aura
    sleepAfterZenSec: 90, // idle profundo pós-Zen → dorme
    excitedMaxMin: 5, // tempo total no Excited pra "cansar" (5c)
    excitedIdleExitMin: 2, // + tempo sem input pra sair do Excited (5c)
    ambientBaseSec: 120, // base do intervalo de fala espontânea (a msgSpeed 1x)
  },

  // Aba Animações — intervalos das assinaturas periódicas
  animacoes: {
    excitedSignatureMinSec: 6, // shimmy do Excited: mínimo entre repetições
    excitedSignatureMaxSec: 12,
    idleSignatureMinSec: 25, // assinatura das demais personalidades
    idleSignatureMaxSec: 55,
  },

  // Aba Interações — sensibilidade do mouse
  interacoes: {
    petFlipsNeeded: 2, // inversões de direção pra engatar cafuné
    flinchSpeed: 1300, // px/s: cursor mais rápido que isso assusta o pet
  },

  // Aba Sistema — aplicados na criação da janela (exigem reiniciar)
  sistema: {
    ativo: true, // liga/desliga o Icosaendro na tela; aplicado ao vivo (main.js)
    targetBrowser: 'brave', // navegador que o Ico_Eye observa
    windowHeight: 480, // altura da "pista" acima da taskbar
  },

  // Aba Falas — overlay de falas adicionadas pelo usuário (mesclado por cima
  // das embutidas). Estrutura: { [personalidade]: { [banco]: [linhas] } }
  falas: { normality: {}, zen: {}, excited: {} },
};

function configPath() {
  return path.join(app.getPath('userData'), 'pet.config.json');
}

// Mescla profunda simples (objetos planos): usada tanto pra aplicar os salvos
// sobre os defaults quanto pra aplicar um patch parcial sobre o config atual.
function deepMerge(base, patch) {
  if (!patch || typeof patch !== 'object') return base;
  const out = Array.isArray(base) ? base.slice() : { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && base && typeof base[k] === 'object' && !Array.isArray(base[k])) {
      out[k] = deepMerge(base[k], v);
    } else {
      out[k] = v; // arrays e escalares substituem
    }
  }
  return out;
}

function load() {
  try {
    const raw = fs.readFileSync(configPath(), 'utf8');
    return deepMerge(DEFAULTS, JSON.parse(raw));
  } catch {
    return deepMerge(DEFAULTS, {}); // arquivo ausente/corrompido → defaults
  }
}

function save(config) {
  try {
    fs.writeFileSync(configPath(), JSON.stringify(config, null, 2), 'utf8');
  } catch (err) {
    console.error('[pet] falha ao gravar config:', err.message);
  }
}

module.exports = { DEFAULTS, load, save, deepMerge, configPath };
