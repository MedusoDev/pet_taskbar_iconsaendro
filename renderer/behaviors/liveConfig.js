// Config editável em tempo de execução: espelha constantes que antes eram
// `const` fixo no topo de outros módulos (boredom.js, personalityState.js,
// interactions.js). Migradas pra cá — mutáveis — pra janela de Configurações
// (ver settings/ + behaviors/settingsBridge.js) poder alterá-las com o pet
// rodando, sem reiniciar nada. Os módulos leem o valor atual do grupo a cada
// uso (nunca capturam uma cópia num closure), então qualquer mudança aqui
// vale já no próximo frame/evento.

export const liveConfig = {
  // ── behaviors/boredom.js ──
  boredom: {
    REST_AT: 14,      // tiques de impaciência
    STRETCH_AT: 32,   // espreguiçada (uma vez por ciclo)
    ZEN_AT: 60,       // 1min parado → entra no modo Zen (uma vez por ciclo)
    SLEEP_AT: 65,     // dorme (precisa ser > ZEN_AT)
    SHUTDOWN_MIN: 30, // evento shutdown: sorteado entre este valor e +20s
  },
  // ── behaviors/personalityState.js ──
  personality: {
    ZEN_BREATHING_ESCALATE_MS: 240000, // respiração contínua → zen_aura
    ZEN_EXCITED_PET_MS: 6000,          // carinho contínuo no zen → excited
    PET_CHARGE_FILL_SEC: 4,            // supercarga: cafuné contínuo (s)
    NSFW_CHARGE_FILL_SEC: 35,          // arousal por site adulto (s)
    PLEASE_PET_EXCESS_MS: 3000,        // carinho acumulado → vergonha
  },
  // ── behaviors/interactions.js ──
  interactions: {
    PET_FLIPS_NEEDED: 2,          // inversões de direção pra engatar o cafuné
    AFFECTION_PER_STROKE: 0.0004, // quanto cada px de esfregada enche a barra
  },
  // ── behaviors/chat.js / settingsBridge.js ──
  ai: {
    forceLocalBrain: false, // true → chat.js nunca chama a API, só o cérebro local
  },
};

// Snapshot congelado dos valores de fábrica — usado pelo botão de reset da
// janela de Configurações e como base do "Salvar como padrão".
const FACTORY_DEFAULTS = JSON.parse(JSON.stringify(liveConfig));

export function getLiveConfigDefaults() {
  return FACTORY_DEFAULTS;
}

/** Aplica um subconjunto de overrides (formato igual ao de `liveConfig`,
 * grupos/campos ausentes ficam como estão) — usado tanto pela janela de
 * Configurações quanto pra hidratar com o pet.tuning.json salvo no boot. */
export function applyLiveConfig(overrides) {
  if (!overrides) return;
  for (const group of Object.keys(liveConfig)) {
    if (overrides[group]) Object.assign(liveConfig[group], overrides[group]);
  }
}

export function resetLiveConfig() {
  applyLiveConfig(FACTORY_DEFAULTS);
}
