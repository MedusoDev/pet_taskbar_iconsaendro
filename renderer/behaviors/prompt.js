// Balão de pergunta clicável: o pet "pergunta" algo e oferece um botão de
// resposta. Diferente do balão de fala (speech.js), este recebe clique —
// interactions.js desliga o click-through quando o cursor está sobre ele.
// Cria o próprio DOM e CSS; basta createPrompt() uma vez.

const AUTO_HIDE_MS = 8000; // sem resposta → a pergunta murcha sozinha

const CSS = `
  #pet-prompt {
    position: absolute;
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
`;

export function createPrompt() {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const el = document.createElement('div');
  el.id = 'pet-prompt';
  const textEl = document.createElement('span');
  const btn = document.createElement('button');
  el.appendChild(textEl);
  el.appendChild(btn);
  document.body.appendChild(el);

  let hideTimer = null;
  let onChoose = null;

  // stopPropagation: o clique no botão não pode virar cutucão (o listener
  // de click de interactions.js fica na window)
  btn.addEventListener('click', (event) => {
    event.stopPropagation();
    const cb = onChoose;
    hide();
    if (cb) cb();
  });

  function show(question, optionLabel, cb) {
    textEl.textContent = question;
    btn.textContent = optionLabel;
    onChoose = cb;
    el.classList.add('visible');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hide, AUTO_HIDE_MS);
  }

  function hide() {
    el.classList.remove('visible');
    onChoose = null;
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
    hide,
    updatePosition,
    isPointOver,
    get visible() {
      return el.classList.contains('visible');
    },
  };
}
