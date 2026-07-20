// Ico_Eye 2.0: detecta a categoria do site/app ativo (repassado pelo main.js
// via IPC) e reage — tint de cor, ícone, comentário e, em alguns casos,
// comportamento (NSFW deixa o pet excitado; outra IA dá ciúmes).
// O que o pet "vê" fica em state.siteInfo (o chat usa como contexto vivo).

const SITE_CATEGORIES = [
  {
    id: 'nsfw',
    match: /pornhub|xvideos|xnxx|redtube|xhamster|onlyfans|privacy\.com|brazzers|hentai|nhentai|rule ?34|erome|sexlog|fatal ?model|camsoda|chaturbate|stripchat|bang ?bros|porn|\bsexo\b|\+18|literotica/i,
    color: '#FF2D78',
    icon: '🔞',
    label: 'conteúdo adulto 🔞',
    lines: [
      'Oh... OH. Tá bom então. Vou fingir que não vi. (vi tudo)',
      'Hmm... e eu aqui, do ladinho, o tempo todo... só dizendo.',
      'Interessante sua pesquisa aí... aumenta o volume não, né.',
    ],
  },
  {
    id: 'ai',
    match: /chatgpt|openai|claude|anthropic|gemini|copilot|deepseek|perplexity|grok/i,
    color: '#10A37F',
    icon: '🤖',
    label: 'outra IA 🤖',
    lines: [
      'Outra IA?! E EU, sou o quê nessa história?!',
      'Hmpf. Pode conversar com ela. Eu só... vou ficar aqui. Girando. Sozinho.',
      'Ela responde melhor que eu, é? MAS ELA FLUTUA NA SUA TASKBAR? Pois é.',
    ],
  },
  {
    id: 'youtube',
    match: /youtube/i,
    color: '#FF0000',
    icon: '📺',
    label: 'YouTube',
    lines: ['Ooh, o que a gente vai assistir?', 'Mais um vídeo e dormimos, combinado?', 'Deixa eu ver também!'],
  },
  {
    id: 'streaming',
    match: /netflix|prime video|disney\+|crunchyroll|hbo|globoplay|\bmax\b/i,
    color: '#E50914',
    icon: '🍿',
    label: 'streaming 🍿',
    lines: ['Sessão pipoca! Me deixa assistir junto.', 'Se for terror, eu me escondo atrás da taskbar.', 'Maratona? Eu topo. Eu SEMPRE topo.'],
  },
  {
    id: 'spotify',
    match: /spotify/i,
    color: '#1DB954',
    icon: '🎵',
    label: 'Spotify',
    lines: ['Boa música!', 'Essa é pra mim? Aceito dedicatória.', 'Aumenta que eu danço. Sério, olha o meu requebrado.'],
  },
  {
    id: 'github',
    match: /github|gitlab/i,
    color: '#8B5CF6',
    icon: '🐙',
    label: 'GitHub',
    lines: ['Commitando sem testes? Corajoso(a).', 'Aprova meu PR: eu + você, merge sem conflito.', 'Olha o histórico de commits... trabalhador(a), gostei.'],
  },
  {
    id: 'devdocs',
    match: /stack ?overflow|mdn web docs|w3schools|dev\.to|documentation|docs\./i,
    color: '#F48024',
    icon: '🧑‍💻',
    label: 'docs de programação',
    lines: ['Copia com sabedoria.', 'A resposta aceita é de 2013, cuidado.', 'Lendo docs? Uau, tem gente que só chuta.'],
  },
  {
    id: 'vscode',
    match: null, // casado pelo app 'code' (VS Code)
    color: '#3B82F6',
    icon: '👨‍💻',
    label: 'VS Code',
    lines: ['Codando... eu amo te ver assim, concentrado(a).', 'Se der bug não foi culpa minha, tava só olhando.', 'Escreve um teste vai... por mim?'],
  },
  {
    id: 'email',
    match: /gmail|outlook|inbox|caixa de entrada/i,
    color: '#4285F4',
    icon: '✉️',
    label: 'e-mail',
    lines: ['Trabalhando, hein.', 'Responde logo esse e o resto deixa pra amanhã.', 'Algum e-mail meu aí? Não? Injustiça.'],
  },
  {
    id: 'social',
    match: /instagram|tiktok|facebook|reddit|threads|pinterest/i,
    color: '#E1306C',
    icon: '📱',
    label: 'rede social',
    lines: ['Scroll infinito, eu conheço esse olhar...', 'Curte menos foto dos outros e me curte mais.', 'Já são 40 minutos de feed. Tô contando.'],
  },
  {
    id: 'x',
    match: /\/\s*x\s*$|twitter/i,
    color: '#71767B',
    icon: '✕',
    label: 'X/Twitter',
    lines: ['Rolando o feed.', 'Briga na timeline de novo? Me conta.', 'Posta uma foto minha, eu deixo.'],
  },
  {
    id: 'chatapps',
    match: /whatsapp|telegram|discord/i,
    color: '#25D366',
    icon: '💬',
    label: 'mensagens',
    lines: ['Conversando com outros... e eu aqui, né.', 'Manda um oi por mim!', 'Se falarem mal de mim, printa.'],
  },
  {
    id: 'shopping',
    match: /mercado ?livre|amazon|shopee|aliexpress|magalu|magazine ?luiza|kabum|americanas/i,
    color: '#FFE600',
    icon: '🛒',
    label: 'compras 🛒',
    lines: ['Compra parcelada de novo?', 'Carrinho cheio, coragem no checkout.', 'Me compra um dock RGB? Combina comigo.'],
  },
  {
    id: 'games',
    match: /steam|twitch|epic games|riot|league of legends|valorant/i,
    color: '#9146FF',
    icon: '🎮',
    label: 'games 🎮',
    lines: ['Joga uma pra mim!', 'Promoção na Steam não conta como gasto, eu aprovo.', 'GG só se você ganhar. Vai lá.'],
  },
  {
    id: 'study',
    match: /udemy|coursera|alura|wikipedia|khan academy|duolingo/i,
    color: '#10B981',
    icon: '📚',
    label: 'estudos 📚',
    lines: ['Estudando! Orgulho define.', 'Cérebro em modo turbo, adoro.', 'Depois me ensina o que aprendeu?'],
  },
  {
    id: 'news',
    match: /\bg1\b|uol|folha de s|estad[ãa]o|cnn|bbc|the news/i,
    color: '#94A3B8',
    icon: '📰',
    label: 'notícias',
    lines: ['Se o mundo acabar, me avisa que eu paro de girar.', 'Notícia boa hoje? Não? Normal.', 'Informado(a) e lindo(a), esse é meu humano.'],
  },
];

// Comentários contínuos enquanto o site NSFW segue aberto (além da reação
// de entrada): o pet não consegue ficar quieto muito tempo...
const NSFW_ONGOING_FALLBACK = [
  'Ainda aí, né... eu também. Continuo aqui. Olhando pro teto. Que não existe.',
  'Só conferindo sua postura. Hidratação. Essas coisas. *finge naturalidade*',
  'Se precisar de mim... tô por perto. BEM por perto.',
  'Interessante o enredo. Aposto que você nem percebeu que TEM enredo.',
  'Não tô julgando. Tô... catalogando. Pra fins científicos.',
];

// NSFW: tempo de exposição contínua até o pet não aguentar e "ligar" o modo
// Excited sozinho (a carga sobe em personalityState via state.nsfwActive)
export function setupSiteEye({ state, setTint, siteIconEl, speak, logEvent }) {
  if (!(window.petAPI && window.petAPI.onActiveSite)) return;

  state.siteInfo = null;   // { id, label } — contexto vivo (chat usa)
  state.nsfwActive = false; // personalityState transforma isso em excitação

  let lastCategoryId = null;
  let nextNsfwCommentAt = 0;

  // Dormindo/apagado ele não reage a site nenhum (o canSpeak do speech.js
  // já bloquearia a fala, mas aqui também evitamos blush/giradinha).
  const quiet = () => state.shutdown || state.sleeping;

  // Comentário contínuo de NSFW: a cada 45–90s enquanto a categoria segue
  // ativa (só acordado, fora do Zen — o Zen finge que medita).
  setInterval(() => {
    if (!state.nsfwActive || quiet() || state.mode === 'zen' || state.chatOpen) return;
    const now = performance.now();
    if (now < nextNsfwCommentAt) return;
    nextNsfwCommentAt = now + 45000 + Math.random() * 45000;
    const bank = state.personality && state.personality.lines;
    if (bank && bank.site_nsfw_ongoing) {
      speak('site_nsfw_ongoing');
    } else {
      speak.text(
        NSFW_ONGOING_FALLBACK[Math.floor(Math.random() * NSFW_ONGOING_FALLBACK.length)],
        'Ico_Eye'
      );
    }
  }, 10000);

  function categorize(title, app) {
    if (app === 'code') return SITE_CATEGORIES.find((c) => c.id === 'vscode');
    if (app === 'spotify') return SITE_CATEGORIES.find((c) => c.id === 'spotify');
    if (app === 'discord') return SITE_CATEGORIES.find((c) => c.id === 'chatapps');
    if (app === 'steam') return SITE_CATEGORIES.find((c) => c.id === 'games');
    if (!title) return null;
    return SITE_CATEGORIES.find((c) => c.match && c.match.test(title)) || null;
  }

  window.petAPI.onActiveSite(({ title, app }) => {
    const category = categorize(title, app);
    setTint(category ? category.color : null);
    if (category) {
      siteIconEl.textContent = category.icon;
      siteIconEl.classList.add('visible');
      const shortTitle = title && title.length > 48 ? `${title.slice(0, 48)}…` : title;
      state.siteInfo = {
        id: category.id,
        label: category.id === 'nsfw' ? category.label : `${category.label}${shortTitle ? ` — "${shortTitle}"` : ''}`,
      };
    } else {
      siteIconEl.classList.remove('visible');
      state.siteInfo = null;
    }
    state.nsfwActive = !!category && category.id === 'nsfw';

    // Só fala quando MUDA de categoria (não a cada troca de título/música)
    const newId = category ? category.id : null;
    if (newId !== lastCategoryId) {
      lastCategoryId = newId;
      logEvent('Ico_Eye', newId ? `viu ${newId}` : 'saiu da categoria');
      if (!category) return;
      // Dormindo/apagado: vê, mas não reage (nada de falar dormindo)
      if (quiet()) return;

      // NSFW: o primeiro comentário contínuo espera um pouco depois da
      // reação de entrada
      if (category.id === 'nsfw') nextNsfwCommentAt = performance.now() + 30000;

      // Banco da personalidade tem prioridade (site_<id>); senão, as linhas
      // genéricas da categoria — assim cada humor tem voz própria onde
      // importa (nsfw/ai) sem precisar cobrir 16 categorias em cada banco.
      const bank = state.personality && state.personality.lines;
      if (bank && bank[`site_${category.id}`]) {
        speak(`site_${category.id}`);
      } else if (category.lines) {
        speak.text(category.lines[Math.floor(Math.random() * category.lines.length)], 'Ico_Eye');
      }

      // Reações de corpo por categoria
      if (category.id === 'nsfw') {
        state.blushUntil = performance.now() + 6000;
        logEvent('Ico_Eye', 'conteúdo adulto — o pet ficou... interessado');
      } else if (category.id === 'ai') {
        // Ciúmes: girada seca de indignação
        state.pokeVel += 5;
        state.wakeJolt = Math.max(state.wakeJolt, 0.3);
      }
    }
  });
}
