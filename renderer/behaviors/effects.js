// Efeitos DOM efêmeros do pet: respingo de gotículas brancas (saída
// envergonhada do Excited) e o blush "///" de vergonha na bochecha.
// Cria o próprio DOM e CSS, como affectionBar.js — basta createEffects()
// uma vez e chamar updateBlush() a cada frame.

const DROP_COUNT = 14;

const CSS = `
  .pet-drop {
    position: absolute;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 35%, #ffffff, #e2e8f0);
    box-shadow: 0 0 6px rgba(255, 255, 255, 0.85);
    pointer-events: none;
    animation: pet-drop-arc var(--dur) cubic-bezier(0.25, 0.55, 0.6, 1) var(--delay) forwards;
    opacity: 0;
  }
  @keyframes pet-drop-arc {
    0%   { transform: translate(0, 0) scale(1); opacity: 0.95; }
    35%  { transform: translate(calc(var(--dx) * 0.45), calc(var(--peak) * -1)) scale(0.85); opacity: 0.9; }
    100% { transform: translate(var(--dx), var(--fall)) scale(0.4); opacity: 0; }
  }

  /* Blush "///" — vergonha estampada na bochecha do gem */
  #pet-blush {
    position: absolute;
    left: 0;
    bottom: 0;
    transform: translateX(-50%) rotate(-14deg);
    font: italic 700 15px 'Segoe UI', sans-serif;
    letter-spacing: 2px;
    color: #fda4af;
    text-shadow: 0 0 8px rgba(244, 63, 94, 0.8);
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.45s ease;
  }
  #pet-blush.visible { opacity: 0.95; }
`;

export function createEffects() {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const blush = document.createElement('div');
  blush.id = 'pet-blush';
  blush.textContent = '///';
  document.body.appendChild(blush);

  /** Fonte de gotículas brancas saindo do gem: sobem num arco curto e caem
   * até o chão, sumindo. (xPx, centerBottomPx) = centro do gem em px.
   * intensity > 1 = mais gotas, arco mais largo e mais alto (much_petting). */
  function burstLiquid(xPx, centerBottomPx, intensity = 1) {
    const count = Math.round(DROP_COUNT * intensity);
    const spread = Math.sqrt(intensity);
    for (let i = 0; i < count; i++) {
      const d = document.createElement('div');
      d.className = 'pet-drop';
      const size = 4 + Math.random() * 5 * spread;
      d.style.width = `${size}px`;
      d.style.height = `${size}px`;
      d.style.left = `${xPx + (Math.random() * 2 - 1) * 10}px`;
      d.style.bottom = `${centerBottomPx + (Math.random() * 2 - 1) * 8}px`;
      d.style.setProperty('--dx', `${((Math.random() * 2 - 1) * 75 * spread).toFixed(0)}px`);
      d.style.setProperty('--peak', `${((22 + Math.random() * 55) * spread).toFixed(0)}px`);
      d.style.setProperty('--fall', `${Math.max(centerBottomPx - 4, 10).toFixed(0)}px`);
      d.style.setProperty('--dur', `${(0.75 + Math.random() * 0.55).toFixed(2)}s`);
      d.style.setProperty('--delay', `${(Math.random() * 0.12).toFixed(2)}s`);
      d.addEventListener('animationend', () => d.remove());
      setTimeout(() => d.remove(), 2500); // rede de segurança
      document.body.appendChild(d);
    }
  }

  /** Chamar a cada frame: liga/desliga o blush e o mantém grudado no gem. */
  function updateBlush(visible, xPx, centerBottomPx) {
    blush.classList.toggle('visible', visible);
    if (visible) {
      blush.style.left = `${xPx + 18}px`;
      blush.style.bottom = `${centerBottomPx + 6}px`;
    }
  }

  return { burstLiquid, updateBlush };
}
