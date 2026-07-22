// Clone de demonstração do Icozinho pra aba "Animações" das Configurações.
// É uma cena Three.js própria (câmera/canvas de tamanho fixo, independente da
// janela do pet real em movement.js/scene.js) com um conjunto de animações
// "de clipe" (duração fixa, sem depender do relógio de tédio ou da máquina de
// personalidade) — pensadas só pra PREVIEW visual, não pra reproduzir 1:1
// toda a lógica de renderer/behaviors/*. Ver ANIMATIONS.md pro catálogo real.
import * as THREE from '../node_modules/three/build/three.module.js';

const GEM_RADIUS = 1.5;
const BASE_PALETTE = ['#7C3AED', '#4C1D95', '#D97706', '#92400E', '#6D28D9', '#B45309'];
// Paletas + movement espelham exatamente renderer/personalities/{zen,excited}.js
// (Normality já é a BASE_PALETTE/movement-padrão daqui).
const ZEN_PALETTE = ['#38BDF8', '#0C4A6E', '#34D399', '#155E75', '#22D3EE', '#0EA5E9'];
const EXCITED_PALETTE = ['#F43F5E', '#9D174D', '#FB7185', '#7C3AED', '#E11D48', '#C026D3'];

// Modos selecionáveis ("como ele fica"): mudam a paleta E a sensação de
// movimento (spin/micro-deriva/altura) do repouso contínuo. Um clipe de
// animação toca por cima e, ao terminar, ele volta pro modo selecionado.
export const MODES = [
  { id: 'normality', label: 'Normality', palette: BASE_PALETTE, movement: { spin: 1.0, micro: 0.9, yRange: 0.85 } },
  { id: 'zen', label: 'Zen', palette: ZEN_PALETTE, movement: { spin: 0.75, micro: 0.7, yRange: 0.7 } },
  { id: 'excited', label: 'Excited', palette: EXCITED_PALETTE, movement: { spin: 1.15, micro: 1.1, yRange: 1.0 } },
];

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const easeOutQuad = (x) => 1 - (1 - x) * (1 - x);
const easeInOutSine = (x) => -(Math.cos(Math.PI * x) - 1) / 2;
const easeOutBack = (x) => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};
const decaySine = (x, freq, decay) => Math.sin(x * freq) * Math.exp(-x * decay);

// Repouso contínuo (hover/breathe/tilt/spin) — reaplicado por baixo de todo
// clipe que não precisa de pose própria, pra ele nunca "congelar" no meio.
// `movement` (opcional) é o pacote spin/micro/yRange do modo selecionado —
// os clipes chamam sem ele e caem no ritmo padrão (Normality).
function idleBase(gem, applyUnfold, t, movement) {
  const spin = movement ? movement.spin : 1;
  const micro = movement ? movement.micro : 1;
  const yRange = movement ? movement.yRange : 1;
  gem.rotation.set(
    Math.sin(t * 0.31 * micro) * 0.12,
    (t * 0.4 * spin) % (Math.PI * 2),
    Math.cos(t * 0.27 * micro) * 0.1
  );
  gem.position.set(0, Math.sin(t * 0.8 * micro) * 0.06 * yRange, 0);
  gem.scale.setScalar(1);
  applyUnfold((Math.sin(t * 0.6) * 0.5 + 0.5) * 0.12);
}

// Catálogo de animações clicáveis (curado a partir do ANIMATIONS.md — os
// estados só alcançáveis dentro da máquina de personalidade, tipo Trapped ou
// Shy Exit, ficam de fora do preview).
export const CLIPS = [
  {
    id: 'hop', group: 'Tédio', label: 'Hop (pulinho)', durationMs: 650,
    run(gem, applyUnfold, t, p) {
      idleBase(gem, applyUnfold, t);
      if (p < 0.25) {
        // antecipação: agacha e amassa antes de saltar
        const k = easeOutQuad(p / 0.25);
        gem.position.y += -0.1 * k;
        gem.scale.setScalar(1 - 0.08 * k);
      } else {
        const k = (p - 0.25) / 0.75;
        const jump = Math.sin(k * Math.PI);
        gem.position.y += -0.1 * (1 - k) + jump * 0.62;
        gem.rotation.x -= jump * 0.25; // inclina pra trás no ar
        const land = k > 0.85 ? Math.sin(((k - 0.85) / 0.15) * Math.PI) : 0;
        gem.scale.setScalar(1 - 0.08 * (1 - k) + jump * 0.05 - land * 0.07);
      }
    },
  },
  {
    id: 'shake', group: 'Tédio', label: 'Shake (giro seco)', durationMs: 500,
    run(gem, applyUnfold, t, p) {
      idleBase(gem, applyUnfold, t);
      const s = decaySine(p * 6, 26, 5);
      gem.rotation.z += s * 0.55;
      gem.rotation.y += s * 0.2;       // o giro arrasta o corpo junto
      gem.position.x += -s * 0.08;     // contrapeso: desloca contra o giro
      applyUnfold(clamp01(0.12 + Math.abs(s) * 0.15));
    },
  },
  {
    id: 'shiver', group: 'Tédio', label: 'Shiver (arrepio)', durationMs: 700,
    run(gem, applyUnfold, t, p) {
      idleBase(gem, applyUnfold, t);
      // frio de verdade: encolhe, treme em 3 eixos dessincronizados e no
      // fim solta um "brrr" de facetas
      const cold = Math.exp(-p * 2.5);
      gem.scale.setScalar(1 - 0.05 * cold);
      gem.rotation.z += Math.sin(p * 60) * 0.05 * cold;
      gem.rotation.x += Math.sin(p * 47 + 2) * 0.04 * cold;
      gem.position.x += Math.sin(p * 53 + 1) * 0.02 * cold;
      const brr = p > 0.75 ? Math.sin(((p - 0.75) / 0.25) * Math.PI) : 0;
      applyUnfold(clamp01(0.03 + brr * 0.25));
    },
  },
  {
    id: 'stretch', group: 'Tédio', label: 'Stretch (espreguiçada)', durationMs: 4200,
    run(gem, applyUnfold, t, p) {
      idleBase(gem, applyUnfold, t);
      const env = p < 0.3 ? easeOutQuad(p / 0.3) : p > 0.75 ? 1 - easeOutQuad((p - 0.75) / 0.25) : 1;
      applyUnfold(0.12 + env * 0.45);
      gem.scale.setScalar(1 + env * 0.05);
      gem.position.y += env * 0.12;
      gem.rotation.x -= env * 0.18; // bocejo: estica "olhando pro alto"
      // tremidinha de esforço no pico + molejo ao soltar
      if (p > 0.3 && p < 0.75) gem.rotation.z += Math.sin(t * 30) * 0.008;
      if (p >= 0.75) gem.rotation.z += decaySine((p - 0.75) * 4, 18, 4) * 0.12;
    },
  },
  {
    id: 'sleep', group: 'Tédio', label: 'Sleep (dormindo)', durationMs: 3200,
    run(gem, applyUnfold, t, p, sink) {
      const settle = easeOutQuad(clamp01(p / 0.3));
      gem.rotation.set(0, (t * 0.05) % (Math.PI * 2), 0);
      // cabeceia de vez em quando (nod) e respira devagarinho
      const nod = Math.pow(Math.max(0, Math.sin(t * 2.2)), 6);
      gem.rotation.x += nod * 0.1 * settle;
      gem.position.set(0, -0.35 * settle + Math.sin(t * 1.2) * 0.02, 0);
      gem.scale.setScalar(1 + Math.sin(t * 1.2) * 0.012 * settle);
      applyUnfold(0.03);
      sink.power = 1 - settle * 0.75;
    },
  },
  {
    id: 'shutdown', group: 'Tédio', label: 'Shutdown (desligar)', durationMs: 2600,
    run(gem, applyUnfold, t, p, sink) {
      if (p < 0.25) {
        const k = p / 0.25;
        applyUnfold(0.12 * (1 - k));
        // a luz falha piscando antes de morrer de vez
        const flicker = k > 0.4 && Math.sin(k * 55) > 0.6 ? 0.35 : 0;
        sink.power = 1 - k * 0.9 + flicker;
        gem.position.y = 0;
        gem.scale.setScalar(1);
      } else if (p < 0.6) {
        const k = (p - 0.25) / 0.35;
        const bounce = Math.abs(Math.sin(k * Math.PI * 2)) * (1 - k) * 0.3;
        gem.position.y = -0.5 * easeOutQuad(Math.min(1, k * 2)) + bounce;
        sink.power = 0.1;
        applyUnfold(0.02);
      } else {
        const k = (p - 0.6) / 0.4;
        sink.power = 0.1 + k * 0.9;
        applyUnfold(0.12 + (1 - k) * 0.5);
        gem.position.y = -0.5 * (1 - easeOutBack(k));
        gem.rotation.z = decaySine(k * 6, 20, 4) * 0.3;
      }
    },
  },
  {
    id: 'poke', group: 'Reativas', label: 'Poke (cutucão)', durationMs: 1400,
    run(gem, applyUnfold, t, p) {
      idleBase(gem, applyUnfold, t);
      gem.rotation.y += (1 - p) * 8 * p;
      gem.scale.setScalar(1 - Math.exp(-p * 10) * 0.08); // amassa no impacto
      gem.rotation.z += decaySine(p * 3, 9, 2) * 0.12;   // cambaleia depois
      applyUnfold(clamp01(0.12 + 0.68 * (1 - p)));
    },
  },
  {
    id: 'dizzy', group: 'Reativas', label: 'Dizzy (tontura)', durationMs: 2600,
    run(gem, applyUnfold, t, p) {
      idleBase(gem, applyUnfold, t);
      const fade = 1 - p;
      gem.rotation.z += decaySine(p * 10, 14, 1.6) * 0.7;
      // deriva em espiral, como se o chão tivesse saído do lugar
      const ang = p * 12;
      gem.position.x += Math.cos(ang) * 0.12 * fade;
      gem.position.y += Math.sin(ang) * 0.08 * fade;
      gem.rotation.x += Math.sin(ang * 0.7) * 0.1 * fade;
      applyUnfold(clamp01(0.12 + (Math.sin(ang * 2) * 0.5 + 0.5) * 0.1 * fade));
    },
  },
  {
    id: 'flinch', group: 'Reativas', label: 'Flinch (susto)', durationMs: 700,
    run(gem, applyUnfold, t, p) {
      idleBase(gem, applyUnfold, t);
      const dodge = decaySine(p * 4, 18, 6);
      gem.position.x += dodge * 0.5;
      gem.rotation.z += -dodge * 0.3;                    // "deita" na esquiva
      gem.scale.setScalar(1 - Math.exp(-p * 8) * 0.06);  // encolhe de medo
      // fecha tudo no susto, reabre desconfiado
      if (p < 0.4) applyUnfold(0.02);
      else applyUnfold(0.02 + easeOutQuad((p - 0.4) / 0.6) * 0.1);
    },
  },
  {
    id: 'drop', group: 'Reativas', label: 'Drop (soltar/cair)', durationMs: 1100,
    run(gem, applyUnfold, t, p) {
      idleBase(gem, applyUnfold, t);
      if (p < 0.45) {
        // queda com gravidade de verdade (acelera) e tombando no ar
        const k = p / 0.45;
        gem.position.y += -0.7 * k * k;
        gem.rotation.z += k * 0.5;
      } else {
        const k = (p - 0.45) / 0.55;
        const b = Math.abs(Math.sin(k * Math.PI * 2)) * (1 - k);
        gem.position.y += -0.7 + b * 0.3;
        gem.scale.setScalar(1 - Math.exp(-k * 6) * 0.12 + b * 0.03); // splat
        gem.rotation.z += 0.5 * (1 - easeOutQuad(k)); // desentorta quicando
      }
    },
  },
  {
    id: 'petting', group: 'Reativas', label: 'Petting (cafuné)', durationMs: 2400,
    run(gem, applyUnfold, t, p) {
      // derrete: encosta no carinho, gira devagar e dá pulsinhos de felicidade
      const lean = Math.sin(p * Math.PI);
      gem.rotation.set(
        Math.sin(t * 0.31) * 0.12,
        (t * 0.1) % (Math.PI * 2),
        0.22 * lean + Math.sin(t * 3) * 0.02
      );
      gem.position.set(Math.sin(t * 2.1) * 0.03, Math.sin(t * 0.8) * 0.04, 0);
      const happy = Math.pow(Math.max(0, Math.sin(t * 6)), 4) * 0.015;
      gem.scale.setScalar(1 + 0.03 * lean + happy);
      applyUnfold(0.18 + lean * 0.08);
    },
  },
  {
    id: 'backflip', group: 'Calendário', label: 'Hourly Backflip', durationMs: 1150,
    run(gem, applyUnfold, t, p) {
      idleBase(gem, applyUnfold, t);
      gem.rotation.x += easeInOutSine(p) * Math.PI * 2;
      gem.position.y += Math.sin(p * Math.PI) * 0.45; // sobe durante o flip
      // tuck: fecha e encolhe no meio do giro, flara no pouso
      const tuck = Math.sin(p * Math.PI);
      gem.scale.setScalar(1 - tuck * 0.07);
      const flare = p > 0.85 ? Math.sin(((p - 0.85) / 0.15) * Math.PI) : 0;
      applyUnfold(clamp01(0.12 - tuck * 0.1 + flare * 0.3));
    },
  },
  {
    id: 'flourish', group: 'Normality', label: 'Flourish (floreio de moeda)', durationMs: 2900,
    run(gem, applyUnfold, t, p) {
      // Assinatura do Normality — espelha personalities/normality.js
      idleBase(gem, applyUnfold, t);
      if (p < 0.3) {
        const k = easeOutQuad(p / 0.3);
        gem.position.y += -0.16 * k;
        gem.scale.setScalar(1 - 0.06 * k);
        gem.rotation.x += 0.14 * k;
        applyUnfold(0.12 * (1 - k));
      } else if (p < 0.66) {
        const k = (p - 0.3) / 0.36;
        const arc = Math.sin(k * Math.PI);
        gem.position.y += -0.16 * (1 - k) + arc * 0.85;
        gem.rotation.y += easeInOutSine(k) * Math.PI * 2;
        gem.rotation.x += 0.14 * (1 - k);
        gem.rotation.z += Math.sin(k * Math.PI * 2) * 0.06;
        gem.scale.setScalar(1 - 0.06 * (1 - k) + arc * 0.12);
        applyUnfold(arc * 0.4);
      } else {
        const k = (p - 0.66) / 0.34;
        const bounce = Math.sin(k * Math.PI * 2) * Math.exp(-k * 3.5);
        gem.position.y += bounce * 0.12;
        gem.scale.setScalar(1 + bounce * 0.08);
        applyUnfold(clamp01(Math.exp(-k * 3) * 0.3));
      }
    },
  },
  {
    id: 'zen_breathing', group: 'Zen', label: 'Zen: respiração (rainbow)', durationMs: 4600, palette: ZEN_PALETTE,
    run(gem, applyUnfold, t, p, sink) {
      // Espelha personalities/zen.js: núcleo quase fechado, levita a cada
      // inspiração, balança como pêndulo — quem respira é o halo + a lótus.
      // As faces ganham o arco-íris da meditação (no pet real, a força sobe
      // conforme a zen_aura se aproxima; aqui mostra o ponto médio).
      const breath = Math.sin(p * Math.PI * 3) * 0.5 + 0.5;
      const sway = Math.sin(p * Math.PI * 2);
      gem.rotation.set(
        Math.sin(t * 0.31) * 0.12 - breath * 0.06,
        (t * 0.12) % (Math.PI * 2),
        sway * 0.04
      );
      gem.position.set(0, Math.sin(t * 0.8) * 0.04 + breath * 0.14, 0);
      gem.scale.setScalar(1 + breath * 0.025);
      applyUnfold(breath * 0.05);
      sink.ring = { active: true, breath, tint: null, tintMix: 0 };
      sink.backdrop = { lotus: 1, lotusBreath: breath, tint: null, tintMix: 0, heart: 0, heartPulse: 0 };
      sink.rainbow = 0.55;
    },
  },
  {
    id: 'zen_aura', group: 'Zen', label: 'Zen Aura (clímax)', durationMs: 4000, palette: ZEN_PALETTE,
    run(gem, applyUnfold, t, p, sink) {
      const env = Math.sin(p * Math.PI);
      gem.rotation.set(0, (t * 0.05) % (Math.PI * 2), 0);
      gem.position.set(0, 0.35 * easeOutQuad(Math.min(1, p * 3)), 0);
      gem.scale.setScalar(1 + env * 0.05);
      applyUnfold(0.35 * clamp01(p * 3));
      sink.emissiveBoost = env * (0.5 + Math.sin(t * 8) * 0.1); // cintila dourado
      sink.ring = { active: true, breath: env, tint: '#FBBF24', tintMix: env };
      sink.backdrop = { lotus: 1, lotusBreath: env, tint: '#FBBF24', tintMix: env, heart: 0, heartPulse: 0 };
      sink.rainbow = env; // arco-íris na força máxima no pico
    },
  },
  {
    id: 'zen_travel', group: 'Zen', label: 'Zen: viagem (rastro de facetas)', durationMs: 2600, palette: ZEN_PALETTE,
    run(gem, applyUnfold, t, p, sink) {
      // Atravessa o quadro deixando facetas caindo pra trás, como pétalas
      const x = -2.4 + easeInOutSine(p) * 4.8;
      const vel = Math.sin(p * Math.PI); // 0 → 1 → 0: rápido no meio
      gem.rotation.set(Math.sin(t * 0.31) * 0.1, (t * 0.3) % (Math.PI * 2), -vel * 0.3);
      gem.position.set(x, Math.sin(p * Math.PI * 2) * 0.18, 0);
      gem.scale.setScalar(1 + vel * 0.04);
      applyUnfold(0.04);
      sink.ring = { active: true, breath: 0.3, tint: null, tintMix: 0 };
      sink.backdrop = { lotus: 1, lotusBreath: 0.3, tint: null, tintMix: 0, heart: 0, heartPulse: 0 };
      if (vel > 0.15) sink.trailFrom = { x: gem.position.x, y: gem.position.y };
    },
  },
  {
    id: 'shimmy', group: 'Excited', label: 'Shimmy (requebra)', durationMs: 1800, palette: EXCITED_PALETTE,
    run(gem, applyUnfold, t, p) {
      // Espelha personalities/excited.js: sambinha com quadril contra o
      // tilt, 3 pulinhos e pose final com olhadinha por cima do ombro
      idleBase(gem, applyUnfold, t);
      const env = 1 - p;
      const hips = Math.sin(p * 1.8 * 11);
      const beat = Math.abs(Math.sin(p * Math.PI * 3));
      const finale = p > 0.82 ? Math.sin(((p - 0.82) / 0.18) * Math.PI) : 0;
      gem.rotation.z += hips * 0.3 * env;
      gem.rotation.y += finale * 0.35;
      gem.position.x += -hips * 0.12 * env;
      gem.position.y += beat * 0.3 * env + finale * 0.18;
      gem.scale.setScalar(1 + beat * 0.04 * env + finale * 0.09);
      applyUnfold(clamp01(0.12 + beat * 0.12 * env + finale * 0.3));
    },
  },
  {
    id: 'vibe', group: 'Excited', label: 'Vibe (vibração)', durationMs: 450, palette: EXCITED_PALETTE,
    run(gem, applyUnfold, t, p) {
      idleBase(gem, applyUnfold, t);
      gem.position.x += Math.sin(t * 90) * 0.03 * (1 - p);
      gem.position.y += Math.sin(t * 70 + 1) * 0.03 * (1 - p);
      gem.rotation.z += Math.sin(t * 82) * 0.02 * (1 - p);
      // as facetas chacoalham junto — energia demais pro corpinho
      applyUnfold(clamp01(0.12 + Math.abs(Math.sin(t * 60)) * 0.06 * (1 - p)));
    },
  },
  {
    id: 'cio', group: 'Excited', label: 'Cio (coração batendo)', durationMs: 3200, palette: EXCITED_PALETTE,
    run(gem, applyUnfold, t, p, sink) {
      // O Excited no auge: coração-cenário pulsando em lub-dub, corpo em
      // onda sensual (rebolado), ofegando com o brilho batendo junto
      const beat = t * 6.2;
      const lub = Math.pow(Math.max(0, Math.sin(beat)), 6);
      const dub = Math.pow(Math.max(0, Math.sin(beat - 0.55)), 6) * 0.55;
      const pulse = Math.min(1, lub + dub);
      const pant = (Math.sin(t * 9) + 1) / 2;
      gem.rotation.set(
        Math.sin(t * 0.31) * 0.1,
        (t * 0.5) % (Math.PI * 2),
        Math.sin(t * 1.7) * 0.11
      );
      gem.position.set(Math.sin(t * 0.9) * 0.12, Math.sin(t * 3.4 + 1.2) * 0.1, 0);
      gem.scale.setScalar(1 + pant * 0.03 + pulse * 0.04);
      applyUnfold(0.15 + pant * 0.08 + pulse * 0.06);
      sink.emissiveBoost = pulse * 0.4;
      sink.backdrop = { lotus: 0, lotusBreath: 0, tint: null, tintMix: 0, heart: 1, heartPulse: pulse };
    },
  },
  {
    id: 'morph', group: 'Transição', label: 'Morph (troca de humor)', durationMs: 1100,
    run(gem, applyUnfold, t, p, sink) {
      // A transição universal de personalidade: enrola girando cada vez mais
      // rápido → flash de luz com pop de escala → assenta com wobble
      idleBase(gem, applyUnfold, t);
      const spinY = p < 0.62 ? 9 * p * p : 9 * 0.62 * 0.62 + (p - 0.62) * 2;
      gem.rotation.y += spinY;
      if (p < 0.45) {
        const k = p / 0.45;
        gem.scale.setScalar(1 - 0.12 * k);
        gem.position.y += 0.15 * k;
        applyUnfold(0.12 * (1 - k));
        sink.emissiveBoost = 0.4 * k;
      } else if (p < 0.62) {
        const k = (p - 0.45) / 0.17;
        gem.scale.setScalar(1 - 0.12 + k * 0.3);
        gem.position.y += 0.15;
        applyUnfold(k * 0.3);
        sink.emissiveBoost = 0.4 + Math.sin(k * Math.PI) * 1.0;
      } else {
        const k = (p - 0.62) / 0.38;
        gem.scale.setScalar(1 + 0.18 * (1 - k));
        gem.position.y += 0.15 * (1 - k);
        gem.rotation.z += Math.sin(k * Math.PI * 3) * 0.12 * (1 - k);
        applyUnfold(0.3 * (1 - k) + 0.12 * k);
        sink.emissiveBoost = 0.4 * (1 - k);
      }
    },
  },
];

export function createPreviewGem(canvas) {
  const scene = new THREE.Scene();
  // vh 3.5: enquadra a flor de lótus inteira (pétalas alcançam ~3.3)
  const camera = new THREE.OrthographicCamera(-3.5, 3.5, 3.5, -3.5, 0.1, 100);
  camera.position.set(0, 0, 10);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setClearColor(0x000000, 0);

  function resize() {
    const w = canvas.clientWidth || 260;
    const h = canvas.clientHeight || 260;
    const aspect = w / h;
    const vh = 3.5;
    camera.left = -vh * aspect;
    camera.right = vh * aspect;
    camera.top = vh;
    camera.bottom = -vh;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  }
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  const ambient = new THREE.AmbientLight(0xffffff, 0.25);
  const purpleLight = new THREE.PointLight('#7C3AED', 6, 14);
  const amberLight = new THREE.PointLight('#D97706', 5, 14);
  const whiteLight = new THREE.PointLight('#ffffff', 0.6);
  whiteLight.position.set(0, 0, 7);
  scene.add(ambient, purpleLight, amberLight, whiteLight);

  const COLORS = BASE_PALETTE.map((c) => new THREE.Color(c));
  const colorTargetTmp = BASE_PALETTE.map((c) => new THREE.Color(c));

  const base = new THREE.IcosahedronGeometry(GEM_RADIUS, 1);
  const gemGeo = base.toNonIndexed();
  base.dispose();
  const posCount = gemGeo.attributes.position.count;
  const faceCount = posCount / 3;
  const colorsAttr = new Float32Array(posCount * 3);
  const faceColors = [];
  const faceTargetIdx = [];
  const faceSpeeds = [];
  for (let f = 0; f < faceCount; f++) {
    const ci = Math.floor(Math.random() * COLORS.length);
    const color = COLORS[ci].clone();
    faceColors.push(color);
    faceTargetIdx.push(ci);
    faceSpeeds.push(0.05 + Math.random() * 0.12);
    for (let v = 0; v < 3; v++) {
      const idx = (f * 3 + v) * 3;
      colorsAttr[idx] = color.r;
      colorsAttr[idx + 1] = color.g;
      colorsAttr[idx + 2] = color.b;
    }
  }
  gemGeo.setAttribute('color', new THREE.BufferAttribute(colorsAttr, 3));

  const basePos = new Float32Array(gemGeo.attributes.position.array);
  const faceNormals = [];
  const faceVariance = [];
  {
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const ab = new THREE.Vector3(), ac = new THREE.Vector3();
    for (let f = 0; f < faceCount; f++) {
      const i = f * 9;
      a.set(basePos[i], basePos[i + 1], basePos[i + 2]);
      b.set(basePos[i + 3], basePos[i + 4], basePos[i + 5]);
      c.set(basePos[i + 6], basePos[i + 7], basePos[i + 8]);
      ab.subVectors(b, a);
      ac.subVectors(c, a);
      faceNormals.push(ab.cross(ac).normalize().clone());
      faceVariance.push(0.55 + Math.random() * 0.9);
    }
  }

  let lastDisp = -1;
  function applyUnfold(disp) {
    if (Math.abs(disp - lastDisp) < 0.0006) return;
    lastDisp = disp;
    const pos = gemGeo.attributes.position;
    const arr = pos.array;
    for (let f = 0; f < faceCount; f++) {
      const n = faceNormals[f];
      const offset = disp * faceVariance[f] * 0.55;
      for (let v = 0; v < 3; v++) {
        const idx = (f * 3 + v) * 3;
        arr[idx] = basePos[idx] + n.x * offset;
        arr[idx + 1] = basePos[idx + 1] + n.y * offset;
        arr[idx + 2] = basePos[idx + 2] + n.z * offset;
      }
    }
    pos.needsUpdate = true;
  }

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.1,
    metalness: 0.88,
    emissive: COLORS[0].clone(),
    emissiveIntensity: 0.55,
  });
  const mesh = new THREE.Mesh(gemGeo, material);
  const baseEdge = new THREE.IcosahedronGeometry(GEM_RADIUS * 1.013, 1);
  const edgeGeo = new THREE.EdgesGeometry(baseEdge);
  baseEdge.dispose();
  const edges = new THREE.LineSegments(
    edgeGeo,
    new THREE.LineBasicMaterial({ color: '#c4b5fd', transparent: true, opacity: 0.18 })
  );

  const gem = new THREE.Group();
  gem.add(mesh, edges);
  scene.add(gem);

  // ── Zen: halo de anéis orbitais — espelha renderer/scene.js → updateRings.
  // Só aparece com o modo Zen selecionado (ligado no idle e nos clipes
  // zen_breathing/zen_aura via sink.ring; ver frame() abaixo).
  const RING_COLOR_A = new THREE.Color('#22D3EE'); // ciano — paleta do Zen
  const RING_COLOR_B = new THREE.Color('#34D399'); // verde-água — paleta do Zen
  const ringGroup = new THREE.Group();
  gem.add(ringGroup);

  function makeRing(radius, tube, tiltX, tiltZ, color) {
    const pivot = new THREE.Group();
    pivot.rotation.set(tiltX, 0, tiltZ);
    const geo = new THREE.TorusGeometry(radius, tube, 8, 96);
    const mat = new THREE.MeshBasicMaterial({
      color: color.clone(),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    pivot.add(new THREE.Mesh(geo, mat));
    ringGroup.add(pivot);
    return { pivot, mat, baseColor: color };
  }

  const ringA = makeRing(GEM_RADIUS * 1.55, 0.018, THREE.MathUtils.degToRad(62), THREE.MathUtils.degToRad(8), RING_COLOR_A);
  const ringB = makeRing(GEM_RADIUS * 1.92, 0.014, THREE.MathUtils.degToRad(-46), THREE.MathUtils.degToRad(-15), RING_COLOR_B);
  const ringTintColor = new THREE.Color();
  let ringMix = 0;
  let ringPrecessA = 0, ringPrecessB = Math.PI * 0.35;

  function updateRings(dt, { active: ringOn = false, breath = 0, tint = null, tintMix = 0 } = {}) {
    ringMix = THREE.MathUtils.damp(ringMix, ringOn ? 1 : 0, 2.2, dt);
    ringGroup.visible = ringMix > 0.003;
    if (!ringGroup.visible) return;
    ringPrecessA += dt * 0.24;
    ringPrecessB -= dt * 0.17;
    ringA.pivot.rotation.y = ringPrecessA;
    ringB.pivot.rotation.y = ringPrecessB;
    const pulse = 1 + breath * 0.08;
    ringA.pivot.scale.setScalar(ringMix * pulse);
    ringB.pivot.scale.setScalar(ringMix * pulse * 1.02);
    const baseOpacity = 0.5 + breath * 0.4;
    ringA.mat.opacity = ringMix * baseOpacity;
    ringB.mat.opacity = ringMix * baseOpacity * 0.75;
    if (tint && tintMix > 0.001) {
      ringTintColor.set(tint);
      ringA.mat.color.copy(ringA.baseColor).lerp(ringTintColor, tintMix);
      ringB.mat.color.copy(ringB.baseColor).lerp(ringTintColor, tintMix);
    } else {
      ringA.mat.color.copy(ringA.baseColor);
      ringB.mat.color.copy(ringB.baseColor);
    }
  }

  // ── Cenário de humor (espelha renderer/scene.js): lótus atrás do Zen,
  // coração pulsando atrás do Excited ──
  const backdrop = new THREE.Group();
  gem.add(backdrop);

  function makePetalGeo(len, wid) {
    const s = new THREE.Shape();
    s.moveTo(0, 0.55);
    s.quadraticCurveTo(wid, 0.55 + len * 0.38, 0, 0.55 + len);
    s.quadraticCurveTo(-wid, 0.55 + len * 0.38, 0, 0.55);
    return new THREE.ShapeGeometry(s, 10);
  }

  function makeLotusLayer(count, len, wid, hex, z) {
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(hex), transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
      side: THREE.DoubleSide,
    });
    const layer = new THREE.Group();
    layer.position.z = z;
    const geo = makePetalGeo(len, wid);
    const petals = [];
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(geo, mat);
      m.rotation.z = (i / count) * Math.PI * 2;
      m.renderOrder = -3;
      layer.add(m);
      petals.push(m);
    }
    backdrop.add(layer);
    return { layer, mat, petals, baseColor: new THREE.Color(hex) };
  }

  const lotusOuter = makeLotusLayer(8, 2.6, 0.52, '#34D399', -1.7);
  const lotusInner = makeLotusLayer(6, 1.8, 0.44, '#22D3EE', -1.6);
  let lotusMix = 0;

  function makeHeartGeo(scale) {
    const s = new THREE.Shape();
    s.moveTo(0.5, 0.5);
    s.bezierCurveTo(0.5, 0.5, 0.4, 0, 0, 0);
    s.bezierCurveTo(-0.6, 0, -0.6, 0.7, -0.6, 0.7);
    s.bezierCurveTo(-0.6, 1.1, -0.3, 1.54, 0.5, 1.9);
    s.bezierCurveTo(1.2, 1.54, 1.6, 1.1, 1.6, 0.7);
    s.bezierCurveTo(1.6, 0.7, 1.6, 0, 1, 0);
    s.bezierCurveTo(0.7, 0, 0.5, 0.5, 0.5, 0.5);
    const g = new THREE.ShapeGeometry(s, 10);
    g.center();
    g.rotateZ(Math.PI);
    g.scale(scale, scale, 1);
    return g;
  }

  function makeHeart(scale, hex, z, order) {
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(hex), transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
      side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(makeHeartGeo(scale), mat);
    m.position.z = z;
    m.renderOrder = order;
    backdrop.add(m);
    return { mesh: m, mat };
  }

  const heartBig = makeHeart(2.3, '#F43F5E', -1.8, -5);
  const heartCore = makeHeart(1.5, '#FB7185', -1.75, -4);
  let heartMix = 0;
  const backdropTintTmp = new THREE.Color();

  function updateBackdrop(dt, { lotus = 0, lotusBreath = 0, tint = null, tintMix = 0, heart = 0, heartPulse = 0 } = {}) {
    lotusMix = THREE.MathUtils.damp(lotusMix, lotus, 1.6, dt);
    heartMix = THREE.MathUtils.damp(heartMix, heart, 2.5, dt);

    const lotusOn = lotusMix > 0.004;
    lotusOuter.layer.visible = lotusInner.layer.visible = lotusOn;
    if (lotusOn) {
      for (const L of [lotusOuter, lotusInner]) {
        const n = L.petals.length;
        for (let i = 0; i < n; i++) {
          const v = clamp01((lotusMix - (i / n) * 0.5) / 0.5);
          L.petals[i].scale.setScalar(Math.max(v, 0.0001) * (1 + lotusBreath * 0.06));
        }
        if (tint && tintMix > 0.001) {
          backdropTintTmp.set(tint);
          L.mat.color.copy(L.baseColor).lerp(backdropTintTmp, tintMix);
        } else {
          L.mat.color.copy(L.baseColor);
        }
      }
      lotusOuter.layer.rotation.z += dt * 0.05;
      lotusInner.layer.rotation.z -= dt * 0.08;
      lotusOuter.mat.opacity = lotusMix * (0.34 + lotusBreath * 0.2);
      lotusInner.mat.opacity = lotusMix * (0.28 + lotusBreath * 0.22);
    }

    const heartOn = heartMix > 0.004;
    heartBig.mesh.visible = heartCore.mesh.visible = heartOn;
    if (heartOn) {
      heartBig.mesh.scale.setScalar(heartMix * (1 + heartPulse * 0.16));
      heartCore.mesh.scale.setScalar(heartMix * (1 + heartPulse * 0.24));
      heartBig.mat.opacity = heartMix * (0.2 + heartPulse * 0.3);
      heartCore.mat.opacity = heartMix * (0.16 + heartPulse * 0.34);
    }
  }

  // ── Rastro de facetas (espelha scene.js): triângulos caindo no mundo ──
  const TRAIL_MAX = 26;
  const trailFacets = [];
  {
    const triGeo = new THREE.BufferGeometry();
    const r = 0.2;
    triGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      0, r, 0, -r * 0.87, -r * 0.5, 0, r * 0.87, -r * 0.5, 0,
    ]), 3));
    for (let i = 0; i < TRAIL_MAX; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      });
      const m = new THREE.Mesh(triGeo, mat);
      m.visible = false;
      scene.add(m);
      trailFacets.push({ mesh: m, mat, age: 0, life: 1, vx: 0, vy: 0, spin: 0 });
    }
  }
  let trailCursor = 0;
  let lastTrailEmit = 0;

  function emitTrailFacet(x, y) {
    const f = trailFacets[trailCursor];
    trailCursor = (trailCursor + 1) % TRAIL_MAX;
    f.age = 0;
    f.life = 1.0 + Math.random() * 0.7;
    f.vx = (Math.random() - 0.5) * 0.8;
    f.vy = -(0.4 + Math.random() * 0.6);
    f.spin = (Math.random() - 0.5) * 6;
    f.mesh.position.set(x + (Math.random() - 0.5) * 1.2, y + (Math.random() - 0.5) * 1.2, -0.5);
    f.mesh.rotation.z = Math.random() * Math.PI * 2;
    f.mesh.scale.setScalar(0.8 + Math.random() * 0.7);
    f.mat.color.copy(COLORS[Math.floor(Math.random() * COLORS.length)]);
    f.mesh.visible = true;
  }

  function updateTrail(dt) {
    for (const f of trailFacets) {
      if (!f.mesh.visible) continue;
      f.age += dt;
      if (f.age >= f.life) {
        f.mesh.visible = false;
        f.mat.opacity = 0;
        continue;
      }
      f.vy -= dt * 1.6;
      f.mesh.position.x += f.vx * dt;
      f.mesh.position.y += f.vy * dt;
      f.mesh.rotation.z += f.spin * dt;
      f.mat.opacity = (1 - f.age / f.life) * 0.8;
    }
  }

  // Repouso do Zen: núcleo quase fechado (a respiração migrou pro halo).
  function zenIdle(gem, applyUnfold, t, movement) {
    const spin = movement ? movement.spin : 1;
    const micro = movement ? movement.micro : 1;
    const yRange = movement ? movement.yRange : 1;
    gem.rotation.set(
      Math.sin(t * 0.31 * micro) * 0.12,
      (t * 0.4 * spin) % (Math.PI * 2),
      Math.cos(t * 0.27 * micro) * 0.1
    );
    gem.position.set(0, Math.sin(t * 0.8 * micro) * 0.06 * yRange, 0);
    gem.scale.setScalar(1);
    applyUnfold(0.02 + (Math.sin(t * 0.68) * 0.5 + 0.5) * 0.03);
  }

  let active = false;
  let lastNow = 0;
  let simTime = 0;
  let clip = null; // { def, start }
  let mode = MODES[0]; // modo selecionado ("como ele fica") — repouso volta pra ele
  let heartPhase = 0;
  const sink = {
    power: 1, emissiveBoost: 0, rainbow: 0, trailFrom: null,
    ring: { active: false, breath: 0, tint: null, tintMix: 0 },
    backdrop: { lotus: 0, lotusBreath: 0, tint: null, tintMix: 0, heart: 0, heartPulse: 0 },
  };
  const emissiveTint = new THREE.Color();
  const rainbowTmp = new THREE.Color();
  const faceDisplayTmp = new THREE.Color();

  function frame(now) {
    requestAnimationFrame(frame);
    if (!active) { lastNow = now; return; }
    const dt = Math.min((now - lastNow) / 1000, 0.1);
    lastNow = now;
    simTime += dt;
    const t = simTime;

    sink.power = 1;
    sink.emissiveBoost = 0;
    sink.rainbow = 0;
    sink.trailFrom = null;
    // Cenário do modo selecionado, ativo o tempo todo (mesmo durante um
    // clipe reativo tipo Poke): Zen = halo + lótus; Excited = coração
    // batendo lub-dub. Os clipes podem sobrescrever com pulso/tint próprios.
    const zenModeOn = mode.id === 'zen';
    const excitedModeOn = mode.id === 'excited';
    const ambientBreath = Math.sin(t * 0.68) * 0.5 + 0.5;
    sink.ring = zenModeOn
      ? { active: true, breath: ambientBreath, tint: null, tintMix: 0 }
      : { active: false, breath: 0, tint: null, tintMix: 0 };
    let heartPulse = 0;
    if (excitedModeOn) {
      heartPhase += dt * 5;
      const lub = Math.pow(Math.max(0, Math.sin(heartPhase)), 6);
      const dub = Math.pow(Math.max(0, Math.sin(heartPhase - 0.55)), 6) * 0.55;
      heartPulse = Math.min(1, lub + dub);
      sink.emissiveBoost = heartPulse * 0.28;
    }
    sink.backdrop = {
      lotus: zenModeOn ? 1 : 0,
      lotusBreath: zenModeOn ? ambientBreath : 0,
      tint: null,
      tintMix: 0,
      heart: excitedModeOn ? 1 : 0,
      heartPulse,
    };

    if (clip) {
      const p = clamp01((t - clip.start) / (clip.def.durationMs / 1000));
      clip.def.run(gem, applyUnfold, t, p, sink);
      if (p >= 1) clip = null;
    } else if (zenModeOn) {
      zenIdle(gem, applyUnfold, t, mode.movement);
    } else {
      idleBase(gem, applyUnfold, t, mode.movement);
      if (excitedModeOn) {
        // rebolado contínuo do Excited: onda lenta atravessando o corpo
        gem.rotation.z += Math.sin(t * 1.7) * 0.055;
        gem.position.y += Math.sin(t * 3.4 + 1.2) * 0.05;
      }
    }

    updateRings(dt, sink.ring);
    updateBackdrop(dt, sink.backdrop);
    // Rastro: clipes de viagem marcam de onde soltar facetas (throttle aqui)
    if (sink.trailFrom && t - lastTrailEmit > 0.055) {
      lastTrailEmit = t;
      emitTrailFacet(sink.trailFrom.x, sink.trailFrom.y);
    }
    updateTrail(dt);

    const paletteTarget = clip && clip.def.palette ? clip.def.palette : mode.palette;
    for (let i = 0; i < COLORS.length; i++) {
      colorTargetTmp[i].set(paletteTarget[i % paletteTarget.length]);
      COLORS[i].lerp(colorTargetTmp[i], dt * 1.5);
    }

    purpleLight.position.set(Math.cos(t * 0.32) * 4, Math.sin(t * 0.24) * 2.5, Math.sin(t * 0.32) * 4);
    amberLight.position.set(-Math.cos(t * 0.32) * 4, Math.cos(t * 0.24 + 1.1) * 2.5, -Math.sin(t * 0.32) * 4);

    const power = sink.power;
    const lightPower = 0.05 + 0.95 * power;
    purpleLight.intensity = 6 * lightPower;
    amberLight.intensity = 5 * lightPower;
    whiteLight.intensity = 0.6 * lightPower;
    ambient.intensity = 0.25 * (0.15 + 0.85 * power);

    const colorAttr = gemGeo.attributes.color;
    for (let f = 0; f < faceCount; f++) {
      const target = COLORS[faceTargetIdx[f]];
      const c = faceColors[f];
      c.lerp(target, dt * faceSpeeds[f] * 2.0);
      const dr = c.r - target.r, dg = c.g - target.g, db = c.b - target.b;
      if (dr * dr + dg * dg + db * db < 0.001) {
        let next = Math.floor(Math.random() * COLORS.length);
        if (next === faceTargetIdx[f]) next = (next + 1) % COLORS.length;
        faceTargetIdx[f] = next;
      }
      // Rainbow por cima da cor real (sem mutá-la), como em scene.js
      let outC = c;
      if (sink.rainbow > 0.001) {
        rainbowTmp.setHSL((f * 0.618 + t * 0.1) % 1, 0.9, 0.62);
        outC = faceDisplayTmp.copy(c).lerp(rainbowTmp, sink.rainbow);
      }
      for (let v = 0; v < 3; v++) {
        const idx = (f * 3 + v) * 3;
        colorAttr.array[idx] = outC.r;
        colorAttr.array[idx + 1] = outC.g;
        colorAttr.array[idx + 2] = outC.b;
      }
    }
    colorAttr.needsUpdate = true;

    const scalarPower = 0.15 + 0.85 * power;
    material.color.setScalar(scalarPower);
    const mood = (Math.sin(t * 0.18) + 1) / 2;
    emissiveTint.lerpColors(COLORS[0], COLORS[2], mood);
    if (sink.rainbow > 0.001) {
      rainbowTmp.setHSL((t * 0.1) % 1, 0.9, 0.6);
      emissiveTint.lerp(rainbowTmp, sink.rainbow * 0.85);
    }
    material.emissive.copy(emissiveTint);
    material.emissiveIntensity =
      (0.5 + sink.emissiveBoost) * (0.08 + 0.92 * power) * (1 + sink.rainbow * 0.5);

    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);

  return {
    setActive(v) {
      active = v;
      if (v) lastNow = performance.now();
    },
    play(id) {
      const def = CLIPS.find((c) => c.id === id);
      if (!def) return;
      clip = { def, start: simTime };
    },
    setMode(id) {
      const m = MODES.find((x) => x.id === id);
      if (m) mode = m;
    },
  };
}
