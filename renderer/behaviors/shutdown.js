// Evento shutdown: desliga, cai como bolinha, quica e religa assustado.
// Tem prioridade sobre todo o resto da vida do pet enquanto está ativo.
import { damp, clamp } from './mathUtils.js';
import { resetBoredom } from './boredom.js';

const SHUTDOWN_DUR = 12.5;
const SHUTDOWN_OFF_AT = 2.2;
const SHUTDOWN_ON_AT = 8.8;

export function updateShutdown(state, refs, now, delta, logEvent) {
  const { gem, mesh, applyUnfold } = refs;
  const shutdown = state.shutdown;
  const evT = (now - shutdown.start) / 1000;
  const off = evT >= SHUTDOWN_OFF_AT && evT < SHUTDOWN_ON_AT;

  state.power = damp(state.power, off ? 0 : 1, 5, delta);

  // Rotação quase para quando desligada
  state.spin += delta * (0.02 + 0.26 * state.power);
  state.pokeVel = 0;

  // Facetas fecham desligada; religa com susto (0.9) e volta ao normal
  let unfoldTarget = 0.015;
  if (evT >= SHUTDOWN_ON_AT) {
    if (!shutdown.startled) {
      shutdown.startled = true;
      shutdown.startleAt = now;
      logEvent('shutdown', 'religou assustado');
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
  if (off) {
    shutdown.falling = true;
    shutdown.vy -= 7.5 * delta;
    gem.position.y += shutdown.vy * delta;
    if (gem.position.y <= state.groundY) {
      gem.position.y = state.groundY;
      if (Math.abs(shutdown.vy) > 0.6 && shutdown.bounces < 2) {
        shutdown.vy = -shutdown.vy * 0.42;
        shutdown.bounces++;
      } else {
        shutdown.vy = 0;
      }
    }
  } else if (evT >= SHUTDOWN_ON_AT) {
    // Religada: flutua de volta ao lugar
    gem.position.y = damp(gem.position.y, state.groundY + 0.13, 2.2, delta);
  }

  mesh.rotation.y = state.spin + state.lookYaw;
  mesh.rotation.x = damp(mesh.rotation.x, 0.22, 2, delta);
  mesh.rotation.z = damp(mesh.rotation.z, 0, 2, delta);
  gem.scale.setScalar(damp(state.scaleCur, 1, 2.2, delta));
  state.scaleCur = gem.scale.x;

  if (evT >= SHUTDOWN_DUR) {
    state.shutdown = null;
    state.power = 1;
    resetBoredom(state, now);
    logEvent('shutdown', 'de volta ao normal');
  }
}
