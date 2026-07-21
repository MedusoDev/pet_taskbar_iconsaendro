// ── AI_Chat (Groq): a chamada de API do chat ao vivo ──
// Sem apiKey, retorna { unavailable: true } pro renderer cair no cérebro
// local (brain.js). Com erro na chamada ou resposta vazia, retorna { error }
// pelo mesmo motivo.
const { logConversation } = require('../conversationLog');

async function askGroq(text, context, { apiKey, model, systemPrompt }) {
  if (!apiKey) return { unavailable: true };

  const contextLine = context ? `[contexto: ${context}]\n` : '';

  let data;
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `${contextLine}${text}` },
        ],
        max_tokens: 300,
      }),
    });
    if (!response.ok) {
      console.log(`[pet] chat Groq falhou: HTTP ${response.status}`);
      return { error: `HTTP ${response.status}` };
    }
    data = await response.json();
  } catch (err) {
    const name = err && err.constructor ? err.constructor.name : 'Erro';
    console.log(`[pet] chat Groq falhou: ${name} — ${err && err.message}`);
    return { error: name };
  }

  const reply = data?.choices?.[0]?.message?.content?.trim();
  if (!reply) {
    console.log('[pet] chat Groq falhou: resposta vazia');
    return { error: 'resposta vazia' };
  }

  logConversation(text, reply);
  return { text: reply };
}

module.exports = { askGroq };
