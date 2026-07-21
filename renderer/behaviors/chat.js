// AI_Chat: painel de conversa com o pet (duplo-clique nele abre/fecha).
// Com groqApiKey configurada (pet.config.json), as respostas vêm da API de
// verdade, com a persona do pet e contexto do momento; sem chave (ou se a
// chamada falhar), o cérebro local (brain.js) responde na hora.
// A resposta também sobe no balão de fala, pra conversa viver "no corpo"
// do pet e não só no painel.

import { liveConfig } from './liveConfig.js';
import { trackTopic, topicLabel } from './topicTracker.js';

const MAX_LOG_MESSAGES = 40;

const CSS = `
  #pet-chat {
    position: absolute;
    /* Camada 50 — ver "Camadas de UI" em index.html: a mais alta de todas.
       O painel de conversa nunca pode ficar atrás/embaixo de nenhum outro
       elemento (fala, pergunta, barrinha, decoração). */
    z-index: 50;
    left: 0;
    bottom: 0;
    transform: translateX(-50%);
    display: none;
    flex-direction: column;
    width: 264px;
    max-height: 320px;
    border-radius: 12px;
    background: rgba(16, 11, 26, 0.93);
    border: 1px solid rgba(196, 181, 253, 0.45);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), 0 0 18px rgba(124, 58, 237, 0.25);
    font-family: 'Segoe UI', sans-serif;
    font-size: 12px;
    color: #ede9fe;
    overflow: hidden;
  }
  #pet-chat.visible { display: flex; }

  #pet-chat .chat-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 7px 10px;
    background: rgba(124, 58, 237, 0.18);
    border-bottom: 1px solid rgba(196, 181, 253, 0.25);
    font-weight: 600;
  }
  #pet-chat .chat-head .bond {
    font-size: 10px;
    font-weight: 400;
    color: #c4b5fd;
  }
  #pet-chat .chat-head .close {
    cursor: pointer;
    border: none;
    background: none;
    color: #c4b5fd;
    font-size: 14px;
    line-height: 1;
    padding: 0 2px;
  }
  #pet-chat .chat-head .close:hover { color: #fff; }

  #pet-chat .chat-log {
    flex: 1;
    overflow-y: auto;
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-height: 60px;
    max-height: 210px;
    scrollbar-width: thin;
    scrollbar-color: rgba(124, 58, 237, 0.6) transparent;
  }
  #pet-chat .msg {
    max-width: 88%;
    padding: 5px 9px;
    border-radius: 10px;
    line-height: 1.35;
    white-space: pre-wrap;
    word-wrap: break-word;
  }
  #pet-chat .msg.user {
    align-self: flex-end;
    background: #7c3aed;
    border-bottom-right-radius: 3px;
  }
  #pet-chat .msg.pet {
    align-self: flex-start;
    background: rgba(196, 181, 253, 0.14);
    border: 1px solid rgba(196, 181, 253, 0.2);
    border-bottom-left-radius: 3px;
  }
  #pet-chat .msg.pet.typing { color: #c4b5fd; letter-spacing: 2px; }

  #pet-chat .chat-input {
    display: flex;
    gap: 6px;
    padding: 8px;
    border-top: 1px solid rgba(196, 181, 253, 0.25);
  }
  #pet-chat .chat-input input {
    flex: 1;
    border: 1px solid rgba(196, 181, 253, 0.35);
    border-radius: 8px;
    background: rgba(30, 20, 50, 0.9);
    color: #ede9fe;
    font: 12px 'Segoe UI', sans-serif;
    padding: 5px 8px;
    outline: none;
  }
  #pet-chat .chat-input input:focus { border-color: #a78bfa; }
  #pet-chat .chat-input button {
    cursor: pointer;
    border: none;
    border-radius: 8px;
    padding: 5px 10px;
    font: 600 12px 'Segoe UI', sans-serif;
    background: #7c3aed;
    color: #ede9fe;
  }
  #pet-chat .chat-input button:hover { background: #8b5cf6; }
`;

export function createChat({ state, bond, brain, sysMonitor, petMemory, speak, logEvent, effects, getGemPos, registerInput }) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const el = document.createElement('div');
  el.id = 'pet-chat';
  el.innerHTML = `
    <div class="chat-head">
      <span class="title">💜 <span class="pet-name">Ico</span></span>
      <span class="bond"></span>
      <button class="close" title="Fechar">✕</button>
    </div>
    <div class="chat-log"></div>
    <div class="chat-input">
      <input type="text" maxlength="280" placeholder="fala comigo..." />
      <button class="send">➤</button>
    </div>
  `;
  document.body.appendChild(el);

  const logEl = el.querySelector('.chat-log');
  const inputEl = el.querySelector('input');
  const sendBtn = el.querySelector('.send');
  const bondEl = el.querySelector('.bond');
  const nameEl = el.querySelector('.pet-name');

  let aiStatus = { available: false, model: null, petName: 'Ico', userName: null };
  let busy = false;
  let typingEl = null;

  if (window.petAPI && window.petAPI.onAIStatus) {
    window.petAPI.onAIStatus((status) => {
      aiStatus = status;
      nameEl.textContent = status.petName || 'Ico';
      if (status.userName && !bond.data.userName) bond.setUserName(status.userName);
      logEvent('chat', status.available ? `IA conectada (${status.model})` : 'IA off — cérebro local no comando');
    });
  }

  function refreshBondLabel() {
    const lv = bond.levelInfo();
    bondEl.textContent = `${lv.name} · ${Math.round(bond.data.points)}pts`;
  }

  function appendMsg(who, text) {
    const div = document.createElement('div');
    div.className = `msg ${who}`;
    div.textContent = text;
    logEl.appendChild(div);
    while (logEl.children.length > MAX_LOG_MESSAGES) logEl.removeChild(logEl.firstChild);
    logEl.scrollTop = logEl.scrollHeight;
    return div;
  }

  function showTyping() {
    typingEl = appendMsg('pet typing', '• • •');
  }
  function hideTyping() {
    if (typingEl) typingEl.remove();
    typingEl = null;
  }

  // Contexto vivo mandado junto de cada mensagem pra API (curto!)
  function buildContext() {
    const parts = [];
    parts.push(`humor: ${state.mode}`);
    const lv = bond.levelInfo();
    parts.push(`vínculo: ${lv.name} (${Math.round(bond.data.points)}pts)`);
    if (state.affection > 0.05) parts.push(`carinho recente: ${Math.round(state.affection * 100)}%`);
    if (state.siteInfo && state.siteInfo.label) parts.push(`vendo agora: ${state.siteInfo.label}`);
    if (state.sysStats) {
      parts.push(
        `sistema: RAM ${Math.round(state.sysStats.memUsedPct * 100)}%, CPU ${Math.round(state.sysStats.cpuPct * 100)}%`
      );
    }
    if (bond.data.userName) parts.push(`nome do usuário: ${bond.data.userName}`);
    // Continuidade de tópico (topicTracker.js): a API já sabe que deve
    // seguir na mesma linha do assunto sem o usuário repetir.
    if (state.currentTopic) parts.push(`tópico atual: ${topicLabel(state.currentTopic)}`);
    // Memórias locais (respostas que o usuário deu às perguntas do pet)
    if (petMemory) {
      const mem = petMemory.contextLine(5);
      if (mem) parts.push(`o que você sabe do usuário: ${mem}`);
    }
    const h = new Date().getHours();
    parts.push(`hora: ${h}h`);
    return parts.join('; ');
  }

  // Efeitos colaterais que o cérebro local pede junto da resposta
  function applyEffects(out) {
    const pos = getGemPos();
    if (out.hearts) effects.floatHearts(pos.x, pos.bottom, out.hearts);
    if (out.blush) state.blushUntil = performance.now() + 4000;
    if (out.charge) state.petCharge = Math.min(1, (state.petCharge || 0) + out.charge * 0.5);
    if (out.bondPts) bond.addBond(out.bondPts, 'conversa');
  }

  async function send() {
    const text = inputEl.value.trim();
    if (!text || busy) return;
    inputEl.value = '';
    busy = true;
    registerInput(state, performance.now());
    appendMsg('user', text);
    logEvent('chat', `usuário: "${text}"`);
    bond.noteStat('chats');
    // Continuidade de tópico: ANTES de montar o contexto, pra tanto a
    // chamada de API quanto o cérebro local (via state.currentTopic)
    // saberem do assunto atual desta mesma mensagem em diante.
    const topicBefore = state.currentTopic;
    const topic = trackTopic(state, text, performance.now());
    if (topic && topic !== topicBefore) logEvent('tópico', `assunto atual: ${topicLabel(topic)}`);
    else if (!topic && topicBefore) logEvent('tópico', 'assunto expirou');
    showTyping();

    let replyText = null;

    // forceLocalBrain (janela de Configurações → aba IA/Chat): pula a API de
    // propósito, útil pra testar sem gastar cota.
    if (aiStatus.available && !liveConfig.ai.forceLocalBrain && window.petAPI && window.petAPI.sendChat) {
      try {
        const res = await window.petAPI.sendChat(text, buildContext());
        if (res && res.text) {
          replyText = res.text;
          bond.addBond(1.5, 'conversa com IA');
        } else if (res && res.error) {
          logEvent('chat', `API falhou (${res.error}) — cérebro local assume`);
        }
      } catch {}
    }

    if (!replyText) {
      // Cérebro local: responde na hora (com um delay de "digitando" charmoso)
      const out = brain.reply(text);
      await new Promise((r) => setTimeout(r, 350 + Math.random() * 550));
      applyEffects(out);
      replyText = out.text;
    }

    hideTyping();
    appendMsg('pet', replyText);
    speak.text(replyText, 'chat');
    refreshBondLabel();
    busy = false;
    inputEl.focus();
  }

  sendBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    send();
  });
  inputEl.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') send();
    if (e.key === 'Escape') close();
  });
  // Cliques dentro do chat não podem virar cutucão/drag no pet
  el.addEventListener('mousedown', (e) => e.stopPropagation());
  el.addEventListener('click', (e) => e.stopPropagation());
  el.querySelector('.close').addEventListener('click', (e) => {
    e.stopPropagation();
    close();
  });

  function open() {
    el.classList.add('visible');
    state.chatOpen = true;
    refreshBondLabel();
    if (logEl.children.length === 0) {
      const hello = bond.data.userName
        ? `Oi, ${bond.data.userName}! Quer conversar? 💜`
        : 'Oi! Pode falar comigo... e se quiser, me diz seu nome ("me chamo ...").';
      appendMsg('pet', hello);
    }
    // Chat aberto precisa de foco de teclado (a janela é focusable:false
    // por padrão — main.js libera e SEGURA o foco enquanto keepFocus=true)
    if (window.petAPI) window.petAPI.setIgnoreMouseEvents(false, true);
    state.ignoringMouseEvents = false;
    setTimeout(() => inputEl.focus(), 60);
    logEvent('chat', 'painel aberto');
  }

  function close() {
    el.classList.remove('visible');
    state.chatOpen = false;
    // Devolve o click-through e o foco pro resto do sistema — sem isso a
    // área do painel (agora invisível) continuaria engolindo cliques.
    if (window.petAPI) window.petAPI.setIgnoreMouseEvents(true, false);
    state.ignoringMouseEvents = true;
    logEvent('chat', 'painel fechado');
  }

  function toggle() {
    if (el.classList.contains('visible')) close();
    else open();
  }

  /** Chamar a cada frame (liveAnimation) pra acompanhar o gem. */
  function updatePosition(xPx, bottomPx) {
    // Mantém o painel dentro da tela na horizontal
    const half = 140;
    const x = Math.min(Math.max(xPx, half), window.innerWidth - half);
    el.style.left = `${x}px`;
    el.style.bottom = `${bottomPx}px`;
  }

  function isPointOver(clientX, clientY) {
    if (!el.classList.contains('visible')) return false;
    const r = el.getBoundingClientRect();
    return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
  }

  return {
    open,
    close,
    toggle,
    updatePosition,
    isPointOver,
    get visible() {
      return el.classList.contains('visible');
    },
  };
}
