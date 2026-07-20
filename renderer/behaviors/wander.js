// Movimento Hover/Relocate: a maior parte do tempo o pet PAIRA em volta de
// um ponto-âncora (micro-deriva por ruído), e de tempos em tempos DECIDE ir
// pra outro lugar — arrancada, viagem com ease-in-out, chegada e assentada.
// Intenção + pausa + arrancada, em vez de deriva uniforme (que lia como
// "fumaça" e não como bichinho).
import { GEM_RADIUS } from '../scene.js';
import { createNoise2D } from '../noise.js';
import { clamp, smooth, damp } from './mathUtils.js';

export const EDGE_MARGIN = 0.4;

const WANDER_Y_RANGE = 2.4; // faixa vertical dos pontos-âncora
const MICRO_X = 0.55;       // amplitude da micro-deriva enquanto paira
const MICRO_Y = 0.4;
const HOVER_LAMBDA = 1.8;   // mola da pairada (segue âncora + ruído)
const RELOC_SPEED = 4.2;    // unidades/s médias de viagem
const RELOC_MIN_DUR = 700;  // ms
const RELOC_MAX_DUR = 3400; // ms

// Queda com gravidade + 1 quique ao soltar do drag
const RELEASE_GRAVITY = 7.5;
const RELEASE_BOUNCE_RESTITUTION = 0.4;

const noiseX = createNoise2D(1);
const noiseY = createNoise2D(2);

/** Área visível / chão, a partir da câmera ortográfica. */
export function computeView(camera) {
  const halfWidth = camera.right;
  const viewTop = camera.top;
  const groundY = -camera.top + GEM_RADIUS + 0.05;
  return { halfWidth, viewTop, groundY };
}

/** Chão POR MONITOR: em setups multi-tela, cada monitor tem seu rodapé/taskbar
 * em um Y diferente (main.js manda a geometria via screen-config). Dado um X
 * de mundo, devolve o groundY do monitor sob aquele ponto — assim o pet sobe
 * pra "flutuar" na borda de um monitor mais baixo em vez de sumir embaixo
 * dele. Sem config (ou X fora de qualquer tela), cai no chão global. */
// Perto da divisa entre dois monitores, o chão vira uma RAMPA (mistura dos
// dois lados) em vez de um degrau — senão o clamp da pairada dava um soco
// vertical no pet quando a micro-deriva cruzava a fronteira.
const GROUND_BLEND_PX = 160;

export function groundAtX(state, x) {
  const cfg = state.screenConfig;
  if (!cfg || !state.viewTop) return state.groundY;
  const screenPx = window.screenX + ((x / state.halfWidth + 1) / 2) * window.innerWidth;
  const worldPerPx = (2 * state.viewTop) / window.innerHeight;
  const toWorld = (floorY) =>
    state.viewTop - (floorY - window.screenY) * worldPerPx + GEM_RADIUS + 0.05;

  for (const d of cfg.displays) {
    if (screenPx >= d.x && screenPx < d.x + d.width) {
      let g = toWorld(d.floorY);
      // Vizinho à direita/esquerda dentro da zona de mistura: cada lado
      // rampa metade do caminho, e os dois se encontram no meio da divisa.
      const right = cfg.displays.find((n) => n !== d && Math.abs(n.x - (d.x + d.width)) < 2);
      const left = cfg.displays.find((n) => n !== d && Math.abs(n.x + n.width - d.x) < 2);
      const distRight = d.x + d.width - screenPx;
      const distLeft = screenPx - d.x;
      if (right && distRight < GROUND_BLEND_PX) {
        g += (toWorld(right.floorY) - g) * 0.5 * (1 - distRight / GROUND_BLEND_PX);
      } else if (left && distLeft < GROUND_BLEND_PX) {
        g += (toWorld(left.floorY) - g) * 0.5 * (1 - distLeft / GROUND_BLEND_PX);
      }
      return g;
    }
  }
  return state.groundY;
}

/** Agenda a próxima decisão de "ir pra outro lugar" com intervalo exponencial
 * (processo de Poisson): irregular de verdade, sem cadência perceptível. */
export function scheduleNextRelocate(state, now) {
  const mean = state.personality.movement.hoverMeanSec * 1000;
  const delay = -Math.log(1 - Math.random()) * mean;
  state.nextRelocateAt = now + clamp(delay, 2200, mean * 3);
}

/** Inicia uma viagem até (targetX, targetY): duração proporcional à
 * distância, modulada pela personalidade do dia. speedMul > 1 = urgência
 * (susto). toCursor = viagem "de visita" ao mouse. */
export function startRelocate(state, now, targetX, targetY, speedMul, toCursor, logEvent) {
  const mv = state.personality.movement;
  const limit = state.halfWidth - GEM_RADIUS - EDGE_MARGIN;
  const x1 = clamp(targetX, -limit, limit);
  const g1 = groundAtX(state, x1);
  const y1 = clamp(targetY, g1, g1 + WANDER_Y_RANGE * mv.yRange);
  const dist = Math.hypot(x1 - state.restX, y1 - state.restY);
  const dur = clamp(
    (dist / (RELOC_SPEED * mv.speed * speedMul)) * 1000,
    RELOC_MIN_DUR / speedMul,
    RELOC_MAX_DUR
  );
  state.reloc = { x0: state.restX, y0: state.restY, x1, y1, start: now, dur, toCursor };
  state.takeoffAt = now;
  logEvent(
    'viagem',
    `de x=${state.restX.toFixed(1)} pra x=${x1.toFixed(1)}` +
      (toCursor ? ' (visita ao mouse)' : '') +
      (speedMul > 1.5 ? ' [fugindo!]' : '')
  );
}

/** Posição do cursor em coordenadas de mundo (eixo X), ou null se desconhecida. */
export function cursorToWorldX(state, camera) {
  if (state.cursor.x < 0) return null;
  const cx = state.cursor.x - window.screenX;
  return ((cx / window.innerWidth) * 2 - 1) * camera.right;
}

/** Sorteia um novo poleiro: na maioria das vezes um ponto aleatório, mas de
 * vez em quando (mais frequente em personalidades grudentas) ele decide ir
 * fazer companhia pro mouse — pousa perto de onde o cursor está.
 *
 * POUSO: na maior parte das vezes o destino é o CHÃO (em cima da taskbar) —
 * flutuar é coisa de viagem; parado, ele assenta como um bichinho de
 * verdade. Só de vez em quando escolhe pairar mais alto. */
const PERCH_CHANCE = 0.65; // chance do poleiro ser rente à taskbar

export function pickWanderTarget(state, camera) {
  const mv = state.personality.movement;
  const limit = state.halfWidth - GEM_RADIUS - EDGE_MARGIN;

  const cwx = cursorToWorldX(state, camera);
  // Empolgado só quer saber de uma coisa: onde o mouse está
  const visitChance = state.mode === 'excited' ? 1 : 0.22 + 0.4 * mv.approach;
  if (cwx !== null && Math.random() < visitChance) {
    const x = cwx + (Math.random() * 2 - 1) * 1.8; // perto, mas não em cima
    const g = groundAtX(state, x);
    return {
      x,
      y: Math.random() < PERCH_CHANCE ? g : g + 0.5 + Math.random() * WANDER_Y_RANGE * mv.yRange * 0.6,
      toCursor: true,
    };
  }

  const x = (Math.random() * 2 - 1) * limit;
  const g = groundAtX(state, x);
  return {
    x,
    y: Math.random() < PERCH_CHANCE ? g : g + 0.5 + Math.random() * WANDER_Y_RANGE * mv.yRange,
    toCursor: false,
  };
}

/** Atualiza restX/restY quando acordado e livre (sem drag/queda/dormindo):
 * viagem em andamento (ease-in-out) ou pairando (micro-deriva por ruído),
 * decidindo quando começar a próxima viagem. */
export function updateRestPosition(state, camera, now, delta, t, logEvent) {
  if (state.reloc) {
    const p = (now - state.reloc.start) / state.reloc.dur;
    if (p >= 1) {
      state.anchor.x = state.reloc.x1;
      state.anchor.y = state.reloc.y1;
      state.restX = state.reloc.x1;
      state.restY = state.reloc.y1;
      state.reloc = null;
      state.landAt = now;
      scheduleNextRelocate(state, now);
    } else {
      const e = smooth(p);
      state.restX = state.reloc.x0 + (state.reloc.x1 - state.reloc.x0) * e;
      state.restY = state.reloc.y0 + (state.reloc.y1 - state.reloc.y0) * e;
    }
  } else {
    const mv = state.personality.movement;
    const g = groundAtX(state, state.restX);
    // Pousado na taskbar, a deriva vertical quase some (bichinho assentado,
    // não bola de sabão); a horizontal também diminui um pouco. Flutuando
    // alto, deriva normal.
    const heightFactor = clamp((state.anchor.y - g) / 1.2, 0.15, 1);
    const mx = noiseX(t * 0.32, 0) * MICRO_X * mv.micro * (0.55 + 0.45 * heightFactor);
    const my = noiseY(t * 0.27, 50) * MICRO_Y * mv.micro * heightFactor;
    state.restX = damp(state.restX, state.anchor.x + mx, HOVER_LAMBDA, delta);
    state.restY = damp(
      state.restY,
      clamp(state.anchor.y + my, g, g + WANDER_Y_RANGE + 0.5),
      HOVER_LAMBDA,
      delta
    );
    // Decisão de mudar de poleiro (agenda irregular, estilo Poisson).
    // zen_aura é não interrompível: enquanto ativa, não começa viagem nova.
    // Recebendo cafuné também não sai andando no meio do carinho.
    // Excited não faz viagens: ele já segue o mouse continuamente por âncora
    // (liveAnimation.js) — uma viagem no meio faria ele "travar" e parar.
    // Parked (estacionado pelo usuário) também não: prometeu ficar no lugar.
    // Assinatura tocando ou pergunta de estacionar aberta: espera terminar —
    // viajar no meio comporia a pose com o banking do voo (ou levaria o
    // balão passeando pela tela).
    // Chat/pergunta abertos: fica quietinho conversando — viajar levaria o
    // painel (e o teclado do usuário) passeando pela tela.
    if (state.pettingNow || state.chatOpen || state.askingQuestion) {
      state.nextRelocateAt = Math.max(state.nextRelocateAt, now + 3000);
    } else if (
      now >= state.nextRelocateAt &&
      state.mode !== 'excited' &&
      !state.parked &&
      !state.signatureAnim && !state.awaitingParkAnswer &&
      !state.stretch && !state.dizzy && !state.zenAuraActive
    ) {
      const tgt = pickWanderTarget(state, camera);
      startRelocate(state, now, tgt.x, tgt.y, 1, tgt.toCursor, logEvent);
    }
  }
}

/** Dormindo: pousa devagar no chão. Estacionado, dorme NO POLEIRO prometido
 * (mesmo no alto) — afundar até o chão quebraria a promessa do "fica aqui". */
export function updateSleepPosition(state, delta) {
  if (state.parked && state.parkHome) {
    state.anchor.x = state.parkHome.x;
    state.anchor.y = state.parkHome.y;
    state.restX = damp(state.restX, state.parkHome.x, 1.1, delta);
    state.restY = damp(state.restY, state.parkHome.y, 1.1, delta);
    return;
  }
  const g = groundAtX(state, state.anchor.x);
  state.anchor.y = g;
  state.restX = damp(state.restX, state.anchor.x, 1.1, delta);
  state.restY = damp(state.restY, g, 1.1, delta);
}

/** Enquanto arrastado, a posição é escrita direto pelo mousemove (ver
 * interactions.js) — aqui só ressincroniza o resto do estado de posição. */
export function syncFromDrag(state, gem) {
  state.restX = gem.position.x;
  state.restY = gem.position.y;
  state.anchor.x = state.restX;
  state.anchor.y = state.restY;
  state.reloc = null;
}

/** Queda com gravidade + 1 quique ao soltar do drag, depois volta a flutuar. */
export function updateReleaseFall(state, gem, delta, now, logEvent) {
  const rf = state.releaseFall;
  const g = groundAtX(state, gem.position.x);
  rf.vy -= RELEASE_GRAVITY * delta;
  gem.position.y += rf.vy * delta;
  if (gem.position.y <= g) {
    gem.position.y = g;
    if (Math.abs(rf.vy) > 0.6 && rf.bounces < 1) {
      rf.vy = -rf.vy * RELEASE_BOUNCE_RESTITUTION;
      rf.bounces++;
    } else {
      state.releaseFall = null;
      state.restX = gem.position.x;
      state.restY = g;
      state.anchor.x = state.restX;
      state.anchor.y = g + 0.6;
      state.landAt = now;
      scheduleNextRelocate(state, now);
      logEvent('pousou', `em x=${state.restX.toFixed(1)}`);
    }
  }
}
