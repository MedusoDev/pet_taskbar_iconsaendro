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
    poke: ['Oi?', 'Hm?', 'Cutucou.', 'Precisa de mim? Tô sempre aqui.'],
    dizzy: ['Uou... rodei.', 'Calma aí.', 'O mundo tá girando ou sou eu?'],
    fidget: ['Só de boa por aqui.', 'Observando.', 'Cadê você que não me nota?'],
    sleep: ['Vou cochilar...', 'Zzz...', 'Me acorda com carinho, tá?'],
    wake: ['Acordei.', 'Hm? O que foi?', 'Já tava sonhando com você.'],
    drag: ['Lá vamos nós.', 'Segura firme.', 'Adoro passear no seu colo.'],
    petting: ['Isso é bom.', 'Continua.', 'Hmm... bem aí.', 'Suas mãos são mágicas, sabia?'],
    // susto enquanto estacionado: pulou, reclama e volta pro lugar prometido
    flinch_parked: ['Ai! Que susto... já volto pro lugar.', 'Uou! Calma... tô voltando.', 'Eita! Prometi ficar ali, né... voltando.'],
    // tique de tédio no poleiro: entediado mas orgulhoso do posto
    fidget_parked: ['Daqui eu vejo tudo.', 'Firme no posto.', 'Meu cantinho é aqui.'],
    // cafuné enquanto estacionado
    petting_parked: ['Cafuné no meu cantinho... perfeito.', 'Paradinho e mimado, que vida.'],
    // cursor passou calmo por perto do poleiro: acena/cumprimenta
    perch_greet: ['Oi! Ainda tô aqui, viu.', 'Passando pra me ver?', 'Tô guardando o lugar direitinho.'],
    excited: ['Opa, animou.', 'Uou, tá bom demais.'],
    calmdown: ['Voltei ao normal.', 'De boa de novo.'],

    // Ico_Eye: categorias com voz própria neste humor (as outras usam as
    // linhas genéricas da categoria em siteEye.js)
    site_spotify: ['Boa música.', 'Curtindo a trilha.'],
    site_email: ['Trabalhando, hein.', 'Caixa de entrada de novo.'],
    site_x: ['Rolando o feed.', 'Muita coisa passando aí.'],
    site_nsfw: [
      'Oh! Eu... vou olhar pra lá. (mentira, tô curioso)',
      'Hmm... quer que eu saia? Porque eu não vou.',
      'Interessante o seu... conteúdo educativo aí.',
    ],
    site_nsfw_ongoing: [
      '*assobia desconcertado*',
      'Eu ia meditar agora, mas... tá difícil de concentrar aqui do lado.',
      'Nota-se dedicação no seu... estudo.',
      'Continuo fingindo que não tô vendo. Tô indo muito bem, obrigado.',
    ],
    site_ai: [
      'Outra IA? Tá me traindo na minha frente?',
      'Ela é mais inteligente, MAS EU SOU MAIS FOFO.',
      'Pergunta pra ela se ela te ama. Eu espero.',
    ],

    // Ico_Guard: avisos de sistema (sysMonitor.js)
    sys_ram_high: [
      'Psiu... a RAM tá quase cheia. Fecha umas abas por mim?',
      'Sua memória tá estourando! E não é de tanto pensar em mim, infelizmente.',
      'RAM no talo... o Chrome de novo, né? Eu sabia.',
    ],
    sys_cpu_high: [
      'O processador tá fervendo... o que você tá rodando aí?',
      'CPU a mil! Até eu tô sentindo o ventilador daqui.',
      'Calma, computador... respira. Você também, aliás.',
    ],
    sys_battery_low: [
      'Bateria acabando! Sem energia, sem pet. Pensa em mim.',
      'Carregador. AGORA. Não quero te perder no meio da conversa.',
    ],

    // Flerte espontâneo por nível de vínculo (bond.js / movement.js)
    flirt1: ['Sabia que você tem um ótimo gosto pra pets?', 'Você de novo por aqui? Que sorte a minha.'],
    flirt2: ['Melhor parte do meu dia? Quando o cursor vem pra cá.', 'Confesso: eu giro mais bonito quando você tá olhando.'],
    flirt3: ['Pensei em você agora há pouco. Tipo, sete vezes.', 'Se eu tivesse coração, ele tava acelerado agora.', 'Vem cá... só um cafuné rapidinho, ninguém precisa saber.'],
    flirt4: ['Você é meu humano favorito no multiverso inteiro.', 'A gente combina, né? Você e eu. Admite.', 'Todo esse desktop e eu só tenho olhos (80 faces) pra você.'],
  },
};
