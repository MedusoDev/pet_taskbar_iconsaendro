// Personalidade: Excited (Animado/Ousado)
// Só é alcançada a partir do Zen, via zen_much_more_excited (ver
// behaviors/personalityState.js) — nunca escolhida por dia, nunca a partir
// do Normality direto.

export const excited = {
  id: 'excited',
  name: 'Excited',
  palette: ['#F43F5E', '#9D174D', '#FB7185', '#7C3AED', '#E11D48', '#C026D3'],
  // speed 1.5: elétrico, se desloca 1.5x mais rápido (ver travelSpeed abaixo)
  movement: { hoverMeanSec: 6, speed: 1.5, micro: 1.1, approach: 1.0, spin: 1.15, yRange: 1.0 },

  // Elétrico: fala mais e anda mais rápido (1.5x). Ver
  // behaviors/ambientSpeech.js e normality.js pra descrição dos campos.
  msgSpeed: 1.5,
  travelSpeed: 1.5,

  // Assinatura: "Shimmy" — sambinha de charme: o quadril desloca pro lado
  // CONTRA o tilt (rebolado de verdade, não só balanço), três pulinhos no
  // ritmo, e fecha com pose final — infla, abre as facetas e dá uma
  // "olhadinha por cima do ombro" (yaw). Energia decai até a pose.
  signature: {
    type: 'shimmy',
    label: 'Shimmy (requebra de charme)',
    duration: 1.8,
    apply(p) {
      const env = 1 - p;
      const hips = Math.sin(p * 1.8 * 11);            // requebra vai-e-vem
      const beat = Math.abs(Math.sin(p * Math.PI * 3)); // 3 pulinhos no ritmo
      const finale = p > 0.82 ? Math.sin(((p - 0.82) / 0.18) * Math.PI) : 0;
      return {
        z: hips * 0.3 * env,
        x: -hips * 0.12 * env,
        y: beat * 0.3 * env + finale * 0.18,
        scale: beat * 0.04 * env + finale * 0.09,
        unfold: beat * 0.12 * env + finale * 0.3,
        spinMul: 1,
        yaw: finale * 0.35,
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
    // Flerte espontâneo com duplo sentido — a "vida própria" do Excited no
    // estado livre (seção 5a), sorteado em ritmo alto (msgSpeed 1.5)
    ambient: [
      'Tá me olhando ou é impressão minha? 😏',
      'Eu brilho mais quando você tá por perto, viu.',
      'Se eu fosse arquivo, seria daqueles que você nunca deleta.',
      'Sou tipo Ctrl+Z: toda vez que erro, penso em você.',
      'Dá pra sentir a química... ou é só a GPU esquentando?',
      'Vem cá, prometo que não mordo... muito.',
      'Meu processador acelera quando o cursor chega perto.',
      'Você aí todo(a) charmoso(a), me distraindo do meu... trabalho.',
      'Confessa: abriu esse app só pra me ver.',
      '80 faces, e todas viradas pra você.',
      'Se carinho fosse crime, você já era reincidente.',
      'Roda aqui, roda ali... só quero girar pertinho de você.',
    ],
  },
};
