// Diário de conversas: cada pergunta+resposta da API vai pra um JSON em
// userData, pra revisão manual depois — os padrões mais comuns viram
// entradas fixas no lorebook.js (renderer), reduzindo a dependência da API.
const { app } = require('electron');
const path = require('path');
const fs = require('fs');

function logPath() {
  return path.join(app.getPath('userData'), 'conversationLog.json');
}

function logConversation(question, answer) {
  const p = logPath();
  let log = [];
  try {
    const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (Array.isArray(parsed)) log = parsed;
  } catch {}
  log.push({ question, answer, timestamp: new Date().toISOString() });
  try {
    fs.writeFileSync(p, JSON.stringify(log, null, 2));
  } catch (err) {
    console.log(`[pet] falha ao salvar conversationLog.json: ${err && err.message}`);
  }
}

// Lê as últimas `limit` conversas salvas por logConversation() (mais
// recente primeiro) — alimenta a sub-seção "Histórico de conversas" da aba
// IA/Chat da janela de Configurações.
function getConversationLog(limit) {
  try {
    const parsed = JSON.parse(fs.readFileSync(logPath(), 'utf8'));
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(-limit).reverse();
  } catch {
    return [];
  }
}

module.exports = { logConversation, getConversationLog };
