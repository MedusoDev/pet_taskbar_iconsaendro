// Vida normal (acordada ou dormindo): compõe, quadro a quadro, tudo que não
// é shutdown — assinatura da personalidade, carinho/empolgado, tiques,
// espreguiçada, tonta, backflip, respiração das facetas, posição (via
// wander.js), escala e a rotação final do corpo.
import { clamp, smooth, pulse, stretchEnv, damp } from './mathUtils.js';
import { createNoise2D } from '../noise.js';
import { GEM_RADIUS } from '../scene.js';
import {
  EDGE_MARGIN,
  startRelocate,
  updateRestPosition,
  updateSleepPosition,
  syncFromDrag,
  updateReleaseFall,
} from './wander.js';

// Espaço pessoal do cursor
const NEAR_PX = 150;          // "perto" do gem, em pixels de tela
const FLINCH_SPEED = 1300;    // px/s: aproximação acima disso assusta
const FLINCH_COOLDOWN = 5000; // ms entre sustos

const noiseMod = createNoise2D(3); // modula spin/bob/respiração/tilt (mata os metrônomos)
const n01 = (v) => (v + 1) / 2;    // ruído [-1,1] → [0,1]

/** Posição do gem em pixels da tela (a janela ocupa a largura toda, embaixo). */
function gemScreenX(state, camera, gem) {
  return ((gem.position.x / state.halfWidth) + 1) / 2 * window.innerWidth;
}

export function updateAlive(state, refs, deps, now, delta, t) {
  const { camera, gem, mesh, applyUnfold, setPalette, zzzEl, siteIconEl, speechEl } = refs;
  const { logEvent, speak, personalityCtl } = deps;
  const personality = state.personality;
  const isExcited = state.mode === 'excited';

  // ── Máquina de personalidade: zen_breathing / zen_aura /
  // zen_much_more_excited têm pose própria, com prioridade sobre a
  // assinatura normal enquanto durar (ver behaviors/personalityState.js) ──
  const zenPose = personalityCtl ? personalityCtl.update(now, delta) : null;

  // ── Animação de assinatura da personalidade ──
  // Nem toda personalidade tem uma (Normality não tem).
  let sigSpinMul = 1, sigY = 0, sigUnfold = 0, sigZ = 0, sigScale = 0;
  if (zenPose) {
    sigZ = zenPose.z;
    sigY = zenPose.y;
    sigScale = zenPose.scale;
    sigUnfold = zenPose.unfold;
    sigSpinMul = zenPose.spinMul;
  } else if (
    !state.signatureAnim &&
    !state.sleeping && !state.dragging && !state.releaseFall &&
    !state.reloc && !state.stretch && !state.dizzy &&
    personality.signature &&
    now >= state.nextSignatureAt
  ) {
    const sig = personality.signature;
    state.signatureAnim = { start: now, sig };
    state.nextSignatureAt = now + (isExcited ? 6000 + Math.random() * 6000 : 25000 + Math.random() * 30000);
    logEvent('assinatura', sig.label);
  }
  if (!zenPose && state.signatureAnim) {
    const el = (now - state.signatureAnim.start) / 1000;
    const p = el / state.signatureAnim.sig.duration;
    if (p >= 1) {
      state.signatureAnim = null;
    } else {
      const out = state.signatureAnim.sig.apply(p);
      sigZ = out.z;
      sigY = out.y;
      sigScale = out.scale;
      sigUnfold = out.unfold;
      sigSpinMul = out.spinMul;
    }
  }

  // ── Carinho: bookkeeping do medidor (afeta o "encolher" visual em
  // qualquer personalidade; a entrada/saída do modo Excited é decidida pela
  // máquina de personalidade — ver behaviors/personalityState.js) ──
  if (state.pettingNow && now - state.lastPetAt > 400) state.pettingNow = false;
  if (!state.pettingNow) state.affection = Math.max(0, state.affection - delta * 0.035);
  state.petLean = damp(state.petLean, state.pettingNow ? 1 : 0, 3, delta);

  // Pulinhos tentando alcançar o cursor (só empolgado, pairando)
  let hopY = 0;
  if (isExcited && !state.sleeping) {
    if (!state.reloc && now >= state.nextExcitedHopAt) {
      state.excitedHopStart = now;
      state.nextExcitedHopAt = now + 1100 + Math.random() * 1300;
    }
    hopY = pulse((now - state.excitedHopStart) / 620) * 0.85;
  }

  // ── Rotação base (velocidade vagando por ruído — nunca metrônomo) ──
  // Cafuné derrete: gira mais devagar enquanto recebe carinho
  const spinRate = state.sleeping
    ? 0.02
    : 0.28 * personality.movement.spin * (0.5 + n01(noiseMod(t * 0.07, 10))) *
      sigSpinMul * (1 - state.petLean * 0.45);
  state.spin += delta * spinRate;
  state.spin += state.pokeVel * delta;
  state.pokeVel *= Math.exp(-2.2 * delta);
  if (state.pokeVel < 0.02) state.pokeVel = 0;

  // ── Curiosidade + espaço pessoal do cursor ──
  let wantYaw = 0, wantPitch = 0;
  if (!state.sleeping && state.cursor.x >= 0) {
    // Posição do gem e do cursor em px da janela (janela cobre a tela toda
    // na horizontal; verticalmente usa o offset real da janela)
    const cx = state.cursor.x - window.screenX;
    const cy = state.cursor.y - window.screenY;
    const gx = gemScreenX(state, camera, gem);
    const gy =
      (1 - (gem.position.y - camera.bottom) / (camera.top - camera.bottom)) *
      window.innerHeight;
    const distPx = Math.hypot(cx - gx, cy - gy);
    const near = distPx < NEAR_PX * 1.4;

    // Perto e devagar = atenção redobrada; em viagem "de visita" ao mouse,
    // o olhar também fica pregado nele; empolgado, nem se fala
    const visiting = state.reloc && state.reloc.toCursor;
    const gazeGain = isExcited ? 1.8 : near && state.cursorVel < 400 ? 1.7 : visiting ? 1.5 : 1;
    const dx = clamp((cx - gx) / (window.screen.width / 2), -1, 1);
    const dy = clamp((cy - gy) / (window.screen.height / 2), -1, 1);
    wantYaw = clamp(dx * 0.45 * gazeGain, -0.42, 0.42);
    wantPitch = clamp(-dy * 0.35 * gazeGain, -0.3, 0.3);

    if (!state.dragging && !state.releaseFall) {
      if (distPx < NEAR_PX * 1.2 && state.cursorVel > FLINCH_SPEED && now > state.flinchUntil) {
        // Susto: cursor voando pra cima dele → esquiva rápida pro lado oposto
        state.flinchUntil = now + FLINCH_COOLDOWN;
        state.wakeJolt = Math.max(state.wakeJolt, 0.45);
        logEvent('susto', `cursor veio a ${Math.round(state.cursorVel)}px/s`);
        const away = gx > cx ? 1 : -1;
        startRelocate(
          state,
          now,
          state.restX + away * (2.5 + Math.random() * 2),
          state.restY + 0.6 + Math.random() * 0.8,
          2.6,
          false,
          logEvent
        );
      } else if (isExcited && !state.reloc) {
        // Empolgado: segue o mouse direto, a tela inteira, querendo mais
        const cursorWorldX = ((cx / window.innerWidth) * 2 - 1) * camera.right;
        const limit = state.halfWidth - GEM_RADIUS - EDGE_MARGIN;
        state.anchor.x = damp(state.anchor.x, clamp(cursorWorldX, -limit, limit), 1.6, delta);
      } else if (!state.reloc && near && state.cursorVel < 250 && personality.movement.approach > 0) {
        // Cursor parado por perto → gravita na direção dele (Manhoso adora)
        const cursorWorldX = ((cx / window.innerWidth) * 2 - 1) * camera.right;
        const limit = state.halfWidth - GEM_RADIUS - EDGE_MARGIN;
        state.anchor.x = damp(
          state.anchor.x,
          clamp(cursorWorldX, -limit, limit),
          0.5 * personality.movement.approach,
          delta
        );
      }
    }
  }
  state.lookYaw = damp(state.lookYaw, wantYaw, 3, delta);
  state.lookPitch = damp(state.lookPitch, wantPitch, 3, delta);

  // ── Tiques de impaciência ──
  let tickY = 0, tickYaw = 0, tickUnfold = 0;
  if (state.tick) {
    const p = (now - state.tick.start) / 800;
    if (p >= 1) {
      state.tick = null;
    } else if (state.tick.type === 0) {
      tickY = pulse(p) * 0.28;                       // pulinho
    } else if (state.tick.type === 1) {
      tickYaw = Math.sin(p * Math.PI * 2) * 0.503;    // giro seco vai-e-volta
    } else {
      tickUnfold = pulse(p) * 0.22;                    // arrepio
    }
  }

  // ── Espreguiçada ──
  let stretchUnfold = 0, stretchScale = 0;
  if (state.stretch) {
    const p = (now - state.stretch.start) / 4200;
    if (p >= 1) {
      state.stretch = null;
    } else {
      const env = stretchEnv(p);
      stretchUnfold = env * 0.5;
      stretchScale = env * 0.05;
    }
  }

  // ── Tonta ──
  let dizzyZ = 0;
  if (state.dizzy) {
    const el = (now - state.dizzy.start) / 1000;
    const p = el / 2.6;
    if (p >= 1) {
      state.dizzy = null;
    } else {
      dizzyZ = Math.sin(el * 9) * 0.3 * (1 - p);
    }
  }

  // ── Backflip ──
  let flipX = 0;
  if (state.flip) {
    const p = (now - state.flip.start) / 1150;
    if (p >= 1) {
      state.flip = null;
    } else {
      flipX = -smooth(p) * Math.PI * 2;
    }
  }

  // ── Susto ao acordar (decai sozinho) ──
  state.wakeJolt = damp(state.wakeJolt, 0, 2.4, delta);

  // ── Desdobramento das facetas ("respiração", ritmo e fundo vagando) ──
  state.breathePhase += delta * (0.6 + 0.3 * n01(noiseMod(t * 0.09, 40)));
  const breathe = state.sleeping
    ? 0.015
    : 0.05 + Math.sin(state.breathePhase) * (0.018 + 0.02 * n01(noiseMod(t * 0.05, 45)));
  const unfoldTarget = clamp(
    breathe + tickUnfold + stretchUnfold + state.wakeJolt + sigUnfold + state.petLean * 0.12,
    0,
    1
  );
  state.unfold = damp(state.unfold, unfoldTarget, 2.4, delta);
  applyUnfold(state.unfold);

  // ── Posição: pairar / viajar / segurado / caindo ──
  // Bob com frequência E amplitude vagando por ruído (sem metrônomo)
  state.bobPhase += delta * (state.sleeping ? 0.3 : 0.42 + 0.22 * n01(noiseMod(t * 0.11, 20)));
  const bobAmp = state.sleeping ? 0.03 : 0.04 + 0.05 * n01(noiseMod(t * 0.05, 30));
  const bob = (Math.sin(state.bobPhase) + 1) * bobAmp;

  if (state.dragging) {
    syncFromDrag(state, gem);
  } else if (state.releaseFall) {
    updateReleaseFall(state, gem, delta, now, logEvent);
  } else if (!state.sleeping) {
    updateRestPosition(state, camera, now, delta, t, logEvent);
    gem.position.x = state.restX;
    gem.position.y = state.restY + bob + tickY + sigY + hopY;
  } else {
    updateSleepPosition(state, delta);
    gem.position.x = state.restX;
    gem.position.y = state.restY + bob + tickY;
  }

  // ── Escala (+ juice: estica na arrancada, amassa na chegada) ──
  const takeoffJuice = pulse((now - state.takeoffAt) / 480) * 0.05;
  const landJuice = pulse((now - state.landAt) / 420) * 0.06;
  const scaleTarget = state.dragging
    ? 0.92 // levemente encolhido ao ser segurado
    : state.sleeping
    ? 1 + Math.sin(t * 1.3) * 0.012
    : 1 + stretchScale + takeoffJuice - landJuice + sigScale + state.petLean * 0.025;
  state.scaleCur = damp(state.scaleCur, scaleTarget, 2.2, delta);
  gem.scale.setScalar(state.scaleCur);

  // ── Corpo sente o movimento: inclina na direção da velocidade ──
  const velX = (gem.position.x - state.prevX) / Math.max(delta, 1e-4);
  const velY = (gem.position.y - state.prevY) / Math.max(delta, 1e-4);
  state.prevX = gem.position.x;
  state.prevY = gem.position.y;
  state.velXSm = damp(state.velXSm, velX, 6, delta);
  state.velYSm = damp(state.velYSm, velY, 6, delta);
  const bankZ = clamp(-state.velXSm * 0.055, -0.34, 0.34); // "deita" na curva
  const pitchVel = clamp(state.velYSm * 0.02, -0.12, 0.12); // nariz sobe/desce

  // ── Composição final da rotação (tilts também vagam por ruído) ──
  state.tiltX = damp(
    state.tiltX,
    0.22 + Math.sin(t * 0.2) * 0.14 + noiseMod(t * 0.06, 60) * 0.06,
    2,
    delta
  );
  state.tiltZ = damp(
    state.tiltZ,
    Math.cos(t * 0.13) * 0.05 + noiseMod(t * 0.08, 70) * 0.05,
    2,
    delta
  );
  mesh.rotation.y = state.spin + state.lookYaw + tickYaw;
  mesh.rotation.x = state.tiltX + state.lookPitch + flipX - pitchVel;
  mesh.rotation.z = state.tiltZ + dizzyZ + bankZ + sigZ;

  // ── zzz ──
  if (state.sleeping) {
    zzzEl.classList.add('visible');
    zzzEl.style.left = `${gemScreenX(state, camera, gem) + 34}px`;
  } else {
    zzzEl.classList.remove('visible');
  }

  // ── Ico_Eye: ícone do site acompanha o gem ──
  siteIconEl.style.left = `${gemScreenX(state, camera, gem)}px`;

  // ── AI_Live: balão de fala acompanha o gem ──
  speechEl.style.left = `${gemScreenX(state, camera, gem)}px`;

  // ── UI acompanha o gem também na vertical (a janela agora é alta e ele
  //    paira/é arrastado em alturas variadas) ──
  const uiBottomPx =
    ((gem.position.y + GEM_RADIUS * 1.15 - camera.bottom) / (camera.top - camera.bottom)) *
      window.innerHeight +
    6;
  zzzEl.style.bottom = `${uiBottomPx}px`;
  siteIconEl.style.bottom = `${uiBottomPx + 10}px`;
  speechEl.style.bottom = `${uiBottomPx + 14}px`;
}
