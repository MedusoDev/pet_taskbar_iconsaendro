// Barrinha de carinho: medidor visual do cafuné (state.affection), flutuando
// acima do gem. Aparece enquanto há carinho acumulado e some sozinha quando
// o medidor zera. Cria o próprio DOM e CSS — basta chamar createAffectionBar()
// uma vez e update() a cada frame.

// state.affection vai até 1.2 (ver interactions.js); 1.0 é o "cheio" visual —
// o excedente vira o brilho de transbordo.
const FULL = 1.0;

const CSS = `
  #affection-bar {
    position: absolute;
    /* Camada 20 — ver "Camadas de UI" em index.html: acima da decoração
       ambiente (zzz/site-icon/efeitos), abaixo da fala/pergunta/chat. */
    z-index: 20;
    left: 0; /* movido via JS para acompanhar o gem */
    bottom: 0;
    width: 56px;
    height: 7px;
    transform: translateX(-50%);
    border-radius: 4px;
    background: rgba(20, 14, 32, 0.75);
    border: 1px solid rgba(196, 181, 253, 0.35);
    box-shadow: 0 0 8px rgba(124, 58, 237, 0.25);
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.3s ease;
  }
  #affection-bar.visible { opacity: 1; }

  #affection-bar .fill {
    height: 100%;
    width: 0%;
    border-radius: 3px;
    /* Sem overflow:hidden no pai (cortava o coração), o próprio fill
       respeita o canto arredondado */
    max-width: 100%;
    background: linear-gradient(90deg, #7c3aed, #c4b5fd, #fbbf24);
    box-shadow: 0 0 6px rgba(196, 181, 253, 0.8);
    transition: width 0.12s linear;
  }

  /* Transbordou (affection > 1): pulsa dourado, sinal de "muito amado" */
  #affection-bar.overflow {
    border-color: rgba(251, 191, 36, 0.8);
    animation: affection-glow 0.9s ease-in-out infinite;
  }
  @keyframes affection-glow {
    0%, 100% { box-shadow: 0 0 6px rgba(251, 191, 36, 0.4); }
    50%      { box-shadow: 0 0 14px rgba(251, 191, 36, 0.9); }
  }

  /* Coraçãozinho ao lado, só enquanto o cafuné está rolando agora */
  #affection-bar .heart {
    position: absolute;
    left: 100%;
    margin-left: 5px;
    top: -4px;
    font-size: 11px;
    opacity: 0;
    transition: opacity 0.25s ease;
    /* Aura de supercarga: cresce com state.petCharge (via --charge) */
    text-shadow:
      0 0 calc(var(--charge, 0) * 8px) rgba(251, 191, 36, calc(var(--charge, 0) * 0.9)),
      0 0 calc(var(--charge, 0) * 16px) rgba(220, 38, 38, calc(var(--charge, 0) * 0.7));
    transform: scale(calc(1 + var(--charge, 0) * 0.5));
  }
  #affection-bar.petting .heart { opacity: 1; }
  /* Com carga, o coração fica visível mesmo em micro-pausas do cafuné */
  #affection-bar.charging .heart { opacity: 1; }
`;

export function createAffectionBar() {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const el = document.createElement('div');
  el.id = 'affection-bar';
  const fill = document.createElement('div');
  fill.className = 'fill';
  const heart = document.createElement('span');
  heart.className = 'heart';
  heart.textContent = '💜';
  el.appendChild(fill);
  el.appendChild(heart);
  document.body.appendChild(el);

  /**
   * Chamar a cada frame.
   * @param state    estado central (usa affection, pettingNow, sleeping)
   * @param gemXPx   posição X do gem em px de tela
   * @param bottomPx base da UI acima do gem, em px (mesma das outras UIs)
   */
  function update(state, gemXPx, bottomPx) {
    const visible = !state.sleeping && (state.affection > 0.005 || state.pettingNow);
    el.classList.toggle('visible', visible);
    if (!visible) return;

    el.style.left = `${gemXPx}px`;
    el.style.bottom = `${bottomPx}px`;
    fill.style.width = `${Math.min(state.affection / FULL, 1) * 100}%`;
    el.classList.toggle('overflow', state.affection > FULL);
    el.classList.toggle('petting', state.pettingNow);

    // Supercarga (Normality → Excited): aura crescendo no coração
    const charge = state.petCharge || 0;
    el.classList.toggle('charging', charge > 0.01);
    heart.style.setProperty('--charge', charge.toFixed(3));
  }

  return { update };
}
