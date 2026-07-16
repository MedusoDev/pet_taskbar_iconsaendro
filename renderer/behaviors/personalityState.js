// Máquina de estados da personalidade: Normality é a base. Zen e Excited são
// alcançados por comportamento do usuário e sempre voltam pro Normality —
// nunca escolhidos por dia. Ver BRAINSTORM_PERSONALIDADES.md.
//
// Normality ──(tecla Z)──▶ Zen (zen_breathing, imóvel)
//   Zen ──(2min contínuos em zen_breathing)──▶ zen_aura ──(termina)──▶ Normality
//   Zen ──(carregado bem alto e solto)──▶ Normality
//   Zen ──(carinho contínuo por ~6s, teste)──▶ zen_much_more_excited ──▶ Excited
//     Excited: need_you (segue o mouse) ──▶ please_pet (pede carinho)
//       please_pet ──(carinho demais)──▶ Normality
//       please_pet ──(sem carinho)──▶ Normality
import { normality } from '../personalities/normality.js';
import { zen } from '../personalities/zen.js';
import { excited } from '../personalities/excited.js';
import { clamp } from './mathUtils.js';

// ── Zen: respiração / aura ──
const ZEN_AURA_DURATION_MS = zen.zenAura.duration * 1000;
const ZEN_BREATHING_ESCALATE_MS = 120000; // 2min contínuos em breathing → zen_aura
const BREATHING_LIFT_THRESHOLD = 14; // unidades de mundo: carregado bem alto → quebra o transe
const ZEN_AURA_TINT = '#FBBF24'; // dourado

// ── zen_much_more_excited: carinho contínuo no Zen → transição pro Excited ──
// (valores reduzidos temporariamente pra facilitar teste com carinho por
// hover — o gesto original de 20s/8s é cansativo de sustentar sem clicar;
// ver BRAINSTORM_PERSONALIDADES.md)
const ZEN_EXCITED_PET_MS = 6000;
const ZEN_TRANSITION_DURATION_MS = 3200;
const ZEN_TRANSITION_TINT = '#DC2626'; // vermelho

// ── Normality → Excited: supercarga de carinho ──
// Com a barra de carinho cheia (>= 1.0) e o cafuné continuando, uma aura
// vai crescendo no coração (state.petCharge, 0→1). Cheia → modo Excited.
const PET_CHARGE_FULL_AFFECTION = 1.0; // barra "100%"
const PET_CHARGE_FILL_SEC = 4;         // s de cafuné contínuo pra encher a aura
const PET_CHARGE_DRAIN_SEC = 2;        // s pra aura esvaziar quando para

// ── Excited: need_you → please_pet ──
const NEED_YOU_MIN_MS = 8000;
const NEED_YOU_MAX_MS = 13000;
const HEART_MIN_MS = 1200;
const HEART_MAX_MS = 2000;
const PLEASE_PET_TIMEOUT_MS = 5000; // sem carinho → desiste
const PLEASE_PET_EXCESS_MS = 3000;  // carinho acumulado dentro do please_pet → vergonha

// O timer automático de "2min sem interação → Zen" ainda NÃO está ligado.
// Por pedido explícito: por enquanto só entra no Zen pelo gatilho manual
// (tecla Z), pra permitir testar Zen isoladamente.

export function createPersonalityState({ state, setPalette, setTint, logEvent, speak }) {
  state.personality = normality;
  state.mode = 'normality';
  state.zen = null;
  state.excitedState = null;
  state.zenAuraActive = false;
  state.zenBreathingActive = false;
  state.petCharge = 0;

  // ── Normality ⇄ Zen ──

  function enterZen(now) {
    if (state.mode !== 'normality') return;
    state.mode = 'zen';
    state.personality = zen;
    setPalette(zen.palette);
    state.signatureAnim = null;
    state.zenBreathingActive = true;
    state.zen = {
      breathing: { start: now, baselineY: state.restY, peakLift: 0, wasDragging: false },
      aura: null,
      transition: null,
      pettingStreakStart: 0,
    };
    logEvent('zen', 'entrou no modo zen — respiração imóvel');
    speak('zen_enter', true);
  }

  function exitZenToNormality(reason, now) {
    state.mode = 'normality';
    state.personality = normality;
    state.zenAuraActive = false;
    state.zenBreathingActive = false;
    setTint(null);
    setPalette(normality.palette);
    state.signatureAnim = null;
    state.zen = null;
    logEvent('zen', `saiu do modo zen (${reason})`);
  }

  function cancelReloc() {
    if (state.reloc) {
      state.reloc = null;
      state.anchor.x = state.restX;
      state.anchor.y = state.restY;
    }
  }

  function startZenAura(now) {
    const z = state.zen;
    z.breathing = null;
    z.aura = { start: now };
    state.zenBreathingActive = false;
    state.zenAuraActive = true;
    state.signatureAnim = null;
    cancelReloc();
    setTint(ZEN_AURA_TINT);
    logEvent('zen_aura', 'iniciou — não interrompível até terminar');
    speak('zen_aura', true);
  }

  function startZenTransition(now) {
    const z = state.zen;
    z.breathing = null;
    z.aura = null;
    z.transition = { start: now };
    state.zenBreathingActive = false;
    state.zenAuraActive = true; // reaproveita o bloqueio de reloc/input da aura
    state.signatureAnim = null;
    cancelReloc();
    setTint(ZEN_TRANSITION_TINT);
    logEvent('zen_much_more_excited', 'carinho demais no zen — perdendo a paciência...');
    speak('zen_annoyed', true);
  }

  // ── Zen → Excited ──

  function enterExcited(now) {
    state.mode = 'excited';
    state.petCharge = 0;
    state.personality = excited;
    state.zen = null;
    state.zenAuraActive = false;
    state.zenBreathingActive = false;
    setTint(null);
    setPalette(excited.palette);
    state.signatureAnim = null;
    state.excitedState = {
      phase: 'needYou',
      needYouUntil: now + NEED_YOU_MIN_MS + Math.random() * (NEED_YOU_MAX_MS - NEED_YOU_MIN_MS),
      nextHeartAt: now + HEART_MIN_MS,
      lastPetSeenAt: 0,
      pettingMsInPleasePet: 0,
    };
    logEvent('excited', 'explodiu — modo Excited ativado!');
    speak('excited', true);
  }

  function exitExcitedToNormality(reason, now) {
    state.mode = 'normality';
    state.personality = normality;
    state.excitedState = null;
    setPalette(normality.palette);
    state.signatureAnim = null;
    logEvent('excited', `saiu do modo excited (${reason})`);
  }

  // ── Loop por frame ──

  /** Chamado a cada frame, antes do resto da animação (updateAlive). Pode
   * retornar uma pose { z, y, scale, unfold, spinMul } com prioridade sobre
   * a assinatura normal (zen_breathing / zen_aura / zen_much_more_excited),
   * ou null quando o resto da animação deve seguir normal (ex: Excited). */
  function update(now, delta) {
    if (state.mode === 'zen') return updateZen(now);
    if (state.mode === 'excited') return updateExcited(now, delta);
    updateNormalityCharge(now, delta);
    return null;
  }

  // Normality → Excited: barra cheia + cafuné continuando → aura no coração
  // cresce; cheia → Excited. Parou o carinho, a aura escorre de volta.
  function updateNormalityCharge(now, delta) {
    if (state.pettingNow && state.affection >= PET_CHARGE_FULL_AFFECTION) {
      state.petCharge = Math.min(state.petCharge + delta / PET_CHARGE_FILL_SEC, 1);
      if (state.petCharge >= 1) {
        logEvent('supercarga', 'carinho transbordou — Normality → Excited');
        enterExcited(now);
      }
    } else {
      state.petCharge = Math.max(0, state.petCharge - delta / PET_CHARGE_DRAIN_SEC);
    }
  }

  function updateZen(now) {
    const z = state.zen;
    if (!z) return null;

    if (z.transition) {
      const p = (now - z.transition.start) / ZEN_TRANSITION_DURATION_MS;
      if (p >= 1) {
        enterExcited(now);
        return null;
      }
      // treme cada vez mais forte, "explode" no final
      const shake = Math.sin(p * 40) * 0.12 * p;
      return { z: shake, y: 0, scale: p * 0.08, unfold: p * 0.4, spinMul: 1 + p * 2 };
    }

    if (z.aura) {
      const p = (now - z.aura.start) / ZEN_AURA_DURATION_MS;
      if (p >= 1) {
        exitZenToNormality('zen_aura terminou', now);
        return null;
      }
      return zen.zenAura.apply(clamp(p, 0, 1));
    }

    // zen_much_more_excited: carinho contínuo por >= 20s enquanto respira
    if (state.pettingNow) {
      if (!z.pettingStreakStart) z.pettingStreakStart = now;
      if (now - z.pettingStreakStart >= ZEN_EXCITED_PET_MS) {
        startZenTransition(now);
        return null;
      }
    } else {
      z.pettingStreakStart = 0;
    }

    if (z.breathing) {
      const b = z.breathing;

      // gesto de quebrar o transe: pego, levantado bem alto, solto
      if (state.dragging) {
        b.wasDragging = true;
        const lift = state.restY - b.baselineY;
        if (lift > b.peakLift) b.peakLift = lift;
      } else if (b.wasDragging && !state.releaseFall) {
        b.wasDragging = false;
        const broke = b.peakLift >= BREATHING_LIFT_THRESHOLD;
        b.peakLift = 0;
        if (broke) {
          exitZenToNormality('carregado bem alto e solto — quebrou a respiração', now);
          return null;
        }
      }

      // escalada: respiração contínua e imóvel por 2min → zen_aura
      if (now - b.start >= ZEN_BREATHING_ESCALATE_MS) {
        startZenAura(now);
        return zen.zenAura.apply(0);
      }

      const cyclesSec = zen.signature.duration;
      const p = ((now - b.start) / 1000 % cyclesSec) / cyclesSec;
      return zen.signature.apply(p);
    }

    return null;
  }

  function updateExcited(now, delta) {
    const es = state.excitedState;
    if (!es) return null;

    if (es.phase === 'needYou') {
      if (now >= es.nextHeartAt) {
        es.nextHeartAt = now + HEART_MIN_MS + Math.random() * (HEART_MAX_MS - HEART_MIN_MS);
        speak('need_you', true);
      }
      if (now >= es.needYouUntil) {
        es.phase = 'pleasePet';
        es.lastPetSeenAt = now;
        es.pettingMsInPleasePet = 0;
        logEvent('please_pet', 'foi pedir carinho');
        speak('please_pet', true);
      }
      return null;
    }

    // fase please_pet: espera carinho, mas nem demais nem de menos
    if (state.pettingNow) {
      es.pettingMsInPleasePet += delta * 1000;
      es.lastPetSeenAt = now;
      if (es.pettingMsInPleasePet >= PLEASE_PET_EXCESS_MS) {
        speak('please_pet_shy', true);
        exitExcitedToNormality('carinho demais — ficou envergonhado', now);
        return null;
      }
    } else if (now - es.lastPetSeenAt >= PLEASE_PET_TIMEOUT_MS) {
      speak('please_pet_giveup', true);
      exitExcitedToNormality('sem carinho — desistiu', now);
      return null;
    }

    return null;
  }

  return { enterZen, update };
}
