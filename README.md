# Icozinho — pet de taskbar com alma 💜

Um icosaedro 3D de estimação que vive em cima da taskbar do Windows.
Ele passeia entre monitores (e pousa na barra quando está de boa), dorme,
medita, fica carente, flerta, conversa, faz perguntas sobre você, observa o
que você navega e cuida da saúde do seu PC.

## Rodando (dev)

```
npm install
npm start
```

## Como programa (o jeito definitivo)

```
npm run dist        # gera dist/Icozinho-2.0.0.exe (portátil, um arquivo só)
```

- Ícone próprio na **bandeja do sistema** com menu: *Iniciar com o Windows*,
  *Reiniciar o pet*, *Abrir pasta de configuração* e *Fechar*.
- A configuração (`pet.config.json`) mora em `%APPDATA%/Icozinho/` — o menu
  da bandeja abre a pasta. Vínculo e memórias ficam lá também.
- A janela do pet nunca aparece na taskbar nem rouba foco no hover — o foco
  de teclado só existe com o chat/pergunta abertos.

## O que ele faz

### Corpo & vida (Three.js)
- **Passeia** pela borda de baixo de todos os monitores (chão por tela).
- **Cafuné**: esfregue o mouse em cima dele (vai-e-vem). Barra de carinho +
  coração com aura de supercarga.
- **Colo**: arraste com o botão esquerdo. Segurando, **botão direito**
  pergunta se ele deve ficar estacionado ali.
- **Tédio**: tiques, espreguiçada, evento de shutdown, sono, e **modo Zen**
  (respiração imóvel → aura dourada) depois de 1min parado.
- **Modo Excited**: carinho demais (ou... veja Ico_Eye abaixo) deixa ele
  elétrico — persegue o mouse com heartbeat "tum-tum", corações flutuando,
  glow rosa pulsante, shimmy de 3 tempos, e um final que termina em respingo,
  vergonha, **afterglow derretido** ou nocaute de amor (z z z).

### AI_Chat — conversa de verdade (duplo-clique nele)
- **Duplo-clique** no pet abre o painel de chat.
- Sem configurar nada: **cérebro local** em PT-BR — intents dinâmicos
  (status do PC, vínculo, nome...) + um **lorebook** com dezenas de assuntos
  (música, filmes, animes, games, comida, filosofia, conselhos, futebol,
  segredos, flerte e spicy que escalam com o vínculo). 100% offline.
- Também lembra do **assunto atual** da conversa por alguns minutos
  (`topicTracker.js`), então não precisa repetir o tema a cada mensagem.
- Com a **API da Groq** configurada, ele responde com IA de verdade, com a
  persona dele + contexto vivo (humor, vínculo, site ativo, RAM/CPU, hora,
  tópico atual). Crie um `pet.config.json` na raiz (gitignored):

```json
{
  "groqApiKey": "gsk_...",
  "petName": "Ico",
  "userName": "SeuNome"
}
```

  (`GROQ_API_KEY` no ambiente também funciona. Também dá pra configurar pela
  janela de Configurações, aba "IA/Chat", sem editar arquivo nenhum.)

### AI_Curiosity + AI_Memory — ele te conhece de verdade
- De tempos em tempos (a cada ~9–16min, com você presente) ele fica curioso
  e **faz uma pergunta** num balão com campo de resposta: gerais (cor, comida,
  hobby, sonho...), sobre o site ativo (canal favorito no YouTube, jogo do
  momento...) e — com vínculo — as **perguntas 🔞** quando o assunto é adulto.
- Cada resposta vai pro **banco de memórias local** (localStorage): o cérebro
  local menciona de volta ("ainda gosta de X?"), o chat com IA recebe tudo
  como contexto, e "o que você sabe sobre mim?" lista o dossiê.

### AI_Bond — ele te conquista aos poucos
- Pontos de vínculo por cafuné, conversa e presença diária (com teto diário —
  conquista é maratona). Persistido entre sessões.
- Níveis: **Desconhecidos → Colegas → Amigos → Crush → Almas Gêmeas**, com
  celebração de level-up (faíscas + anel + corações) e flerte espontâneo que
  fica mais íntimo a cada nível.
- Saudação ao abrir: hora do dia + quanto tempo de saudade.
- Pergunte no chat: "qual nosso vínculo?"

### Ico_Eye — ele vê o que você navega
Observa a janela ativa (navegadores + Spotify/Discord/VS Code/Steam) e reage
com cor, ícone e comentário por categoria: YouTube, streaming, GitHub, docs,
e-mail, redes sociais, X, mensagens, compras, games, estudos, notícias...
- **Outra IA** (ChatGPT & cia): ciúmes. Girada seca de indignação.
- **Conteúdo adulto** 🔞: ele fica vermelho, finge que não viu, e a aura de
  excitação enche sozinha... ~35s depois ele "liga" o modo Excited e a culpa
  é toda sua.

### Ico_Guard — ele cuida do seu PC
- RAM alta, CPU sustentada, bateria fraca e uptime de 7+ dias geram avisos
  espontâneos (com cooldown), na voz da personalidade ativa.
- No chat: "como tá o pc?" / "ram" / "status" → relatório completo com
  recomendação.

## Arquitetura

```
main.js               processo Electron: janela, cursor global, janela ativa,
                      stats de sistema, chat com a API da Groq
preload.js            ponte IPC (contextBridge)
renderer/
  movement.js         bootstrap + loop principal (fiação de tudo)
  scene.js            cena Three.js (FacetGem: 80 faces, luzes, paletas)
  behaviors/
    state.js            estado central compartilhado
    personalityState.js máquina Normality ⇄ Zen ⇄ Excited (+afterglow, arousal)
    liveAnimation.js    composição de pose por frame (heartbeat, hearts, glow)
    wander.js           pairar/viajar (Poisson, chão por monitor)
    boredom.js          relógio de tédio (tiques → zen → sono)
    interactions.js     mouse: cutucar, arrastar, cafuné, chat (dblclick)
    speech.js           balão de fala (bancos + texto livre)
    chat.js             painel de conversa
    brain.js            cérebro local PT-BR (intents)
    bond.js             vínculo persistente (níveis, saudação)
    siteEye.js          categorias de site/app + reações
    sysMonitor.js       RAM/CPU/bateria/uptime + avisos
    effects.js          gotículas, corações, anel, faíscas, blush
    affectionBar.js     barrinha de carinho
    prompt.js           balão de pergunta clicável
    shutdown.js         evento shutdown / nocaute
  personalities/        Normality, Zen, Excited (paleta, movimento, falas)
```
