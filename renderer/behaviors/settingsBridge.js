// Ponte entre a janela de Configurações/Playground (settings/) e o renderer
// do pet. A janela de Settings é uma BrowserWindow separada — não enxerga
// `state`/`personalityCtl`/etc diretamente, então tudo passa por IPC via
// main.js (que só relê mensagens, nunca decide nada sozinho — ver main.js
// "settings:cmd"/"settings:pet-event"). Este módulo é o único lugar do
// renderer que entende os comandos vindos de lá.
import { PERSONALITIES } from '../personalities/index.js';
import { startRelocate } from './wander.js';
import { liveConfig, getLiveConfigDefaults, applyLiveConfig, resetLiveConfig } from './liveConfig.js';
import { topicLabel } from './topicTracker.js';

const MOOD_BY_ID = Object.fromEntries(PERSONALITIES.map((p) => [p.id, p]));

export function createSettingsBridge({
  state,
  personalityCtl,
  speak,
  logEvent,
  setPalette,
  brain,
  bond,
  getAiStatus,
}) {
  if (!window.petAPI || !window.petAPI.onSettingsCommand) return;

  function moodSnapshot() {
    const out = {};
    for (const p of PERSONALITIES) {
      out[p.id] = {
        name: p.name,
        movement: { ...p.movement },
        palette: [...p.palette],
        signature: p.signature ? { type: p.signature.type, label: p.signature.label } : null,
      };
    }
    return out;
  }

  function fullSnapshot() {
    const ai = getAiStatus ? getAiStatus() : { available: false };
    return {
      mode: state.mode,
      moods: moodSnapshot(),
      liveConfig: JSON.parse(JSON.stringify(liveConfig)),
      liveConfigDefaults: getLiveConfigDefaults(),
      aiAvailable: !!ai.available,
      aiModel: ai.model || null,
    };
  }

  function setMood(mood) {
    const now = performance.now();
    if (mood === 'normality') {
      personalityCtl.exitToNormality(now);
    } else if (mood === 'zen') {
      personalityCtl.exitToNormality(now);
      personalityCtl.enterZen(now);
    } else if (mood === 'excited') {
      personalityCtl.exitToNormality(now);
      personalityCtl.enterExcited(now);
    }
    logEvent('config', `humor forçado manualmente: ${mood}`);
  }

  function setMovementField(mood, field, value) {
    const p = MOOD_BY_ID[mood];
    if (!p || !(field in p.movement)) return;
    p.movement[field] = value;
  }

  function setPaletteColor(mood, index, value) {
    const p = MOOD_BY_ID[mood];
    if (!p || index < 0 || index >= p.palette.length) return;
    p.palette[index] = value;
    // Cor da personalidade ATIVA: aplica na hora. As outras só valem no
    // próximo enter*() — já vão pegar a paleta editada porque é o mesmo
    // array/objeto mutado em memória (ver personalities/*.js).
    if (state.personality === p) setPalette(p.palette);
  }

  function setLiveConfigField(group, field, value) {
    if (!liveConfig[group] || !(field in liveConfig[group])) return;
    liveConfig[group][field] = value;
  }

  /** Preview de assinatura, independente do humor atual: força a volta pro
   * Normality (se necessário) e injeta a pose no mecanismo genérico de
   * signatureAnim (liveAnimation.js) — o mesmo que toca as assinaturas de
   * verdade quando não há pose própria de humor (zenPose) tomando conta. */
  function testSignature(mood) {
    const p = MOOD_BY_ID[mood];
    if (!p || !p.signature) return;
    const now = performance.now();
    if (state.mode !== 'normality') personalityCtl.exitToNormality(now);
    state.signatureAnim = { start: now, sig: p.signature };
    logEvent('config', `testando assinatura: ${p.signature.label}`);
  }

  /** "Testar gatilho" da aba Cérebro e Falas: mostra uma frase (sorteada
   * entre as que a UI tem na hora, salvas ou não em disco ainda — editar
   * personalities/*.js não recarrega o módulo já importado neste renderer,
   * então usar o speak(gatilho) normal aqui mostraria texto desatualizado
   * até um "Reiniciar o pet"). Sem forçar humor nem gastar cooldown real. */
  function testSpeak(phrases) {
    if (!Array.isArray(phrases) || !phrases.length) return;
    const text = phrases[Math.floor(Math.random() * phrases.length)];
    speak.text(text, 'teste_frase');
  }

  function testAction(action) {
    const now = performance.now();
    switch (action) {
      case 'poke':
        state.pokeVel += 8;
        state.unfold = Math.max(state.unfold, 0.8);
        logEvent('config', 'teste: cutucão');
        speak('poke');
        break;
      case 'dizzy':
        state.dizzy = { start: now };
        state.pokeVel += 8;
        state.unfold = Math.max(state.unfold, 0.8);
        logEvent('config', 'teste: tonta');
        speak('dizzy');
        break;
      case 'stretch':
        state.stretch = { start: now };
        state.stretchDone = true;
        state.tick = null;
        logEvent('config', 'teste: espreguiçada');
        break;
      case 'tick':
        state.tick = { type: Math.floor(Math.random() * 2), start: now };
        logEvent('config', 'teste: tique');
        break;
      case 'fall':
        state.dragging = false;
        state.releaseFall = { vy: 0, bounces: 0 };
        logEvent('config', 'teste: queda');
        break;
      case 'flinch': {
        const away = Math.random() < 0.5 ? 1 : -1;
        state.wakeJolt = Math.max(state.wakeJolt, 0.45);
        logEvent('config', 'teste: susto');
        startRelocate(
          state,
          now,
          state.restX + away * (2.5 + Math.random() * 2),
          state.restY + 0.6 + Math.random() * 0.8,
          2.6,
          false,
          logEvent
        );
        break;
      }
      default:
        break;
    }
  }

  // Contexto simplificado pro teste de chat — mesmo espírito do buildContext
  // de chat.js, sem depender do DOM/estado interno dele.
  function buildTestContext() {
    const parts = [`humor: ${state.mode}`];
    const lv = bond.levelInfo();
    parts.push(`vínculo: ${lv.name} (${Math.round(bond.data.points)}pts)`);
    parts.push('[mensagem de teste vinda da janela de Configurações]');
    return parts.join('; ');
  }

  async function testChat(text) {
    const ai = getAiStatus ? getAiStatus() : { available: false };
    if (ai.available && !liveConfig.ai.forceLocalBrain && window.petAPI && window.petAPI.sendChat) {
      try {
        const res = await window.petAPI.sendChat(text, buildTestContext());
        if (res && res.text) return { text: res.text, source: 'api', model: ai.model };
      } catch {}
    }
    const out = brain.reply(text);
    return { text: out.text, source: 'local', model: null };
  }

  function reply(type, payload) {
    window.petAPI.sendSettingsEvent({ type, payload });
  }

  // Debug ao vivo (aba IA/Chat da janela de Configurações — só leitura, não
  // dá pra editar o tópico por lá): estado atual de topicTracker.js.
  function topicStatus() {
    const topic = state.currentTopic;
    const msRemaining = topic ? Math.max(0, state.topicExpiresAt - performance.now()) : 0;
    return { topic, label: topic ? topicLabel(topic) : null, msRemaining };
  }

  window.petAPI.onSettingsCommand(async (msg) => {
    if (!msg || typeof msg.type !== 'string') return;
    switch (msg.type) {
      case 'requestSnapshot':
        reply('snapshot', fullSnapshot());
        break;
      case 'getTopicStatus':
        reply('topicStatus', topicStatus());
        break;
      case 'setMood':
        setMood(msg.payload.mood);
        break;
      case 'setMovementField':
        setMovementField(msg.payload.mood, msg.payload.field, msg.payload.value);
        break;
      case 'setPaletteColor':
        setPaletteColor(msg.payload.mood, msg.payload.index, msg.payload.value);
        break;
      case 'setLiveConfig':
        setLiveConfigField(msg.payload.group, msg.payload.field, msg.payload.value);
        break;
      case 'resetLiveConfig':
        resetLiveConfig();
        reply('snapshot', fullSnapshot());
        break;
      case 'setForceLocalBrain':
        liveConfig.ai.forceLocalBrain = !!msg.payload.value;
        break;
      case 'testSignature':
        testSignature(msg.payload.mood);
        break;
      case 'testAction':
        testAction(msg.payload.action);
        break;
      case 'testSpeak':
        testSpeak(msg.payload.phrases);
        break;
      case 'testChat': {
        const result = await testChat(msg.payload.text);
        reply('testChatResult', result);
        break;
      }
      default:
        break;
    }
  });

  /** Chamado uma vez no boot (movement.js) com o que veio do
   * pet.tuning.json salvo (ver main.js) — mesma lógica de aplicar valores
   * que a edição ao vivo usa, só que em lote e na largada. */
  function applyTuningConfig(cfg) {
    if (!cfg) return;
    if (cfg.liveConfig) applyLiveConfig(cfg.liveConfig);
    if (cfg.moods) {
      for (const [moodId, data] of Object.entries(cfg.moods)) {
        const p = MOOD_BY_ID[moodId];
        if (!p) continue;
        if (data.movement) Object.assign(p.movement, data.movement);
        if (data.palette) {
          data.palette.forEach((hex, i) => {
            if (hex) p.palette[i] = hex;
          });
          if (state.personality === p) setPalette(p.palette);
        }
      }
    }
  }

  return { fullSnapshot, applyTuningConfig };
}
