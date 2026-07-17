// Interações de mouse com o gem: cutucar, arrastar, cafuné e o
// click-through no resto da tela (a janela cobre a tela toda, então só
// captura eventos quando o cursor está de fato em cima do gem).
import * as THREE from '../../node_modules/three/build/three.module.js';
import { GEM_RADIUS } from '../scene.js';
import { EDGE_MARGIN, scheduleNextRelocate, groundAtX } from './wander.js';
import { clamp } from './mathUtils.js';

export function setupInteractions({ state, camera, gem, mesh, logEvent, speak, registerInput, prompt }) {
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  let parkAskedThisDrag = false;

  // Cafuné exige esfregada de verdade: o cursor precisa fazer vai-e-vem em
  // cima dele (inversões de direção) — só passar por cima não conta.
  const PET_FLIP_WINDOW = 1000; // ms para acumular inversões
  const PET_FLIPS_NEEDED = 2;   // inversões dentro da janela para engatar
  const PET_JITTER_PX = 2;      // movimento abaixo disso não define direção
  let petDirX = 0;
  let petDirY = 0;
  let petFlips = [];

  function isPointerOverPet(event) {
    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    return raycaster.intersectObject(mesh, false).length > 0;
  }

  // Converte coordenadas de tela (px) pra coordenadas de mundo no plano
  // z=0, usando os limites da câmera ortográfica.
  function pointerToWorld(event) {
    const nx = event.clientX / window.innerWidth;
    const ny = event.clientY / window.innerHeight;
    return {
      x: camera.left + nx * (camera.right - camera.left),
      y: camera.top - ny * (camera.top - camera.bottom),
    };
  }

  window.addEventListener('mousedown', (event) => {
    // Estacionar: segurando ele no colo (drag com o esquerdo), um clique do
    // botão DIREITO dispara a pergunta "quer ficar parado aqui?".
    if (event.button === 2) {
      if (
        state.dragging &&
        prompt &&
        !state.parked &&
        !parkAskedThisDrag
      ) {
        parkAskedThisDrag = true;
        state.awaitingParkAnswer = true;
        logEvent('pergunta', 'segurado + botão direito — quer que eu fique parado aqui?');
        prompt.show(
          'Quer que eu fique paradinho aqui?',
          'Fica aqui',
          () => {
            state.parked = true;
            state.awaitingParkAnswer = false;
            state.parkHome = { x: gem.position.x, y: gem.position.y };
            logEvent('parked', `estacionado em x=${gem.position.x.toFixed(1)} — não sai do lugar`);
          },
          () => {
            // Murchou sem resposta → solta o estado pendente e volta à vida
            state.awaitingParkAnswer = false;
            scheduleNextRelocate(state, performance.now());
            logEvent('pergunta', 'sem resposta — seguindo a vida');
          }
        );
      }
      return;
    }
    if (event.button !== 0) return;
    if (!isPointerOverPet(event) || state.shutdown || state.zenAuraActive) return;

    registerInput(state, performance.now());
    state.dragging = true;
    state.releaseFall = null;
    state.signatureAnim = null;
    state.dragDistance = 0;
    parkAskedThisDrag = false;
    state.lastPointerScreen = { x: event.clientX, y: event.clientY };
    logEvent('colo', 'pegou ele no colo');
    speak('drag');

    const wp = pointerToWorld(event);
    state.dragOffsetX = gem.position.x - wp.x;
    state.dragOffsetY = gem.position.y - wp.y;
  });

  window.addEventListener('mousemove', (event) => {
    if (state.dragging) {
      state.dragDistance +=
        Math.abs(event.clientX - state.lastPointerScreen.x) +
        Math.abs(event.clientY - state.lastPointerScreen.y);
      state.lastPointerScreen = { x: event.clientX, y: event.clientY };

      const wp = pointerToWorld(event);
      const limit = state.halfWidth - GEM_RADIUS - EDGE_MARGIN;
      gem.position.x = clamp(wp.x + state.dragOffsetX, -limit, limit);
      gem.position.y = clamp(
        wp.y + state.dragOffsetY,
        groundAtX(state, gem.position.x),
        camera.top - GEM_RADIUS - 0.1
      );

      if (state.ignoringMouseEvents && window.petAPI) {
        window.petAPI.setIgnoreMouseEvents(false);
        state.ignoringMouseEvents = false;
      }
      return;
    }

    const overPet = isPointerOverPet(event);

    // Carinho: esfregar o mouse EM CIMA dele (vai-e-vem). Depois de
    // engatado, qualquer movimento sobre ele mantém o cafuné; parar por
    // 400ms encerra (ver liveAnimation.js).
    if (overPet && !state.shutdown && !state.zenAuraActive) {
      const now = performance.now();
      const dx = event.movementX;
      const dy = event.movementY;
      const dirX = Math.abs(dx) > PET_JITTER_PX ? Math.sign(dx) : 0;
      const dirY = Math.abs(dy) > PET_JITTER_PX ? Math.sign(dy) : 0;
      if (dirX && petDirX && dirX !== petDirX) petFlips.push(now);
      if (dirY && petDirY && dirY !== petDirY) petFlips.push(now);
      if (dirX) petDirX = dirX;
      if (dirY) petDirY = dirY;
      petFlips = petFlips.filter((f) => now - f < PET_FLIP_WINDOW);

      if (petFlips.length >= PET_FLIPS_NEEDED || state.pettingNow) {
        const strokes = Math.abs(dx) + Math.abs(dy);
        state.affection = Math.min(state.affection + strokes * 0.0004, 1.2);
        state.lastPetAt = now;
        if (!state.pettingNow) {
          state.pettingNow = true;
          if (now - state.lastPetLogAt > 5000) {
            state.lastPetLogAt = now;
            logEvent('carinho', 'recebendo cafuné');
            speak('petting');
          }
        }
      }
    }

    // Cursor sobre o balão de pergunta também segura os eventos (senão o
    // click-through engole o clique no botão)
    const overPrompt = prompt && prompt.isPointOver(event.clientX, event.clientY);
    const shouldIgnore = !overPet && !overPrompt;
    if (shouldIgnore !== state.ignoringMouseEvents && window.petAPI) {
      window.petAPI.setIgnoreMouseEvents(shouldIgnore);
      state.ignoringMouseEvents = shouldIgnore;
    }
  });

  // Botão direito não encerra o colo (ele é o gatilho do estacionar) e não
  // abre menu de contexto em cima do pet.
  window.addEventListener('contextmenu', (event) => {
    if (state.dragging || isPointerOverPet(event)) event.preventDefault();
  });

  window.addEventListener('mouseup', (event) => {
    if (event.button !== 0) return;
    if (!state.dragging) return;
    state.dragging = false;
    // Soltou com a pergunta de estacionar aberta → não cai: fica pairando
    // ali, esperando a resposta (o clique no botão vem depois do mouseup)
    if (state.awaitingParkAnswer) {
      state.awaitingParkAnswer = false;
      state.releaseFall = null;
      state.restX = gem.position.x;
      state.restY = gem.position.y;
      state.anchor.x = state.restX;
      state.anchor.y = state.restY;
      logEvent('soltou', 'pairando no lugar, esperando a resposta...');
      return;
    }
    state.releaseFall = { vy: 0, bounces: 0 };
    logEvent('soltou', 'caindo...');
  });

  window.addEventListener('click', (event) => {
    // Se acabou de arrastar de verdade, esse clique é só o fim do drag —
    // não conta como cutucão.
    const wasRealDrag = state.dragDistance > 6;
    state.dragDistance = 0;
    if (wasRealDrag) return;

    if (!isPointerOverPet(event) || state.shutdown || state.zenAuraActive) return;

    registerInput(state, performance.now());

    // Estacionado: o clique vira a pergunta de liberação, não cutucão.
    // Preso no Excited a súplica é bem mais veemente.
    if (state.parked && prompt) {
      const desperate = state.mode === 'excited';
      logEvent('pergunta', desperate ? 'cutucado preso e EXCITADO — implorando' : 'cutucado parado — posso voltar a passear?');
      prompt.show(
        desperate ? 'ME SOLTA! Por favor, por favor—' : 'Posso voltar a passear?',
        desperate ? 'Vai!' : 'Pode ir!',
        () => {
          state.parked = false;
          state.parkHome = null;
          scheduleNextRelocate(state, performance.now());
          logEvent('parked', 'liberado — voltando a passear');
        }
      );
      return;
    }

    // Zen (respiração/meditação): cutucão e tonta quebrariam a pose imóvel —
    // o clique é ignorado; interromper o zen continua sendo pelo gesto de
    // carregar bem alto e soltar (drag segue funcionando).
    if (state.mode === 'zen') return;

    // Cutucão: giro de peão + facetas abrem
    state.pokeVel += 8;
    state.unfold = Math.max(state.unfold, 0.8);

    // 3+ cliques em 2.5s → fica tonta
    const now = performance.now();
    state.clickTimes.push(now);
    state.clickTimes = state.clickTimes.filter((c) => now - c < 2500);
    if (state.clickTimes.length >= 3 && !state.dizzy) {
      state.dizzy = { start: now };
      state.clickTimes = [];
      logEvent('tonto', '3+ cliques seguidos');
      speak('dizzy');
    } else {
      logEvent('cutucado');
      speak('poke');
    }
  });

  return { isPointerOverPet, pointerToWorld };
}
