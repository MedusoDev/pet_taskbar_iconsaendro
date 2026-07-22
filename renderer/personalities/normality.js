// Personalidade: Normality (base)
// Comportamento padrão do pet. É o estado de repouso da máquina de
// personalidades (ver behaviors/personalityState.js): sempre volta pra cá
// depois de Zen/Excited.

const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

export const normality = {
  id: 'normality',
  name: 'Normality',
  // roxo/âmbar — a paleta de identidade original do gem (ver scene.js)
  palette: ['#7C3AED', '#4C1D95', '#D97706', '#92400E', '#6D28D9', '#B45309'],
  movement: { hoverMeanSec: 9, speed: 1.0, micro: 0.9, approach: 0.55, spin: 1.0, yRange: 0.85 },

  // Falas espontâneas (ver behaviors/ambientSpeech.js) e deslocamento:
  //   msgSpeed    — multiplicador da frequência de comentário ambiente (1x = base)
  //   travelSpeed — velocidade de viagem; espelha movement.speed (o motor lê
  //                 movement.speed em wander.js; mantidos em sincronia).
  msgSpeed: 1.0,
  travelSpeed: 1.0,

  // Flourish (floreio de moeda) — a assinatura do Normality: de vez em
  // quando ele se exibe com um truque de gamer. Agacha carregando o pulo,
  // salta dando uma pirueta completa em Y com as facetas flarando no ápice
  // (moeda jogada pro alto), e pousa com overshoot num "tcharam" que
  // assenta. Tocado pelo relógio de assinatura (idleSignatureMin/MaxSec).
  signature: {
    type: 'flourish',
    label: 'flourish (floreio de moeda)',
    duration: 2.9,
    apply(p) {
      if (p < 0.3) {
        // 1) carga: agacha, amassa e fecha, mirando o pulo
        const k = smooth(p / 0.3);
        return {
          z: 0,
          y: -0.16 * k,
          scale: -0.06 * k,
          unfold: 0,
          spinMul: 1 - 0.7 * k,
          pitch: 0.14 * k,
        };
      }
      if (p < 0.66) {
        // 2) voo: pulo em arco + pirueta completa em Y, facetas no ápice
        const k = (p - 0.3) / 0.36;
        const arc = Math.sin(k * Math.PI);
        return {
          z: Math.sin(k * Math.PI * 2) * 0.06,
          y: -0.16 * (1 - k) + arc * 0.85,
          scale: -0.06 * (1 - k) + arc * 0.12,
          unfold: arc * 0.4,
          spinMul: 0.3,
          yaw: smooth(k) * Math.PI * 2, // 2π ≡ 0: pousa no ângulo em que saiu
          pitch: 0.14 * (1 - k),
        };
      }
      // 3) pouso: quica com overshoot e um pop de facetas que assenta
      const k = (p - 0.66) / 0.34;
      const bounce = Math.sin(k * Math.PI * 2) * Math.exp(-k * 3.5);
      return {
        z: 0,
        y: bounce * 0.12,
        scale: bounce * 0.08,
        unfold: Math.exp(-k * 3) * 0.3,
        spinMul: 1,
      };
    },
  },

  lines: {
    poke: ['Oi?', 'Hm?', 'Cutucou.'],
    dizzy: ['Uou... rodei.', 'Calma aí.'],
    fidget: ['Só de boa por aqui.', 'Observando.'],
    sleep: ['Vou cochilar...', 'Zzz...'],
    wake: ['Acordei.', 'Hm? O que foi?'],
    drag: ['Lá vamos nós.', 'Segura firme.'],
    site_spotify: ['Boa música.', 'Curtindo a trilha.'],
    site_email: ['Trabalhando, hein.', 'Caixa de entrada de novo.'],
    site_x: ['Rolando o feed.', 'Muita coisa passando aí.'],
    petting: ['Isso é bom.', 'Continua.'],
    // susto enquanto estacionado: pulou, reclama e volta pro lugar prometido
    flinch_parked: ['Ai! Que susto... já volto pro lugar.', 'Uou! Calma... tô voltando.', 'Eita! Prometi ficar ali, né... voltando.'],
    excited: ['Opa, animou.', 'Uou, tá bom demais.'],
    calmdown: ['Voltei ao normal.', 'De boa de novo.'],
    // Falas espontâneas do dia a dia (clima, "você está bem?", cotidiano),
    // sorteadas em intervalo aleatório pelo ambientSpeech.js
    ambient: [
      'Como tá o dia por aí?',
      'Você bebeu água hoje?',
      'Tá tudo bem com você?',
      'O tempo hoje parece bom, né.',
      'Já fez uma pausa hoje?',
      'Tô aqui de boa, só observando.',
      'Lembra de descansar os olhos, hein.',
      'Que horas são? Perdi a noção.',
      'Dia tranquilo até agora.',
      'Se precisar de companhia, é só chamar.',
      'Não esquece de respirar fundo de vez em quando.',
    ],
  },
};
