// Máquina de estados da personalidade: Normality é a base. Zen e Excited são
// alcançados por comportamento do usuário e sempre voltam pro Normality —
// nunca escolhidos por dia. Ver BRAINSTORM_PERSONALIDADES.md.
//
// Normality ──(tecla Z)──▶ Zen (zen_breathing, imóvel)
//   Zen ──(2min contínuos em zen_breathing)──▶ zen_aura ──(termina)──▶ Normality
//   Zen ──(carregado bem alto e solto)──▶ Normality
//   Zen ──(carinho contínuo por ~6s, teste)──▶ zen_much_more_excited ──▶ Excited
//     Excited estacionado (parked): trapped (implora ofegante pra sair)
//       trapped ──(unpark)──▶ rush (barra cheia, corre pro mouse) ──(chegou
//         perto)──▶ solta as gotículas ──▶ Normality
//       trapped ──(14s sem liberar)──▶ se acaba ali mesmo ──▶ Normality
//     Excited: need_you (segue o mouse) ──▶ please_pet (pede carinho)
//       please_pet ──(carinho demais)──▶ shy (respinga, blush ///) ──▶ Normality
//         shy ──(carinho continua na janela)──▶ shy2/much_petting (2x mais
//           intenso) ──▶ nocaute: shutdown + z z z por ~1min ──▶ Normality
//       please_pet ──(sem carinho)──▶ Normality
import { normality } from '../personalities/normality.js';
import { zen } from '../personalities/zen.js';
import { excited } from '../personalities/excited.js';
import { clamp } from './mathUtils.js';
import { resetBoredom } from './boredom.js';

// ── Zen: respiração / aura ──
const ZEN_AURA_DURATION_MS = zen.zenAura.duration * 1000;
const ZEN_BREATHING_ESCALATE_MS = 240000; // 4min contínuos em breathing → zen_aura (sem rush)
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

// ── Ico_Eye → Excited: arousal por conteúdo adulto no navegador ──
// Com um site NSFW ativo (state.nsfwActive, ver siteEye.js), a mesma aura
// de supercarga enche devagarinho sozinha — o pet tenta disfarçar, não
// consegue, e depois de ~35s de exposição contínua ele "liga" sozinho.
const NSFW_CHARGE_FILL_SEC = 35;

// ── Afterglow: os segundos derretidos depois do alívio (fase rush) ──
const AFTERGLOW_MS = 8000;

// ── Excited: need_you → please_pet ──
const NEED_YOU_MIN_MS = 8000;
const NEED_YOU_MAX_MS = 13000;
const HEART_MIN_MS = 1200;
const HEART_MAX_MS = 2000;
const PLEASE_PET_TIMEOUT_MS = 5000; // sem carinho → desiste
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

// Porta de entrada do Zen: o relógio de tédio (behaviors/boredom.js) chama
// enterZen depois de 1min de idle contínuo, uma vez por ciclo (o gatilho
// manual da tecla Z foi removido).

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
    state.zenAuraActive = false;
    state.zenBreathingActive = false;
    // Devolve o tint que o Ico_Eye pediu enquanto a aura era dona da cor
    setTint(state.siteTint || null);
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

  function enterExcited(now, source = 'petting') {
    state.mode = 'excited';
    state.petCharge = 0;
    state.personality = excited;
    state.zen = null;
    state.zenAuraActive = false;
    state.zenBreathingActive = false;
    setTint(state.siteTint || null);
    setPalette(excited.palette);
    state.signatureAnim = null;
    // O relógio de assinatura (nextSignatureAt) certamente já venceu durante
    // o zen — sem re-agendar, a shimmy dispararia no MESMO frame da entrada,
    // por cima da explosão da transição.
    state.nextSignatureAt = now + 4000 + Math.random() * 4000;
    // Viagem em andamento morreria brigando com o "seguir o mouse" por
    // âncora — cancela pra ele engatar a perseguição limpo.
    cancelReloc();
    if (state.parked) {
      // Estacionado: não pode perseguir — fica preso implorando pra sair
      state.excitedState = { phase: 'trapped', trappedStart: now, nextPleaAt: now + 800 };
      logEvent('excited', 'ativado PRESO (estacionado) — implorando pra sair!');
      speak('let_me_out', true);
    } else {
      state.excitedState = {
        phase: 'needYou',
        needYouUntil: now + NEED_YOU_MIN_MS + Math.random() * (NEED_YOU_MAX_MS - NEED_YOU_MIN_MS),
        nextHeartAt: now + HEART_MIN_MS,
        lastPetSeenAt: 0,
        pettingMsInPleasePet: 0,
      };
      if (source === 'nsfw') {
        state.blushUntil = now + 8000;
        logEvent('excited', 'o navegador venceu — modo Excited ativado pelo Ico_Eye!');
        speak('excited_nsfw', true);
      } else {
        logEvent('excited', 'explodiu — modo Excited ativado!');
        speak('excited', true);
      }
    }
  }

  // Afterglow: em vez de voltar seco pro Normality depois do alívio, o pet
  // fica uns segundos derretido — flutuação lenta, giro preguiçoso, falas
  // desconexas — e SÓ ENTÃO volta ao normal.
  function startAfterglow(now) {
    state.excitedState = { phase: 'afterglow', afterglowStart: now, nextLineAt: now + 1500 };
    state.blushUntil = now + AFTERGLOW_MS + 2000;
    logEvent('afterglow', 'derretido... voltando ao normal devagarinho');
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
    } else if (state.nsfwActive && !state.dragging && now >= state.excitedCooldownUntil) {
      // Ico_Eye: conteúdo adulto no navegador — a aura enche devagarinho
      // sozinha enquanto ele "finge que não viu"
      state.petCharge = Math.min(state.petCharge + delta / NSFW_CHARGE_FILL_SEC, 1);
      if (state.petCharge >= 1) {
        logEvent('arousal', 'exposição demais — Normality → Excited (culpa do navegador)');
        enterExcited(now, 'nsfw');
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
    // cheia; chegou perto (ver liveAnimation.js) → solta tudo, alivia e
    // emenda no afterglow (derretido) antes de voltar ao normal
    if (es.phase === 'rush') {
      if (state.rushArrived) {
        state.rushArrived = false;
        state.pendingBurst = true;
        state.affection = 0;
        state.excitedCooldownUntil = now + SHY_COOLDOWN_MS;
        speak('rush_done', true);
        logEvent('excited', 'chegou no mouse — soltou tudo e aliviou');
        startAfterglow(now);
      }
      return null;
    }

    // fase afterglow: derretido pós-alívio — flutua devagar, meio caído,
    // giro preguiçoso; solta uma fala desconexa no meio e volta ao normal
    if (es.phase === 'afterglow') {
      const el = now - es.afterglowStart;
      const p = el / AFTERGLOW_MS;
      if (p >= 1) {
        exitExcitedToNormality('afterglow terminou — recompôs a dignidade', now);
        return null;
      }
      if (now >= es.nextLineAt) {
        es.nextLineAt = now + 3200 + Math.random() * 2500;
        speak('afterglow', true);
      }
      // Derretido: balanço lento e largo, levemente afundado, quase sem girar
      const settle = Math.min(1, p * 3); // afunda rápido, recupera no final
      const recover = clamp((p - 0.75) / 0.25, 0, 1);
      return {
        z: Math.sin(el / 480) * 0.14 * (1 - recover),
        y: -0.35 * settle * (1 - recover) + Math.sin(el / 700) * 0.08,
        scale: -0.05 * settle * (1 - recover),
        unfold: 0.1 * (1 - p),
        spinMul: 0.15 + recover * 0.85,
      };
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
      speak('please_pet_giveup', true);
      exitExcitedToNormality('sem carinho — desistiu', now);
      return null;
    }

    return null;
  }

  return { enterZen, update };
}
