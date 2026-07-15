import * as THREE from '../node_modules/three/build/three.module.js';
import { initScene, GEM_RADIUS } from './scene.js';

const canvas = document.getElementById('pet-canvas');
const zzzEl = document.getElementById('zzz');
const { scene, camera, renderer, gem, mesh, applyUnfold, updateVisuals } =
  initScene(canvas);

// ─── Helpers de motion (mesmos do portfólio) ─────────────────────────────────
const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
/** 0 → 1 → 0 ao longo de p ∈ [0,1] */
const pulse = (p) => Math.sin(clamp(p, 0, 1) * Math.PI);
/** sobe, segura, desce — envelope da espreguiçada */
const stretchEnv = (p) =>
  p < 0.3 ? smooth(p / 0.3) : p < 0.62 ? 1 : smooth((1 - p) / 0.38);
const damp = THREE.MathUtils.damp;

// ─── Constantes ──────────────────────────────────────────────────────────────
const WALK_SPEED = 2.6;
const EDGE_MARGIN = 0.4;

// Relógio de tédio (segundos sem input do usuário)
const REST_AT = 14;    // tiques de impaciência
const STRETCH_AT = 32; // espreguiçada (uma vez por ciclo)
const SLEEP_AT = 65;   // dorme
const SHUTDOWN_MIN = 30; // evento shutdown: sorteado entre 30 e 50s parado

// Evento shutdown
const SHUTDOWN_DUR = 12.5;
const SHUTDOWN_OFF_AT = 2.2;
const SHUTDOWN_ON_AT = 8.8;

// ─── Área visível / chão ─────────────────────────────────────────────────────
function computeView() {
  const halfWidth = camera.right;
  const groundY = -camera.top + GEM_RADIUS + 0.05;
  return { halfWidth, groundY };
}
let { halfWidth, groundY } = computeView();
window.addEventListener('resize', () => {
  ({ halfWidth, groundY } = computeView());
});

// ─── Estado ──────────────────────────────────────────────────────────────────
let direction = 1;

let spin = 0;          // rotação Y acumulada
let pokeVel = 0;       // giro de peão do cutucão
let unfold = 0.055;    // desdobramento atual das facetas (damped)
let tiltX = 0.22;      // inclinações suavizadas
let tiltZ = 0;
let lookYaw = 0;       // olhar (curiosidade)
let lookPitch = 0;
let scaleCur = 1;

let sleeping = false;
let power = 1;         // 0 = desligada (shutdown)

let lastInput = performance.now();
let cursor = { x: -1, y: -1 };

// Tiques de impaciência
let nextTickAt = 0;
let tick = null; // { type: 0|1|2, start }

// Espreguiçada
let stretch = null; // { start }
let stretchDone = false;

// Tonta (3+ cliques em 2.5s)
let clickTimes = [];
let dizzy = null; // { start }

// Shutdown
let shutdownAt = 0;      // idleSec sorteado para o evento
let shutdownDone = false;
let shutdown = null;     // { start, vy, falling, bounces, startled }

// Backflip de hora cheia
let flip = null; // { start }
let lastHour = new Date().getHours();

// Susto ao acordar
let wakeJolt = 0; // impulso de desdobramento que decai

function resetBoredom() {
  lastInput = performance.now();
  stretchDone = false;
  shutdownDone = false;
  shutdownAt = SHUTDOWN_MIN + Math.random() * 20;
  nextTickAt = 0;
}
resetBoredom();

function registerInput() {
  const wasSleeping = sleeping;
  resetBoredom();
  tick = null;
  stretch = null;
  if (wasSleeping) {
    // Acorda com susto
    sleeping = false;
    wakeJolt = 1.0;
    pokeVel += 5;
  }
}

// ─── Cursor global (curiosidade + zera o tédio) ──────────────────────────────
if (window.petAPI && window.petAPI.onCursorMove) {
  window.petAPI.onCursorMove((p) => {
    if (cursor.x >= 0) {
      const moved = Math.abs(p.x - cursor.x) + Math.abs(p.y - cursor.y);
      if (moved > 2 && !shutdown) registerInput();
    }
    cursor = p;
  });
}

// Posição do gem em pixels da tela (a janela ocupa a largura toda, embaixo)
function gemScreenX() {
  return ((gem.position.x / halfWidth) + 1) / 2 * window.innerWidth;
}

// ─── Loop principal ──────────────────────────────────────────────────────────
const clock = new THREE.Clock();
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
  const idleSec = (now - lastInput) / 1000;

  // ── Backflip de hora cheia ──
  const hour = new Date().getHours();
  if (hour !== lastHour) {
    lastHour = hour;
    if (!sleeping && !shutdown) flip = { start: now };
  }

  // ── Estado: shutdown tem prioridade sobre tudo ──
  if (shutdown) {
    updateShutdown(now, delta, t);
  } else {
    // Entradas do relógio de tédio
    if (!sleeping) {
      if (idleSec >= SLEEP_AT) {
        sleeping = true;
        tick = null;
        stretch = null;
      } else if (!shutdownDone && idleSec >= shutdownAt) {
        shutdownDone = true;
        shutdown = { start: now, vy: 0, falling: false, bounces: 0, startled: false };
        tick = null;
        stretch = null;
      } else if (!stretchDone && !stretch && idleSec >= STRETCH_AT) {
        stretch = { start: now };
        stretchDone = true;
        tick = null;
      } else if (!stretch && idleSec >= REST_AT) {
        if (nextTickAt === 0) nextTickAt = now + (4000 + Math.random() * 5000);
        if (now >= nextTickAt && !tick) {
          tick = { type: Math.floor(Math.random() * 3), start: now };
          nextTickAt = now + (4000 + Math.random() * 5000);
        }
      }
    }
    updateAlive(now, delta, t);
  }

  updateVisuals(t, delta, { power, sleeping });
  renderer.render(scene, camera);
}

// ─── Vida normal (acordada ou dormindo) ──────────────────────────────────────
function updateAlive(now, delta, t) {
  // ── Andar (só acordada) ──
  if (!sleeping) {
    gem.position.x += direction * WALK_SPEED * delta;
    const limit = halfWidth - GEM_RADIUS - EDGE_MARGIN;
    if (gem.position.x > limit) {
      gem.position.x = limit;
      direction = -1;
    } else if (gem.position.x < -limit) {
      gem.position.x = -limit;
      direction = 1;
    }
  }

  // ── Rotação base ──
  spin += delta * (sleeping ? 0.02 : 0.28);
  spin += pokeVel * delta;
  pokeVel *= Math.exp(-2.2 * delta);
  if (pokeVel < 0.02) pokeVel = 0;

  // ── Curiosidade: olhar segue o cursor (suprimido dormindo) ──
  let wantYaw = 0, wantPitch = 0;
  if (!sleeping && cursor.x >= 0) {
    const dx = clamp((cursor.x - gemScreenX()) / (window.screen.width / 2), -1, 1);
    const gemScreenYpx = window.screen.height - 90; // gem vive junto à taskbar
    const dy = clamp((cursor.y - gemScreenYpx) / (window.screen.height / 2), -1, 1);
    wantYaw = clamp(dx * 0.45, -0.32, 0.32);
    wantPitch = clamp(-dy * 0.35, -0.26, 0.26);
  }
  lookYaw = damp(lookYaw, wantYaw, 3, delta);
  lookPitch = damp(lookPitch, wantPitch, 3, delta);

  // ── Tiques de impaciência ──
  let tickY = 0, tickYaw = 0, tickUnfold = 0;
  if (tick) {
    const p = (now - tick.start) / 800;
    if (p >= 1) {
      tick = null;
    } else if (tick.type === 0) {
      tickY = pulse(p) * 0.28;            // pulinho
    } else if (tick.type === 1) {
      tickYaw = Math.sin(p * Math.PI * 2) * 0.503; // giro seco vai-e-volta
    } else {
      tickUnfold = pulse(p) * 0.22;       // arrepio
    }
  }

  // ── Espreguiçada ──
  let stretchUnfold = 0, stretchScale = 0;
  if (stretch) {
    const p = (now - stretch.start) / 4200;
    if (p >= 1) {
      stretch = null;
    } else {
      const env = stretchEnv(p);
      stretchUnfold = env * 0.5;
      stretchScale = env * 0.05;
    }
  }

  // ── Tonta ──
  let dizzyZ = 0;
  if (dizzy) {
    const el = (now - dizzy.start) / 1000;
    const p = el / 2.6;
    if (p >= 1) {
      dizzy = null;
    } else {
      dizzyZ = Math.sin(el * 9) * 0.3 * (1 - p);
    }
  }

  // ── Backflip ──
  let flipX = 0;
  if (flip) {
    const p = (now - flip.start) / 1150;
    if (p >= 1) {
      flip = null;
    } else {
      flipX = -smooth(p) * Math.PI * 2;
    }
  }

  // ── Susto ao acordar (decai sozinho) ──
  wakeJolt = damp(wakeJolt, 0, 2.4, delta);

  // ── Desdobramento das facetas ("respiração") ──
  const breathe = sleeping ? 0.015 : 0.055 + Math.sin(t * 0.7) * 0.03;
  const unfoldTarget = clamp(
    breathe + tickUnfold + stretchUnfold + wakeJolt,
    0,
    1
  );
  unfold = damp(unfold, unfoldTarget, 2.4, delta);
  applyUnfold(unfold);

  // ── Posição vertical (bob) ──
  const bob = sleeping
    ? (Math.sin(t * 0.3) + 1) * 0.03
    : (Math.sin(t * 0.48) + 1) * 0.065;
  gem.position.y = damp(gem.position.y, groundY + bob + tickY, 8, delta);

  // ── Escala ──
  const scaleTarget = sleeping
    ? 1 + Math.sin(t * 1.3) * 0.012
    : 1 + stretchScale;
  scaleCur = damp(scaleCur, scaleTarget, 2.2, delta);
  gem.scale.setScalar(scaleCur);

  // ── Composição final da rotação ──
  tiltX = damp(tiltX, 0.22 + Math.sin(t * 0.2) * 0.14, 2, delta);
  tiltZ = damp(tiltZ, Math.cos(t * 0.13) * 0.05, 2, delta);
  mesh.rotation.y = spin + lookYaw + tickYaw;
  mesh.rotation.x = tiltX + lookPitch + flipX;
  mesh.rotation.z = tiltZ + dizzyZ;

  // ── zzz ──
  if (sleeping) {
    zzzEl.classList.add('visible');
    zzzEl.style.left = `${gemScreenX() + 34}px`;
  } else {
    zzzEl.classList.remove('visible');
  }
}

// ─── Evento shutdown: desliga, cai como bolinha, quica e religa ──────────────
function updateShutdown(now, delta, t) {
  const evT = (now - shutdown.start) / 1000;
  const off = evT >= SHUTDOWN_OFF_AT && evT < SHUTDOWN_ON_AT;

  power = damp(power, off ? 0 : 1, 5, delta);

  // Rotação quase para quando desligada
  spin += delta * (0.02 + 0.26 * power);
  pokeVel = 0;

  // Facetas fecham desligada; religa com susto (0.9) e volta ao normal
  let unfoldTarget = 0.015;
  if (evT >= SHUTDOWN_ON_AT) {
    if (!shutdown.startled) {
      shutdown.startled = true;
      shutdown.startleAt = now;
    }
    const el = (now - shutdown.startleAt) / 1000;
    const p = clamp(el / 1.4, 0, 1);
    unfoldTarget = 0.9 * (1 - p) + 0.055 * p;
    // Olhar trêmulo de susto
    lookYaw = Math.sin(el * 11) * 0.35 * (1 - p);
  }
  unfold = damp(unfold, unfoldTarget, off ? 2.4 : 5, delta);
  applyUnfold(unfold);

  // Queda com gravidade + quiques (só enquanto desligada)
  if (off) {
    shutdown.falling = true;
    shutdown.vy -= 7.5 * delta;
    gem.position.y += shutdown.vy * delta;
    if (gem.position.y <= groundY) {
      gem.position.y = groundY;
      if (Math.abs(shutdown.vy) > 0.6 && shutdown.bounces < 2) {
        shutdown.vy = -shutdown.vy * 0.42;
        shutdown.bounces++;
      } else {
        shutdown.vy = 0;
      }
    }
  } else if (evT >= SHUTDOWN_ON_AT) {
    // Religada: flutua de volta ao lugar
    gem.position.y = damp(gem.position.y, groundY + 0.13, 2.2, delta);
  }

  mesh.rotation.y = spin + lookYaw;
  mesh.rotation.x = damp(mesh.rotation.x, 0.22, 2, delta);
  mesh.rotation.z = damp(mesh.rotation.z, 0, 2, delta);
  gem.scale.setScalar(damp(scaleCur, 1, 2.2, delta));
  scaleCur = gem.scale.x;

  if (evT >= SHUTDOWN_DUR) {
    shutdown = null;
    power = 1;
    resetBoredom();
  }
}

animate();

// ─── Clique no gem: cutucar + click-through no resto ─────────────────────────
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function isPointerOverPet(event) {
  pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  return raycaster.intersectObject(mesh, false).length > 0;
}

let ignoringMouseEvents = true;
window.addEventListener('mousemove', (event) => {
  const shouldIgnore = !isPointerOverPet(event);
  if (shouldIgnore !== ignoringMouseEvents && window.petAPI) {
    window.petAPI.setIgnoreMouseEvents(shouldIgnore);
    ignoringMouseEvents = shouldIgnore;
  }
});

window.addEventListener('click', (event) => {
  if (!isPointerOverPet(event) || shutdown) return;

  registerInput();

  // Cutucão: giro de peão + facetas abrem
  pokeVel += 8;
  unfold = Math.max(unfold, 0.8);

  // 3+ cliques em 2.5s → fica tonta
  const now = performance.now();
  clickTimes.push(now);
  clickTimes = clickTimes.filter((c) => now - c < 2500);
  if (clickTimes.length >= 3 && !dizzy) {
    dizzy = { start: now };
    clickTimes = [];
  }
});
