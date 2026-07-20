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
    // Tique/espreguiçada em andamento NÃO são cortados aqui: são curtos
    // (0.8s/4.2s) e terminam sozinhos — cortar zerava tickY/stretch de um
    // frame pro outro e dava um "pop" na pose. Novos não são agendados
    // porque o idle recomeçou do zero.
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
    // No colo, caindo, com pergunta aberta (estacionar/curiosidade) ou no
    // meio de uma conversa (chat) também não: "segurar parado" não é tédio,
    // e shutdown/sono no meio do drag faria o gem despencar da mão do
    // usuário (ou dormir com o balão/painel aberto).
    if (
      state.dragging || state.releaseFall || state.awaitingParkAnswer ||
      state.chatOpen || state.askingQuestion
    ) return;
    // Corpo ocupado (tique, espreguiçada, tonta ou viagem em andamento):
    // toda transição de idle espera a animação atual terminar — cortar no
    // meio dava pop de pose, e dormir/desligar no meio de uma viagem deixava
    // o reloc pendente que "teleportava" ele pro destino ao acordar. São
    // todas curtas (≤ ~4s), então o gatilho só desliza alguns segundos.
    if (state.tick || state.stretch || state.dizzy || state.reloc) return;

    // 1min parado → medita (uma vez por ciclo de idle; quando o zen termina,
    // o idle continua e a próxima parada é o sono)
    if (!state.zenCycleDone && idleSec >= ZEN_AT) {
      state.zenCycleDone = true;
      personalityCtl.enterZen(now);
      return;
    }

    if (idleSec >= SLEEP_AT) {
      state.sleeping = true;
      logEvent('dormiu', `depois de ${Math.round(idleSec)}s parado`);
      speak('sleep');
    } else if (!state.shutdownDone && idleSec >= state.shutdownAt) {
      state.shutdownDone = true;
      state.shutdown = { start: now, vy: 0, falling: false, bounces: 0, startled: false };
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
        speak(state.parked ? 'fidget_parked' : 'fidget');
      }
    }
  };
}
