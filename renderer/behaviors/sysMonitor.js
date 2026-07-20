// Ico_Guard: o pet cuidando do computador do usuário. Recebe RAM/CPU/uptime
// do main.js (a cada 5s), guarda em state.sysStats, avisa espontaneamente
// quando algo passa do ponto (com cooldown pra não virar alarme de carro) e
// formata o relatório completo pro chat ("como tá o pc?").

const RAM_WARN_PCT = 0.88;      // acima disso: aviso
const CPU_WARN_PCT = 0.85;      // sustentado por 3 amostras (15s): aviso
const WARN_COOLDOWN_MS = 10 * 60 * 1000; // 10min entre avisos do mesmo tipo
const BATTERY_WARN_LEVEL = 0.2;
const UPTIME_NAG_DAYS = 7;      // 7+ dias ligado → sugestão de reiniciar (1x/sessão)

export function setupSysMonitor({ state, speak, logEvent, effects, getGemPos }) {
  state.sysStats = null;
  let cpuHighStreak = 0;
  const lastWarnAt = { ram: 0, cpu: 0, battery: 0 };
  let uptimeNagged = false;
  let battery = null;

  // Bateria (notebooks): API do Chromium no renderer
  if (navigator.getBattery) {
    navigator.getBattery().then((b) => { battery = b; }).catch(() => {});
  }

  function warnLine(key) {
    // Linhas por personalidade (cai no banco da ativa; fallback genérico)
    const bank = state.personality && state.personality.lines;
    const lines = bank && bank[key];
    if (lines && lines.length) return lines[Math.floor(Math.random() * lines.length)];
    return null;
  }

  function tryWarn(kind, key, fallback) {
    // Só avisa quando o pet está acordado, ligado e "de boa" (Normality):
    // avisar dormindo/apagado/no meio do Zen ou do Excited brigava com as
    // poses desses estados. O cooldown NÃO é consumido — o aviso espera a
    // próxima amostra em que ele puder falar.
    if (state.shutdown || state.sleeping || state.mode !== 'normality' || state.chatOpen) return;
    const now = performance.now();
    if (now - lastWarnAt[kind] < WARN_COOLDOWN_MS) return;
    lastWarnAt[kind] = now;
    const line = warnLine(key) || fallback;
    speak.text(line, 'Ico_Guard');
    // Pulinho de alerta pra chamar o olho junto com o balão
    state.wakeJolt = Math.max(state.wakeJolt, 0.4);
    state.pokeVel += 3;
  }

  if (window.petAPI && window.petAPI.onSysStats) {
    window.petAPI.onSysStats((stats) => {
      state.sysStats = stats;

      // RAM alta
      if (stats.memUsedPct >= RAM_WARN_PCT) {
        tryWarn(
          'ram',
          'sys_ram_high',
          `Ei... sua RAM tá em ${Math.round(stats.memUsedPct * 100)}%! Fecha umas abas por mim?`
        );
      }

      // CPU alta sustentada (picos curtos são normais)
      if (stats.cpuPct >= CPU_WARN_PCT) {
        cpuHighStreak++;
        if (cpuHighStreak >= 3) {
          cpuHighStreak = 0;
          tryWarn(
            'cpu',
            'sys_cpu_high',
            `Seu processador tá suando: ${Math.round(stats.cpuPct * 100)}%. Tô até sentindo o calor daqui...`
          );
        }
      } else {
        cpuHighStreak = 0;
      }

      // Uptime exagerado (1x por sessão; espera um momento em que ele
      // esteja acordado e de boa pra comentar)
      if (
        !uptimeNagged && stats.uptimeSec > UPTIME_NAG_DAYS * 86400 &&
        !state.shutdown && !state.sleeping && state.mode === 'normality' && !state.chatOpen
      ) {
        uptimeNagged = true;
        const days = Math.floor(stats.uptimeSec / 86400);
        speak.text(
          `Sabia que esse PC tá ${days} dias sem reiniciar? Até eu preciso dormir de vez em quando...`,
          'Ico_Guard'
        );
      }

      // Bateria fraca descarregando
      if (battery && !battery.charging && battery.level <= BATTERY_WARN_LEVEL) {
        tryWarn(
          'battery',
          'sys_battery_low',
          `Bateria em ${Math.round(battery.level * 100)}%! Me conecta na tomada... digo, conecta o notebook.`
        );
      }
    });
  }

  /** Relatório completo em texto (pro chat: "como tá o pc?"). */
  function formatReport() {
    const s = state.sysStats;
    if (!s) return 'Ainda tô medindo tudo aqui... me pergunta de novo em uns segundos.';
    const ramPct = Math.round(s.memUsedPct * 100);
    const cpuPct = Math.round(s.cpuPct * 100);
    const upH = s.uptimeSec / 3600;
    const uptime = upH < 24 ? `${upH.toFixed(1)}h ligado` : `${(upH / 24).toFixed(1)} dias ligado`;

    let mood;
    if (ramPct > 88 || cpuPct > 85) mood = 'Tá pesado por aqui... fecha alguma coisa, vai. 🥵';
    else if (ramPct > 70 || cpuPct > 60) mood = 'Trabalhando firme, mas sob controle.';
    else mood = 'Tá uma brisa, seu PC tá voando. ✨';

    let batLine = '';
    if (battery && battery.level < 1 && !battery.charging) {
      batLine = ` | bateria ${Math.round(battery.level * 100)}%`;
    }

    return (
      `RAM ${s.memUsedGb.toFixed(1)}/${s.memTotalGb.toFixed(0)}GB (${ramPct}%) · ` +
      `CPU ${cpuPct}% · ${uptime}${batLine}. ${mood}`
    );
  }

  return { formatReport };
}
