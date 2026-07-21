// AI_Live: balão de fala com FILA — uma fala nunca atropela a outra.
// Toda fala tem um tempo mínimo de leitura na tela; o que chegar nesse meio
// tempo espera na fila (texto livre/importante) ou é descartado (falas
// ambientes de banco, que sempre voltam a acontecer). speak.text entra na
// fila; speak(banco) só fala com o balão livre.
//
// Prioridade de UI (ver liveAnimation.js e index.html): o painel de chat e o
// balão de pergunta (prompt.js) ocupam o mesmo canto acima do gem que este
// balão — nunca podem ficar escondidos atrás dele. `suppressBank` recusa
// falas de banco novas enquanto um dos dois está ativo; o balão em si (fila
// e cooldown inclusos) continua vivo por baixo e some visualmente via CSS
// (classe `.suppressed`), sem perder o que já estava na fila.

const SPEECH_COOLDOWN = 6000;  // ms mínimo entre falas de banco
const SPEECH_DURATION = 3500;  // ms visível na tela (falas curtas de banco)
const MIN_READ_MS = 2600;      // uma fala segura o balão pelo menos isso
const QUEUE_GAP_MS = 400;      // respiro entre uma fala e a próxima da fila
const QUEUE_MAX = 2;           // fila curta: mais que isso vira ruído
// force fura o cooldown normal, mas ainda respeita um vão mínimo — senão em
// cadeias de eventos (vergonha → respingo → rubor) uma fala atropela a outra
// antes de dar tempo de ler.
const FORCE_MIN_GAP = 1500;

export function createSpeech({ speechEl, logEvent, getPersonality, canSpeak, suppressBank }) {
  let lastSpeakAt = 0;
  let holdUntil = 0;      // até quando a fala atual não pode ser substituída
  let hideTimer = null;
  let queue = [];         // [{ text, tag }]

  function show(line, durationMs) {
    speechEl.textContent = line;
    speechEl.classList.add('visible');
    holdUntil = performance.now() + Math.min(durationMs, MIN_READ_MS);
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      speechEl.classList.remove('visible');
      drainQueue();
    }, durationMs);
  }

  function durationFor(text) {
    return Math.min(12000, Math.max(3500, 1800 + text.length * 55));
  }

  function drainQueue() {
    const next = queue.shift();
    if (!next) return;
    setTimeout(() => {
      // O mundo pode ter mudado no meio tempo (apagou/caiu): rechecar
      if (canSpeak && !canSpeak()) {
        queue = [];
        return;
      }
      lastSpeakAt = performance.now();
      logEvent(next.tag, `"${next.text}" (da fila)`);
      show(next.text, durationFor(next.text));
    }, QUEUE_GAP_MS);
  }

  function busy() {
    return performance.now() < holdUntil;
  }

  function speak(triggerKey, force = false) {
    // Apagado/caindo (shutdown/nocaute) ele NÃO fala — qualquer evento
    // assíncrono (site mudou, RAM alta, level-up) espera ele religar.
    if (canSpeak && !canSpeak()) return;
    // Chat aberto ou pergunta na tela: fala de banco cede o balão (prioridade
    // de UI — ver liveAnimation.js) em vez de gastar cooldown numa fala que
    // ninguém vai ver.
    if (suppressBank && suppressBank()) return;
    // Balão ocupado: fala ambiente é descartada (sempre volta a acontecer)
    if (busy()) return;
    const now = performance.now();
    if (now - lastSpeakAt < (force ? FORCE_MIN_GAP : SPEECH_COOLDOWN)) return;

    // Gatilhos "_parked" caem no banco base se a personalidade não tiver
    // linhas próprias pra versão estacionada (ex.: petting_parked → petting).
    const bank = getPersonality().lines;
    let lines = bank[triggerKey];
    if ((!lines || lines.length === 0) && triggerKey.endsWith('_parked')) {
      lines = bank[triggerKey.slice(0, -'_parked'.length)];
    }
    if (!lines || lines.length === 0) return;

    lastSpeakAt = now;
    const line = lines[Math.floor(Math.random() * lines.length)];
    logEvent('fala', `"${line}" (gatilho: ${triggerKey})`);
    show(line, SPEECH_DURATION);
  }

  /** Texto importante (chat, avisos, curiosidade, vínculo): se o balão está
   * ocupado, entra na FILA e aparece assim que a fala atual terminar — nunca
   * atropela, nunca se perde (até o limite da fila). */
  speak.text = function speakText(text, tag = 'fala_livre') {
    if (!text) return;
    if (canSpeak && !canSpeak()) return;
    if (busy()) {
      if (queue.length >= QUEUE_MAX) queue.shift(); // derruba a mais antiga
      queue.push({ text, tag });
      return;
    }
    lastSpeakAt = performance.now();
    logEvent(tag, `"${text}"`);
    show(text, durationFor(text));
  };

  /** Corta a fala atual e a fila na hora (o pet apagou/caiu). */
  speak.hide = function hideSpeech() {
    clearTimeout(hideTimer);
    queue = [];
    holdUntil = 0;
    speechEl.classList.remove('visible');
  };

  return speak;
}
