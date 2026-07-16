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

const canvas = document.getElementById('pet-canvas');
const zzzEl = document.getElementById('zzz');
const siteIconEl = document.getElementById('site-icon');
const speechEl = document.getElementById('speech');
const { scene, camera, renderer, gem, mesh, applyUnfold, updateVisuals, setTint, setPalette } =
  initScene(canvas);

// ─── Diário do pet: tudo que ele faz vai pro terminal via IPC ────────────────
function logEvent(tag, detail = '') {
  const line = `[pet] ${tag}${detail ? ` — ${detail}` : ''}`;
  if (window.petAPI && window.petAPI.log) window.petAPI.log(line);
}

// ─── Área visível / chão ─────────────────────────────────────────────────────
let { halfWidth, groundY } = computeView(camera);

// ─── Estado central + sistemas ligados a ele ─────────────────────────────────
const state = createState(performance.now(), groundY);
state.halfWidth = halfWidth;
state.restY = groundY;
state.prevY = groundY;
state.anchor = { x: 0, y: groundY + 1.0 };

window.addEventListener('resize', () => {
  ({ halfWidth, groundY } = computeView(camera));
  state.halfWidth = halfWidth;
  state.groundY = groundY;
});

// ─── AI_Live: máquina de personalidade (Normality ⇄ Zen ⇄ ...) ─────────────
const speak = createSpeech({ speechEl, logEvent, getPersonality: () => state.personality });
const personalityCtl = createPersonalityState({ state, setPalette, setTint, logEvent, speak });
setPalette(state.personality.palette);
logEvent('personalidade', `${state.personality.name} (paleta ${state.personality.palette[0]}…)`);

// ─── Ico_Eye: categorias conhecidas por trecho do título da janela ──────────
setupSiteEye({ setTint, siteIconEl, speak, logEvent });

// ─── Tédio: relógio de idle + reação a input ─────────────────────────────────
const registerInput = createRegisterInput({ logEvent, speak });
const updateBoredomClock = createBoredomClock({ logEvent, speak });
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

// ─── Interações de mouse: cutucar, arrastar, cafuné ──────────────────────────
setupInteractions({ state, camera, gem, mesh, logEvent, speak, registerInput });

// ─── AI_Live: gatilho manual de teste — tecla Z entra no modo Zen ───────────
window.addEventListener('keydown', (event) => {
  if (event.key.toLowerCase() === 'z' && !state.shutdown) {
    personalityCtl.enterZen(performance.now());
  }
});

// ─── Loop principal ──────────────────────────────────────────────────────────
const clock = new THREE.Clock();
const refs = { camera, gem, mesh, applyUnfold, setPalette, zzzEl, siteIconEl, speechEl };
const deps = { logEvent, speak, personalityCtl };
let rafPaused = false;
let rafId = 0;

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

  // ── Backflip de hora cheia ──
  const hour = new Date().getHours();
  if (hour !== state.lastHour) {
    state.lastHour = hour;
    if (!state.sleeping && !state.shutdown) {
      state.flip = { start: now };
      logEvent('backflip', `hora cheia (${hour}h)`);
    }
  }

  // ── Estado: shutdown tem prioridade sobre tudo; zen_aura (não
  //    interrompível) suprime o relógio de tédio enquanto durar ──
  if (state.shutdown) {
    updateShutdown(state, refs, now, delta, logEvent);
  } else {
    if (!state.zenAuraActive) updateBoredomClock(state, now, idleSec);
    updateAlive(state, refs, deps, now, delta, t);
  }

  updateVisuals(t, delta, { power: state.power, sleeping: state.sleeping });
  renderer.render(scene, camera);
}

animate();
