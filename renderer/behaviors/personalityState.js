// Máquina de estados da personalidade: Normality é a base. Zen e Excited são
// alcançados por comportamento do usuário e sempre voltam pro Normality —
// nunca escolhidos por dia. Ver BRAINSTORM_PERSONALIDADES.md.
//
// Normality ──(~4,5min idle)──▶ Zen (zen_breathing, imóvel)
//   Zen ──(~6min contínuos em zen_breathing)──▶ zen_aura ──(termina)──▶ Normality
//   Zen ──(carregado bem alto e solto)──▶ Normality
//   Zen ──(carinho contínuo por ~6s, teste)──▶ zen_much_more_excited ──▶ Excited
//     Excited estacionado (parked): trapped (implora ofegante pra sair)
//       trapped ──(unpark)──▶ rush (barra cheia, corre pro mouse) ──(chegou
//         perto)──▶ solta as gotículas ──▶ Normality
//       trapped ──(14s sem liberar)──▶ se acaba ali mesmo ──▶ Normality
//     Excited: entra no estado LIVRE (anda errático + flerta sozinho) — a
//       "vida própria" do Excited, independente de carinho (seção 5a).
//       free ──(cafuné sustentado)──▶ need_you (segue o mouse) ──▶ please_pet
//         please_pet ──(carinho demais)──▶ shy (respinga, blush ///) ──▶ Normality
//           shy ──(carinho continua na janela)──▶ shy2/much_petting (2x mais
//             intenso) ──▶ nocaute: shutdown + z z z por ~1min ──▶ Normality
//         please_pet ──(carinho parou)──▶ volta pro estado LIVRE (não Normality)
//       free ──(≥5min no Excited E ≥2min sem input)──▶ Normality (seção 5c)
import { normality } from '../personalities/normality.js';
import { zen } from '../personalities/zen.js';
import { excited } from '../personalities/excited.js';
import { clamp } from './mathUtils.js';
import { resetBoredom } from './boredom.js';
import { CONFIG } from '../config.js';

// ── Zen: respiração / aura ──
const ZEN_AURA_DURATION_MS = zen.zenAura.duration * 1000;
// breathing → zen_aura é ajustável na aba Ritmo e Tempos
// (CONFIG.ritmo.breathingToAuraSec, faixa 4-8min).
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

// ── Excited: estado LIVRE (vida própria) e saída (seção 5) ──
// O Excited "livre" (anda errático + flerta sozinho) É o estado padrão. O
// loop de carinho é UMA fase dentro dele, engatada por cafuné sustentado.
const FREE_PET_ENGAGE_MS = 600;      // carinho contínuo no estado livre → engata o loop
// O "cansaço" do Excited (5c) — tempo total animado E tempo sem input pra sair
// — é ajustável na aba Ritmo e Tempos: CONFIG.ritmo.excitedMaxMin /
// excitedIdleExitMin.

// ── Excited: need_you → please_pet ──
const NEED_YOU_MIN_MS = 8000;
const NEED_YOU_MAX_MS = 13000;
const HEART_MIN_MS = 1200;
const HEART_MAX_MS = 2000;
const PLEASE_PET_TIMEOUT_MS = 5000; // sem carinho → volta pro estado livre
const PLEASE_PET_EXCESS_MS = 3000;  // carinho acumulado dentro do please_pet → vergonha

// ── Excited: saída envergonhada (carinho demais) ──
const SHY_EXIT_MS = 4200;            // murcha tremendo antes de voltar pro Normality
const SHY_BLUSH_EXTRA_MS = 2500;     // blush "///" ainda visível depois de sair
const SHY_COOLDOWN_MS = 30000;       // vergonha recente → supercarga não recarrega
const SHY_PALETTE_HOLD_MAX_MS = 8000; // rubor: cor do Excited segura enquanto o cafuné continua

// ── Excited estacionado (trapped): implora pra sair, ofegante ──
// Liberado (unpark) → rush: sai com a barra cheia e alivia ao chegar no
// mouse. Não liberado a tempo → se acaba ali mesmo e volta pro Normality.
const TRAPPED_GIVEUP_MS = 14000;
// ("perto do mouse" do rush = 90px, checado em liveAnimation.js → rushArrived)

// ── much_petting: o carinho NÃO parou depois da vergonha ──
// Reincide direto na sobrecarga (shy2), muito mais intensa, e termina
// apagando: shutdown variante "nocaute" com z z z por ~1min (shutdown.js).
const MUCH_PETTING_WINDOW_MS = 15000; // janela pós-shy pra reincidir
const MUCH_PETTING_TRIGGER_MS = 2500; // carinho contínuo dentro da janela
const SHY2_MS = 3500;                 // segunda vergonha, bem mais intensa
const KNOCKOUT_COOLDOWN_MS = 120000;  // depois do nocaute: paz por 2min

// O gatilho manual da tecla Z foi removido e o timer automático de "2min
// sem interação → Zen" ainda NÃO está ligado — no momento o Zen não tem
// porta de entrada (enterZen fica exportado esperando o gatilho definitivo).

export function createPersonalityState({ state, setPalette, setTint, logEvent, speak }) {
  state.personality = normality;
  state.mode = 'normality';
  state.zen = null;
  state.excitedState = null;
  state.zenAuraActive = false;
  state.zenBreathingActive = false;
  state.petCharge = 0;

  // Morph de troca de humor: TODA transição de personalidade toca a mesma
  // animação-relâmpago (enrola girando → flash → assenta com wobble), por
  // cima do que estiver rolando — a pose em si vive em liveAnimation.js.
  function startMorph(now) {
    state.morphAnim = { start: now };
  }

  // ── Normality ⇄ Zen ──

  function enterZen(now) {
    if (state.mode !== 'normality') return;
    state.mode = 'zen';
    state.personality = zen;
    startMorph(now);
    setPalette(zen.palette);
    state.signatureAnim = null;
    // Viagem em andamento brigaria com a pose de respiração imóvel (e o
    // baselineY sairia do meio do voo) — assenta onde está antes de meditar.
    cancelReloc();
    state.zenBreathingActive = true;
    state.zen = {
      breathing: { start: now, baselineY: state.restY, peakLift: 0, wasDragging: false },
      aura: null,
      transition: null,
      pettingStreakStart: 0,
    };
    logEvent('zen', 'entrou no modo zen — respiração imóvel' + (state.parked ? ' (estacionado: autocontrole perfeito)' : ''));
    // Estacionado ele nem reclama: parado é o lugar ideal pra meditar
    speak(state.parked ? 'zen_parked' : 'zen_enter', true);
  }

  function exitZenToNormality(reason, now) {
    state.mode = 'normality';
    state.personality = normality;
    startMorph(now);
    state.zenAuraActive = false;
    state.zenBreathingActive = false;
    setTint(null);
    setPalette(normality.palette);
    state.signatureAnim = null;
    state.zen = null;
    // O tempo meditando não conta como idle: recomeça o relógio de tédio do
    // zero (zenCycleDone segue true — sem input novo, a próxima parada do
    // idle é o sono, não outro zen; senão ele rusharia zen→aura→zen).
    resetBoredom(state, now);
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
    startMorph(now);
    state.zen = null;
    state.zenAuraActive = false;
    state.zenBreathingActive = false;
    state.excitedEnteredAt = now; // relógio do "cansaço" total (seção 5c)
    setTint(null);
    setPalette(excited.palette);
    state.signatureAnim = null;
    // Viagem em andamento morreria brigando com o "seguir o mouse" por
    // âncora — cancela pra ele engatar limpo.
    cancelReloc();
    if (state.parked) {
      // Estacionado: não pode perseguir — fica preso implorando pra sair
      state.excitedState = { phase: 'trapped', trappedStart: now, nextPleaAt: now + 800 };
      logEvent('excited', 'ativado PRESO (estacionado) — implorando pra sair!');
      speak('let_me_out', true);
    } else {
      // Vida própria: entra no estado LIVRE (anda errático + flerta sozinho).
      // O loop de carinho (needYou→pleasePet→...) só começa se o usuário fizer
      // cafuné durante o estado livre (ver updateExcitedFree). Seção 5a/5b.
      enterExcitedFree(now, 'explodiu — modo Excited ativado (estado livre)!');
      speak('excited', true);
    }
  }

  // Estado LIVRE do Excited (seção 5a/5b): a "vida própria" dele. Reutilizado
  // na entrada e sempre que o carinho para antes do clímax (volta pra cá, não
  // pro Normality). O andar errático fica em wander.js; o flerte espontâneo,
  // no ambientSpeech.js; a shimmy, na assinatura da personalidade.
  function enterExcitedFree(now, reason) {
    cancelReloc();
    state.excitedState = {
      phase: 'free',
      pettingMs: 0, // carinho sustentado no estado livre pra engatar o loop
    };
    // Arranca já pra um novo destino errático (não fica plantado no lugar)
    state.nextRelocateAt = now + 400 + Math.random() * 600;
    logEvent('excited', reason);
  }

  // Carinho demais no please_pet: gotículas brancas espirram, o blush "///"
  // acende e ele murcha tremendo (fase shy) antes de voltar pro Normality —
  // a paleta já volta devagar sozinha (as faces perseguem as cores por lerp).
  function startShyExit(now) {
    const es = state.excitedState;
    es.phase = 'shy';
    es.shyStart = now;
    state.pendingBurst = true; // liveAnimation dispara o respingo onde o gem está
    state.blushUntil = now + SHY_EXIT_MS + SHY_BLUSH_EXTRA_MS;
    state.excitedCooldownUntil = now + SHY_EXIT_MS + SHY_COOLDOWN_MS;
    // abre a janela do much_petting: se o carinho continuar depois da
    // vergonha, reincide muito mais intenso
    state.shyRoundUntil = now + SHY_EXIT_MS + MUCH_PETTING_WINDOW_MS;
    state.muchPettingMs = 0;
    state.affection = Math.min(state.affection, 0.25); // precisa de um tempo
    state.petCharge = 0;
    state.signatureAnim = null;
    logEvent('excited_shy', 'carinho demais — transbordou, morrendo de vergonha');
    speak('please_pet_shy', true);
  }

  // much_petting round 2: nem chega a paquerar — vai direto pra sobrecarga
  // (fase shy2), muito mais intensa, e termina apagando (startKnockout).
  function startMuchPetting(now) {
    state.mode = 'excited';
    state.personality = excited;
    setPalette(excited.palette);
    cancelReloc();
    state.signatureAnim = null;
    state.shyRoundUntil = 0;
    state.muchPettingMs = 0;
    state.petCharge = 0;
    state.excitedState = { phase: 'shy2', shyStart: now, secondBurstDone: false };
    state.pendingBurst = true;
    state.pendingBurstIntense = true;
    state.blushUntil = now + SHY2_MS;
    logEvent('much_petting', 'o carinho não parou — sobrecarga total!');
    speak('much_petting', true);
  }

  // Fim do much_petting: desliga de vez e apaga dormindo — shutdown
  // variante "nocaute" (z z z por ~1min antes de religar assustado).
  function startKnockout(now) {
    speak('knockout', true);
    exitExcitedToNormality('much_petting — apagou de tanto carinho', now);
    state.affection = 0;
    state.shyRoundUntil = 0;
    state.excitedCooldownUntil = now + KNOCKOUT_COOLDOWN_MS;
    state.dragging = false; // se estava no colo, escorrega — apagou de vez
    state.releaseFall = null;
    // Apagado não tem rubor: a cor volta ao normal já (dormindo escuro)
    state.paletteHoldMaxUntil = 0;
    setPalette(normality.palette);
    state.shutdown = { start: now, vy: 0, falling: false, bounces: 0, startled: false, knockout: true };
    logEvent('knockout', 'apagou de tanto carinho — dormindo fundo por ~1min');
  }

  function exitExcitedToNormality(reason, now) {
    state.mode = 'normality';
    state.personality = normality;
    startMorph(now);
    state.excitedState = null;
    // Rubor: se o cafuné ainda está rolando na hora da saída, a cor do
    // Excited se mantém por mais alguns segundos (solta quando o carinho
    // parar ou no teto — ver updateNormalityCharge).
    if (state.pettingNow) {
      state.paletteHoldMaxUntil = now + SHY_PALETTE_HOLD_MAX_MS;
      logEvent('rubor', 'carinho continua — segurando a cor do excited');
    } else {
      setPalette(normality.palette);
    }
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
    // Rubor: solta a cor do Excited quando o carinho parar (ou no teto)
    if (state.paletteHoldMaxUntil) {
      if (!state.pettingNow || now >= state.paletteHoldMaxUntil) {
        state.paletteHoldMaxUntil = 0;
        setPalette(normality.palette);
        logEvent('rubor', 'passou — cor derretendo de volta ao normal');
      }
    }

    // much_petting: saiu envergonhado mas o carinho NÃO parou → reincide
    // (ignora o cooldown normal da supercarga — esse caminho é próprio)
    if (now < state.shyRoundUntil) {
      if (state.pettingNow) {
        state.muchPettingMs += delta * 1000;
        if (state.muchPettingMs >= MUCH_PETTING_TRIGGER_MS) {
          startMuchPetting(now);
          return;
        }
      }
    } else {
      state.muchPettingMs = 0;
    }

    if (state.pettingNow && state.affection >= PET_CHARGE_FULL_AFFECTION && now >= state.excitedCooldownUntil) {
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
      // treme cada vez mais forte, "explode" no final — o halo também perde
      // a calma: vira vermelho junto com o tint do material (ZEN_TRANSITION_TINT)
      const shake = Math.sin(p * 40) * 0.12 * p;
      return {
        z: shake, y: 0, scale: p * 0.08, unfold: p * 0.4, spinMul: 1 + p * 2,
        ringBreath: 1, ringTint: ZEN_TRANSITION_TINT, ringTintMix: p,
      };
    }

    if (z.aura) {
      const p = (now - z.aura.start) / ZEN_AURA_DURATION_MS;
      if (p >= 1) {
        exitZenToNormality('zen_aura terminou', now);
        return null;
      }
      const pose = zen.zenAura.apply(clamp(p, 0, 1));
      pose.rainbow = 1; // clímax: arco-íris na força máxima
      return pose;
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

      // escalada: respiração contínua e imóvel por N min → zen_aura
      if (now - b.start >= CONFIG.ritmo.breathingToAuraSec * 1000) {
        startZenAura(now);
        return zen.zenAura.apply(0);
      }

      const cyclesSec = zen.signature.duration;
      const p = ((now - b.start) / 1000 % cyclesSec) / cyclesSec;
      const pose = zen.signature.apply(p);
      // Arco-íris da respiração: começa suave e esquenta conforme a
      // zen_aura se aproxima (a cor "carrega" junto com a meditação)
      pose.rainbow = 0.3 + 0.55 * clamp((now - b.start) / (CONFIG.ritmo.breathingToAuraSec * 1000), 0, 1);
      return pose;
    }

    return null;
  }

  function updateExcited(now, delta) {
    const es = state.excitedState;
    if (!es) return null;

    // fase free (estado LIVRE, seção 5a/5b): a vida própria do Excited
    if (es.phase === 'free') return updateExcitedFree(now, delta);

    // fase trapped: ativado estacionado — preso, implora pra sair com
    // veemência, respirando ofegante
    if (es.phase === 'trapped') {
      // Liberado (unpark)! Sai com a barra cheia, correndo pro mouse
      if (!state.parked) {
        es.phase = 'rush';
        state.affection = 1.2;
        state.rushArrived = false;
        logEvent('excited', 'LIBERADO — correndo pro mouse com tudo');
        speak('rush_release', true);
        return null;
      }
      if (now >= es.nextPleaAt) {
        es.nextPleaAt = now + 2000 + Math.random() * 1500;
        speak('let_me_out', true);
      }
      // Não foi liberado a tempo → se acaba ali mesmo e volta pro Normality
      if (now - es.trappedStart >= TRAPPED_GIVEUP_MS) {
        state.pendingBurst = true;
        state.blushUntil = now + 5000;
        state.affection = Math.min(state.affection, 0.25);
        state.excitedCooldownUntil = now + SHY_COOLDOWN_MS;
        speak('trapped_giveup', true);
        exitExcitedToNormality('preso e não liberado — se acabou ali mesmo', now);
        return null;
      }
      // Ofegante: respiração rápida e curta + tremidinha, no lugar
      const el = now - es.trappedStart;
      const pant = (Math.sin(el / 110) + 1) / 2;
      return {
        z: Math.sin(el / 45) * 0.06,
        y: pant * 0.18,
        scale: pant * 0.05,
        unfold: 0.15 + pant * 0.3,
        spinMul: 1.6,
      };
    }

    // fase rush: liberado do estacionamento — persegue o mouse com a barra
    // cheia; chegou perto (ver liveAnimation.js) → solta tudo e alivia
    if (es.phase === 'rush') {
      if (state.rushArrived) {
        state.rushArrived = false;
        state.pendingBurst = true;
        state.blushUntil = now + 5500;
        state.affection = 0;
        state.excitedCooldownUntil = now + SHY_COOLDOWN_MS;
        speak('rush_done', true);
        exitExcitedToNormality('chegou no mouse — soltou tudo e aliviou', now);
      }
      return null;
    }

    // fase shy2 (much_petting): segunda sobrecarga, MUITO mais intensa —
    // treme forte o tempo todo, gira alucinado, respinga duas vezes e no
    // fim apaga de vez (nocaute)
    if (es.phase === 'shy2') {
      const el = now - es.shyStart;
      const p = el / SHY2_MS;
      if (p >= 1) {
        startKnockout(now);
        return null;
      }
      if (!es.secondBurstDone && p >= 0.55) {
        es.secondBurstDone = true;
        state.pendingBurst = true;
        state.pendingBurstIntense = true;
      }
      const env = Math.sin(clamp(p, 0, 1) * Math.PI);
      return {
        z: Math.sin(el / 15) * 0.32,
        y: Math.abs(Math.sin(el / 105)) * 0.5,
        scale: 0.14 * env,
        unfold: 0.5 * env,
        spinMul: 3 + p * 4,
      };
    }

    // fase shy: para de perseguir o mouse (ver liveAnimation.js), treme de
    // vergonha no começo e murcha devagar até voltar pro Normality
    if (es.phase === 'shy') {
      const p = (now - es.shyStart) / SHY_EXIT_MS;
      if (p >= 1) {
        exitExcitedToNormality('vergonha — saiu devagarinho', now);
        return null;
      }
      const tremor = Math.sin((now - es.shyStart) / 26) * 0.09 * Math.max(0, 1 - p * 2.2);
      const droop = Math.min(p * 1.4, 1);
      return {
        z: tremor,
        y: -0.3 * droop,
        scale: -0.07 * droop,
        unfold: 0.03 * (1 - p),
        spinMul: 0.2,
      };
    }

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
        startShyExit(now);
        return null;
      }
    } else if (now - es.lastPetSeenAt >= PLEASE_PET_TIMEOUT_MS) {
      // Carinho parou antes do clímax → volta pro estado LIVRE, não pro
      // Normality (seção 5b). Só sai do Excited de vez pelo critério da 5c
      // (cansaço + tédio real), avaliado no updateExcitedFree.
      speak('please_pet_giveup', true);
      enterExcitedFree(now, 'carinho parou antes do clímax — volta a viver livre');
      return null;
    }

    // Ofegante implorando: respiração curta e rápida, o corpo inteiro
    // pedindo — pose própria (suprime o shimmy enquanto implora)
    const pant = (Math.sin(now / 130) + 1) / 2;
    return {
      z: Math.sin(now / 210) * 0.03,
      y: pant * 0.07,
      scale: pant * 0.02,
      unfold: 0.08 + pant * 0.1,
      spinMul: 1.15,
    };
  }

  // fase free (seção 5a/5b): anda errático (wander.js) e flerta sozinho
  // (ambientSpeech.js). Aqui só cuidamos de (a) engatar o loop de carinho se o
  // usuário fizer cafuné e (b) o critério de saída do Excited (seção 5c).
  function updateExcitedFree(now, delta) {
    const es = state.excitedState;

    // (a) Cafuné sustentado durante o estado livre → engata o loop de paquera
    // (needYou → pleasePet → ...). Precisa de um tiquinho pra não engatar num
    // roçar acidental do cursor.
    if (state.pettingNow) {
      es.pettingMs += delta * 1000;
      if (es.pettingMs >= FREE_PET_ENGAGE_MS) {
        es.phase = 'needYou';
        es.needYouUntil = now + NEED_YOU_MIN_MS + Math.random() * (NEED_YOU_MAX_MS - NEED_YOU_MIN_MS);
        es.nextHeartAt = now + HEART_MIN_MS;
        es.lastPetSeenAt = now;
        es.pettingMsInPleasePet = 0;
        logEvent('excited', 'carinho no estado livre — engatou o loop de paquera');
        speak('need_you', true);
      }
      return null;
    }
    es.pettingMs = 0;

    // (b) Saída do Excited (seção 5c): SÓ sai quando as DUAS valem —
    // >= 5min TOTAL animado (cansou) E >= 2min sem input nenhum (tédio real).
    const inExcitedFor = now - state.excitedEnteredAt;
    const idleFor = now - state.lastInput;
    if (
      inExcitedFor >= CONFIG.ritmo.excitedMaxMin * 60000 &&
      idleFor >= CONFIG.ritmo.excitedIdleExitMin * 60000
    ) {
      exitExcitedToNormality('cansou de estar animado + tédio real (5min + 2min)', now);
      resetBoredom(state, now); // recomeça o relógio de idle limpo no Normality
      speak('calmdown', true);  // já no Normality: usa as falas de calmdown dele
    }
    return null;
  }

  return { enterZen, update };
}
