// Falas espontâneas (ambient): de tempos em tempos o pet solta um comentário
// do banco lines.ambient da personalidade ativa, sem nenhum gatilho de input.
//
// O intervalo é aleatório (nunca metrônomo), no mesmo espírito do relógio de
// tédio (boredom.js): um tempo-base com variação de ±40%, escalado pelo
// msgSpeed da personalidade.
//
// Fórmula do intervalo (base = CONFIG.ritmo.ambientBaseSec em ms):
//   intervalo = (base / msgSpeed) * (0.6 + random*0.8)
//   → média = base / msgSpeed, espalhando de 60% a 140% da média.
// Com base = 120s (2min): msgSpeed 1x → ~2min; 0.5x → ~4min; 1.5x → ~1min20s.
// (Ver tabela na seção 2 do escopo.) O tempo-base é ajustável na aba Ritmo e
// Tempos: CONFIG.ritmo.ambientBaseSec.
import { CONFIG } from '../config.js';

function pickInterval(msgSpeed) {
  const mean = (CONFIG.ritmo.ambientBaseSec * 1000) / (msgSpeed || 1);
  return mean * (0.6 + Math.random() * 0.8);
}

/** Fábrica: liga o agendador ao estado e ao balão de fala. Devolve um
 * update(now) chamado a cada frame pelo loop principal (movement.js). */
export function createAmbientSpeech({ state, speak }) {
  let nextAt = 0;
  let lastPersonalityId = null;

  return function updateAmbientSpeech(now) {
    const personality = state.personality;
    if (!personality) return;

    // Troca de humor: reprograma logo pra um vão curto, pra a nova
    // personalidade "estrear a voz" sem esperar o intervalo antigo inteiro
    // (ex.: entrar no Excited e começar a flertar rápido).
    if (personality.id !== lastPersonalityId) {
      lastPersonalityId = personality.id;
      nextAt = now + 3000 + Math.random() * 5000;
      return;
    }

    if (nextAt === 0) {
      nextAt = now + pickInterval(personality.msgSpeed);
      return;
    }
    if (now < nextAt) return;
    nextAt = now + pickInterval(personality.msgSpeed);

    // Só tagarela quando está "disponível": nada de falar dormindo, no meio
    // de um shutdown, durante a aura não-interrompível, sendo arrastado, ou
    // nas fases scriptadas de clímax do Excited (shy/shy2/trapped/rush, que
    // têm falas próprias e atropelariam).
    if (
      state.sleeping ||
      state.shutdown ||
      state.zenAuraActive ||
      state.dragging ||
      state.releaseFall
    ) {
      return;
    }
    if (state.mode === 'excited' && state.excitedState) {
      const phase = state.excitedState.phase;
      if (phase !== 'free' && phase !== 'needYou' && phase !== 'pleasePet') return;
    }

    speak('ambient');
  };
}
