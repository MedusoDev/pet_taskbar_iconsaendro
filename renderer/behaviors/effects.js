// Efeitos DOM efêmeros do pet: respingo de gotículas brancas (saída
// envergonhada do Excited), blush "///" de vergonha, corações flutuantes
// (modo Excited / flerte), anel de flash (clímax do respingo) e faíscas.
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

  /* Coração flutuante: sobe balançando e some (modo Excited / flerte) */
  .pet-heart {
    position: absolute;
    pointer-events: none;
    font-size: var(--size);
    opacity: 0;
    animation: pet-heart-rise var(--dur) ease-out var(--delay) forwards;
    filter: drop-shadow(0 0 6px rgba(244, 63, 94, 0.55));
  }
  @keyframes pet-heart-rise {
    0%   { opacity: 0;    transform: translate(0, 6px) scale(0.5) rotate(0deg); }
    15%  { opacity: 0.95; transform: translate(calc(var(--sway) * 0.4), -14px) scale(1) rotate(-8deg); }
    55%  { opacity: 0.85; transform: translate(var(--sway), -52px) scale(1.05) rotate(8deg); }
    100% { opacity: 0;    transform: translate(calc(var(--sway) * 0.5), -92px) scale(0.8) rotate(-6deg); }
  }

  /* Anel de flash: onda circular que expande no clímax do respingo */
  .pet-ring {
    position: absolute;
    border-radius: 50%;
    border: 3px solid rgba(255, 255, 255, 0.9);
    box-shadow: 0 0 18px rgba(251, 113, 133, 0.8), inset 0 0 12px rgba(255, 255, 255, 0.5);
    pointer-events: none;
    transform: translate(-50%, 50%) scale(0.15);
    opacity: 0.95;
    animation: pet-ring-pop 0.65s cubic-bezier(0.2, 0.8, 0.3, 1) forwards;
  }
  @keyframes pet-ring-pop {
    0%   { transform: translate(-50%, 50%) scale(0.15); opacity: 0.95; border-width: 6px; }
    100% { transform: translate(-50%, 50%) scale(1.6);  opacity: 0;    border-width: 1px; }
  }

  /* Faísca: pontinho brilhante que pisca e cai devagar (celebrações) */
  .pet-spark {
    position: absolute;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--color);
    box-shadow: 0 0 8px var(--color);
    pointer-events: none;
    opacity: 0;
    animation: pet-spark-fall var(--dur) ease-in var(--delay) forwards;
  }
  @keyframes pet-spark-fall {
    0%   { opacity: 0;   transform: translate(0, 0) scale(1.4); }
    20%  { opacity: 1;   transform: translate(calc(var(--dx) * 0.4), calc(var(--dy) * 0.3)) scale(1); }
    100% { opacity: 0;   transform: translate(var(--dx), var(--dy)) scale(0.3); }
  }
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
   * intensity > 1 = mais gotas, arco mais largo e mais alto (much_petting).
   * Agora com anel de flash no epicentro pra dar clímax visual. */
  function burstLiquid(xPx, centerBottomPx, intensity = 1) {
    flashRing(xPx, centerBottomPx, intensity);
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

  /** Anel de onda que expande do centro do gem (clímax/celebração). */
  function flashRing(xPx, centerBottomPx, intensity = 1) {
    const ring = document.createElement('div');
    ring.className = 'pet-ring';
    const size = 90 * Math.sqrt(intensity);
    ring.style.width = `${size}px`;
    ring.style.height = `${size}px`;
    ring.style.left = `${xPx}px`;
    ring.style.bottom = `${centerBottomPx}px`;
    ring.addEventListener('animationend', () => ring.remove());
    setTimeout(() => ring.remove(), 1200);
    document.body.appendChild(ring);
  }

  /** Coraçõezinhos subindo em volta do gem. count pequeno (1–3) por chamada;
   * o modo Excited chama em pulsos pra manter um fluxo vivo sem poluir. */
  function floatHearts(xPx, centerBottomPx, count = 1, palette = ['💜', '💗', '💕', '❤️‍🔥']) {
    for (let i = 0; i < count; i++) {
      const h = document.createElement('div');
      h.className = 'pet-heart';
      h.textContent = palette[Math.floor(Math.random() * palette.length)];
      h.style.left = `${xPx + (Math.random() * 2 - 1) * 26}px`;
      h.style.bottom = `${centerBottomPx + 8 + Math.random() * 14}px`;
      h.style.setProperty('--size', `${(11 + Math.random() * 9).toFixed(0)}px`);
      h.style.setProperty('--sway', `${((Math.random() * 2 - 1) * 34).toFixed(0)}px`);
      h.style.setProperty('--dur', `${(1.6 + Math.random() * 1.1).toFixed(2)}s`);
      h.style.setProperty('--delay', `${(Math.random() * 0.25).toFixed(2)}s`);
      h.addEventListener('animationend', () => h.remove());
      setTimeout(() => h.remove(), 3500);
      document.body.appendChild(h);
    }
  }

  /** Chuva curta de faíscas coloridas (level up de vínculo, celebração). */
  function sparkBurst(xPx, centerBottomPx, count = 18, colors = ['#fbbf24', '#c4b5fd', '#f472b6', '#34d399']) {
    for (let i = 0; i < count; i++) {
      const s = document.createElement('div');
      s.className = 'pet-spark';
      s.style.left = `${xPx}px`;
      s.style.bottom = `${centerBottomPx}px`;
      s.style.setProperty('--color', colors[Math.floor(Math.random() * colors.length)]);
      const ang = Math.random() * Math.PI * 2;
      const dist = 30 + Math.random() * 70;
      s.style.setProperty('--dx', `${(Math.cos(ang) * dist).toFixed(0)}px`);
      s.style.setProperty('--dy', `${(-Math.abs(Math.sin(ang)) * dist - 20).toFixed(0)}px`);
      s.style.setProperty('--dur', `${(0.8 + Math.random() * 0.7).toFixed(2)}s`);
      s.style.setProperty('--delay', `${(Math.random() * 0.2).toFixed(2)}s`);
      s.addEventListener('animationend', () => s.remove());
      setTimeout(() => s.remove(), 2500);
      document.body.appendChild(s);
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

  return { burstLiquid, flashRing, floatHearts, sparkBurst, updateBlush };
}
