// Interações de mouse com o gem: cutucar, arrastar, cafuné e o
// click-through no resto da tela (a janela cobre a tela toda, então só
// captura eventos quando o cursor está de fato em cima do gem).
import * as THREE from '../../node_modules/three/build/three.module.js';
import { GEM_RADIUS } from '../scene.js';
import { EDGE_MARGIN } from './wander.js';
import { clamp } from './mathUtils.js';

export function setupInteractions({ state, camera, gem, mesh, logEvent, speak, registerInput }) {
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

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
    if (!isPointerOverPet(event) || state.shutdown || state.zenAuraActive) return;

    registerInput(state, performance.now());
    state.dragging = true;
    state.releaseFall = null;
    state.signatureAnim = null;
    state.dragDistance = 0;
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
      gem.position.y = clamp(wp.y + state.dragOffsetY, state.groundY, camera.top - GEM_RADIUS - 0.1);

      if (state.ignoringMouseEvents && window.petAPI) {
        window.petAPI.setIgnoreMouseEvents(false);
        state.ignoringMouseEvents = false;
      }
      return;
    }

    const overPet = isPointerOverPet(event);

    // Carinho: mover o mouse EM CIMA dele (sem clicar) é cafuné — quanto
    // mais movimento, mais o medidor enche.
    if (overPet && !state.shutdown && !state.zenAuraActive) {
      const strokes = Math.abs(event.movementX) + Math.abs(event.movementY);
      state.affection = Math.min(state.affection + strokes * 0.0012, 1.2);
      state.lastPetAt = performance.now();
      if (!state.pettingNow) {
        state.pettingNow = true;
        if (performance.now() - state.lastPetLogAt > 5000) {
          state.lastPetLogAt = performance.now();
          logEvent('carinho', 'recebendo cafuné');
          speak('petting');
        }
      }
    }

    const shouldIgnore = !overPet;
    if (shouldIgnore !== state.ignoringMouseEvents && window.petAPI) {
      window.petAPI.setIgnoreMouseEvents(shouldIgnore);
      state.ignoringMouseEvents = shouldIgnore;
    }
  });

  window.addEventListener('mouseup', () => {
    if (!state.dragging) return;
    state.dragging = false;
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
