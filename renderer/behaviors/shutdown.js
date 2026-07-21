// Evento shutdown: desliga, cai como bolinha, quica e religa assustado.
// Tem prioridade sobre todo o resto da vida do pet enquanto está ativo.
//
// Variante "knockout" (much_petting): apagou de tanto carinho — desliga
// quase na hora, cai e fica dormindo com z z z por ~1min antes de religar.
import { damp, clamp } from './mathUtils.js';
import { resetBoredom } from './boredom.js';
import { groundAtX } from './wander.js';
import { GEM_RADIUS } from '../scene.js';

const SHUTDOWN_DUR = 12.5;
const SHUTDOWN_OFF_AT = 2.2;
const SHUTDOWN_ON_AT = 8.8;
const SHUTDOWN_RECOVERY = SHUTDOWN_DUR - SHUTDOWN_ON_AT; // religa → normal

const KNOCKOUT_OFF_AT = 0.5;     // apaga quase na hora (exausto)
const KNOCKOUT_SLEEP_SEC = 60;   // dorme apagado por 1min

export function updateShutdown(state, refs, now, delta, logEvent) {
  const { gem, mesh, applyUnfold } = refs;
  const shutdown = state.shutdown;
  const knockout = !!shutdown.knockout;
  const evT = (now - shutdown.start) / 1000;

  const offAt = knockout ? KNOCKOUT_OFF_AT : SHUTDOWN_OFF_AT;
  const onAt = knockout ? KNOCKOUT_OFF_AT + KNOCKOUT_SLEEP_SEC : SHUTDOWN_ON_AT;
  const dur = onAt + SHUTDOWN_RECOVERY;
  const off = evT >= offAt && evT < onAt;

  state.power = damp(state.power, off ? 0 : 1, 5, delta);

  // Rotação quase para quando desligada
  state.spin += delta * (0.02 + 0.26 * state.power);
  state.pokeVel = 0;

  // Facetas fecham desligada; religa com susto (0.9) e volta ao normal
  let unfoldTarget = 0.015;
  if (evT >= onAt) {
    if (!shutdown.startled) {
      shutdown.startled = true;
      shutdown.startleAt = now;
      logEvent('shutdown', knockout ? 'acordou do nocaute de carinho' : 'religou assustado');
    }
    const el = (now - shutdown.startleAt) / 1000;
    const p = clamp(el / 1.4, 0, 1);
    unfoldTarget = 0.9 * (1 - p) + 0.055 * p;
    // Olhar trêmulo de susto
    state.lookYaw = Math.sin(el * 11) * 0.35 * (1 - p);
  }
  state.unfold = damp(state.unfold, unfoldTarget, off ? 2.4 : 5, delta);
  applyUnfold(state.unfold);

  // Queda com gravidade + quiques (só enquanto desligada)
  const ground = groundAtX(state, gem.position.x);
  if (off) {
    shutdown.falling = true;
    shutdown.vy -= 7.5 * delta;
    gem.position.y += shutdown.vy * delta;
    if (gem.position.y <= ground) {
      gem.position.y = ground;
      if (Math.abs(shutdown.vy) > 0.6 && shutdown.bounces < 2) {
        shutdown.vy = -shutdown.vy * 0.42;
        shutdown.bounces++;
      } else {
        shutdown.vy = 0;
      }
    }
  } else if (evT >= onAt) {
    // Religada: flutua de volta ao lugar
    gem.position.y = damp(gem.position.y, ground + 0.13, 2.2, delta);
  }

  mesh.rotation.y = state.spin + state.lookYaw;
  mesh.rotation.x = damp(mesh.rotation.x, 0.22, 2, delta);
  mesh.rotation.z = damp(mesh.rotation.z, 0, 2, delta);
  gem.scale.setScalar(damp(state.scaleCur, 1, 2.2, delta));
  state.scaleCur = gem.scale.x;

  // Nocaute: dormindo apagado — z z z ao lado dele e blush escondido.
  // (updateAlive não roda durante o shutdown, então a UI é cuidada aqui.)
  if (knockout) {
    const { zzzEl, camera, effects } = refs;
    if (effects) effects.updateBlush(false, 0, 0);
    const showZzz = off && evT > offAt + 1.5; // já caiu e assentou
    zzzEl.classList.toggle('visible', showZzz);
    if (showZzz) {
      const xPx = ((gem.position.x / state.halfWidth) + 1) / 2 * window.innerWidth;
      const bottomPx =
        ((gem.position.y + GEM_RADIUS * 1.15 - camera.bottom) / (camera.top - camera.bottom)) *
          window.innerHeight + 6;
      zzzEl.style.left = `${xPx + 34}px`;
      zzzEl.style.bottom = `${bottomPx}px`;
    }
  }

  if (evT >= dur) {
    state.shutdown = null;
    state.power = 1;
    resetBoredom(state, now);
    if (!knockout) {
      // O gag de shutdown já aconteceu neste ciclo de idle: não re-arma
      // (senão ele ficaria em loop de shutdown a cada ~40s e nunca chegaria
      // ao sono). Mantém zenCycleDone como está — assim o idle profundo
      // pós-reboot segue direto pro sono.
      state.shutdownDone = true;
    }
    logEvent('shutdown', knockout ? 'nocaute de carinho terminou — de volta ao normal' : 'de volta ao normal');
  }
}
