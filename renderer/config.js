// Config aplicada no lado do pet (renderer). O main manda a config salva no
// startup e a cada mudança (preload.onConfig) e aqui a gente aplica:
//   - personalidade: msgSpeed / travelSpeed (nos objetos de personalidade)
//   - falas: overlay do usuário mesclado por cima das falas embutidas
//   - ritmo / animações / interações: viram os tunables em CONFIG, lidos em
//     runtime pelos comportamentos (boredom, personalityState, ambientSpeech,
//     liveAnimation, interactions).
// (Os ajustes de Sistema — janela/navegador — são aplicados no main, não aqui.)
import { normality } from './personalities/normality.js';
import { zen } from './personalities/zen.js';
import { excited } from './personalities/excited.js';

const BY_ID = { normality, zen, excited };

// Baseline das falas embutidas: capturado UMA vez, pra mesclar as falas do
// usuário por cima sem duplicar quando a config é reaplicada ao vivo.
const baselineLines = {};
for (const id of Object.keys(BY_ID)) {
  baselineLines[id] = {};
  for (const [bank, arr] of Object.entries(BY_ID[id].lines)) {
    baselineLines[id][bank] = arr.slice();
  }
}

// Tunables lidos a cada uso pelos comportamentos. Os defaults aqui espelham os
// de configStore.js (main) — servem de fallback até a config salva chegar.
export const CONFIG = {
  ritmo: {
    zenEntrySec: 270,
    breathingToAuraSec: 360,
    sleepAfterZenSec: 90,
    excitedMaxMin: 5,
    excitedIdleExitMin: 2,
    ambientBaseSec: 120,
  },
  animacoes: {
    excitedSignatureMinSec: 6,
    excitedSignatureMaxSec: 12,
    idleSignatureMinSec: 25,
    idleSignatureMaxSec: 55,
  },
  interacoes: {
    petFlipsNeeded: 2,
    flinchSpeed: 1300,
  },
};

/** Aplica (ou reaplica) a config recebida do main. Tolerante a campos
 * ausentes — só mexe no que veio. */
export function applyConfig(cfg) {
  if (!cfg || typeof cfg !== 'object') return;

  if (cfg.personalidade) {
    for (const [id, v] of Object.entries(cfg.personalidade)) {
      const p = BY_ID[id];
      if (!p || !v) continue;
      if (typeof v.msgSpeed === 'number') p.msgSpeed = v.msgSpeed;
      if (typeof v.travelSpeed === 'number') {
        p.travelSpeed = v.travelSpeed;
        p.movement.speed = v.travelSpeed; // o motor de viagem lê movement.speed
      }
    }
  }

  if (cfg.ritmo) Object.assign(CONFIG.ritmo, cfg.ritmo);
  if (cfg.animacoes) Object.assign(CONFIG.animacoes, cfg.animacoes);
  if (cfg.interacoes) Object.assign(CONFIG.interacoes, cfg.interacoes);
  if (cfg.falas) applyFalas(cfg.falas);
}

// Reconstrói cada banco de falas = embutidas + adicionadas pelo usuário.
// Idempotente (sempre parte do baseline), então pode rodar em toda troca.
function applyFalas(falas) {
  for (const id of Object.keys(BY_ID)) {
    const p = BY_ID[id];
    const base = baselineLines[id];
    const overlay = (falas && falas[id]) || {};
    const banks = new Set([...Object.keys(base), ...Object.keys(overlay)]);
    for (const bank of banks) {
      const builtIn = base[bank] || [];
      const added = Array.isArray(overlay[bank]) ? overlay[bank] : [];
      p.lines[bank] = [...builtIn, ...added];
    }
  }
}
