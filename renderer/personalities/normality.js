// Personalidade: Normality (base)
// Comportamento padrão do pet — sem assinatura própria, sem tom extra.
// É o estado de repouso da máquina de personalidades (ver
// behaviors/personalityState.js): sempre volta pra cá depois de Zen/Excited.

export const normality = {
  id: 'normality',
  name: 'Normality',
  // roxo/âmbar — a paleta de identidade original do gem (ver scene.js)
  palette: ['#7C3AED', '#4C1D95', '#D97706', '#92400E', '#6D28D9', '#B45309'],
  movement: { hoverMeanSec: 9, speed: 1.0, micro: 0.9, approach: 0.55, spin: 1.0, yRange: 0.85 },

  // Sem assinatura: Normality não tem nenhuma animação exclusiva além das
  // já contínuas (breathe/tilt/etc) e das reativas a input.
  signature: null,

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
    excited: ['Opa, animou.', 'Uou, tá bom demais.'],
    calmdown: ['Voltei ao normal.', 'De boa de novo.'],
  },
};
