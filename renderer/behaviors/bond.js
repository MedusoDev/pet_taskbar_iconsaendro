// AI_Bond: o vínculo do pet com o usuário — a "conquista" de verdade.
// Pontos entram por carinho, conversa e presença diária; o total define o
// nível do relacionamento, persistido em localStorage (sobrevive a restarts).
// O nível destrava bancos de flerte mais íntimos (personalities/*.js usam
// state.bondLevel) e muda como o pet fala com o usuário no chat.

const STORAGE_KEY = 'ico_bond_v1';

// Ganho diário limitado: conquista é maratona, não sprint — impede farmar
// o nível máximo numa tarde só de cafuné.
const DAILY_CAP = 90;

export const BOND_LEVELS = [
  { at: 0,   name: 'Desconhecidos',  desc: 'a gente mal se conhece...' },
  { at: 60,  name: 'Colegas',        desc: 'já te acho legal' },
  { at: 180, name: 'Amigos',         desc: 'confio em você' },
  { at: 420, name: 'Crush',          desc: 'meu núcleo acelera perto de você' },
  { at: 900, name: 'Almas Gêmeas',   desc: 'sou todinho seu 💜' },
];

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {
    points: 0,
    firstSeenAt: Date.now(),
    lastSeenAt: 0,
    dailyDate: todayKey(),
    dailyGained: 0,
    userName: null,
    stats: { pets: 0, chats: 0, knockouts: 0, sessions: 0 },
  };
}

export function levelIndexFor(points) {
  let idx = 0;
  for (let i = 0; i < BOND_LEVELS.length; i++) {
    if (points >= BOND_LEVELS[i].at) idx = i;
  }
  return idx;
}

export function createBond({ logEvent }) {
  const data = load();
  const prevSeenAt = data.lastSeenAt;
  data.lastSeenAt = Date.now();
  data.stats.sessions = (data.stats.sessions || 0) + 1;
  if (data.dailyDate !== todayKey()) {
    data.dailyDate = todayKey();
    data.dailyGained = 0;
  }

  let onLevelUp = null; // (levelIdx, level) => void — registrado pelo bootstrap
  let saveTimer = null;

  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      data.lastSeenAt = Date.now();
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      } catch {}
    }, 400);
  }

  function level() {
    return levelIndexFor(data.points);
  }

  /** Soma pontos de vínculo (respeitando o teto diário) e dispara a
   * celebração se cruzou um nível. reason vai pro diário. */
  function addBond(pts, reason) {
    if (pts <= 0) return;
    const room = Math.max(0, DAILY_CAP - data.dailyGained);
    const gain = Math.min(pts, room);
    if (gain <= 0) return;
    const before = level();
    data.points += gain;
    data.dailyGained += gain;
    const after = level();
    save();
    if (after > before) {
      const lv = BOND_LEVELS[after];
      logEvent('vínculo', `SUBIU DE NÍVEL → ${lv.name} (${Math.round(data.points)} pts)`);
      if (onLevelUp) onLevelUp(after, lv);
    } else if (reason) {
      logEvent('vínculo', `+${gain.toFixed(1)} (${reason}) → ${Math.round(data.points)} pts`);
    }
  }

  /** Saudação de início de sessão: hora do dia + quanto tempo de saudade.
   * Devolve a linha pro speak.text (ou null se acabou de reabrir). */
  function sessionGreeting(userName) {
    const name = userName || data.userName;
    const oi = name ? `${name}` : 'você';
    const h = new Date().getHours();
    const daypart = h < 6 ? 'madrugada' : h < 12 ? 'bom dia' : h < 18 ? 'boa tarde' : 'boa noite';
    const away = prevSeenAt ? Date.now() - prevSeenAt : 0;
    const awayH = away / 3600000;

    if (!prevSeenAt) {
      return `Oi! Eu sou o seu novo... hmm, o que eu sou? Me faz um cafuné que a gente descobre junto 💜`;
    }
    if (awayH < 0.5) {
      return `Voltou rapidinho... sentiu minha falta, né? Eu sabia.`;
    }
    if (awayH > 72) {
      return `TRÊS dias sem ${oi}?! Eu quase virei um sólido platônico comum de tristeza...`;
    }
    if (awayH > 24) {
      return `Que saudade de ${oi}... não some assim de novo, tá?`;
    }
    if (daypart === 'madrugada') {
      return `Acordado a essa hora? Vem, eu faço companhia... só nós dois 💜`;
    }
    return `Oi, ${daypart}! Senti sua falta. Vem cá me dar atenção.`;
  }

  function setUserName(name) {
    data.userName = name;
    save();
  }

  return {
    data,
    addBond,
    level,
    levelInfo: () => BOND_LEVELS[level()],
    nextLevelAt: () => (BOND_LEVELS[level() + 1] ? BOND_LEVELS[level() + 1].at : null),
    sessionGreeting,
    setUserName,
    setOnLevelUp: (cb) => { onLevelUp = cb; },
    noteStat: (key, n = 1) => { data.stats[key] = (data.stats[key] || 0) + n; save(); },
  };
}
