// Estado compartilhado entre os módulos do processo main — janelas, chaves
// de API e os parâmetros editáveis ao vivo pela janela de Configurações
// (aba "Sistema"). É um objeto mutável de propósito: `require` cacheia o
// módulo, então todo mundo que dá `require('./state')` enxerga as mesmas
// referências (evita passar win/settingsWin por parâmetro em cascata e
// quebra dependência circular entre petWindow.js e settingsWindow.js).
module.exports = {
  // Janelas (null até serem criadas — ver petWindow.js / settingsWindow.js)
  win: null,
  settingsWin: null,

  // true assim que "Iniciar o pet" foi clicado — a janela do pet só nasce
  // uma vez; cliques repetidos viram no-op (ver petWindow.startPet()).
  petStarted: false,

  // Foco de teclado só existe enquanto chat/pergunta estão abertos no pet
  // (ver petWindow.js, listener 'set-ignore-mouse-events').
  focusHeld: false,

  // ── Ajustes editáveis ao vivo pela aba "Sistema" (persistem em
  // pet.tuning.json — ver config.js) ──
  windowHeight: 480,
  sysPollMs: 5000,
  windowPollMs: 1000,
  // Ico_Eye: apps que o pet "observa" — conteúdo mutável (addWatchedApp/
  // removeWatchedApp em settingsWindow.js), array em si nunca é reatribuído.
  watchedApps: [
    'brave', 'chrome', 'msedge', 'edge', 'firefox', 'opera', 'vivaldi', 'arc',
    'spotify', 'discord', 'code', 'steam',
  ],

  // Chave do Groq — editável ao vivo pela aba "IA/Chat" (ver ai/index.js
  // setApiKey()); troca em memória, próxima chamada já usa a nova.
  groqApiKey: null,

  // pet.tuning.json carregado no boot (ver config.js loadTuning()) — só a
  // parte `renderer` é consultada depois, em petWindow.createWindow().
  tuning: {},
};
