// Lógica da janela de Configurações/Playground. Script clássico (sem
// import/export) — carregado direto pelo settings.html. Fala com o main
// (e, por relé, com o renderer do pet) só através de window.settingsAPI
// (ver settings-preload.js). Nunca guarda nada em disco sozinho: quem
// persiste é sempre o main.js ("Salvar como padrão").
(function () {
  const sendMain = (type, payload) => window.settingsAPI.send('main', type, payload);
  const sendPet = (type, payload) => window.settingsAPI.send('pet', type, payload);

  // Espelho local de tudo que já chegou do main/pet — é a partir daqui que
  // o botão "Salvar como padrão" monta o pacote final (ver saveDefault()).
  const model = {
    main: null, // { windowHeight, sysPollMs, windowPollMs, watchedApps, groqApiKey, aiAvailable, aiModel, petRunning }
    pet: null,  // { mode, moods, liveConfig, liveConfigDefaults, aiAvailable, aiModel }
    conversationLog: [], // [{ question, answer, timestamp }] — mais recente primeiro
    brain: null, // { moods: { normality: {lines}, ... }, lorebook: [...], curiosity: {...} }
  };

  let editingMood = 'normality';
  let testChatBusy = false;
  // Prefill pendente pro formulário "nova entrada" da aba Cérebro e Falas
  // (ver renderCerebro/seção Lorebook) — setado por promoteToLorebook().
  let lorebookPrefill = null;

  function slugify(text, maxLen) {
    const base = (text || '')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove acentos (marcas combinantes pos-NFD)
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, maxLen || 24);
    return base || 'entrada';
  }

  function escapeRegExp(text) {
    return (text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /** "Promover pro Lorebook" (histórico de conversas → aba Cérebro e Falas):
   * só PRÉ-PREENCHE o formulário de nova entrada — nada é salvo em disco
   * até o usuário revisar e confirmar lá. */
  function promoteToLorebook(entry) {
    lorebookPrefill = {
      id: slugify(entry.question, 24),
      matchSource: escapeRegExp((entry.question || '').trim()),
      matchFlags: 'i',
      replies: [entry.answer || ''],
    };
    setStatus('Entrada pré-preenchida — revise na aba "Cérebro e Falas" → Lorebook.');
    const tabBtn = document.querySelector('.tab-btn[data-tab="cerebro"]');
    if (tabBtn) tabBtn.click();
    renderCerebro();
  }

  // ── util DOM ──
  function h(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const k of Object.keys(attrs)) {
        const v = attrs[k];
        if (v === undefined || v === null) continue;
        if (k === 'text') node.textContent = v;
        else if (k === 'class') node.className = v;
        else if (k.indexOf('on') === 0 && typeof v === 'function') node.addEventListener(k.slice(2), v);
        else node.setAttribute(k, v);
      }
    }
    (children || []).forEach((c) => c && node.appendChild(c));
    return node;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function setStatus(text, isErr) {
    const elm = document.getElementById('status-msg');
    elm.textContent = text;
    elm.classList.toggle('err', !!isErr);
    if (text) setTimeout(() => { if (elm.textContent === text) elm.textContent = ''; }, 4000);
  }

  /** Rótulo com um ícone "ⓘ" opcional (tooltip nativo via title="") — usado
   * em todo campo editável, junto com o parágrafo .hint logo abaixo dele. */
  function labelWithHelp(text, help) {
    const label = document.createElement('label');
    label.appendChild(document.createTextNode(text));
    if (help) {
      const icon = document.createElement('span');
      icon.className = 'help-icon';
      icon.title = help;
      icon.textContent = ' ⓘ';
      label.appendChild(icon);
    }
    return label;
  }

  /** Bloco padrão de um campo: rótulo (+ ícone de ajuda), input, e um
   * parágrafo de ajuda persistente abaixo (não só tooltip — o pedido era
   * "texto de ajuda abaixo OU ícone com tooltip"; aqui tem os dois). */
  function fieldBlock(label, help, input) {
    const row = h('div', { class: 'field-row' }, [labelWithHelp(label, help), input]);
    const wrap = h('div', {}, [row]);
    if (help) wrap.appendChild(h('p', { class: 'hint', text: help }));
    return wrap;
  }

  function numberField(label, value, onChange, opts) {
    opts = opts || {};
    const input = h('input', { type: 'number', step: opts.step || 'any', min: opts.min, max: opts.max });
    input.value = value;
    input.addEventListener('change', () => {
      const v = parseFloat(input.value);
      if (!Number.isNaN(v)) onChange(v);
    });
    const row = fieldBlock(label, opts.help, input);
    return { row, input };
  }

  // ── tabs ──
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    });
  });

  // ═══════════════════════════ Personalidade ═══════════════════════════
  const MOVEMENT_FIELDS = [
    ['hoverMeanSec', 'Hover médio (s)', 'Tempo médio (em segundos) que ele fica pairando/parado antes de decidir ir pra outro lugar. Maior = passeia com menos frequência. Faixa comum: 6–12s.'],
    ['speed', 'Velocidade de viagem', 'Multiplicador da velocidade quando ele decide se mover pra outro ponto. 1.0 = padrão. Maior = viagens mais rápidas entre pontos.'],
    ['micro', 'Micro-deriva', "Amplitude da 'respiração'/balanço pequeno enquanto ele paira parado. Maior = balança mais; perto de 0 fica robótico e imóvel."],
    ['approach', 'Aproximação do cursor', 'De 0 a 1: o quanto ele gravita na direção do cursor quando ele fica parado por perto. 0 = ignora o cursor; 1 = sempre se aproxima.'],
    ['spin', 'Giro', 'Multiplicador da velocidade de rotação própria do corpo. 1.0 = padrão desse humor.'],
    ['yRange', 'Faixa vertical (Y)', 'De 0 a 1: quão alto ele costuma pairar. 1 = usa a faixa vertical toda disponível; valores baixos o mantêm mais rente ao chão.'],
  ];

  function renderPersonalidade() {
    const root = document.getElementById('tab-personalidade');
    clear(root);
    if (!model.pet) {
      root.appendChild(petLoadingNotice());
      return;
    }
    const moods = model.pet.moods;

    const select = h('select', {}, []);
    Object.keys(moods).forEach((id) => {
      select.appendChild(h('option', { value: id, text: moods[id].name || id }));
    });
    select.value = editingMood;
    select.addEventListener('change', () => {
      editingMood = select.value;
      renderPersonalidade();
    });
    const forceBtn = h('button', {
      class: 'secondary',
      text: '▶ Forçar este humor agora',
      onclick: () => {
        sendPet('setMood', { mood: editingMood });
        setStatus('Humor forçado: ' + editingMood);
      },
    });

    const picker = h('div', { class: 'mood-picker' }, [select, forceBtn]);

    const mood = moods[editingMood];
    const movCard = h('div', { class: 'card' }, [
      h('h2', { text: 'Movimento — ' + (mood.name || editingMood) }),
    ]);
    MOVEMENT_FIELDS.forEach(([key, label, help]) => {
      const { row } = numberField(label, mood.movement[key], (v) => {
        mood.movement[key] = v;
        sendPet('setMovementField', { mood: editingMood, field: key, value: v });
      }, { step: 0.05, help });
      movCard.appendChild(row);
    });

    const paletteCard = h('div', { class: 'card' }, [
      h('h2', { text: 'Paleta — ' + (mood.name || editingMood) }),
      h('p', { class: 'hint', text: 'As 6 cores do degradê de facetas do corpo. A 1ª e a 3ª cor são as "âncoras" do brilho pulsante (emissive) — escolha as mais fortes/saturadas nessas posições.' }),
    ]);
    const paletteRow = h('div', { class: 'palette-row' });
    mood.palette.forEach((hex, i) => {
      const input = h('input', { type: 'color', value: hex });
      input.addEventListener('input', () => {
        mood.palette[i] = input.value;
        sendPet('setPaletteColor', { mood: editingMood, index: i, value: input.value });
      });
      paletteRow.appendChild(input);
    });
    paletteCard.appendChild(paletteRow);

    root.appendChild(picker);
    root.appendChild(movCard);
    root.appendChild(paletteCard);
  }

  // ═══════════════════════════ Animações / Assinaturas ═══════════════════════════
  const TEST_ACTIONS = [
    ['poke', '👉 Cutucão', 'Giro de peão + facetas abrindo — o que normalmente acontece quando você clica nele.'],
    ['flinch', '😳 Susto', 'Esquiva rápida pro lado oposto, como quando o cursor voa em cima dele rápido demais.'],
    ['stretch', '🙆 Espreguiçada', 'Animação de 4.2s que normalmente só acontece uma vez por ciclo de tédio (~32s parado).'],
    ['dizzy', '💫 Tonta', 'Giro tonto de 2.6s, como quando você clica nele 3+ vezes seguidas rapidamente.'],
    ['tick', '🔁 Tique', 'Tique de impaciência (pulinho ou giro seco) — normalmente aparece depois de ~14s parado.'],
    ['fall', '⬇️ Queda', 'Simula soltar ele do colo: cai com gravidade e quica uma vez antes de assentar.'],
  ];

  function renderAnimacoes() {
    const root = document.getElementById('tab-animacoes');
    clear(root);
    if (!model.pet) {
      root.appendChild(petLoadingNotice());
      return;
    }
    const sigCard = h('div', { class: 'card' }, [
      h('h2', { text: 'Assinaturas' }),
      h('p', { class: 'hint', text: 'Toca a animação uma vez, pra visualização — independe do humor atual.' }),
    ]);
    Object.entries(model.pet.moods).forEach(([id, mood]) => {
      if (!mood.signature) return;
      sigCard.appendChild(
        h('div', { class: 'sig-row' }, [
          h('span', { class: 'sig-label', text: (mood.name || id) + ' — ' + mood.signature.label }),
          h('button', {
            text: '▶ Testar',
            onclick: () => sendPet('testSignature', { mood: id }),
          }),
        ])
      );
    });
    if (!sigCard.querySelector('.sig-row')) {
      sigCard.appendChild(h('p', { class: 'hint', text: 'Nenhum humor com assinatura própria carregado ainda.' }));
    }

    const actCard = h('div', { class: 'card' }, [
      h('h2', { text: 'Forçar reação' }),
      h('p', { class: 'hint', text: 'Dispara a reação na hora, sem precisar do gesto/tempo real que normalmente a causa.' }),
    ]);
    const grid = h('div', { class: 'action-grid' });
    TEST_ACTIONS.forEach(([action, label, help]) => {
      grid.appendChild(h('button', { class: 'secondary', text: label, title: help, onclick: () => sendPet('testAction', { action }) }));
    });
    actCard.appendChild(grid);

    root.appendChild(sigCard);
    root.appendChild(actCard);
  }

  // ═══════════════════════════ Ritmo e Tempos ═══════════════════════════
  const BOREDOM_FIELDS = [
    ['REST_AT', 'Tique de impaciência (s)', 'Quantos segundos parado até ele começar os tiques de impaciência (pulinho ou giro seco). Padrão: 14s.'],
    ['STRETCH_AT', 'Espreguiçada (s)', 'Quantos segundos parado até a espreguiçada (acontece uma vez por ciclo de inatividade). Padrão: 32s. Precisa ser maior que REST_AT.'],
    ['ZEN_AT', 'Entra no modo Zen (s)', 'Quantos segundos de inatividade até o pet entrar em modo Zen (meditação parada). Padrão: 60s. Precisa ser MENOR que SLEEP_AT, senão ele nunca chega a meditar antes de dormir.'],
    ['SLEEP_AT', 'Dorme (s)', 'Quantos segundos de inatividade até ele dormir (só depois do ciclo de Zen já ter acontecido). Padrão: 65s. Precisa ser MAIOR que ZEN_AT.'],
    ['SHUTDOWN_MIN', 'Shutdown mínimo (s)', "Tempo mínimo parado (em segundos) até o evento de 'desligar' poder acontecer — o valor real é sorteado entre este número e +20s. Padrão: 30s."],
  ];
  const PERSONALITY_TIME_FIELDS = [
    ['ZEN_BREATHING_ESCALATE_MS', 'Zen → zen_aura (ms)', 'Quanto tempo (em milissegundos) de respiração contínua no Zen até virar zen_aura, um evento especial e não-interrompível. Padrão: 240000ms (4min).'],
    ['ZEN_EXCITED_PET_MS', 'Zen → Excited por carinho (ms)', 'Quanto tempo (ms) de carinho contínuo durante o Zen até ele perder a paciência e entrar no modo Excited. Padrão: 6000ms (6s).'],
    ['PET_CHARGE_FILL_SEC', 'Supercarga de carinho (s)', "Segundos de cafuné contínuo, com a barra de carinho já cheia, até a 'supercarga' explodir e ele entrar em modo Excited. Padrão: 4s."],
    ['NSFW_CHARGE_FILL_SEC', 'Arousal por site adulto (s)', 'Segundos de exposição contínua a um site adulto até o modo Excited ligar sozinho. Padrão: 35s.'],
    ['PLEASE_PET_EXCESS_MS', 'Carinho excessivo → vergonha (ms)', "Tempo (ms) de carinho acumulado durante a fase 'implorando carinho' do Excited até dar vergonha nele e ele murchar. Padrão: 3000ms (3s)."],
  ];

  function renderRitmo() {
    const root = document.getElementById('tab-ritmo');
    clear(root);
    if (!model.pet) {
      root.appendChild(petLoadingNotice());
      return;
    }
    const lc = model.pet.liveConfig;

    const warnHolder = h('div');
    function updateWarn() {
      clear(warnHolder);
      if (lc.boredom.SLEEP_AT <= lc.boredom.ZEN_AT) {
        warnHolder.appendChild(
          h('div', { class: 'warn-banner', text: '⚠ SLEEP_AT precisa ser maior que ZEN_AT — do jeito que está, ele nunca chega a meditar antes de dormir.' })
        );
      }
    }
    updateWarn();

    const boredomCard = h('div', { class: 'card' }, [h('h2', { text: 'boredom.js — relógio de tédio' })]);
    BOREDOM_FIELDS.forEach(([key, label, help]) => {
      const { row } = numberField(label, lc.boredom[key], (v) => {
        lc.boredom[key] = v;
        sendPet('setLiveConfig', { group: 'boredom', field: key, value: v });
        updateWarn();
      }, { step: 1, help });
      boredomCard.appendChild(row);
    });

    const persCard = h('div', { class: 'card' }, [h('h2', { text: 'personalityState.js — transições de humor' })]);
    PERSONALITY_TIME_FIELDS.forEach(([key, label, help]) => {
      const { row } = numberField(label, lc.personality[key], (v) => {
        lc.personality[key] = v;
        sendPet('setLiveConfig', { group: 'personality', field: key, value: v });
      }, { step: key.endsWith('_MS') ? 100 : 1, help });
      persCard.appendChild(row);
    });

    const resetBtn = h('button', {
      class: 'secondary',
      text: '↺ Restaurar padrões de fábrica (ritmo e tempos)',
      onclick: () => sendPet('resetLiveConfig'),
    });

    root.appendChild(warnHolder);
    root.appendChild(boredomCard);
    root.appendChild(persCard);
    root.appendChild(resetBtn);
  }

  // ═══════════════════════════ Interações ═══════════════════════════
  function renderInteracoes() {
    const root = document.getElementById('tab-interacoes');
    clear(root);
    if (!model.pet) {
      root.appendChild(petLoadingNotice());
      return;
    }
    const ic = model.pet.liveConfig.interactions;
    const card = h('div', { class: 'card' }, [h('h2', { text: 'interactions.js — cafuné' })]);

    const flipsHelp = 'Quantas inversões de direção do mouse (vai-e-vem) são necessárias em cima dele pra engatar o cafuné. Menos inversões = mais fácil engatar. Padrão: 2.';
    const flipsField = numberField('Inversões pra engatar cafuné (PET_FLIPS_NEEDED)', ic.PET_FLIPS_NEEDED, (v) => {
      ic.PET_FLIPS_NEEDED = Math.round(v);
      sendPet('setLiveConfig', { group: 'interactions', field: 'PET_FLIPS_NEEDED', value: Math.round(v) });
    }, { step: 1, min: 1, help: flipsHelp });
    card.appendChild(flipsField.row);

    const strokeHelp = 'Quanto cada pixel de esfregada (durante o cafuné) enche o medidor de carinho. Maior = a barra enche mais rápido. Padrão: 0.0004.';
    const strokeRow = h('div', { class: 'field-row' });
    const strokeInput = h('input', { type: 'range', min: '0.0001', max: '0.002', step: '0.0001' });
    strokeInput.value = ic.AFFECTION_PER_STROKE;
    const strokeValue = h('span', { text: ic.AFFECTION_PER_STROKE.toFixed(4) });
    strokeInput.addEventListener('input', () => {
      const v = parseFloat(strokeInput.value);
      strokeValue.textContent = v.toFixed(4);
      ic.AFFECTION_PER_STROKE = v;
      sendPet('setLiveConfig', { group: 'interactions', field: 'AFFECTION_PER_STROKE', value: v });
    });
    strokeRow.appendChild(labelWithHelp('Quanto cada px de esfregada enche a barra', strokeHelp));
    strokeRow.appendChild(strokeInput);
    strokeRow.appendChild(strokeValue);
    card.appendChild(strokeRow);
    card.appendChild(h('p', { class: 'hint', text: strokeHelp }));

    root.appendChild(card);
  }

  // ═══════════════════════════ IA / Chat ═══════════════════════════
  function renderIA() {
    const root = document.getElementById('tab-ia');
    clear(root);
    if (!model.main) {
      root.appendChild(h('p', { class: 'hint', text: 'Carregando dados do main...' }));
      return;
    }

    const statusLine = h('p', { class: 'status-line' }, [
      h('span', {
        class: model.main.aiAvailable ? 'ok' : 'off',
        text: model.main.aiAvailable ? ('IA ativa: ' + model.main.aiModel) : 'IA offline — usando cérebro local',
      }),
    ]);

    const topicCard = h('div', { class: 'card' }, [
      h('h2', { text: 'Continuidade de tópico' }),
      h('p', { class: 'hint', text: 'Só debug visual (topicTracker.js) — não editável aqui. Atualiza a cada poucos segundos enquanto o pet estiver rodando.' }),
      h('p', { id: 'topic-status-line', class: 'status-line', text: model.main.petRunning ? 'Nenhum tópico ativo.' : 'Inicie o pet pra ver isso.' }),
    ]);

    const keysCard = h('div', { class: 'card' }, [
      h('h2', { text: 'Chaves de API' }),
      h('p', { class: 'hint', text: 'Salva em pet.config.json (fora do git) só quando você clicar em "Salvar como padrão".' }),
    ]);
    const groqInput = h('input', { type: 'password', placeholder: 'gsk_...' });
    groqInput.value = model.main.groqApiKey || '';
    groqInput.addEventListener('change', () => {
      model.main.groqApiKey = groqInput.value;
      sendMain('setApiKey', { provider: 'groq', value: groqInput.value });
    });
    keysCard.appendChild(
      h('div', { class: 'field-row' }, [
        labelWithHelp('groqApiKey', 'Chave da API da Groq — é ela que o painel de chat do pet usa. Sem essa chave, todo chat cai no cérebro local (offline).'),
      ])
    );
    keysCard.appendChild(groqInput);

    const toggleCard = h('div', { class: 'card' });
    const forceLocal = h('input', { type: 'checkbox' });
    forceLocal.checked = !!(model.pet && model.pet.liveConfig.ai.forceLocalBrain);
    forceLocal.addEventListener('change', () => {
      sendPet('setForceLocalBrain', { value: forceLocal.checked });
    });
    toggleCard.appendChild(
      h('div', { class: 'toggle-row' }, [forceLocal, h('label', { text: 'Forçar sempre cérebro local (ignora a API mesmo se disponível — útil pra testar sem gastar cota)' })])
    );

    const testCard = h('div', { class: 'card' }, [h('h2', { text: 'Testar mensagem' })]);
    const log = h('div', { class: 'chat-log' });
    const input = h('input', { type: 'text', placeholder: 'digite uma mensagem de teste...' });
    const sendBtn = h('button', { text: 'Enviar' });
    function appendLog(who, text, tag) {
      const line = h('div', { class: 'msg' }, [
        tag ? h('span', { class: 'tag', text: tag }) : null,
        h('span', { text: (who === 'user' ? '🧑 ' : '💜 ') + text }),
      ]);
      log.appendChild(line);
      log.scrollTop = log.scrollHeight;
    }
    function doSend() {
      const text = input.value.trim();
      if (!text || testChatBusy) return;
      appendLog('user', text);
      input.value = '';
      testChatBusy = true;
      sendBtn.disabled = true;
      sendPet('testChat', { text });
    }
    sendBtn.addEventListener('click', doSend);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doSend();
    });
    testCard.appendChild(log);
    testCard.appendChild(h('div', { class: 'test-chat-input' }, [input, sendBtn]));

    // expõe pra receber a resposta assíncrona (ver onPetEvent 'testChatResult')
    window.__settingsTestChatLog = appendLog;
    window.__settingsTestChatDone = () => {
      testChatBusy = false;
      sendBtn.disabled = false;
    };

    const histCard = h('div', { class: 'card' }, [
      h('h2', { text: 'Histórico de conversas' }),
      h('p', { class: 'hint', text: 'Últimas conversas salvas em conversationLog.json (só grava quando a resposta veio da API).' }),
    ]);
    if (!model.conversationLog.length) {
      histCard.appendChild(h('p', { class: 'hint', text: 'Nada registrado ainda.' }));
    } else {
      model.conversationLog.forEach((entry) => {
        const when = entry.timestamp ? new Date(entry.timestamp).toLocaleString('pt-BR') : '';
        histCard.appendChild(
          h('div', { class: 'list-row' }, [
            h('div', {}, [
              h('div', { text: '🧑 ' + entry.question }),
              h('div', { text: '💜 ' + entry.answer }),
              h('div', { class: 'hint', text: when }),
            ]),
            h('button', {
              class: 'secondary',
              text: '⬆ Promover pro Lorebook',
              onclick: () => promoteToLorebook(entry),
            }),
          ])
        );
      });
    }

    root.appendChild(statusLine);
    root.appendChild(topicCard);
    root.appendChild(keysCard);
    root.appendChild(toggleCard);
    root.appendChild(testCard);
    root.appendChild(histCard);
  }

  // ═══════════════════════════ Cérebro e Falas ═══════════════════════════
  // Edita direto renderer/personalities/*.js, lorebook.js e curiosity.js no
  // disco (ver main/brainStore.js) — cada mudança já dispara o save; a UI
  // sempre re-renderiza a partir do 'brainData' que volta do main depois de
  // cada operação (nunca assume que a escrita local bateu com o arquivo).
  let cerebroMood = 'normality';

  /** Editor de uma lista de textos (frases/respostas/nível): cada linha tem
   * uma textarea + remover; uma linha extra no fim adiciona. `onChange`
   * recebe o array inteiro atualizado toda vez que algo muda. */
  function textListEditor(initialItems, onChange) {
    let items = [...(initialItems || [])];
    const container = h('div', {});
    function renderList() {
      clear(container);
      items.forEach((text, i) => {
        const ta = h('textarea', {});
        ta.value = text;
        ta.addEventListener('change', () => {
          items[i] = ta.value;
          onChange([...items]);
        });
        const removeBtn = h('button', {
          class: 'danger',
          text: '✕',
          onclick: () => {
            items.splice(i, 1);
            onChange([...items]);
            renderList();
          },
        });
        container.appendChild(h('div', { class: 'text-list-row' }, [ta, removeBtn]));
      });
      const addTa = h('textarea', { placeholder: 'nova frase...' });
      const addBtn = h('button', {
        class: 'secondary',
        text: '+',
        onclick: () => {
          const v = addTa.value.trim();
          if (!v) return;
          items.push(v);
          onChange([...items]);
          addTa.value = '';
          renderList();
        },
      });
      container.appendChild(h('div', { class: 'text-list-row' }, [addTa, addBtn]));
    }
    renderList();
    return container;
  }

  // ── Falas por humor ──
  function renderFalasSection() {
    const card = h('div', { class: 'card' }, [
      h('h2', { text: 'Falas por humor' }),
      h('p', { class: 'hint', text: 'Cada gatilho é uma lista de frases — o pet sorteia uma quando o evento acontece. "Testar" mostra uma frase da lista no balão agora, mesmo sem salvar.' }),
    ]);
    const select = h('select', {}, []);
    Object.keys(model.brain.moods).forEach((id) => select.appendChild(h('option', { value: id, text: id })));
    select.value = cerebroMood;
    select.addEventListener('change', () => {
      cerebroMood = select.value;
      renderCerebro();
    });
    card.appendChild(h('div', { class: 'mood-picker' }, [select]));

    const moodData = model.brain.moods[cerebroMood];
    if (!moodData || !moodData.ok) {
      card.appendChild(h('p', { class: 'hint', text: 'Não consegui ler esse arquivo: ' + ((moodData && moodData.error) || '?') }));
      return card;
    }
    Object.entries(moodData.triggers).forEach(([trigger, phrases]) => {
      const details = document.createElement('details');
      details.className = 'trigger-block';
      const summary = document.createElement('summary');
      summary.appendChild(
        h('div', { class: 'trigger-head' }, [
          h('span', { class: 'trigger-name', text: trigger + ' (' + phrases.length + ')' }),
          h('button', {
            class: 'secondary',
            text: '▶ Testar gatilho',
            onclick: (e) => {
              e.preventDefault();
              sendPet('testSpeak', { phrases });
            },
          }),
        ])
      );
      details.appendChild(summary);
      details.appendChild(
        textListEditor(phrases, (newPhrases) => {
          sendMain('savePersonalityPhrases', { mood: cerebroMood, trigger, phrases: newPhrases });
        })
      );
      card.appendChild(details);
    });
    return card;
  }

  // ── Lorebook ──
  // Mesma taxonomia de renderer/behaviors/topicTracker.js — duplicada aqui
  // só como rótulos de UI (esta janela é um processo renderer separado do
  // pet, não dá pra importar o módulo ES dele direto). '' = sem tag (balde
  // "Geral").
  const LOREBOOK_TOPICS = [
    ['', 'Geral'],
    ['nsfw', 'NSFW'],
    ['series_filmes', 'Séries/Filmes'],
    ['jogos', 'Jogos'],
    ['tecnologia', 'Tecnologia'],
    ['musica', 'Música'],
  ];

  function topicSelect(value, onChange) {
    const select = h('select', {});
    LOREBOOK_TOPICS.forEach(([id, label]) => select.appendChild(h('option', { value: id, text: label })));
    select.value = value || '';
    select.addEventListener('change', () => onChange(select.value || null));
    return select;
  }

  function lorebookEntryCard(entry) {
    const live = { ...entry };
    const card = h('div', { class: 'entry-card' });

    function commit() {
      sendMain('saveLorebookEntry', { index: entry.index, entry: live });
    }

    const idInput = h('input', { type: 'text', class: 'wide' });
    idInput.value = live.id;
    idInput.addEventListener('change', () => { live.id = idInput.value.trim(); commit(); });

    const upBtn = h('button', { class: 'secondary', text: '↑', title: 'Mover pra cima', onclick: () => sendMain('moveLorebookEntry', { index: entry.index, direction: 'up' }) });
    const downBtn = h('button', { class: 'secondary', text: '↓', title: 'Mover pra baixo', onclick: () => sendMain('moveLorebookEntry', { index: entry.index, direction: 'down' }) });
    const removeBtn = h('button', { class: 'danger', text: '✕ Remover', onclick: () => sendMain('removeLorebookEntry', { index: entry.index }) });

    card.appendChild(
      h('div', { class: 'entry-head' }, [
        h('div', {}, [h('span', { class: 'hint', text: 'id' }), idInput]),
        h('div', { class: 'entry-actions' }, [upBtn, downBtn, removeBtn]),
      ])
    );

    const miniRow = h('div', { class: 'mini-row' });
    const matchInput = h('input', { type: 'text', class: 'wide', title: 'Padrão regex (sem as barras)' });
    matchInput.value = live.matchSource;
    matchInput.addEventListener('change', () => { live.matchSource = matchInput.value; commit(); });
    const flagsInput = h('input', { type: 'text', title: 'Flags da regex, ex.: i' });
    flagsInput.value = live.matchFlags || 'i';
    flagsInput.style.width = '50px';
    flagsInput.addEventListener('change', () => { live.matchFlags = flagsInput.value.trim() || 'i'; commit(); });
    miniRow.appendChild(h('label', { text: 'match /' }, [matchInput]));
    miniRow.appendChild(matchInput);
    miniRow.appendChild(h('label', { text: '/ flags' }));
    miniRow.appendChild(flagsInput);

    [['hearts', 'hearts'], ['bondPts', 'bondPts'], ['charge', 'charge'], ['minLevel', 'minLevel (0-4)']].forEach(([field, label]) => {
      const inp = h('input', { type: 'number', step: field === 'charge' ? '0.1' : '1' });
      inp.value = live[field] === null || live[field] === undefined ? '' : live[field];
      inp.placeholder = '—';
      inp.addEventListener('change', () => {
        live[field] = inp.value === '' ? null : parseFloat(inp.value);
        commit();
      });
      miniRow.appendChild(h('label', { text: label }, [inp]));
      miniRow.appendChild(inp);
    });
    const blushChk = h('input', { type: 'checkbox' });
    blushChk.checked = !!live.blush;
    blushChk.addEventListener('change', () => { live.blush = blushChk.checked; commit(); });
    miniRow.appendChild(h('label', { text: 'blush' }, [blushChk]));
    miniRow.appendChild(blushChk);
    miniRow.appendChild(h('label', { text: 'tópico' }));
    miniRow.appendChild(topicSelect(live.topic, (v) => { live.topic = v; commit(); }));
    card.appendChild(miniRow);

    if (live.byLevel) {
      live.byLevel.forEach((tier, tierIdx) => {
        card.appendChild(h('div', { class: 'tier-label', text: 'Nível ' + tierIdx }));
        card.appendChild(
          textListEditor(tier, (newTier) => {
            live.byLevel[tierIdx] = newTier;
            commit();
          })
        );
      });
    } else {
      card.appendChild(h('div', { class: 'tier-label', text: 'Respostas' }));
      card.appendChild(
        textListEditor(live.replies || [], (newReplies) => {
          live.replies = newReplies;
          commit();
        })
      );
    }
    if (live.locked) {
      card.appendChild(h('div', { class: 'tier-label', text: 'Travadas (abaixo de minLevel)' }));
      card.appendChild(
        textListEditor(live.locked, (newLocked) => {
          live.locked = newLocked;
          commit();
        })
      );
    }
    return card;
  }

  function renderLorebookSection() {
    const card = h('div', { class: 'card' }, [
      h('h2', { text: 'Lorebook' }),
      h('p', { class: 'hint', text: 'A ORDEM (real, do arquivo) importa: a primeira entrada cuja regex casar com a mensagem vence — ↑/↓ move nessa ordem de verdade, então pode fazer uma entrada "pular" de grupo aqui embaixo (os grupos por tópico são só uma forma de navegar, não mudam a ordem real).' }),
    ]);
    if (!model.brain.lorebook.ok) {
      card.appendChild(h('p', { class: 'hint', text: 'Não consegui ler lorebook.js: ' + model.brain.lorebook.error }));
      return card;
    }

    // Agrupado por tópico (topicTracker.js) só pra navegação — cada grupo
    // mostra as entradas na mesma ordem relativa que elas têm no arquivo.
    LOREBOOK_TOPICS.forEach(([topicId, topicLabelTxt]) => {
      const inGroup = model.brain.lorebook.entries.filter((e) => (e.topic || '') === topicId);
      if (!inGroup.length) return;
      card.appendChild(h('h2', { text: topicLabelTxt + ' (' + inGroup.length + ')', style: 'margin-top:14px' }));
      inGroup.forEach((entry) => card.appendChild(lorebookEntryCard(entry)));
    });

    // ── nova entrada ──
    const addCard = h('div', { class: 'entry-card' }, [h('h2', { text: '+ Nova entrada' })]);
    const draft = lorebookPrefill
      ? { id: lorebookPrefill.id, matchSource: lorebookPrefill.matchSource, matchFlags: lorebookPrefill.matchFlags, replies: [...lorebookPrefill.replies] }
      : { id: '', matchSource: '', matchFlags: 'i', replies: [''] };
    lorebookPrefill = null;

    const newId = h('input', { type: 'text', class: 'wide', placeholder: 'id único' });
    newId.value = draft.id;
    const newMatch = h('input', { type: 'text', class: 'wide', placeholder: 'padrão regex (edite pra generalizar)' });
    newMatch.value = draft.matchSource;
    const newFlags = h('input', { type: 'text' });
    newFlags.value = draft.matchFlags;
    newFlags.style.width = '50px';
    let newTopic = null;
    addCard.appendChild(
      h('div', { class: 'mini-row' }, [
        h('label', { text: 'id' }), newId,
        h('label', { text: 'match /' }), newMatch,
        h('label', { text: '/ flags' }), newFlags,
        h('label', { text: 'tópico' }), topicSelect(newTopic, (v) => { newTopic = v; }),
      ])
    );

    let newReplies = [...draft.replies];
    addCard.appendChild(h('div', { class: 'tier-label', text: 'Respostas' }));
    addCard.appendChild(textListEditor(newReplies, (v) => { newReplies = v; }));

    addCard.appendChild(
      h('button', {
        text: '+ Adicionar entrada',
        onclick: () => {
          sendMain('addLorebookEntry', {
            entry: {
              id: newId.value.trim(),
              matchSource: newMatch.value,
              matchFlags: newFlags.value.trim() || 'i',
              topic: newTopic,
              replies: newReplies.filter((r) => r.trim()),
            },
          });
        },
      })
    );
    card.appendChild(addCard);
    return card;
  }

  // ── Curiosidade ──
  function curiosityQuestionCard(bank, entry, siteMode) {
    const live = { ...entry };
    const card = h('div', { class: 'entry-card' });
    function commit() {
      if (siteMode) sendMain('saveSiteQuestion', { siteId: live.siteId, question: live });
      else sendMain('saveCuriosityQuestion', { bank, index: entry.index, question: live });
    }
    function removeThis() {
      if (siteMode) sendMain('removeSiteQuestion', { siteId: live.siteId });
      else sendMain('removeCuriosityQuestion', { bank, index: entry.index });
    }
    const idInput = h('input', { type: 'text', class: 'wide' });
    idInput.value = live.id;
    idInput.addEventListener('change', () => { live.id = idInput.value.trim(); commit(); });
    const removeBtn = h('button', { class: 'danger', text: '✕ Remover', onclick: removeThis });
    const headChildren = [h('div', {}, [h('span', { class: 'hint', text: 'id (memória)' }), idInput]), h('div', { class: 'entry-actions' }, [removeBtn])];
    card.appendChild(h('div', { class: 'entry-head' }, headChildren));

    if (siteMode) {
      card.appendChild(h('p', { class: 'hint', text: 'Categoria do site (chave em siteEye.js): ' + live.siteId + ' — não editável aqui (crie uma nova entrada pra outra categoria).' }));
    }
    const miniRow = h('div', { class: 'mini-row' });
    if (!siteMode) {
      const minLevelInp = h('input', { type: 'number', step: '1' });
      minLevelInp.value = live.minLevel === null || live.minLevel === undefined ? '' : live.minLevel;
      minLevelInp.placeholder = '—';
      minLevelInp.addEventListener('change', () => { live.minLevel = minLevelInp.value === '' ? null : parseFloat(minLevelInp.value); commit(); });
      miniRow.appendChild(h('label', { text: 'minLevel' }, [minLevelInp]));
      miniRow.appendChild(minLevelInp);
    }
    const labelInput = h('input', { type: 'text' });
    labelInput.value = live.label;
    labelInput.addEventListener('change', () => { live.label = labelInput.value; commit(); });
    miniRow.appendChild(h('label', { text: 'label' }, [labelInput]));
    miniRow.appendChild(labelInput);
    card.appendChild(miniRow);

    [['q', 'Pergunta'], ['ph', 'Placeholder'], ['thanks', 'Agradecimento ({a} = resposta)']].forEach(([field, label]) => {
      const ta = h('textarea', {});
      ta.value = live[field];
      ta.addEventListener('change', () => { live[field] = ta.value; commit(); });
      card.appendChild(h('div', { class: 'tier-label', text: label }));
      card.appendChild(ta);
    });
    return card;
  }

  function curiosityAddForm(bank, title, siteMode) {
    const addCard = h('div', { class: 'entry-card' }, [h('h2', { text: title })]);
    const idInput = h('input', { type: 'text', class: 'wide', placeholder: siteMode ? 'id (memória)' : 'id (memória)' });
    const siteIdInput = siteMode ? h('input', { type: 'text', placeholder: 'categoria do site (ex.: figma)' }) : null;
    const minLevelInput = !siteMode && bank === 'nsfw' ? h('input', { type: 'number', step: '1', placeholder: 'minLevel' }) : null;
    const labelInput = h('input', { type: 'text', placeholder: 'label' });
    const qTa = h('textarea', { placeholder: 'pergunta...' });
    const phInput = h('input', { type: 'text', class: 'wide', placeholder: 'placeholder do campo de resposta' });
    const thanksTa = h('textarea', { placeholder: 'agradecimento ({a} = resposta)' });

    const row = h('div', { class: 'mini-row' }, [
      h('label', { text: 'id' }), idInput,
      siteMode ? h('label', { text: 'categoria' }) : null,
      siteMode ? siteIdInput : null,
      minLevelInput ? h('label', { text: 'minLevel' }) : null,
      minLevelInput,
      h('label', { text: 'label' }), labelInput,
    ]);
    addCard.appendChild(row);
    addCard.appendChild(h('div', { class: 'tier-label', text: 'Pergunta' }));
    addCard.appendChild(qTa);
    addCard.appendChild(h('div', { class: 'tier-label', text: 'Placeholder' }));
    addCard.appendChild(phInput);
    addCard.appendChild(h('div', { class: 'tier-label', text: 'Agradecimento' }));
    addCard.appendChild(thanksTa);

    addCard.appendChild(
      h('button', {
        text: '+ Adicionar pergunta',
        onclick: () => {
          const q = {
            id: idInput.value.trim(),
            label: labelInput.value.trim(),
            q: qTa.value.trim(),
            ph: phInput.value.trim(),
            thanks: thanksTa.value.trim(),
          };
          if (minLevelInput && minLevelInput.value !== '') q.minLevel = parseFloat(minLevelInput.value);
          if (siteMode) {
            sendMain('saveSiteQuestion', { siteId: siteIdInput.value.trim(), question: q });
          } else {
            sendMain('addCuriosityQuestion', { bank, question: q });
          }
        },
      })
    );
    return addCard;
  }

  function renderCuriositySection() {
    const card = h('div', { class: 'card' }, [
      h('h2', { text: 'Perguntas da curiosidade' }),
      h('p', { class: 'hint', text: 'O pet só pergunta o que ainda não foi respondido. A ordem não importa aqui (sem "primeira que casar vence").' }),
    ]);
    if (!model.brain.curiosity.ok) {
      card.appendChild(h('p', { class: 'hint', text: 'Não consegui ler curiosity.js: ' + model.brain.curiosity.error }));
      return card;
    }
    card.appendChild(h('h2', { text: 'Genéricas' }));
    model.brain.curiosity.generic.forEach((q) => card.appendChild(curiosityQuestionCard('generic', q, false)));
    card.appendChild(curiosityAddForm('generic', '+ Nova pergunta genérica', false));

    card.appendChild(h('h2', { text: 'Do site ativo', style: 'margin-top:18px' }));
    model.brain.curiosity.site.forEach((q) => card.appendChild(curiosityQuestionCard('site', q, true)));
    card.appendChild(curiosityAddForm('site', '+ Nova categoria de site', true));

    card.appendChild(h('h2', { text: 'NSFW (vínculo alto)', style: 'margin-top:18px' }));
    model.brain.curiosity.nsfw.forEach((q) => card.appendChild(curiosityQuestionCard('nsfw', q, false)));
    card.appendChild(curiosityAddForm('nsfw', '+ Nova pergunta NSFW', false));

    return card;
  }

  function renderCerebro() {
    const root = document.getElementById('tab-cerebro');
    clear(root);
    if (!model.main || !model.main.petRunning) {
      // Cérebro/lorebook são lidos direto do disco pelo MAIN (não dependem
      // do pet estar rodando) — mas é mais simples esperar o boot terminar
      // de pedir os dados igual as outras abas.
    }
    if (!model.brain) {
      root.appendChild(h('p', { class: 'hint', text: 'Carregando dados do cérebro...' }));
      return;
    }
    root.appendChild(renderFalasSection());
    root.appendChild(renderLorebookSection());
    root.appendChild(renderCuriositySection());
  }

  // ═══════════════════════════ Sistema ═══════════════════════════
  function renderSistema() {
    const root = document.getElementById('tab-sistema');
    clear(root);
    if (!model.main) {
      root.appendChild(h('p', { class: 'hint', text: 'Carregando dados do main...' }));
      return;
    }

    const winCard = h('div', { class: 'card' }, [h('h2', { text: 'Janela' })]);
    winCard.appendChild(
      numberField('Altura da pista (WINDOW_HEIGHT, px)', model.main.windowHeight, (v) => {
        model.main.windowHeight = v;
        sendMain('setWindowHeight', { value: v });
      }, { step: 10, min: 120, help: 'Altura (em pixels) da faixa onde o pet vive e pode se mover, logo acima da taskbar. O corpo dele continua do mesmo tamanho visual — só a área de passeio/arrasto muda. Padrão: 480px.' }).row
    );

    const pollCard = h('div', { class: 'card' }, [h('h2', { text: 'Frequência dos pollers' })]);
    pollCard.appendChild(
      numberField('RAM/CPU — sysPoll (ms)', model.main.sysPollMs, (v) => {
        model.main.sysPollMs = v;
        sendMain('setSysPollMs', { value: v });
      }, { step: 500, min: 500, help: 'De quanto em quanto tempo (ms) o app mede RAM/CPU do sistema, pra alimentar os avisos do Ico_Guard e o balão de fala. Padrão: 5000ms (5s). Valores muito baixos gastam mais CPU só medindo CPU.' }).row
    );
    pollCard.appendChild(
      numberField('Janela ativa — windowPoll (ms)', model.main.windowPollMs, (v) => {
        model.main.windowPollMs = v;
        sendMain('setWindowPollMs', { value: v });
      }, { step: 100, min: 200, help: 'De quanto em quanto tempo (ms) o app pergunta ao Windows qual é a janela ativa (Ico_Eye). Padrão: 1000ms (1s).' }).row
    );

    const appsCard = h('div', { class: 'card' }, [
      h('h2', { text: 'Apps observados (Ico_Eye)' }),
      h('p', { class: 'hint', text: "Lista de processos que o pet 'enxerga' — só o título de janelas desses apps chega até ele. Qualquer outro app fica invisível pro pet." }),
    ]);
    const chipList = h('div', { class: 'chip-list' });
    function renderChips() {
      clear(chipList);
      model.main.watchedApps.forEach((appName) => {
        chipList.appendChild(
          h('span', { class: 'chip' }, [
            h('span', { text: appName }),
            h('button', {
              class: 'danger',
              text: '✕',
              onclick: () => {
                model.main.watchedApps = model.main.watchedApps.filter((a) => a !== appName);
                sendMain('removeWatchedApp', { value: appName });
                renderChips();
              },
            }),
          ])
        );
      });
    }
    renderChips();
    const addInput = h('input', { type: 'text', placeholder: 'ex.: photoshop' });
    const addBtn = h('button', {
      class: 'secondary',
      text: 'Adicionar',
      onclick: () => {
        const v = addInput.value.trim().toLowerCase();
        if (!v || model.main.watchedApps.includes(v)) return;
        model.main.watchedApps.push(v);
        sendMain('addWatchedApp', { value: v });
        addInput.value = '';
        renderChips();
      },
    });
    appsCard.appendChild(chipList);
    appsCard.appendChild(h('div', { class: 'add-row' }, [addInput, addBtn]));

    root.appendChild(winCard);
    root.appendChild(pollCard);
    root.appendChild(appsCard);
  }

  // ═══════════════════════════ orquestração ═══════════════════════════
  function renderAll() {
    renderPersonalidade();
    renderAnimacoes();
    renderRitmo();
    renderInteracoes();
    renderIA();
    renderCerebro();
    renderSistema();
  }

  // ── Boot-first: a janela de Config abre ANTES do pet existir ──
  const startPetBtn = document.getElementById('start-pet-btn');
  function updateStartPetBtn() {
    if (!model.main) return;
    if (model.main.petRunning) {
      startPetBtn.textContent = '✅ Pet iniciado';
      startPetBtn.disabled = true;
    } else {
      startPetBtn.textContent = '🐾 Iniciar o pet';
      startPetBtn.disabled = false;
    }
  }
  startPetBtn.addEventListener('click', () => {
    startPetBtn.disabled = true;
    sendMain('startPet');
  });

  /** Tabs que dependem do renderer do pet mostram este aviso em vez de
   * "carregando" pra sempre quando o pet ainda não existe. */
  function petLoadingNotice() {
    if (model.main && !model.main.petRunning) {
      return h('div', { class: 'warn-banner', text: '🐾 Inicie o pet primeiro (botão "Iniciar o pet" no topo) — esta aba precisa dele rodando pra mostrar/editar os dados de verdade.' });
    }
    return h('p', { class: 'hint', text: 'Carregando dados do pet...' });
  }

  window.settingsAPI.onMainEvent((msg) => {
    if (!msg) return;
    if (msg.type === 'mainSnapshot') {
      model.main = msg.payload;
      editingMood = editingMood || 'normality';
      updateStartPetBtn();
      renderIA();
      renderSistema();
    } else if (msg.type === 'petStarted') {
      if (model.main) model.main.petRunning = true;
      updateStartPetBtn();
      setStatus('🐾 Pet iniciado!');
      // O renderer do pet acabou de nascer — pede os dados dele agora que
      // já existe alguém do outro lado pra responder.
      sendPet('requestSnapshot');
      sendPet('getTopicStatus');
    } else if (msg.type === 'savedDefault') {
      setStatus(msg.payload && msg.payload.ok ? '💾 Salvo como padrão.' : 'Falha ao salvar.', !(msg.payload && msg.payload.ok));
    } else if (msg.type === 'conversationLog') {
      model.conversationLog = msg.payload || [];
      renderIA();
    } else if (msg.type === 'brainData') {
      model.brain = msg.payload;
      renderCerebro();
    } else if (msg.type === 'brainOpResult') {
      setStatus(msg.payload && msg.payload.ok ? '✔ Salvo em disco.' : 'Erro: ' + (msg.payload && msg.payload.error), !(msg.payload && msg.payload.ok));
    }
  });

  window.settingsAPI.onPetEvent((msg) => {
    if (!msg) return;
    if (msg.type === 'snapshot') {
      model.pet = msg.payload;
      if (!model.pet.moods[editingMood]) editingMood = model.pet.mode || 'normality';
      renderAll();
    } else if (msg.type === 'testChatResult') {
      const payload = msg.payload || {};
      const tag = payload.source === 'api' ? 'via API (' + (payload.model || '?') + ')' : 'via cérebro local';
      if (window.__settingsTestChatLog) window.__settingsTestChatLog('pet', payload.text || '(sem resposta)', tag);
      if (window.__settingsTestChatDone) window.__settingsTestChatDone();
    } else if (msg.type === 'topicStatus') {
      const elm = document.getElementById('topic-status-line');
      if (!elm) return; // aba IA/Chat não está montada agora — sem problema
      const p = msg.payload || {};
      if (!p.topic) {
        elm.textContent = 'Nenhum tópico ativo.';
      } else {
        const min = Math.floor(p.msRemaining / 60000);
        const sec = Math.floor((p.msRemaining % 60000) / 1000);
        elm.textContent = 'Tópico atual: ' + p.label + ' (expira em ' + min + 'min' + (min === 0 ? ' ' + sec + 's' : '') + ')';
      }
    }
  });

  // Continuidade de tópico: pergunta o status a cada 5s (barato — só um
  // objeto pequeno, não mexe no resto da UI). Sem efeito enquanto o pet
  // ainda não existir (main.js só relê pra `win` se ele já estiver aberto).
  setInterval(() => sendPet('getTopicStatus'), 5000);

  document.getElementById('save-default-btn').addEventListener('click', () => {
    if (!model.main) return;
    sendMain('saveAsDefault', {
      groqApiKey: model.main.groqApiKey,
      renderer: model.pet
        ? { liveConfig: model.pet.liveConfig, moods: model.pet.moods }
        : undefined,
    });
  });

  // boot: pede os dois snapshots (main é sempre rápido; pet pode demorar um
  // pouco mais se a janela dele acabou de abrir — sem problema, o painel
  // mostra "carregando" até a resposta chegar).
  sendMain('getMainSnapshot');
  sendMain('getConversationLog', { limit: 30 });
  sendMain('getBrainData');
  sendPet('requestSnapshot');
  renderAll();
})();
