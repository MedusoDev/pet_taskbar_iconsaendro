// Relógio de tédio (segundos sem input do usuário): decide quando entra
// tique de impaciência, espreguiçada, shutdown ou sono. E o inverso: quando
// qualquer input chega, zera o relógio e acorda o pet se preciso.
import { scheduleNextRelocate, groundAtX } from './wander.js';

const REST_AT = 14;      // tiques de impaciência
const STRETCH_AT = 32;   // espreguiçada (uma vez por ciclo)
const ZEN_AT = 60;       // 1min parado → entra no modo Zen (uma vez por ciclo)
const SLEEP_AT = 65;     // dorme (só depois do ciclo de Zen já ter acontecido)
const SHUTDOWN_MIN = 30; // evento shutdown: sorteado entre 30 e 50s parado

export function resetBoredom(state, now) {
  state.lastInput = now;
  state.stretchDone = false;
  state.shutdownDone = false;
  state.shutdownAt = SHUTDOWN_MIN + Math.random() * 20;
  state.nextTickAt = 0;
}

/** Fábrica: liga registerInput ao logger/falas sem precisar passá-los toda
 * vez que um input do usuário chega (mouse, clique, cursor global). */
export function createRegisterInput({ logEvent, speak }) {
  return function registerInput(state, now) {
    const wasSleeping = state.sleeping;
    resetBoredom(state, now);
    state.tick = null;
    state.stretch = null;
    // Input de verdade rearma o ciclo: o próximo idle longo leva ao Zen de
    // novo (o fim da zen_aura NÃO rearma — senão ele rusharia zen→aura→zen).
    state.zenCycleDone = false;
    if (wasSleeping) {
      // Acorda com susto, reancorado onde estiver (não voa de volta pro
      // poleiro antigo)
      state.sleeping = false;
      state.wakeJolt = 1.0;
      state.pokeVel += 5;
      state.anchor.x = state.restX;
      state.anchor.y = Math.max(state.restY, groundAtX(state, state.restX) + 0.5);
      scheduleNextRelocate(state, now);
      logEvent('acordou', 'com susto');
      speak('wake');
    }
  };
}

/** Fábrica: entradas do relógio de tédio, avaliadas a cada frame enquanto
 * não há shutdown em andamento. */
export function createBoredomClock({ logEvent, speak, personalityCtl }) {
  return function updateBoredomClock(state, now, idleSec) {
    if (state.sleeping) return;
    // Tédio só existe no Normality: no Excited ele está elétrico (não
    // entediado) e no Zen a meditação tem os próprios timers — sono/shutdown
    // no meio da respiração deixariam dois sistemas de pose brigando.
    if (state.mode !== 'normality') return;
    // No colo, caindo ou com a pergunta de estacionar aberta também não:
    // "segurar parado" não é tédio, e shutdown/sono no meio do drag faria o
    // gem despencar da mão do usuário (ou dormir com o balão aberto).
    if (state.dragging || state.releaseFall || state.awaitingParkAnswer) return;

    // 1min parado → medita (uma vez por ciclo de idle; quando o zen termina,
    // o idle continua e a próxima parada é o sono)
    if (!state.zenCycleDone && idleSec >= ZEN_AT) {
      state.zenCycleDone = true;
      state.tick = null;
      state.stretch = null;
      personalityCtl.enterZen(now);
      return;
    }

    if (idleSec >= SLEEP_AT) {
      state.sleeping = true;
      state.tick = null;
      state.stretch = null;
      state.signatureAnim = null;
      logEvent('dormiu', `depois de ${Math.round(idleSec)}s parado`);
      speak('sleep');
    } else if (!state.shutdownDone && idleSec >= state.shutdownAt) {
      state.shutdownDone = true;
      state.shutdown = { start: now, vy: 0, falling: false, bounces: 0, startled: false };
      state.tick = null;
      state.stretch = null;
      state.signatureAnim = null;
      logEvent('shutdown', 'o bixinho puxou a alavanca...');
    } else if (!state.stretchDone && !state.stretch && idleSec >= STRETCH_AT) {
      state.stretch = { start: now };
      state.stretchDone = true;
      state.tick = null;
      logEvent('espreguiçada');
    } else if (!state.stretch && idleSec >= REST_AT) {
      if (state.nextTickAt === 0) state.nextTickAt = now + (4000 + Math.random() * 5000);
      if (now >= state.nextTickAt && !state.tick) {
        state.tick = { type: Math.floor(Math.random() * 2), start: now };
        state.nextTickAt = now + (4000 + Math.random() * 5000);
        logEvent('tique', ['pulinho', 'giro seco'][state.tick.type]);
        speak('fidget');
      }
    }
  };
}
