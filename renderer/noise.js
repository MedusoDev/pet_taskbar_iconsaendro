// Simplex noise 2D compacto (sem dependência externa), baseado no algoritmo
// clássico de Stefan Gustavson. Usado pro Drift: em vez de perseguir pontos
// aleatórios discretos (que geram aquela pausa "escolhe → converge → para →
// escolhe de novo"), a posição é uma função contínua do tempo — nunca para,
// nunca repete o mesmo caminho, sempre suave.

const GRAD = [
  [1, 1], [-1, 1], [1, -1], [-1, -1],
  [1, 0], [-1, 0], [0, 1], [0, -1],
];

function buildPermutation(seed) {
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;

  // Embaralha deterministicamente a partir da seed (mesmo padrão de "seed
  // simples" usado no resto do projeto — sem precisar de lib de random).
  let s = seed >>> 0 || 1;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }

  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  return perm;
}

export function createNoise2D(seed = 1) {
  const perm = buildPermutation(seed);
  const F2 = 0.5 * (Math.sqrt(3) - 1);
  const G2 = (3 - Math.sqrt(3)) / 6;

  function dot(g, x, y) {
    return g[0] * x + g[1] * y;
  }

  return function noise2D(xin, yin) {
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const X0 = i - t, Y0 = j - t;
    const x0 = xin - X0, y0 = yin - Y0;

    const i1 = x0 > y0 ? 1 : 0;
    const j1 = x0 > y0 ? 0 : 1;

    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;

    const ii = i & 255, jj = j & 255;
    const g0 = GRAD[perm[ii + perm[jj]] % 8];
    const g1 = GRAD[perm[ii + i1 + perm[jj + j1]] % 8];
    const g2 = GRAD[perm[ii + 1 + perm[jj + 1]] % 8];

    let n0 = 0, n1 = 0, n2 = 0;

    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 > 0) { t0 *= t0; n0 = t0 * t0 * dot(g0, x0, y0); }

    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 > 0) { t1 *= t1; n1 = t1 * t1 * dot(g1, x1, y1); }

    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 > 0) { t2 *= t2; n2 = t2 * t2 * dot(g2, x2, y2); }

    return 70 * (n0 + n1 + n2); // aprox. [-1, 1]
  };
}
