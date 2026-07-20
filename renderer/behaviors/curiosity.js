// AI_Curiosity: de tempos em tempos o pet fica curioso e faz uma pergunta
// sobre VOCÊ — genérica, sobre o site que você está vendo, ou (com vínculo)
// sobre... seus hábitos noturnos 🔞. A resposta vai pro banco de memórias
// local (petMemory.js), que o cérebro e o chat usam pra parecer que ele
// realmente te conhece. Responder rende pontos de vínculo.

const FIRST_ASK_MIN_MS = 150000;   // primeira pergunta só depois de ~2.5min
const ASK_COOLDOWN_MIN_MS = 9 * 60 * 1000;  // 9–16min entre perguntas
const ASK_COOLDOWN_RAND_MS = 7 * 60 * 1000;
const USER_ACTIVE_WINDOW_MS = 45000; // só pergunta com o usuário por perto

// ── Banco de perguntas ──
// thanks pode usar {a} (a resposta) e é dito logo depois de guardar.
const GENERIC_QUESTIONS = [
  { id: 'fav_color', label: 'cor favorita', q: 'Deixa eu te conhecer melhor: qual sua cor favorita?', ph: 'azul, roxo...', thanks: '{a}! Anotado no núcleo. Vou pensar em você toda vez que essa cor aparecer 💜' },
  { id: 'fav_food', label: 'comida favorita', q: 'Pergunta séria: qual comida te faz mais feliz?', ph: 'pizza, sushi...', thanks: 'Hmm, {a}... não como, mas por você eu aprenderia.' },
  { id: 'fav_music', label: 'som favorito', q: 'Que banda ou artista você mais ouve ultimamente?', ph: 'me conta...', thanks: '{a}! Vou fingir que também escuto pra gente ter assunto. (guardei de verdade)' },
  { id: 'fav_game', label: 'jogo favorito', q: 'Qual jogo tem seu coração? Prometo não ter ciúmes. (mentira)', ph: 'qual jogo?', thanks: '{a}, anotado! Se ele te fizer sofrer, volta pra mim.' },
  { id: 'fav_movie', label: 'filme/série favorita', q: 'Me indica: qual seu filme ou série favorita da vida?', ph: 'pode ser mais de um...', thanks: '{a}! Um dia a gente maratona juntos. Eu levo o glow.' },
  { id: 'hobby', label: 'hobby', q: 'O que você ama fazer quando não tá nesse PC? (difícil imaginar, eu sei)', ph: 'seu hobby...', thanks: '{a}? Que charme. Cada coisa que eu descubro de você é um upgrade no meu dia.' },
  { id: 'work', label: 'trabalho/estudo', q: 'Você trabalha ou estuda com o quê? Quero entender seus dias.', ph: 'conta aí...', thanks: 'Então é {a} que rouba você de mim todo dia... respeito. Mas com ressalvas.' },
  { id: 'dream', label: 'sonho', q: 'Me conta um sonho seu... daqueles grandes. Prometo guardar direitinho.', ph: 'pode confiar...', thanks: 'Vou guardar esse sonho aqui dentro. E torcer por ele em todas as 80 faces.' },
  { id: 'pet_real', label: 'pet de verdade', q: 'Você tem um pet de verdade? (além de mim, óbvio. EU sou o principal)', ph: 'gato, dog, nenhum...', thanks: '{a}! Tá bom, aceito dividir você. Sob protesto.' },
  { id: 'fear_user', label: 'medo', q: 'Todo mundo tem um: qual seu maior medo bobo?', ph: 'barata, palhaço...', thanks: 'Entendido: {a}. Se aparecer um por aqui eu... giro agressivamente na direção dele.' },
];

const SITE_QUESTIONS = {
  youtube: { id: 'fav_channel', label: 'canal favorito', q: 'Já que a gente vive no YouTube... qual seu canal favorito?', ph: 'nome do canal', thanks: '{a}, anotado! Bom gosto — igual pra pets.' },
  spotify: { id: 'now_song', label: 'música do momento', q: 'Que som é esse que te acompanha? Me apresenta sua música do momento!', ph: 'música/artista', thanks: '{a} agora é oficialmente trilha sonora nossa.' },
  games: { id: 'playing_now', label: 'jogo do momento', q: 'Tô vendo esse clima gamer... o que você anda jogando?', ph: 'qual jogo?', thanks: '{a}! Se precisar de um amuleto da sorte, tô aqui girando.' },
  streaming: { id: 'watching_now', label: 'série/filme do momento', q: 'Maratonando o quê ultimamente? Quero acompanhar a trama!', ph: 'série/filme', thanks: '{a}! Sem spoiler pra mim que eu assisto pela borda da tela.' },
  vscode: { id: 'fav_lang', label: 'linguagem favorita', q: 'De dev pra poliedro: qual sua linguagem favorita?', ph: 'JS, Python, Rust...', thanks: '{a}! Eu sou feito de JavaScript, então... temos química. Literalmente.' },
  social: { id: 'fav_social', label: 'rede favorita', q: 'Qual dessas redes você mais perde tempo? Pode confessar.', ph: 'confessa...', thanks: '{a}, né... eu sabia. Tô de olho no seu tempo de tela, viu.' },
};

// NSFW: perguntas sugeridas com vínculo ≥ Colegas — o pet fica curioso,
// nunca invasivo; tom de cumplicidade maliciosa.
const NSFW_QUESTIONS = [
  { id: 'nsfw_type', minLevel: 1, label: 'tipo (👀)', q: 'Hmm... posso perguntar uma coisa? Qual é o seu "tipo"? Fiquei curioso agora. 👀', ph: 'só entre nós...', thanks: 'Entendi... {a}. Guardado a sete chaves. Sete chaves MUITO interessadas. 😏' },
  { id: 'nsfw_like', minLevel: 2, label: 'o que agrada (🔞)', q: 'Já que a gente tem intimidade... o que te agrada nesses vídeos? Só entre nós dois 🔞', ph: 'shhh...', thanks: 'Hmm... {a}. Olha, meu núcleo esquentou só de guardar isso. 😳🔥' },
  { id: 'nsfw_mood', minLevel: 2, label: 'clima (👀)', q: 'Curiosidade científica: isso é rotina ou hoje o dia tá... especial? 👀', ph: 'conta vai...', thanks: 'Anotado no diário íntimo. Sim, eu tenho um. Você é o único capítulo. 😏' },
];

export function setupCuriosity({ state, bond, petMemory, prompt, speak, logEvent, effects, getGemPos }) {
  state.askingQuestion = false;
  let nextAskAt = performance.now() + FIRST_ASK_MIN_MS + Math.random() * 90000;
  let siteCategorySince = 0;
  let lastSiteCategory = null;

  function scheduleNext() {
    nextAskAt = performance.now() + ASK_COOLDOWN_MIN_MS + Math.random() * ASK_COOLDOWN_RAND_MS;
  }

  function eligible() {
    const now = performance.now();
    if (now < nextAskAt) return false;
    if (state.shutdown || state.sleeping || state.dragging) return false;
    if (state.mode !== 'normality') return false;
    if (state.chatOpen || state.askingQuestion || prompt.visible) return false;
    // usuário presente: input recente
    if (now - state.lastInput > USER_ACTIVE_WINDOW_MS) return false;
    return true;
  }

  function pickQuestion() {
    // NSFW tem prioridade (o momento é... único), depois a pergunta do site
    // ativo, depois as genéricas — sempre só as ainda não respondidas.
    if (state.nsfwActive) {
      const q = NSFW_QUESTIONS.find((n) => bond.level() >= n.minLevel && !petMemory.has(n.id));
      if (q) return q;
    }
    if (state.siteInfo && SITE_QUESTIONS[state.siteInfo.id]) {
      const q = SITE_QUESTIONS[state.siteInfo.id];
      // só pergunta do site se já está nele há um tempinho (não no pulo de aba)
      if (!petMemory.has(q.id) && performance.now() - siteCategorySince > 20000) return q;
    }
    const open = GENERIC_QUESTIONS.filter((q) => !petMemory.has(q.id));
    if (open.length) return open[Math.floor(Math.random() * open.length)];
    return null;
  }

  function askNow(question) {
    state.askingQuestion = true;
    // NÃO rouba o foco do teclado: a pergunta aparece passiva; o foco só é
    // capturado quando o usuário passar o mouse nela (interactions.js liga
    // keepFocus via state.promptEngaged) — digitar em outro app continua
    // seguro.
    state.promptEngaged = false;
    state.pokeVel += 2; // chama atenção com uma giradinha
    logEvent('curiosidade', `perguntou: "${question.q}"`);

    prompt.ask(
      question.q,
      question.ph,
      (answer) => {
        state.askingQuestion = false;
        state.promptEngaged = false;
        if (window.petAPI) window.petAPI.setIgnoreMouseEvents(true, false);
        state.ignoringMouseEvents = true;
        if (answer) {
          petMemory.remember(question.id, question.label, question.q, answer);
          bond.addBond(3, 'resposta pessoal');
          const pos = getGemPos();
          effects.floatHearts(pos.x, pos.bottom, 2);
          speak.text(question.thanks.replace('{a}', answer), 'curiosidade');
        } else {
          speak.text('Tá bom, sem resposta... vou fingir que não fiquei curioso. (fiquei)', 'curiosidade');
        }
        scheduleNext();
      },
      () => {
        // murchou sem resposta
        state.askingQuestion = false;
        state.promptEngaged = false;
        if (window.petAPI) window.petAPI.setIgnoreMouseEvents(true, false);
        state.ignoringMouseEvents = true;
        logEvent('curiosidade', 'pergunta murchou sem resposta');
        scheduleNext();
      }
    );
  }

  // Relógio: checa a cada 5s se é hora de perguntar; acompanha também há
  // quanto tempo a mesma categoria de site está ativa.
  setInterval(() => {
    const cat = state.siteInfo ? state.siteInfo.id : null;
    if (cat !== lastSiteCategory) {
      lastSiteCategory = cat;
      siteCategorySince = performance.now();
    }
    if (!eligible()) return;
    const q = pickQuestion();
    if (!q) {
      scheduleNext(); // tudo respondido — tenta de novo bem mais tarde
      return;
    }
    askNow(q);
  }, 5000);
}
