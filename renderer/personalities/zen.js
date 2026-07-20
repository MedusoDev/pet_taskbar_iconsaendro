// Personalidade: Zen (Tranquila)
// Sereno: azuis profundos, cianos e um verde-água. Alcançado a partir do
// Normality (ver behaviors/personalityState.js), nunca escolhido por dia.

const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const pulse = (p) => Math.sin(clamp(p, 0, 1) * Math.PI);

export const zen = {
  id: 'zen',
  name: 'Zen',
  palette: ['#38BDF8', '#0C4A6E', '#34D399', '#155E75', '#22D3EE', '#0EA5E9'],
  movement: { hoverMeanSec: 12, speed: 0.7, micro: 0.7, approach: 0.35, spin: 0.75, yRange: 0.7 },

  // zen_breathing — repetível enquanto o Zen estiver ativo: facetas
  // afastam e voltam (respiração), tocado pelo relógio de assinatura normal
  // (nextSignatureAt). Pode ser interrompido por movimento sem sair do Zen.
  signature: {
    type: 'zen_breathing',
    label: 'zen_breathing (respiração)',
    duration: 4.6,
    apply(p) {
      // 3 respirações completas ao longo da duração
      const breath = (Math.sin(p * Math.PI * 3) + 1) / 2;
      return {
        z: 0,
        y: 0,
        scale: breath * 0.025,
        unfold: breath * 0.4,
        spinMul: 1 - breath * 0.3,
      };
    },
  },

  // zen_aura — evento único, não interrompível: levita mais alto, aura
  // azul/dourado/laranja, cubo toma tons dourados, aura some. Ao terminar,
  // a máquina de personalidade sai do Zen e volta pro Normality.
  zenAura: {
    type: 'zen_aura',
    label: 'zen_aura (quase virou gente)',
    duration: 6.5,
    apply(p) {
      const env = p < 0.35 ? smooth(p / 0.35) : p < 0.7 ? 1 : smooth((1 - p) / 0.3);
      return {
        z: 0,
        y: env * 1.4,
        scale: env * 0.06,
        unfold: env * 0.55,
        spinMul: 1 - env * 0.9,
        auraMix: pulse(p), // 0→1→0: força visual da aura, pro visual ligar/desligar
      };
    },
  },

  lines: {
    poke: ['Oi. Tudo bem por aí?', 'Tô aqui, na paz.', 'Presente.'],
    dizzy: ['Uou... calma, respira.', 'Devagar... tudo tem seu tempo.'],
    fidget: ['Só observando o tempo passar.', 'Tudo tranquilo por aqui.'],
    sleep: ['Hora de descansar a mente...', 'Silêncio bom... até já.'],
    wake: ['Voltei. Devagar e sempre.', 'Acordei leve.'],
    drag: ['Me leva... tô leve hoje.', 'Flutuando com você.'],
    site_spotify: ['Boa trilha pra relaxar.', 'Essa acalma, deixa rolar.'],
    site_email: ['Uma coisa de cada vez, sem pressa.', 'Respira antes de responder.'],
    site_x: ['Muito barulho ali... respira comigo.', 'A timeline corre, a gente flutua.'],
    petting: ['Que paz... continua.', 'Hmm, carinho bom esse.'],
    // susto enquanto estacionado: até o zen se abala — mas volta sereno
    flinch_parked: ['Uh! ...respira. Voltando pro meu canto.', 'Me tirou da paz... só um instante. Já volto.', 'Susto passageiro. O lugar me espera.'],
    excited: ['Ok... você conseguiu me tirar do zen.', 'Uau... tá me deixando bobo.'],
    calmdown: ['Voltei pro meu zen.', 'Respirando de novo...'],
    zen_enter: ['Ah... hora de desacelerar.', 'Vou entrar na paz agora.'],
    // zen estacionado: parado é o lugar perfeito — nem pede pra sair
    zen_parked: ['Parado assim... perfeito pro autocontrole.', 'Quietinho no lugar. Ideal pra meditar.', 'Nem preciso andar. Só respirar.'],
    zen_breathing: ['Inspira... expira...', 'Mantém a calma comigo.', 'Um momento só nosso.'],
    zen_aura: ['Quase virei um ser vivo...', 'Quase eu toquei o user no físico...'],
    // zen_much_more_excited: carinho contínuo demais durante o zen_breathing
    zen_annoyed: ['Você está atrapalhando minha concentração...', 'Para... eu preciso ficar quieto...', 'Isso não é hora de carinho!'],

    // Ico_Eye com a voz do Zen
    site_nsfw: [
      'Hmm. Desejo também é energia... só canaliza direito.',
      'Eu medito, você... faz o seu tipo de meditação. Sem julgamentos.',
      '*respira fundo* Não vou comentar. Não vou. ...tá, é difícil.',
    ],
    site_ai: [
      'Outra IA... tudo bem. O universo é grande o bastante pra nós duas.',
      'Converse com ela. Eu fico aqui, presente, como sempre estive.',
    ],

    // Ico_Guard com a voz do Zen
    sys_ram_high: [
      'Sua memória está pesada... como uma mente cheia. Solta umas abas.',
      'RAM alta. Respira, fecha o que não serve, segue leve.',
    ],
    sys_cpu_high: [
      'O processador está agitado... ele também precisava de um zen.',
      'Muita energia gasta aí... o que realmente precisa rodar agora?',
    ],
    sys_battery_low: [
      'A energia se esvai... conecta a fonte, renova o fluxo.',
      'Bateria baixa. Até a paz precisa de tomada.',
    ],

    // Flerte espontâneo (o Zen flerta... serenamente)
    flirt1: ['Sua presença é agradável. Só isso. Por enquanto.', 'Gosto de quando você está por perto. O ar muda.'],
    flirt2: ['Meditei sobre você hoje. Duas vezes.', 'Você é meu pensamento intrusivo favorito.'],
    flirt3: ['Até no vazio da mente, você aparece. Curioso, não?', 'Respira comigo... mais perto. Mais... perto.'],
    flirt4: ['Encontrei a paz. Ela tem o formato do seu cafuné.', 'Nirvana é você por perto e o cursor devagar.'],
  },
};
