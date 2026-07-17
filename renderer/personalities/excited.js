// Personalidade: Excited (Animado/Ousado)
// Só é alcançada a partir do Zen, via zen_much_more_excited (ver
// behaviors/personalityState.js) — nunca escolhida por dia, nunca a partir
// do Normality direto.

const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
const pulse = (p) => Math.sin(clamp(p, 0, 1) * Math.PI);

export const excited = {
  id: 'excited',
  name: 'Excited',
  palette: ['#F43F5E', '#9D174D', '#FB7185', '#7C3AED', '#E11D48', '#C026D3'],
  movement: { hoverMeanSec: 6, speed: 1.2, micro: 1.1, approach: 1.0, spin: 1.15, yRange: 1.0 },

  // Assinatura: "Shimmy" — rebolada de charme, toca enquanto ele está na
  // fase need_you (seguindo o mouse)
  signature: {
    type: 'shimmy',
    label: 'Shimmy (requebra de charme)',
    duration: 1.6,
    apply(p) {
      return {
        z: Math.sin(p * 1.6 * 14) * 0.28 * (1 - p),
        y: pulse(p) * 0.35,
        scale: pulse(p) * 0.05,
        unfold: pulse(p) * 0.15,
        spinMul: 1,
      };
    },
  },

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
    // susto enquanto estacionado: pulou de susto mas volta (com charme)
    flinch_parked: ['Aii, me assustou! ...gostei. Mas vou voltar.', 'Uau, que agressividade! Já volto pro lugar, prometo.', 'Quase caí do salto! Voltando, viu.'],
    // entrada no modo (explosão do zen_much_more_excited)
    excited: ['Pronto, me ativou. Agora aguenta!', 'MAIS. Eu quero mais.', 'Você começou, agora termina.'],
    // fase need_you: segue o mouse jogando coraçõezinhos
    need_you: ['💜', '✨💜', 'Vem cá, vem...', 'Óoown, olha pra mim!'],
    // fase please_pet: vai até o mouse implorar carinho
    please_pet: ['Por favoooor, um carinho só...', 'Implorando aqui, viu.', 'Um cafuné, vai...'],
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
    // much_petting: o carinho não parou depois da vergonha — sobrecarga total
    much_petting: ['V-você não parou?! Ai—', 'De novo?! Meu núcleo não aguen—', 'MUITO. É MUITO carinho—'],
    // nocaute: apagou de tanto carinho, dorme fundo
    knockout: ['Erro fatal... de amor...', 'Desligando... feliz...', 'Valeu... a pena... zzz'],
  },
};
