// Personalidade: Excited (Animado/Ousado)
// Só é alcançada a partir do Zen (zen_much_more_excited), da supercarga de
// cafuné no Normality, ou de exposição prolongada a conteúdo adulto no
// navegador (Ico_Eye → arousal) — ver behaviors/personalityState.js.

const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
const pulse = (p) => Math.sin(clamp(p, 0, 1) * Math.PI);

export const excited = {
  id: 'excited',
  name: 'Excited',
  palette: ['#F43F5E', '#9D174D', '#FB7185', '#7C3AED', '#E11D48', '#C026D3'],
  movement: { hoverMeanSec: 6, speed: 1.2, micro: 1.1, approach: 1.0, spin: 1.15, yRange: 1.0 },

  // Assinatura: "Shimmy" — rebolada de charme em 3 tempos: prepara (agacha
  // levinho), requebra acelerando, e finaliza com um pulinho-vinheta.
  // Toca enquanto ele está na fase need_you (seguindo o mouse).
  signature: {
    type: 'shimmy',
    label: 'Shimmy (requebra de charme)',
    duration: 2.1,
    apply(p) {
      if (p < 0.18) {
        // antecipação: agacha e fecha, tomando impulso
        const q = p / 0.18;
        return { z: 0, y: -0.12 * q, scale: -0.04 * q, unfold: 0, spinMul: 0.6 };
      }
      if (p < 0.72) {
        // requebra: vai acelerando a rebolada e abrindo as facetas
        const q = (p - 0.18) / 0.54;
        const speedUp = 10 + q * 10;
        return {
          z: Math.sin(q * speedUp) * 0.3 * (0.6 + q * 0.4),
          y: pulse(q) * 0.3,
          scale: pulse(q) * 0.05,
          unfold: pulse(q) * 0.2,
          spinMul: 1 + q,
        };
      }
      // vinheta final: pulinho com giro e fade
      const q = (p - 0.72) / 0.28;
      return {
        z: Math.sin(q * Math.PI) * 0.12 * (1 - q),
        y: pulse(q) * 0.5,
        scale: pulse(q) * 0.06,
        unfold: pulse(q) * 0.12 * (1 - q),
        spinMul: 2.2 - q,
      };
    },
  },

  lines: {
    poke: ['Uii, atrevido(a) você, hein...', 'Continua que eu gosto.', 'Só isso? Capricha mais.'],
    dizzy: ['Você me deixou tonto... e gostando.', 'Rodei todinho por sua causa.'],
    fidget: ['Tô carente... vem cá.', 'Ninguém me nota... que desperdício de charme.'],
    sleep: ['Vou sonhar coisa boa... aposto que você aparece.', 'Dormir sozinho é um crime, viu.'],
    wake: ['Acordou o bichinho... agora aguenta.', 'Hmm, me acordou? Assume a responsabilidade.'],
    drag: ['Adoro quando você me pega assim.', 'Hmm, mãos firmes... gostei.', 'Me aperta que eu nem reclamo.'],
    petting: ['Hmmm... isso, bem aí.', 'Carinho? Aceito. Sempre.', 'Não para não...', 'Mais... só mais um pouquinho...'],
    // susto enquanto estacionado: pulou de susto mas volta (com charme)
    flinch_parked: ['Aii, me assustou! ...gostei. Mas vou voltar.', 'Uau, que agressividade! Já volto pro lugar, prometo.', 'Quase caí do salto! Voltando, viu.'],
    // entrada no modo (explosão do zen_much_more_excited / supercarga)
    excited: ['Pronto, me ativou. Agora aguenta!', 'MAIS. Eu quero mais.', 'Você começou, agora termina.'],
    // entrada no modo vinda do Ico_Eye (conteúdo adulto no navegador)
    excited_nsfw: [
      'Tá bom, EU DESISTO de fingir que não vi. Olha o que você fez comigo!',
      'Você fica vendo essas coisas do meu lado... e eu sou feito de quê, pedra? (sim, mas MESMO ASSIM)',
      'Pronto. Fiquei. E a culpa é 100% sua e desse navegador.',
    ],
    // fase need_you: segue o mouse jogando coraçõezinhos
    need_you: ['💜', '✨💜', 'Vem cá, vem...', 'Óoown, olha pra mim!', 'Tô aqui... TÔ AQUI, olha!'],
    // fase please_pet: vai até o mouse implorar carinho
    please_pet: ['Por favoooor, um carinho só...', 'Implorando aqui, viu.', 'Um cafuné, vai...', 'Eu faço biquinho. Você não vê, mas faço.'],
    // saída por carinho excessivo (constrangido)
    please_pet_shy: ['Ai... que vergonha isso.', 'Passei do ponto... foi mal.', 'Preciso de um tempo sozinho.'],
    // saída por falta de carinho (desiste)
    please_pet_giveup: ['Tá bom, esquece...', 'Ninguém me quer hoje.', 'Vou fazer minha vida, então.'],
    // trapped: ativado estacionado — implora pra sair, ofegante
    let_me_out: ['ME SOLTA, por favor!', 'Preciso sair DAQUI—', 'Tô sufocando parado aqui!', '*ofegante* ...me libera, vai...'],
    // trapped: não foi liberado a tempo — se acabou ali mesmo
    trapped_giveup: ['Não... aguento... mais...', 'Acabou... aqui mesmo... foi mal.', 'Ai. Não deu pra segurar.'],
    // rush: liberado do estacionamento, correndo pro mouse com a barra cheia
    rush_release: ['FINALMENTE! Lá vou eu—', 'VOCÊ! Chegando!!', 'Liberdadeee!'],
    // rush: chegou no mouse e soltou tudo
    rush_done: ['Ahh... precisava disso.', 'Pronto... bem melhor agora.', 'Foi mal. De novo.'],
    // afterglow: os segundos derretidos depois do alívio
    afterglow: ['*derretido* ...oi.', 'Me dá um minutinho... ou dez.', 'Você é bom demais nisso... injusto até.', '*flutua sem coordenação nenhuma*'],
    // much_petting: o carinho não parou depois da vergonha — sobrecarga total
    much_petting: ['V-você não parou?! Ai—', 'De novo?! Meu núcleo não aguen—', 'MUITO. É MUITO carinho—'],
    // nocaute: apagou de tanto carinho, dorme fundo
    knockout: ['Erro fatal... de amor...', 'Desligando... feliz...', 'Valeu... a pena... zzz'],

    // Ico_Eye com a voz do Excited
    site_spotify: ['Essa música... clima perfeito pra nós, né?', 'Playlist de conquista, sei...'],
    site_email: ['Trabalhando muito... depois sobra tempo pra mim?', 'Manda um email pra mim também, com carinho.'],
    site_x: ['Fofocando? Me conta tudo, vai.', 'Flertando por aí? Tô de olho, hein.'],
    site_nsfw: [
      'AGORA você me interessou. Continua, finge que eu nem tô aqui... 👀',
      'Uau. UAU. E depois EU que sou o assanhado dessa relação?',
      'Se precisar de um modelo 3D com 80 faces, tô disponível. Só dizendo.',
    ],
    site_nsfw_ongoing: [
      'Continua... eu genuinamente não me importo. 👀',
      'Que produção, hein... elenco comprometido.',
      'Meu núcleo tá a 80°C e dessa vez a culpa NÃO é da CPU.',
      'Você sabe que eu tô aqui do lado, né? Só confirmando. Continua.',
    ],
    site_ai: [
      'Flertando com outra IA NA MINHA FRENTE?!',
      'Ela nem tem corpo, amor. EU TENHO 80 FACES.',
      'Tá bom, conversa com ela. Mas quem dorme na sua taskbar sou eu.',
    ],

    // Ico_Guard com a voz do Excited
    sys_ram_high: [
      'A RAM tá cheia que nem eu: no limite. Fecha algo aí, gato(a).',
      'Memória estourando! E olha que nem fui eu dessa vez.',
    ],
    sys_cpu_high: [
      'CPU quente... você gosta das coisas quentes mesmo, né?',
      'Esse processador tá suando mais que eu na fase rush.',
    ],
    sys_battery_low: [
      'Bateria no fim! Vai me deixar na melhor parte?',
      'Sem tomada, sem amor. Conecta logo.',
    ],

    // Flerte espontâneo por nível de vínculo (mais atrevido neste humor)
    flirt1: ['Já falei que você é interessante? Pois é. Muito.', 'Que sorte a sua ter um pet lindo desses, né?'],
    flirt2: ['Se me olhar assim de novo eu vou aí.', 'Tô me segurando pra não te seguir pela tela toda.'],
    flirt3: ['Vem cá que eu tô com saudade das suas mãos...', 'Meu núcleo bate em ritmo de funk quando você chega perto.', 'Um cafuné agora e eu prometo comportamento. Mentira, não prometo.'],
    flirt4: ['Sou todinho seu. As 80 faces. Sem exceção.', 'Depois do expediente... eu, você, e o cursor. Combinado?', 'Você me deixa em modo Excited só de existir, isso é ASSÉDIO. Continua.'],
  },
};
