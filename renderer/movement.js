import * as THREE from '../node_modules/three/build/three.module.js';
import { initScene, GEM_RADIUS } from './scene.js';
import { PERSONALITIES, pickPersonalityForToday } from './personality.js';
import { createNoise2D } from './noise.js';

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

// ─── AI_Live: personalidade do dia + banco de falas ─────────────────────────
let personality = pickPersonalityForToday();
let personalityDay = new Date().toDateString();
setPalette(personality.palette);
logEvent('personalidade', `${personality.name} (paleta ${personality.palette[0]}…)`);

const SPEECH_COOLDOWN = 6000; // ms mínimo entre falas
const SPEECH_DURATION = 3500; // ms visível na tela
let lastSpeakAt = 0;
let speechHideTimer = null;

function speak(triggerKey, force = false) {
  const now = performance.now();
  if (!force && now - lastSpeakAt < SPEECH_COOLDOWN) return;

  const lines = personality.lines[triggerKey];
  if (!lines || lines.length === 0) return;

  lastSpeakAt = now;
  const line = lines[Math.floor(Math.random() * lines.length)];
  logEvent('fala', `"${line}" (gatilho: ${triggerKey})`);
  speechEl.textContent = line;
  speechEl.classList.add('visible');

  clearTimeout(speechHideTimer);
  speechHideTimer = setTimeout(() => {
    speechEl.classList.remove('visible');
  }, SPEECH_DURATION);
}

// ─── Ico_Eye: categorias conhecidas por trecho do título da janela ──────────
// (main.js só repassa o título se a janela for do navegador configurado)
const SITE_CATEGORIES = [
  { id: 'spotify', match: /spotify/i, color: '#1DB954', icon: '🎵' },
  { id: 'email', match: /gmail|outlook|inbox/i, color: '#4285F4', icon: '✉️' },
  { id: 'x', match: /\/\s*x\s*$|twitter/i, color: '#71767B', icon: '✕' },
];

function categorize(title) {
  if (!title) return null;
  return SITE_CATEGORIES.find((c) => c.match.test(title)) || null;
}

let lastCategoryId = null;

if (window.petAPI && window.petAPI.onActiveSite) {
  window.petAPI.onActiveSite(({ title }) => {
    const category = categorize(title);
    setTint(category ? category.color : null);
    if (category) {
      siteIconEl.textContent = category.icon;
      siteIconEl.classList.add('visible');
    } else {
      siteIconEl.classList.remove('visible');
    }

    // Só fala quando MUDA de categoria (não a cada troca de título/música)
    const newId = category ? category.id : null;
    if (newId !== lastCategoryId) {
      lastCategoryId = newId;
      logEvent('Ico_Eye', newId ? `viu ${newId}` : 'saiu da categoria');
      if (category) speak(`site_${category.id}`);
    }
  });
}

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
const EDGE_MARGIN = 0.4;

// Movimento Hover/Relocate: a maior parte do tempo o pet PAIRA em volta de
// um ponto-âncora (micro-deriva por ruído), e de tempos em tempos DECIDE ir
// pra outro lugar — arrancada, viagem com ease-in-out, chegada e assentada.
// Intenção + pausa + arrancada, em vez de deriva uniforme (que lia como
// "fumaça" e não como bichinho).
const WANDER_Y_RANGE = 2.4;   // faixa vertical dos pontos-âncora
const MICRO_X = 0.55;         // amplitude da micro-deriva enquanto paira
const MICRO_Y = 0.4;
const HOVER_LAMBDA = 1.8;     // mola da pairada (segue âncora + ruído)
const RELOC_SPEED = 4.2;      // unidades/s médias de viagem
const RELOC_MIN_DUR = 700;    // ms
const RELOC_MAX_DUR = 3400;   // ms

// Espaço pessoal do cursor
const NEAR_PX = 150;          // "perto" do gem, em pixels de tela
const FLINCH_SPEED = 1300;    // px/s: aproximação acima disso assusta
const FLINCH_COOLDOWN = 5000; // ms entre sustos

const noiseX = createNoise2D(1);
const noiseY = createNoise2D(2);
const noiseMod = createNoise2D(3); // modula spin/bob/respiração/tilt (mata os metrônomos)
const n01 = (v) => (v + 1) / 2;    // ruído [-1,1] → [0,1]

// Drag: gravidade/quique ao soltar (mesma linguagem física do shutdown)
const RELEASE_GRAVITY = 7.5;
const RELEASE_BOUNCE_RESTITUTION = 0.4;

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
// Posição de "repouso" (sem bob/tick por cima), o poleiro atual (anchor) e a
// viagem em andamento, se houver.
let restX = 0;
let restY = groundY;
let anchor = { x: 0, y: groundY + 1.0 };
let reloc = null; // { x0, y0, x1, y1, start, dur }
let nextRelocateAt = performance.now() + 4000;

// Corpo que sente o movimento (secondary motion)
let prevX = 0, prevY = groundY;
let velXSm = 0, velYSm = 0; // velocidade suavizada → inclinação do corpo
let takeoffAt = -1e9;       // juice de arrancada (estica)
let landAt = -1e9;          // juice de chegada (amassa)

// Fases com frequência modulada por ruído (nada de senoide fixa)
let bobPhase = 0;
let breathePhase = 0;

// Espaço pessoal do cursor
let cursorVel = 0;    // px/s, suavizado
let lastCursorAt = 0;
let flinchUntil = 0;  // cooldown do susto

// Animação de assinatura da personalidade (Shimmy do Ousado / Zen do Tranquilo)
let signatureAnim = null; // { start, type }
let nextSignatureAt = performance.now() + 20000;

// Carinho: acariciar com o mouse (hover sem clicar) enche o medidor de afeto.
// Cheio → modo EMPOLGADO: vira o Ousado (paleta e tudo), segue o mouse,
// pula tentando alcançar, shimmy direto. Sem carinho, esvazia e volta ao zen.
const OUSADO = PERSONALITIES.find((p) => p.id === 'ousado');
let affection = 0;      // 0..1.2 — medidor de carinho
let pettingNow = false; // mouse em cima dele agora
let lastPetAt = 0;
let lastPetLogAt = 0;
let petLean = 0;        // 0..1 suavizado: "se derretendo" no carinho
let excited = false;
let excitedHopStart = -1e9;
let nextExcitedHopAt = 0;

// Drag: segurar e arrastar o gem com o mouse.
let dragging = false;
let dragOffsetX = 0;
let dragOffsetY = 0;
let dragDistance = 0;
let releaseFall = null; // { vy, bounces } — queda física ao soltar

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
    // Acorda com susto, reancorado onde estiver (não voa de volta pro
    // poleiro antigo)
    sleeping = false;
    wakeJolt = 1.0;
    pokeVel += 5;
    anchor.x = restX;
    anchor.y = Math.max(restY, groundY + 0.5);
    scheduleNextRelocate(performance.now());
    logEvent('acordou', 'com susto');
    speak('wake');
  }
}

// ─── Cursor global (curiosidade + zera o tédio) ──────────────────────────────
if (window.petAPI && window.petAPI.onCursorMove) {
  window.petAPI.onCursorMove((p) => {
    const nowMs = performance.now();
    if (cursor.x >= 0) {
      const moved = Math.hypot(p.x - cursor.x, p.y - cursor.y);
      const dt = Math.max(nowMs - lastCursorAt, 16) / 1000;
      // Velocidade suavizada do cursor (pro susto/curiosidade por proximidade)
      cursorVel = cursorVel * 0.6 + (moved / dt) * 0.4;
      if (moved > 2 && !shutdown) registerInput();
    }
    lastCursorAt = nowMs;
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
    if (!sleeping && !shutdown) {
      flip = { start: now };
      logEvent('backflip', `hora cheia (${hour}h)`);
    }
  }

  // ── AI_Live: troca de personalidade à meia-noite ──
  const today = new Date().toDateString();
  if (today !== personalityDay) {
    personalityDay = today;
    personality = pickPersonalityForToday();
    // Se estiver empolgado, mantém a paleta quente até acalmar
    if (!excited) setPalette(personality.palette);
    logEvent('personalidade', `virou o dia: agora é ${personality.name}`);
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
        signatureAnim = null;
        logEvent('dormiu', `depois de ${Math.round(idleSec)}s parado`);
        speak('sleep');
      } else if (!shutdownDone && idleSec >= shutdownAt) {
        shutdownDone = true;
        shutdown = { start: now, vy: 0, falling: false, bounces: 0, startled: false };
        tick = null;
        stretch = null;
        signatureAnim = null;
        logEvent('shutdown', 'o bixinho puxou a alavanca...');
      } else if (!stretchDone && !stretch && idleSec >= STRETCH_AT) {
        stretch = { start: now };
        stretchDone = true;
        tick = null;
        logEvent('espreguiçada');
      } else if (!stretch && idleSec >= REST_AT) {
        if (nextTickAt === 0) nextTickAt = now + (4000 + Math.random() * 5000);
        if (now >= nextTickAt && !tick) {
          tick = { type: Math.floor(Math.random() * 3), start: now };
          nextTickAt = now + (4000 + Math.random() * 5000);
          logEvent('tique', ['pulinho', 'giro seco', 'arrepio'][tick.type]);
          speak('fidget');
        }
      }
    }
    updateAlive(now, delta, t);
  }

  updateVisuals(t, delta, { power, sleeping });
  renderer.render(scene, camera);
}

// Agenda a próxima decisão de "ir pra outro lugar" com intervalo exponencial
// (processo de Poisson): irregular de verdade, sem cadência perceptível.
function scheduleNextRelocate(now) {
  const mean = personality.movement.hoverMeanSec * 1000;
  const delay = -Math.log(1 - Math.random()) * mean;
  nextRelocateAt = now + clamp(delay, 2200, mean * 3);
}

// Inicia uma viagem até (targetX, targetY): duração proporcional à distância,
// modulada pela personalidade do dia. speedMul > 1 = urgência (susto).
// toCursor = viagem "de visita" ao mouse (olhar fica pregado nele no caminho).
function startRelocate(now, targetX, targetY, speedMul = 1, toCursor = false) {
  const mv = personality.movement;
  const limit = halfWidth - GEM_RADIUS - EDGE_MARGIN;
  const x1 = clamp(targetX, -limit, limit);
  const y1 = clamp(targetY, groundY, groundY + WANDER_Y_RANGE * mv.yRange);
  const dist = Math.hypot(x1 - restX, y1 - restY);
  const dur = clamp(
    (dist / (RELOC_SPEED * mv.speed * speedMul)) * 1000,
    RELOC_MIN_DUR / speedMul,
    RELOC_MAX_DUR
  );
  reloc = { x0: restX, y0: restY, x1, y1, start: now, dur, toCursor };
  takeoffAt = now;
  logEvent(
    'viagem',
    `de x=${restX.toFixed(1)} pra x=${x1.toFixed(1)}` +
      (toCursor ? ' (visita ao mouse)' : '') +
      (speedMul > 1.5 ? ' [fugindo!]' : '')
  );
}

// Posição do cursor em coordenadas de mundo (eixo X), ou null se desconhecida.
function cursorToWorldX() {
  if (cursor.x < 0) return null;
  const cx = cursor.x - window.screenX;
  return ((cx / window.innerWidth) * 2 - 1) * camera.right;
}

// Sorteia um novo poleiro: na maioria das vezes um ponto aleatório, mas de
// vez em quando (mais frequente em personalidades grudentas) ele decide ir
// fazer companhia pro mouse — pousa perto de onde o cursor está.
function pickWanderTarget() {
  const mv = personality.movement;
  const limit = halfWidth - GEM_RADIUS - EDGE_MARGIN;

  const cwx = cursorToWorldX();
  // Empolgado só quer saber de uma coisa: onde o mouse está
  const visitChance = excited ? 1 : 0.22 + 0.4 * mv.approach;
  if (cwx !== null && Math.random() < visitChance) {
    return {
      x: cwx + (Math.random() * 2 - 1) * 1.8, // perto, mas não em cima
      y: groundY + Math.random() * WANDER_Y_RANGE * mv.yRange * 0.7,
      toCursor: true,
    };
  }

  return {
    x: (Math.random() * 2 - 1) * limit,
    y: groundY + Math.random() * WANDER_Y_RANGE * mv.yRange,
    toCursor: false,
  };
}

// ─── Vida normal (acordada ou dormindo) ──────────────────────────────────────
function updateAlive(now, delta, t) {
  // ── Animação de assinatura da personalidade ──
  // Só a personalidade do dia tem a dela: Ousado faz o "Shimmy" (requebra de
  // charme), Tranquilo faz o "Zen Float" (flutuação meditativa).
  let sigSpinMul = 1, sigY = 0, sigUnfold = 0, sigZ = 0, sigScale = 0;
  if (
    !signatureAnim &&
    !sleeping && !dragging && !releaseFall && !reloc && !stretch && !dizzy &&
    now >= nextSignatureAt
  ) {
    // Empolgado sempre faz Shimmy, e bem mais vezes
    signatureAnim = { start: now, type: excited ? 'shimmy' : personality.signature };
    nextSignatureAt = now + (excited ? 6000 + Math.random() * 6000 : 25000 + Math.random() * 30000);
    logEvent('assinatura', signatureAnim.type === 'shimmy' ? 'Shimmy (requebra de charme)' : 'Zen Float (meditação)');
  }
  if (signatureAnim) {
    const el = (now - signatureAnim.start) / 1000;
    if (signatureAnim.type === 'shimmy') {
      // 1.6s: requebra em Z decaindo + pulinho + facetas abrem de leve
      const p = el / 1.6;
      if (p >= 1) {
        signatureAnim = null;
      } else {
        sigZ = Math.sin(el * 14) * 0.28 * (1 - p);
        sigY = pulse(p) * 0.35;
        sigScale = pulse(p) * 0.05;
        sigUnfold = pulse(p) * 0.15;
      }
    } else {
      // Zen: 5.2s subindo devagar, facetas abrem, rotação quase para
      const p = el / 5.2;
      if (p >= 1) {
        signatureAnim = null;
      } else {
        const env = stretchEnv(p);
        sigY = env * 0.9;
        sigUnfold = env * 0.35;
        sigSpinMul = 1 - env * 0.85;
        sigScale = env * 0.03;
      }
    }
  }

  // ── Carinho / modo empolgado ──
  if (pettingNow && now - lastPetAt > 400) pettingNow = false;
  if (!pettingNow) affection = Math.max(0, affection - delta * 0.035);
  petLean = damp(petLean, pettingNow ? 1 : 0, 3, delta);

  if (!excited && affection >= 0.65) {
    excited = true;
    setPalette(OUSADO.palette);
    nextSignatureAt = Math.min(nextSignatureAt, now + 2500);
    nextExcitedHopAt = now + 600;
    logEvent('empolgado', 'carinho demais — modo Ousado ativado!');
    speak('excited', true);
  } else if (excited && affection <= 0.3) {
    excited = false;
    setPalette(personality.palette);
    logEvent('acalmou', 'voltou ao humor do dia');
    speak('calmdown', true);
  }

  // Pulinhos tentando alcançar o cursor (só empolgado, pairando)
  let hopY = 0;
  if (excited && !sleeping) {
    if (!reloc && now >= nextExcitedHopAt) {
      excitedHopStart = now;
      nextExcitedHopAt = now + 1100 + Math.random() * 1300;
    }
    hopY = pulse((now - excitedHopStart) / 620) * 0.85;
  }

  // ── Rotação base (velocidade vagando por ruído — nunca metrônomo) ──
  // Cafuné derrete: gira mais devagar enquanto recebe carinho
  const spinRate = sleeping
    ? 0.02
    : 0.28 * personality.movement.spin * (0.5 + n01(noiseMod(t * 0.07, 10))) *
      sigSpinMul * (1 - petLean * 0.45);
  spin += delta * spinRate;
  spin += pokeVel * delta;
  pokeVel *= Math.exp(-2.2 * delta);
  if (pokeVel < 0.02) pokeVel = 0;

  // ── Curiosidade + espaço pessoal do cursor ──
  let wantYaw = 0, wantPitch = 0;
  if (!sleeping && cursor.x >= 0) {
    // Posição do gem e do cursor em px da janela (janela cobre a tela toda
    // na horizontal; verticalmente usa o offset real da janela)
    const cx = cursor.x - window.screenX;
    const cy = cursor.y - window.screenY;
    const gx = gemScreenX();
    const gy =
      (1 - (gem.position.y - camera.bottom) / (camera.top - camera.bottom)) *
      window.innerHeight;
    const distPx = Math.hypot(cx - gx, cy - gy);
    const near = distPx < NEAR_PX * 1.4;

    // Perto e devagar = atenção redobrada; em viagem "de visita" ao mouse,
    // o olhar também fica pregado nele; empolgado, nem se fala
    const visiting = reloc && reloc.toCursor;
    const gazeGain = excited ? 1.8 : near && cursorVel < 400 ? 1.7 : visiting ? 1.5 : 1;
    const dx = clamp((cx - gx) / (window.screen.width / 2), -1, 1);
    const dy = clamp((cy - gy) / (window.screen.height / 2), -1, 1);
    wantYaw = clamp(dx * 0.45 * gazeGain, -0.42, 0.42);
    wantPitch = clamp(-dy * 0.35 * gazeGain, -0.3, 0.3);

    if (!dragging && !releaseFall) {
      if (distPx < NEAR_PX * 1.2 && cursorVel > FLINCH_SPEED && now > flinchUntil) {
        // Susto: cursor voando pra cima dele → esquiva rápida pro lado oposto
        flinchUntil = now + FLINCH_COOLDOWN;
        wakeJolt = Math.max(wakeJolt, 0.45);
        logEvent('susto', `cursor veio a ${Math.round(cursorVel)}px/s`);
        const away = gx > cx ? 1 : -1;
        startRelocate(
          now,
          restX + away * (2.5 + Math.random() * 2),
          restY + 0.6 + Math.random() * 0.8,
          2.6
        );
      } else if (excited && !reloc) {
        // Empolgado: segue o mouse direto, a tela inteira, querendo mais
        const cursorWorldX = ((cx / window.innerWidth) * 2 - 1) * camera.right;
        const limit = halfWidth - GEM_RADIUS - EDGE_MARGIN;
        anchor.x = damp(anchor.x, clamp(cursorWorldX, -limit, limit), 1.6, delta);
      } else if (!reloc && near && cursorVel < 250 && personality.movement.approach > 0) {
        // Cursor parado por perto → gravita na direção dele (Manhoso adora)
        const cursorWorldX = ((cx / window.innerWidth) * 2 - 1) * camera.right;
        const limit = halfWidth - GEM_RADIUS - EDGE_MARGIN;
        anchor.x = damp(
          anchor.x,
          clamp(cursorWorldX, -limit, limit),
          0.5 * personality.movement.approach,
          delta
        );
      }
    }
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

  // ── Desdobramento das facetas ("respiração", ritmo e fundo vagando) ──
  breathePhase += delta * (0.6 + 0.3 * n01(noiseMod(t * 0.09, 40)));
  const breathe = sleeping
    ? 0.015
    : 0.05 + Math.sin(breathePhase) * (0.018 + 0.02 * n01(noiseMod(t * 0.05, 45)));
  const unfoldTarget = clamp(
    breathe + tickUnfold + stretchUnfold + wakeJolt + sigUnfold + petLean * 0.12,
    0,
    1
  );
  unfold = damp(unfold, unfoldTarget, 2.4, delta);
  applyUnfold(unfold);

  // ── Posição: pairar / viajar / segurado / caindo ──
  // Bob com frequência E amplitude vagando por ruído (sem metrônomo)
  bobPhase += delta * (sleeping ? 0.3 : 0.42 + 0.22 * n01(noiseMod(t * 0.11, 20)));
  const bobAmp = sleeping ? 0.03 : 0.04 + 0.05 * n01(noiseMod(t * 0.05, 30));
  const bob = (Math.sin(bobPhase) + 1) * bobAmp;

  if (dragging) {
    // posição já é escrita direto pelo mousemove; sincroniza o resto
    restX = gem.position.x;
    restY = gem.position.y;
    anchor.x = restX;
    anchor.y = restY;
    reloc = null;
  } else if (releaseFall) {
    updateReleaseFall(delta);
  } else if (!sleeping) {
    if (reloc) {
      // Viagem: ease-in-out até o novo poleiro
      const p = (now - reloc.start) / reloc.dur;
      if (p >= 1) {
        anchor.x = reloc.x1;
        anchor.y = reloc.y1;
        restX = reloc.x1;
        restY = reloc.y1;
        reloc = null;
        landAt = now;
        scheduleNextRelocate(now);
      } else {
        const e = smooth(p);
        restX = reloc.x0 + (reloc.x1 - reloc.x0) * e;
        restY = reloc.y0 + (reloc.y1 - reloc.y0) * e;
      }
    } else {
      // Pairando: micro-deriva por ruído em volta do poleiro
      const mv = personality.movement;
      const mx = noiseX(t * 0.32, 0) * MICRO_X * mv.micro;
      const my = noiseY(t * 0.27, 50) * MICRO_Y * mv.micro;
      restX = damp(restX, anchor.x + mx, HOVER_LAMBDA, delta);
      restY = damp(
        restY,
        clamp(anchor.y + my, groundY, groundY + WANDER_Y_RANGE + 0.5),
        HOVER_LAMBDA,
        delta
      );
      // Decisão de mudar de poleiro (agenda irregular, estilo Poisson)
      if (now >= nextRelocateAt && !stretch && !dizzy) {
        const tgt = pickWanderTarget();
        startRelocate(now, tgt.x, tgt.y, 1, tgt.toCursor);
      }
    }
    gem.position.x = restX;
    gem.position.y = restY + bob + tickY + sigY + hopY;
  } else {
    // Dormindo: pousa devagar no chão
    anchor.y = groundY;
    restX = damp(restX, anchor.x, 1.1, delta);
    restY = damp(restY, groundY, 1.1, delta);
    gem.position.x = restX;
    gem.position.y = restY + bob + tickY;
  }

  // ── Escala (+ juice: estica na arrancada, amassa na chegada) ──
  const takeoffJuice = pulse((now - takeoffAt) / 480) * 0.05;
  const landJuice = pulse((now - landAt) / 420) * 0.06;
  const scaleTarget = dragging
    ? 0.92 // levemente encolhido ao ser segurado
    : sleeping
    ? 1 + Math.sin(t * 1.3) * 0.012
    : 1 + stretchScale + takeoffJuice - landJuice + sigScale + petLean * 0.025;
  scaleCur = damp(scaleCur, scaleTarget, 2.2, delta);
  gem.scale.setScalar(scaleCur);

  // ── Corpo sente o movimento: inclina na direção da velocidade ──
  const velX = (gem.position.x - prevX) / Math.max(delta, 1e-4);
  const velY = (gem.position.y - prevY) / Math.max(delta, 1e-4);
  prevX = gem.position.x;
  prevY = gem.position.y;
  velXSm = damp(velXSm, velX, 6, delta);
  velYSm = damp(velYSm, velY, 6, delta);
  const bankZ = clamp(-velXSm * 0.055, -0.34, 0.34); // "deita" na curva
  const pitchVel = clamp(velYSm * 0.02, -0.12, 0.12); // nariz sobe/desce

  // ── Composição final da rotação (tilts também vagam por ruído) ──
  tiltX = damp(
    tiltX,
    0.22 + Math.sin(t * 0.2) * 0.14 + noiseMod(t * 0.06, 60) * 0.06,
    2,
    delta
  );
  tiltZ = damp(
    tiltZ,
    Math.cos(t * 0.13) * 0.05 + noiseMod(t * 0.08, 70) * 0.05,
    2,
    delta
  );
  mesh.rotation.y = spin + lookYaw + tickYaw;
  mesh.rotation.x = tiltX + lookPitch + flipX - pitchVel;
  mesh.rotation.z = tiltZ + dizzyZ + bankZ + sigZ;

  // ── zzz ──
  if (sleeping) {
    zzzEl.classList.add('visible');
    zzzEl.style.left = `${gemScreenX() + 34}px`;
  } else {
    zzzEl.classList.remove('visible');
  }

  // ── Ico_Eye: ícone do site acompanha o gem ──
  siteIconEl.style.left = `${gemScreenX()}px`;

  // ── AI_Live: balão de fala acompanha o gem ──
  speechEl.style.left = `${gemScreenX()}px`;

  // ── UI acompanha o gem também na vertical (a janela agora é alta e ele
  //    paira/é arrastado em alturas variadas) ──
  const uiBottomPx =
    ((gem.position.y + GEM_RADIUS * 1.15 - camera.bottom) /
      (camera.top - camera.bottom)) *
      window.innerHeight +
    6;
  zzzEl.style.bottom = `${uiBottomPx}px`;
  siteIconEl.style.bottom = `${uiBottomPx + 10}px`;
  speechEl.style.bottom = `${uiBottomPx + 14}px`;
}

// Queda com gravidade + 1 quique ao soltar do drag, depois volta a flutuar.
function updateReleaseFall(delta) {
  releaseFall.vy -= RELEASE_GRAVITY * delta;
  gem.position.y += releaseFall.vy * delta;
  if (gem.position.y <= groundY) {
    gem.position.y = groundY;
    if (Math.abs(releaseFall.vy) > 0.6 && releaseFall.bounces < 1) {
      releaseFall.vy = -releaseFall.vy * RELEASE_BOUNCE_RESTITUTION;
      releaseFall.bounces++;
    } else {
      releaseFall = null;
      restX = gem.position.x;
      restY = groundY;
      anchor.x = restX;
      anchor.y = groundY + 0.6;
      landAt = performance.now();
      scheduleNextRelocate(performance.now());
      logEvent('pousou', `em x=${restX.toFixed(1)}`);
    }
  }
}

// Converte coordenadas de tela (px) pra coordenadas de mundo no plano z=0,
// usando os limites da câmera ortográfica.
function pointerToWorld(event) {
  const nx = event.clientX / window.innerWidth;
  const ny = event.clientY / window.innerHeight;
  return {
    x: camera.left + nx * (camera.right - camera.left),
    y: camera.top - ny * (camera.top - camera.bottom),
  };
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
      logEvent('shutdown', 'religou assustado');
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
    logEvent('shutdown', 'de volta ao normal');
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
let lastPointerScreen = { x: 0, y: 0 };

window.addEventListener('mousedown', (event) => {
  if (!isPointerOverPet(event) || shutdown) return;

  registerInput();
  dragging = true;
  releaseFall = null;
  signatureAnim = null;
  dragDistance = 0;
  lastPointerScreen = { x: event.clientX, y: event.clientY };
  logEvent('colo', 'pegou ele no colo');
  speak('drag');

  const wp = pointerToWorld(event);
  dragOffsetX = gem.position.x - wp.x;
  dragOffsetY = gem.position.y - wp.y;
});

window.addEventListener('mousemove', (event) => {
  if (dragging) {
    dragDistance += Math.abs(event.clientX - lastPointerScreen.x) +
      Math.abs(event.clientY - lastPointerScreen.y);
    lastPointerScreen = { x: event.clientX, y: event.clientY };

    const wp = pointerToWorld(event);
    const limit = halfWidth - GEM_RADIUS - EDGE_MARGIN;
    gem.position.x = clamp(wp.x + dragOffsetX, -limit, limit);
    gem.position.y = clamp(wp.y + dragOffsetY, groundY, camera.top - GEM_RADIUS - 0.1);

    if (ignoringMouseEvents && window.petAPI) {
      window.petAPI.setIgnoreMouseEvents(false);
      ignoringMouseEvents = false;
    }
    return;
  }

  const overPet = isPointerOverPet(event);

  // Carinho: mover o mouse EM CIMA dele (sem clicar) é cafuné — quanto mais
  // movimento, mais o medidor enche.
  if (overPet && !shutdown) {
    const strokes = Math.abs(event.movementX) + Math.abs(event.movementY);
    affection = Math.min(affection + strokes * 0.0012, 1.2);
    lastPetAt = performance.now();
    if (!pettingNow) {
      pettingNow = true;
      if (performance.now() - lastPetLogAt > 5000) {
        lastPetLogAt = performance.now();
        logEvent('carinho', 'recebendo cafuné');
        speak('petting');
      }
    }
  }

  const shouldIgnore = !overPet;
  if (shouldIgnore !== ignoringMouseEvents && window.petAPI) {
    window.petAPI.setIgnoreMouseEvents(shouldIgnore);
    ignoringMouseEvents = shouldIgnore;
  }
});

window.addEventListener('mouseup', () => {
  if (!dragging) return;
  dragging = false;
  releaseFall = { vy: 0, bounces: 0 };
  logEvent('soltou', 'caindo...');
});

window.addEventListener('click', (event) => {
  // Se acabou de arrastar de verdade, esse clique é só o fim do drag —
  // não conta como cutucão.
  const wasRealDrag = dragDistance > 6;
  dragDistance = 0;
  if (wasRealDrag) return;

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
    logEvent('tonto', '3+ cliques seguidos');
    speak('dizzy');
  } else {
    logEvent('cutucado');
    speak('poke');
  }
});
