// Balão de pergunta clicável: o pet "pergunta" algo e oferece um botão de
// resposta. Diferente do balão de fala (speech.js), este recebe clique —
// interactions.js desliga o click-through quando o cursor está sobre ele.
// Cria o próprio DOM e CSS; basta createPrompt() uma vez.

const AUTO_HIDE_MS = 8000; // sem resposta → a pergunta murcha sozinha

const CSS = `
  #pet-prompt {
    position: absolute;
    /* Camada 40 — ver "Camadas de UI" em index.html: sempre acima do balão
       de fala comum (que se esconde sozinho via .suppressed enquanto esta
       pergunta está visível — ver liveAnimation.js). */
    z-index: 40;
    left: 0;
    bottom: 0;
    transform: translateX(-50%);
    display: none;
    flex-direction: column;
    align-items: center;
    gap: 5px;
    padding: 7px 10px;
    border-radius: 10px;
    background: rgba(20, 14, 32, 0.88);
    border: 1px solid rgba(196, 181, 253, 0.45);
    color: #ede9fe;
    font-family: 'Segoe UI', sans-serif;
    font-size: 12px;
    line-height: 1.3;
    text-align: center;
    white-space: nowrap;
  }
  #pet-prompt.visible { display: flex; }
  #pet-prompt button {
    cursor: pointer;
    border: none;
    border-radius: 7px;
    padding: 4px 12px;
    font: 600 12px 'Segoe UI', sans-serif;
    background: #7c3aed;
    color: #ede9fe;
  }
  #pet-prompt button:hover { background: #8b5cf6; }
  #pet-prompt input {
    display: none;
    width: 190px;
    border: 1px solid rgba(196, 181, 253, 0.4);
    border-radius: 7px;
    background: rgba(30, 20, 50, 0.9);
    color: #ede9fe;
    font: 12px 'Segoe UI', sans-serif;
    padding: 4px 8px;
    outline: none;
  }
  #pet-prompt.asking input { display: block; }
  #pet-prompt input:focus { border-color: #a78bfa; }
`;

export function createPrompt() {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const el = document.createElement('div');
  el.id = 'pet-prompt';
  const textEl = document.createElement('span');
  const inputEl = document.createElement('input');
  inputEl.type = 'text';
  inputEl.maxLength = 120;
  const btn = document.createElement('button');
  el.appendChild(textEl);
  el.appendChild(inputEl);
  el.appendChild(btn);
  document.body.appendChild(el);

  let hideTimer = null;
  let onChoose = null;
  let onTimeout = null;
  let asking = false; // modo pergunta-com-input (curiosity.js)

  function submit() {
    const cb = onChoose;
    const answer = asking ? inputEl.value.trim() : null;
    hide();
    if (cb) cb(answer);
  }

  // stopPropagation: o clique no botão não pode virar cutucão (o listener
  // de click de interactions.js fica na window)
  btn.addEventListener('click', (event) => {
    event.stopPropagation();
    submit();
  });
  inputEl.addEventListener('keydown', (event) => {
    event.stopPropagation();
    if (event.key === 'Enter') submit();
    if (event.key === 'Escape') {
      const tcb = onTimeout;
      hide();
      if (tcb) tcb();
    }
  });
  el.addEventListener('mousedown', (event) => event.stopPropagation());
  el.addEventListener('click', (event) => event.stopPropagation());
  // Perguntando: quando o mouse chega na pergunta, o input pega o foco
  // (a janela acabou de ficar focável via interactions/keepFocus)
  el.addEventListener('mouseenter', () => {
    if (asking) setTimeout(() => inputEl.focus(), 140);
  });

  /** onTimeoutCb (opcional): chamado se a pergunta murchar SEM resposta —
   * pra quem mostrou poder desfazer estado pendente (ex: awaitingParkAnswer). */
  function show(question, optionLabel, cb, onTimeoutCb) {
    asking = false;
    el.classList.remove('asking');
    textEl.textContent = question;
    btn.textContent = optionLabel;
    onChoose = cb;
    onTimeout = onTimeoutCb || null;
    el.classList.add('visible');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      const tcb = onTimeout;
      hide();
      if (tcb) tcb();
    }, AUTO_HIDE_MS);
  }

  /** Pergunta com campo de resposta (curiosity.js): o usuário digita e o
   * texto vai pro callback. Fica mais tempo na tela que o show() normal. */
  function ask(question, placeholder, cb, onTimeoutCb) {
    asking = true;
    el.classList.add('asking');
    textEl.textContent = question;
    inputEl.value = '';
    inputEl.placeholder = placeholder || 'me conta...';
    btn.textContent = 'Responder';
    onChoose = cb;
    onTimeout = onTimeoutCb || null;
    el.classList.add('visible');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      const tcb = onTimeout;
      hide();
      if (tcb) tcb();
    }, 22000);
    setTimeout(() => inputEl.focus(), 80);
  }

  function hide() {
    el.classList.remove('visible');
    el.classList.remove('asking');
    asking = false;
    onChoose = null;
    onTimeout = null;
    clearTimeout(hideTimer);
  }

  /** Chamar a cada frame (liveAnimation) pra acompanhar o gem. */
  function updatePosition(xPx, bottomPx) {
    el.style.left = `${xPx}px`;
    el.style.bottom = `${bottomPx}px`;
  }

  /** O cursor está sobre a pergunta? (pro click-through não engolir o botão) */
  function isPointOver(clientX, clientY) {
    if (!el.classList.contains('visible')) return false;
    const r = el.getBoundingClientRect();
    return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
  }

  return {
    show,
    ask,
    hide,
    updatePosition,
    isPointOver,
    get visible() {
      return el.classList.contains('visible');
    },
  };
}
