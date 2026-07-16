// Ico_Eye: detecta a categoria do site/app ativo (repassado pelo main.js via
// IPC) e reage com um tint de cor + ícone + fala, só quando a categoria muda.

const SITE_CATEGORIES = [
  { id: 'spotify', match: /spotify/i, color: '#1DB954', icon: '🎵' },
  { id: 'email', match: /gmail|outlook|inbox/i, color: '#4285F4', icon: '✉️' },
  { id: 'x', match: /\/\s*x\s*$|twitter/i, color: '#71767B', icon: '✕' },
];

function categorize(title) {
  if (!title) return null;
  return SITE_CATEGORIES.find((c) => c.match.test(title)) || null;
}

export function setupSiteEye({ setTint, siteIconEl, speak, logEvent }) {
  if (!(window.petAPI && window.petAPI.onActiveSite)) return;

  let lastCategoryId = null;

  window.petAPI.onActiveSite(({ title }) => {
    const category = categorize(title);
    setTint(category ? category.color : null);
    if (category) {
      siteIconEl.textContent = category.icon;
      siteIconEl.classList.add('visible');
    } else {
      siteIconEl.classList.remove('visible');
    }

    // Só fala quando MUDA de categoria (não a cada troca de título/música)
    const newId = category ? category.id : null;
    if (newId !== lastCategoryId) {
      lastCategoryId = newId;
      logEvent('Ico_Eye', newId ? `viu ${newId}` : 'saiu da categoria');
      if (category) speak(`site_${category.id}`);
    }
  });
}
