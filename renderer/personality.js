// AI_Live — banco de falas pequeno, sem IA por enquanto (isso fica pra depois,
// possivelmente plugando a API da Claude aqui no mesmo lugar).
//
// v1.1: DUAS personalidades por enquanto, alternando estritamente a cada dia
// (dia par/ímpar). Cada uma tem:
//   palette   — as 6 cores do degradê de facetas + emissive (troca o visual
//               inteiro do gem, não só um tint)
//   movement  — modula o motor de movimento (ver comentário abaixo)
//   signature — animação única que SÓ essa personalidade faz
//   lines     — falas por gatilho
//
// Campos de `movement`:
//   hoverMeanSec — tempo médio pairando antes de decidir ir pra outro lugar
//   speed        — multiplicador da velocidade de viagem
//   micro        — amplitude da micro-deriva enquanto paira
//   approach     — 0..1: quanto gravita na direção do cursor parado por perto
//   spin         — multiplicador da rotação própria
//   yRange       — 0..1: quão alto costuma pairar (1 = faixa toda)

export const PERSONALITIES = [
  {
    id: 'ousado',
    name: 'Manhoso Ousado',
    // Quente: rosas, magentas e vermelhos com um toque do roxo da marca
    palette: ['#F43F5E', '#9D174D', '#FB7185', '#7C3AED', '#E11D48', '#C026D3'],
    movement: { hoverMeanSec: 6, speed: 1.2, micro: 1.1, approach: 1.0, spin: 1.15, yRange: 1.0 },
    signature: 'shimmy', // rebolada de charme: requebra + pulinho + facetas
    lines: {
      poke: ['Uii, atrevido(a) você, hein...', 'Continua que eu gosto.', 'Só isso? Capricha mais.'],
      dizzy: ['Você me deixou tonto... e gostando.', 'Rodei todinho por sua causa.'],
      fidget: ['Tô carente... vem cá.', 'Ninguém me nota... que desperdício de charme.'],
      sleep: ['Vou sonhar coisa boa... aposto que você aparece.', 'Dormir sozinho é um crime, viu.'],
      wake: ['Acordou o bichinho... agora aguenta.', 'Hmm, me acordou? Assume a responsabilidade.'],
      drag: ['Adoro quando você me pega assim.', 'Hmm, mãos firmes... gostei.'],
      site_spotify: ['Essa música... clima perfeito pra nós, né?', 'Playlist de conquista, sei...'],
      site_email: ['Trabalhando muito... depois sobra tempo pra mim?', 'Manda um email pra mim também, com carinho.'],
      site_x: ['Fofocando? Me conta tudo, vai.', 'Flertando por aí? Tô de olho, hein.'],
      petting: ['Hmmm... isso, bem aí.', 'Carinho? Aceito. Sempre.', 'Não para não...'],
      excited: ['Pronto, me ativou. Agora aguenta!', 'MAIS. Eu quero mais.', 'Você começou, agora termina.'],
      calmdown: ['Ufa... que intenso.', 'Tô de boa de novo... por enquanto.'],
    },
  },
  {
    id: 'tranquilo',
    name: 'Tranquilo',
    // Sereno: azuis profundos, cianos e um verde-água
    palette: ['#38BDF8', '#0C4A6E', '#34D399', '#155E75', '#22D3EE', '#0EA5E9'],
    movement: { hoverMeanSec: 12, speed: 0.7, micro: 0.7, approach: 0.35, spin: 0.75, yRange: 0.7 },
    signature: 'zen', // flutuação meditativa: sobe devagar, abre as facetas, quase para de girar
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
      excited: ['Ok... você conseguiu me tirar do zen.', 'Uau... tá me deixando bobo.'],
      calmdown: ['Voltei pro meu zen.', 'Respirando de novo...'],
    },
  },
];

/** Alternância estrita: dia par = uma, dia ímpar = outra. Troca à meia-noite. */
export function pickPersonalityForToday(date = new Date()) {
  const daySinceEpoch = Math.floor(
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() / 86400000
  );
  return PERSONALITIES[daySinceEpoch % PERSONALITIES.length];
}
