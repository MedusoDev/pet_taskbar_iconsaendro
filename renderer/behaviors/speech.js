// AI_Live: balão de fala. Sorteia uma linha do banco da personalidade ativa
// pro gatilho pedido, respeitando um cooldown mínimo entre falas.

const SPEECH_COOLDOWN = 6000; // ms mínimo entre falas
const SPEECH_DURATION = 3500; // ms visível na tela
// force fura o cooldown normal, mas ainda respeita um vão mínimo — senão em
// cadeias de eventos (vergonha → respingo → rubor) uma fala atropela a outra
// antes de dar tempo de ler.
const FORCE_MIN_GAP = 1500;

export function createSpeech({ speechEl, logEvent, getPersonality }) {
  let lastSpeakAt = 0;
  let speechHideTimer = null;
  // Última fala sorteada por gatilho, pra não repetir a mesma duas vezes
  // seguidas (importante nos bancos grandes como lines.ambient).
  const lastLineByTrigger = new Map();

  return function speak(triggerKey, force = false) {
    const now = performance.now();
    if (now - lastSpeakAt < (force ? FORCE_MIN_GAP : SPEECH_COOLDOWN)) return;

    const lines = getPersonality().lines[triggerKey];
    if (!lines || lines.length === 0) return;

    lastSpeakAt = now;
    // Sorteia sem repetir a última do mesmo gatilho (quando há alternativa)
    let line = lines[Math.floor(Math.random() * lines.length)];
    if (lines.length > 1 && line === lastLineByTrigger.get(triggerKey)) {
      line = lines[(lines.indexOf(line) + 1) % lines.length];
    }
    lastLineByTrigger.set(triggerKey, line);
    logEvent('fala', `"${line}" (gatilho: ${triggerKey})`);
    speechEl.textContent = line;
    speechEl.classList.add('visible');

    clearTimeout(speechHideTimer);
    speechHideTimer = setTimeout(() => {
      speechEl.classList.remove('visible');
    }, SPEECH_DURATION);
  };
}
