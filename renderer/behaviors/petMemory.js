// AI_Memory: o banco de dados local do que o pet sabe sobre o usuário.
// Cada memória nasce de uma pergunta que ele fez (curiosity.js) e o usuário
// respondeu — persistida em localStorage, usada pelo cérebro local (brain.js
// menciona de volta), pelo contexto do chat com IA e pelas provocações.

const STORAGE_KEY = 'ico_memory_v1';
const MAX_MEMORIES = 60;

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { entries: [] }; // { id, label, question, answer, at }
}

export function createPetMemory({ logEvent }) {
  const data = load();

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {}
  }

  /** Guarda (ou atualiza) uma memória. label = nome curto legível
   * ("cor favorita"), answer = o que o usuário respondeu. */
  function remember(id, label, question, answer) {
    const clean = (answer || '').trim().slice(0, 120);
    if (!clean) return;
    const existing = data.entries.find((e) => e.id === id);
    if (existing) {
      existing.answer = clean;
      existing.at = Date.now();
    } else {
      data.entries.push({ id, label, question, answer: clean, at: Date.now() });
      if (data.entries.length > MAX_MEMORIES) data.entries.shift();
    }
    save();
    logEvent('memória', `guardou: ${label} = "${clean}"`);
  }

  function recall(id) {
    const e = data.entries.find((m) => m.id === id);
    return e ? e.answer : null;
  }

  function has(id) {
    return data.entries.some((m) => m.id === id);
  }

  /** As mais recentes primeiro. */
  function list(limit = 6) {
    return [...data.entries].sort((a, b) => b.at - a.at).slice(0, limit);
  }

  function random() {
    if (!data.entries.length) return null;
    return data.entries[Math.floor(Math.random() * data.entries.length)];
  }

  function count() {
    return data.entries.length;
  }

  /** Linha compacta pro contexto do chat com IA. */
  function contextLine(limit = 5) {
    const items = list(limit).map((m) => `${m.label}=${m.answer}`);
    return items.length ? items.join('; ') : null;
  }

  return { remember, recall, has, list, random, count, contextLine };
}
