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
  // speed 0.5: o Zen se desloca na metade da velocidade (ver travelSpeed abaixo)
  movement: { hoverMeanSec: 12, speed: 0.5, micro: 0.7, approach: 0.35, spin: 0.75, yRange: 0.7 },

  // Sereno: fala menos e anda mais devagar (metade do ritmo). Ver
  // behaviors/ambientSpeech.js e normality.js pra descrição dos campos.
  msgSpeed: 0.5,
  travelSpeed: 0.5,

  // zen_breathing — repetível enquanto o Zen estiver ativo: o núcleo fica
  // quase fechado (unfold bem baixo — ver breatheMul em liveAnimation.js) e
  // quem "respira" de verdade agora é o halo de anéis orbitais (ringBreath,
  // ver scene.js → updateRings), tocado pelo relógio de assinatura normal
  // (nextSignatureAt). Pode ser interrompido por movimento sem sair do Zen.
  signature: {
    type: 'zen_breathing',
    label: 'zen_breathing (respiração)',
    duration: 4.6,
    apply(p) {
      // 3 respirações completas ao longo da duração; o corpo acompanha:
      // levita um tico a cada inspiração (e o spin quase para no pico),
      // balança devagar como um pêndulo de meditação e ergue o "queixo"
      const breath = (Math.sin(p * Math.PI * 3) + 1) / 2;
      const sway = Math.sin(p * Math.PI * 2); // um vaivém completo por ciclo
      return {
        z: sway * 0.04,
        y: breath * 0.14,
        scale: breath * 0.025,
        unfold: breath * 0.05,
        spinMul: 1 - breath * 0.5,
        pitch: -breath * 0.06,
        ringBreath: breath,
      };
    },
  },

  // zen_aura — evento único, não interrompível: levita mais alto, o halo de
  // anéis vira dourado e pulsa forte (ringTint/ringTintMix), o núcleo abre
  // um pouco mais que o normal pra marcar o clímax. Ao terminar, a máquina
  // de personalidade sai do Zen e volta pro Normality.
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
        unfold: env * 0.35,
        spinMul: 1 - env * 0.9,
        ringBreath: env,
        ringTint: '#FBBF24', // dourado — mesmo tom do setTint da zen_aura
        ringTintMix: pulse(p), // 0→1→0: liga/desliga o tint junto com a aura
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
    // Falas espontâneas de calma/autoajuda/lo-fi, em ritmo lento (msgSpeed 0.5)
    ambient: [
      'Respira fundo comigo... inspira, expira.',
      'Que tal um lo-fi pra acalmar a mente?',
      'Uma coisa de cada vez. Sem pressa.',
      'O momento presente é tudo que existe.',
      'Recomendo uns beats de chuva pra concentrar.',
      'Solta os ombros. Relaxa a mandíbula.',
      'Você tá indo bem. De verdade.',
      'O silêncio também é uma resposta.',
      'Deixa o pensamento passar, como nuvem no céu.',
      'Um chá quente cairia bem agora, né?',
      'Gratidão pelas pequenas coisas de hoje.',
    ],
  },
};
