// ── AI_Chat (Ollama): cérebro rodando local (localhost:11434), alternativa
// grátis/offline ao Groq — precisa do app Ollama instalado e do modelo
// baixado (`ollama pull <modelo>`). Diferente do Groq (cada chamada é
// isolada), aqui a gente guarda um histórico de turnos da sessão pra dar
// continuidade — limitado, já que modelos pequenos (gemma2:2b, llama3.2:3b)
// têm janela de contexto curta.
const { logConversation } = require('../conversationLog');

const OLLAMA_URL = 'http://localhost:11434/api/chat';
const OLLAMA_HISTORY_LIMIT = 12; // mensagens (user+assistant), não tokens
let ollamaHistory = [];

async function askOllama(text, context, { model, systemPrompt }) {
  const contextLine = context ? `[contexto: ${context}]\n` : '';
  const userMessage = { role: 'user', content: `${contextLine}${text}` };

  let data;
  try {
    const response = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: systemPrompt }, ...ollamaHistory, userMessage],
        stream: false,
        // Modelos pequenos (3B) ignoram "máximo 2 frases" do prompt e viajam
        // — num_predict corta na marra pra manter a resposta do tamanho de
        // balãozinho de fala. repeat_penalty ajuda a não fixar num assunto
        // (tipo RAM/CPU) toda hora só porque apareceu no contexto uma vez.
        options: { num_predict: 70, temperature: 0.8, repeat_penalty: 1.2 },
      }),
    });
    if (!response.ok) {
      console.log(`[pet] chat Ollama falhou: HTTP ${response.status}`);
      return { error: `HTTP ${response.status}` };
    }
    data = await response.json();
  } catch (err) {
    const name = err && err.constructor ? err.constructor.name : 'Erro';
    console.log(`[pet] chat Ollama falhou: ${name} — ${err && err.message} (o app Ollama tá rodando?)`);
    return { error: name };
  }

  const reply = data?.message?.content?.trim();
  if (!reply) {
    console.log('[pet] chat Ollama falhou: resposta vazia');
    return { error: 'resposta vazia' };
  }

  ollamaHistory.push(userMessage, { role: 'assistant', content: reply });
  if (ollamaHistory.length > OLLAMA_HISTORY_LIMIT) ollamaHistory = ollamaHistory.slice(-OLLAMA_HISTORY_LIMIT);

  logConversation(text, reply);
  return { text: reply };
}

module.exports = { askOllama };
