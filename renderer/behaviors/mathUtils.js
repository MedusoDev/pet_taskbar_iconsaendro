// Helpers matemáticos genéricos, usados por todos os sistemas de comportamento.
import * as THREE from '../../node_modules/three/build/three.module.js';

export const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
export const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
/** 0 → 1 → 0 ao longo de p ∈ [0,1] */
export const pulse = (p) => Math.sin(clamp(p, 0, 1) * Math.PI);
/** sobe, segura, desce — envelope da espreguiçada */
export const stretchEnv = (p) =>
  p < 0.3 ? smooth(p / 0.3) : p < 0.62 ? 1 : smooth((1 - p) / 0.38);
export const damp = THREE.MathUtils.damp;
