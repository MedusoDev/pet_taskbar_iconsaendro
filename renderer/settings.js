// Janela de Configurações do Icozinho. Lê a config atual (preload.getConfig),
// monta as abas por um schema e grava as mudanças (preload.saveConfig) — o main
// persiste no pet.config.json e reemite pro pet aplicar ao vivo.
//
// Importa as personalidades só pra MOSTRAR as falas embutidas e as paletas
// (read-only). As falas ADICIONADAS pelo usuário ficam no overlay config.falas.
import { normality } from './personalities/normality.js';
import { zen } from './personalities/zen.js';
import { excited } from './personalities/excited.js';

const PERSONALITIES = [normality, zen, excited];
const P_LABEL = { normality: 'Normality', zen: 'Zen', excited: 'Excited' };

// Schema das abas com campos numéricos/texto/checkbox simples. Personalidade e
// Falas têm render próprio (custom).
const TABS = [
  { id: 'personalidade', title: 'Personalidade', custom: renderPersonalidade },
  {
    id: 'animacoes', title: 'Animações',
    hint: 'Com que frequência as animações de assinatura (shimmy etc.) se repetem.',
    fields: [
      { path: 'animacoes.excitedSignatureMinSec', label: 'Shimmy do Excited — intervalo mínimo', sub: 'segundos', type: 'number', min: 1, step: 1 },
      { path: 'animacoes.excitedSignatureMaxSec', label: 'Shimmy do Excited — intervalo máximo', sub: 'segundos', type: 'number', min: 1, step: 1 },
      { path: 'animacoes.idleSignatureMinSec', label: 'Outras assinaturas — intervalo mínimo', sub: 'segundos', type: 'number', min: 1, step: 1 },
      { path: 'animacoes.idleSignatureMaxSec', label: 'Outras assinaturas — intervalo máximo', sub: 'segundos', type: 'number', min: 1, step: 1 },
    ],
  },
  {
    id: 'ritmo', title: 'Ritmo e Tempos',
    hint: 'Limiares das transições de humor (Zen, sono e o "cansaço" do Excited).',
    fields: [
      { path: 'ritmo.zenEntrySec', label: 'Normality → Zen', sub: 'segundos parado até meditar', type: 'number', min: 5, step: 5 },
      { path: 'ritmo.breathingToAuraSec', label: 'Zen: respiração até a aura', sub: 'segundos respirando', type: 'number', min: 10, step: 10 },
      { path: 'ritmo.sleepAfterZenSec', label: 'Sono (idle profundo pós-Zen)', sub: 'segundos', type: 'number', min: 10, step: 5 },
      { path: 'ritmo.excitedMaxMin', label: 'Excited: tempo total pra cansar', sub: 'minutos (condição 1 da saída)', type: 'number', min: 1, step: 1 },
      { path: 'ritmo.excitedIdleExitMin', label: 'Excited: tempo sem input pra sair', sub: 'minutos (condição 2 da saída)', type: 'number', min: 1, step: 1 },
      { path: 'ritmo.ambientBaseSec', label: 'Falas espontâneas: intervalo-base', sub: 'segundos a msgSpeed 1x', type: 'number', min: 10, step: 10 },
    ],
  },
  {
    id: 'interacoes', title: 'Interações',
    hint: 'Sensibilidade do mouse.',
    fields: [
      { path: 'interacoes.petFlipsNeeded', label: 'Cafuné: inversões pra engatar', sub: 'vai-e-vem do cursor em cima dele', type: 'number', min: 1, step: 1 },
      { path: 'interacoes.flinchSpeed', label: 'Susto: velocidade do cursor', sub: 'px/s — acima disso ele se assusta', type: 'number', min: 100, step: 100 },
    ],
  },
  {
    id: 'sistema', title: 'Sistema',
    hint: 'Itens de Sistema só valem depois de reiniciar o app.',
    fields: [
      { path: 'openSettingsOnStart', label: 'Abrir Configurações ao iniciar', type: 'checkbox' },
      { path: 'sistema.targetBrowser', label: 'Navegador observado (Ico_Eye)', sub: 'nome do processo, ex: brave', type: 'text', restart: true },
      { path: 'sistema.windowHeight', label: 'Altura da pista', sub: 'px acima da taskbar', type: 'number', min: 160, step: 20, restart: true },
    ],
  },
  { id: 'falas', title: 'Falas', custom: renderFalas },
];

// ── util de path aninhado ──
function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
function setPath(obj, path, val) {
  const keys = path.split('.');
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (typeof o[keys[i]] !== 'object' || o[keys[i]] == null) o[keys[i]] = {};
    o = o[keys[i]];
  }
  o[keys[keys.length - 1]] = val;
}

let config = null;     // config atual (do main)
let selectedP = 'normality'; // aba Falas: personalidade selecionada

const tabsEl = document.getElementById('tabs');
const panesEl = document.getElementById('panes');
const statusEl = document.getElementById('status');

function buildField(f) {
  const wrap = document.createElement('div');
  wrap.className = 'field';
  const lbl = document.createElement('label');
  lbl.innerHTML = f.sub ? `${f.label}<small>${f.sub}</small>` : f.label;
  if (f.restart) lbl.innerHTML += '<small class="restart-note">↻ requer reiniciar</small>';
  const input = document.createElement('input');
  input.type = f.type;
  input.dataset.path = f.path;
  const val = getPath(config, f.path);
  if (f.type === 'checkbox') input.checked = !!val;
  else input.value = val ?? '';
  if (f.min != null) input.min = f.min;
  if (f.step != null) input.step = f.step;
  wrap.append(lbl, input);
  return wrap;
}

function renderPersonalidade(pane) {
  pane.insertAdjacentHTML('beforeend',
    '<h2>Personalidade</h2><p class="hint">Frequência de fala (msgSpeed) e velocidade de deslocamento (travelSpeed) de cada humor. A personalidade ativa é decidida pelo comportamento do usuário, não escolhida aqui.</p>');
  for (const p of PERSONALITIES) {
    const card = document.createElement('div');
    card.className = 'card';
    const swatches = p.palette.map((c) => `<span class="swatch" style="background:${c}"></span>`).join('');
    card.innerHTML = `<h3>${p.name}<span class="swatches">${swatches}</span></h3>`;
    card.append(
      buildField({ path: `personalidade.${p.id}.msgSpeed`, label: 'msgSpeed', sub: 'multiplicador de frequência de fala', type: 'number', min: 0.1, step: 0.1 }),
      buildField({ path: `personalidade.${p.id}.travelSpeed`, label: 'travelSpeed', sub: 'multiplicador de velocidade de viagem', type: 'number', min: 0.1, step: 0.1 })
    );
    pane.append(card);
  }
}

function renderFalas(pane) {
  pane.insertAdjacentHTML('beforeend',
    '<h2>Falas</h2><p class="hint">Veja as falas de cada personalidade e adicione novas a qualquer banco. As embutidas ficam em cinza (não editáveis); as suas ficam destacadas e podem ser removidas.</p>');

  // seletor de personalidade
  const sel = document.createElement('select');
  sel.className = 'pselect';
  for (const p of PERSONALITIES) {
    const opt = document.createElement('option');
    opt.value = p.id; opt.textContent = p.name;
    if (p.id === selectedP) opt.selected = true;
    sel.append(opt);
  }
  sel.addEventListener('change', () => { selectedP = sel.value; rebuildFalasBody(); });
  pane.append(sel);

  const body = document.createElement('div');
  body.id = 'falas-body';
  body.style.marginTop = '14px';
  pane.append(body);
  rebuildFalasBody();
}

function rebuildFalasBody() {
  const body = document.getElementById('falas-body');
  if (!body) return;
  body.innerHTML = '';
  const p = PERSONALITIES.find((x) => x.id === selectedP);
  const overlay = (config.falas && config.falas[selectedP]) || {};

  for (const bank of Object.keys(p.lines)) {
    const builtIn = p.lines[bank] || [];
    const added = Array.isArray(overlay[bank]) ? overlay[bank] : [];

    const box = document.createElement('div');
    box.className = 'lines-bank card';
    box.innerHTML = `<div class="bank-name">${bank} <span class="badge">${builtIn.length + added.length}</span></div>`;

    for (const line of builtIn) {
      const it = document.createElement('div');
      it.className = 'line-item builtin';
      it.innerHTML = `<span class="txt"></span>`;
      it.querySelector('.txt').textContent = line;
      box.append(it);
    }
    added.forEach((line, idx) => {
      const it = document.createElement('div');
      it.className = 'line-item user';
      it.innerHTML = `<span class="txt"></span><button class="rm" title="Remover">✕</button>`;
      it.querySelector('.txt').textContent = line;
      it.querySelector('.rm').addEventListener('click', () => {
        overlay[bank].splice(idx, 1);
        if (overlay[bank].length === 0) delete overlay[bank];
        ensureFalasSlot();
        rebuildFalasBody();
      });
      box.append(it);
    });

    const addRow = document.createElement('div');
    addRow.className = 'add-row';
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = `Nova fala pra "${bank}"...`;
    const btn = document.createElement('button');
    btn.textContent = 'Adicionar';
    const doAdd = () => {
      const v = input.value.trim();
      if (!v) return;
      ensureFalasSlot();
      if (!Array.isArray(config.falas[selectedP][bank])) config.falas[selectedP][bank] = [];
      config.falas[selectedP][bank].push(v);
      input.value = '';
      rebuildFalasBody();
    };
    btn.addEventListener('click', doAdd);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doAdd(); });
    addRow.append(input, btn);
    box.append(addRow);
    body.append(box);
  }
}

function ensureFalasSlot() {
  if (!config.falas) config.falas = {};
  if (!config.falas[selectedP]) config.falas[selectedP] = {};
}

function buildTabs() {
  TABS.forEach((tab, i) => {
    const btn = document.createElement('button');
    btn.className = 'tab' + (i === 0 ? ' active' : '');
    btn.textContent = tab.title;
    btn.dataset.tab = tab.id;
    btn.addEventListener('click', () => selectTab(tab.id));
    tabsEl.append(btn);

    const pane = document.createElement('section');
    pane.className = 'pane' + (i === 0 ? ' active' : '');
    pane.id = `pane-${tab.id}`;
    if (tab.custom) {
      tab.custom(pane);
    } else {
      if (tab.hint) pane.insertAdjacentHTML('beforeend', `<h2>${tab.title}</h2><p class="hint">${tab.hint}</p>`);
      const card = document.createElement('div');
      card.className = 'card';
      tab.fields.forEach((f) => card.append(buildField(f)));
      pane.append(card);
    }
    panesEl.append(pane);
  });
}

function selectTab(id) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === id));
  document.querySelectorAll('.pane').forEach((p) => p.classList.toggle('active', p.id === `pane-${id}`));
}

async function save() {
  // Coleta todos os campos com data-path direto no config (working copy)
  document.querySelectorAll('[data-path]').forEach((el) => {
    let v;
    if (el.type === 'checkbox') v = el.checked;
    else if (el.type === 'number') { v = parseFloat(el.value); if (Number.isNaN(v)) return; }
    else v = el.value;
    setPath(config, el.dataset.path, v);
  });
  try {
    await window.petAPI.saveConfig(config);
    statusEl.textContent = '✓ Salvo — mudanças de Sistema (↻) só valem ao reiniciar.';
    setTimeout(() => (statusEl.textContent = ''), 4000);
  } catch (err) {
    statusEl.textContent = '✗ Falha ao salvar: ' + err.message;
  }
}

async function init() {
  if (!window.petAPI || !window.petAPI.getConfig) {
    document.body.innerHTML = '<p style="padding:20px">Falha: API de config indisponível.</p>';
    return;
  }
  config = await window.petAPI.getConfig();
  buildTabs();
  document.getElementById('save').addEventListener('click', save);
}

init();
