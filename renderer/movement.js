// Bootstrap + loop principal: monta a cena, o estado e cada sistema de
// comportamento (renderer/behaviors/*), e conduz o relógio de cada frame.
// A lógica de cada sistema vive no seu próprio módulo — aqui é só fiação.
import * as THREE from '../node_modules/three/build/three.module.js';
import { initScene } from './scene.js';
import { createPersonalityState } from './behaviors/personalityState.js';
import { createSpeech } from './behaviors/speech.js';
import { setupSiteEye } from './behaviors/siteEye.js';
import { computeView, scheduleNextRelocate } from './behaviors/wander.js';
import { createState } from './behaviors/state.js';
import { resetBoredom, createRegisterInput, createBoredomClock } from './behaviors/boredom.js';
import { updateShutdown } from './behaviors/shutdown.js';
import { setupInteractions } from './behaviors/interactions.js';
import { updateAlive } from './behaviors/liveAnimation.js';
import { createAffectionBar } from './behaviors/affectionBar.js';
import { createEffects } from './behaviors/effects.js';
import { createPrompt } from './behaviors/prompt.js';
import { createBond } from './behaviors/bond.js';
import { createBrain } from './behaviors/brain.js';
import { setupSysMonitor } from './behaviors/sysMonitor.js';
import { createChat } from './behaviors/chat.js';
import { createPetMemory } from './behaviors/petMemory.js';
import { setupCuriosity } from './behaviors/curiosity.js';

const canvas = document.getElementById('pet-canvas');
const zzzEl = document.getElementById('zzz');
const siteIconEl = document.getElementById('site-icon');
const speechEl = document.getElementById('speech');
const { scene, camera, renderer, gem, mesh, applyUnfold, updateVisuals, setTint, setPalette, setShapeMode } =
  initScene(canvas);

// ─── Diário do pet: tudo que ele faz vai pro terminal via IPC ────────────────
function logEvent(tag, detail = '') {
  const line = `[pet] ${tag}${detail ? ` — ${detail}` : ''}`;
  if (window.petAPI && window.petAPI.log) window.petAPI.log(line);
}

// ─── Área visível / chão ─────────────────────────────────────────────────────
let { halfWidth, viewTop, groundY } = computeView(camera);

// ─── Estado central + sistemas ligados a ele ─────────────────────────────────
const state = createState(performance.now(), groundY);
state.halfWidth = halfWidth;
state.viewTop = viewTop;
state.restY = groundY;
state.prevY = groundY;
state.anchor = { x: 0, y: groundY + 1.0 };

window.addEventListener('resize', () => {
  ({ halfWidth, viewTop, groundY } = computeView(camera));
  state.halfWidth = halfWidth;
  state.viewTop = viewTop;
  state.groundY = groundY;
});

// Geometria dos monitores (chão por tela) — ver groundAtX em wander.js
if (window.petAPI && window.petAPI.onScreenConfig) {
  window.petAPI.onScreenConfig((config) => {
    state.screenConfig = config;
  });
}

// Posição do gem em px de tela (efeitos DOM: corações, faíscas, chat)
function getGemPos() {
  return {
    x: ((gem.position.x / state.halfWidth) + 1) / 2 * window.innerWidth,
    bottom:
      ((gem.position.y - camera.bottom) / (camera.top - camera.bottom)) * window.innerHeight,
  };
}

// ─── AI_Live: máquina de personalidade (Normality ⇄ Zen ⇄ ...) ─────────────
// canSpeak: apagado/caindo (shutdown/nocaute) o pet fica MUDO — eventos
// assíncronos (site mudou, RAM alta, level-up) esperam ele religar.
const speak = createSpeech({
  speechEl,
  logEvent,
  getPersonality: () => state.personality,
  canSpeak: () => !state.shutdown,
});
const personalityCtl = createPersonalityState({ state, setPalette, setTint, logEvent, speak });
setPalette(state.personality.palette);
logEvent('personalidade', `${state.personality.name} (paleta ${state.personality.palette[0]}…)`);

// ─── Efeitos DOM (gotículas, corações, faíscas, blush) ──────────────────────
const effects = createEffects();

// ─── AI_Bond: vínculo persistente com o usuário ──────────────────────────────
// Level-up no meio de um shutdown/nocaute (ex.: os +5 pts do nocaute de
// amor) fica PENDENTE e a celebração toca quando ele religar — antes ela
// falava/brilhava com o pet caído no chão.
const bond = createBond({ logEvent });
state.bondLevel = bond.level();
let pendingLevelUp = null;
function celebrateLevelUp(lv) {
  const pos = getGemPos();
  effects.sparkBurst(pos.x, pos.bottom, 26);
  effects.flashRing(pos.x, pos.bottom, 1.4);
  effects.floatHearts(pos.x, pos.bottom, 4);
  state.pokeVel += 6;
  state.wakeJolt = 1;
  speak.text(`Subimos de nível: ${lv.name}! (${lv.desc}) 💜`, 'vínculo');
}
bond.setOnLevelUp((idx, lv) => {
  state.bondLevel = idx;
  if (state.shutdown || state.sleeping) {
    pendingLevelUp = lv;
    logEvent('vínculo', 'level-up guardado — celebra quando acordar');
  } else {
    celebrateLevelUp(lv);
  }
});

// ─── AI_Memory: o que o pet sabe sobre o usuário (banco local) ──────────────
const petMemory = createPetMemory({ logEvent });

// Saudação de chegada: hora do dia + saudade desde a última sessão
setTimeout(() => {
  const line = bond.sessionGreeting();
  if (line) speak.text(line, 'saudação');
}, 2600);

// ─── Ico_Guard: monitor de sistema (RAM/CPU/uptime/bateria) ─────────────────
const sysMonitor = setupSysMonitor({ state, speak, logEvent, effects, getGemPos });

// ─── AI_Brain: cérebro conversacional local (lorebook + memórias) ───────────
const brain = createBrain({ state, bond, sysMonitor, petMemory });

// ─── Ico_Eye: o que o pet vê no navegador/apps ──────────────────────────────
// O tint do site passa por state.siteTint: durante a zen_aura / transição
// zen→excited (donas do tint dourado/vermelho) a troca fica em espera e é
// restaurada na saída do zen (personalityState.js).
setupSiteEye({
  state,
  setTint: (color) => {
    state.siteTint = color;
    if (!state.zenAuraActive) setTint(color);
  },
  siteIconEl,
  speak,
  logEvent,
});

// ─── Tédio: relógio de idle + reação a input ─────────────────────────────────
const registerInput = createRegisterInput({ logEvent, speak });
const updateBoredomClock = createBoredomClock({ logEvent, speak, personalityCtl });
resetBoredom(state, performance.now());
scheduleNextRelocate(state, performance.now());

// ─── Cursor global (curiosidade + zera o tédio) ──────────────────────────────
if (window.petAPI && window.petAPI.onCursorMove) {
  window.petAPI.onCursorMove((p) => {
    const nowMs = performance.now();
    if (state.cursor.x >= 0) {
      const moved = Math.hypot(p.x - state.cursor.x, p.y - state.cursor.y);
      const dt = Math.max(nowMs - state.lastCursorAt, 16) / 1000;
      // Velocidade suavizada do cursor (pro susto/curiosidade por proximidade)
      state.cursorVel = state.cursorVel * 0.6 + (moved / dt) * 0.4;
      if (moved > 2 && !state.shutdown) registerInput(state, nowMs);
    }
    state.lastCursorAt = nowMs;
    state.cursor = p;
  });
}

// ─── Balão de pergunta clicável (estacionar/liberar — ver interactions.js) ──
const prompt = createPrompt();

// ─── AI_Chat: painel de conversa (duplo-clique no pet) ──────────────────────
const chat = createChat({
  state,
  bond,
  brain,
  sysMonitor,
  petMemory,
  speak,
  logEvent,
  effects,
  getGemPos,
  registerInput,
});

// ─── AI_Curiosity: perguntas ocasionais → banco de memórias ─────────────────
setupCuriosity({ state, bond, petMemory, prompt, speak, logEvent, effects, getGemPos });

// ─── Interações de mouse: cutucar, arrastar, cafuné, chat ────────────────────
setupInteractions({ state, camera, gem, mesh, logEvent, speak, registerInput, prompt, chat });

// ─── Loop principal ──────────────────────────────────────────────────────────
const clock = new THREE.Clock();
const affectionBar = createAffectionBar();
const refs = {
  camera, gem, mesh, applyUnfold, setPalette, zzzEl, siteIconEl, speechEl,
  affectionBar, effects, prompt, chat, canvasEl: canvas,
};
const deps = { logEvent, speak, personalityCtl };
let rafPaused = false;
let rafId = 0;

// AI_Bond: carinho contínuo vira pontos de vínculo (devagar — ver bond.js)
let petBondAccum = 0;
let knockoutCounted = false;

document.addEventListener('visibilitychange', () => {
  rafPaused = document.hidden;
  if (!rafPaused) {
    cancelAnimationFrame(rafId); // evita loop duplicado ao voltar
    clock.getDelta(); // descarta o tempo parado
    animate();
  }
});

function animate() {
  if (rafPaused) return;
  rafId = requestAnimationFrame(animate);

  const delta = Math.min(clock.getDelta(), 0.1);
  const t = clock.getElapsedTime();
  const now = performance.now();
  const idleSec = (now - state.lastInput) / 1000;

  // Vínculo: cafuné acumula pontos; nocaute de amor vale bônus
  if (state.pettingNow) {
    petBondAccum += delta;
    if (petBondAccum >= 6) {
      petBondAccum = 0;
      bond.addBond(1.5, 'cafuné');
      bond.noteStat('pets');
    }
  }
  if (state.shutdown && state.shutdown.knockout) {
    if (!knockoutCounted) {
      knockoutCounted = true;
      bond.addBond(5, 'nocaute de amor');
      bond.noteStat('knockouts');
    }
  } else {
    knockoutCounted = false;
  }
  state.bondLevel = bond.level();

  // Level-up que ficou guardado (aconteceu apagado/dormindo) → celebra agora
  if (pendingLevelUp && !state.shutdown && !state.sleeping) {
    celebrateLevelUp(pendingLevelUp);
    pendingLevelUp = null;
  }

  // ── Estado: shutdown tem prioridade sobre tudo; zen_aura (não
  //    interrompível) suprime o relógio de tédio enquanto durar ──
  if (state.shutdown) {
    updateShutdown(state, refs, now, delta, logEvent);
  } else {
    if (!state.zenAuraActive) updateBoredomClock(state, now, idleSec);
    updateAlive(state, refs, deps, now, delta, t);
  }

  setShapeMode(state.mode); // forma acompanha o humor (zen=orbe liso+anéis, excited=espinhos latejando)
  updateVisuals(t, delta, { power: state.power, sleeping: state.sleeping });
  renderer.render(scene, camera);
}

animate();
