import * as THREE from '../node_modules/three/build/three.module.js';

// ─── Paleta de identidade (mesma do Icosaendro3D do portfólio) ───────────────
const COLORS = [
  new THREE.Color('#7C3AED'), // roxo vivo — Dev
  new THREE.Color('#4C1D95'), // roxo profundo
  new THREE.Color('#D97706'), // âmbar — Games
  new THREE.Color('#92400E'), // âmbar escuro
  new THREE.Color('#6D28D9'), // violeta — ponte
  new THREE.Color('#B45309'), // âmbar médio
];

// Mesma escala do portfólio: gem de raio 1.5.
export const GEM_RADIUS = 1.5;

// Meia-altura da vista em unidades de mundo (define o "zoom" da cena).
const VIEW_HALF_HEIGHT = 3.84;

export function initScene(canvas) {
  const scene = new THREE.Scene();

  // Câmera ORTOGRÁFICA: a janela é larguíssima (tela inteira) e uma câmera
  // perspectiva estica o gem ("distorção ovo") quando ele anda para longe do
  // centro. Com projeção ortográfica ele fica idêntico em qualquer ponto da
  // taskbar — e a rotação continua sendo 3D de verdade.
  const aspect = window.innerWidth / window.innerHeight;
  const camera = new THREE.OrthographicCamera(
    -VIEW_HALF_HEIGHT * aspect,
    VIEW_HALF_HEIGHT * aspect,
    VIEW_HALF_HEIGHT,
    -VIEW_HALF_HEIGHT,
    0.1,
    100
  );
  camera.position.set(0, 0, 10);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0); // fundo 100% transparente

  // ── Luzes dinâmicas: roxa + âmbar em órbitas opostas (como no portfólio) ──
  const ambient = new THREE.AmbientLight(0xffffff, 0.2);
  scene.add(ambient);

  const purpleLight = new THREE.PointLight('#7C3AED', 6, 14);
  const amberLight = new THREE.PointLight('#D97706', 5, 14);
  const whiteLight = new THREE.PointLight('#ffffff', 0.5);
  whiteLight.position.set(0, 0, 7);
  scene.add(purpleLight, amberLight, whiteLight);

  // ── FacetGem: 80 faces com cor própria, cada uma transitando no seu ritmo ──
  const base = new THREE.IcosahedronGeometry(GEM_RADIUS, 1);
  const gemGeo = base.toNonIndexed();
  base.dispose();

  const posCount = gemGeo.attributes.position.count; // 240 (detail=1)
  const faceCount = posCount / 3; // 80 faces
  const colors = new Float32Array(posCount * 3);

  const faceColors = [];
  const faceTargetIdx = [];
  const faceSpeeds = [];

  for (let f = 0; f < faceCount; f++) {
    const ci = Math.floor(Math.random() * COLORS.length);
    const color = COLORS[ci].clone();
    faceColors.push(color);
    faceTargetIdx.push(ci);
    faceSpeeds.push(0.05 + Math.random() * 0.12);

    for (let v = 0; v < 3; v++) {
      const idx = (f * 3 + v) * 3;
      colors[idx] = color.r;
      colors[idx + 1] = color.g;
      colors[idx + 2] = color.b;
    }
  }
  gemGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  // Pré-cálculo para o desdobramento das facetas: posições originais,
  // normal de cada face e uma amplitude aleatória própria por face.
  const basePos = new Float32Array(gemGeo.attributes.position.array);
  const faceNormals = [];
  const faceVariance = [];
  {
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const ab = new THREE.Vector3(), ac = new THREE.Vector3();
    for (let f = 0; f < faceCount; f++) {
      const i = f * 9;
      a.set(basePos[i], basePos[i + 1], basePos[i + 2]);
      b.set(basePos[i + 3], basePos[i + 4], basePos[i + 5]);
      c.set(basePos[i + 6], basePos[i + 7], basePos[i + 8]);
      ab.subVectors(b, a);
      ac.subVectors(c, a);
      faceNormals.push(ab.cross(ac).normalize().clone());
      faceVariance.push(0.55 + Math.random() * 0.9);
    }
  }

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.1,
    metalness: 0.88,
    emissive: COLORS[0].clone(),
    emissiveIntensity: 0.55,
  });
  const mesh = new THREE.Mesh(gemGeo, material);

  // Casca wireframe lilás — nunca desdobra, fica como "memória" do sólido
  const baseEdge = new THREE.IcosahedronGeometry(GEM_RADIUS * 1.013, 1);
  const edgeGeo = new THREE.EdgesGeometry(baseEdge);
  baseEdge.dispose();
  const edges = new THREE.LineSegments(
    edgeGeo,
    new THREE.LineBasicMaterial({ color: '#c4b5fd', transparent: true, opacity: 0.18 })
  );

  // group = posição/escala (movimento); o mesh interno cuida do visual.
  const gem = new THREE.Group();
  gem.add(mesh, edges);
  scene.add(gem);

  window.addEventListener('resize', () => {
    const newAspect = window.innerWidth / window.innerHeight;
    camera.left = -VIEW_HALF_HEIGHT * newAspect;
    camera.right = VIEW_HALF_HEIGHT * newAspect;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // Desdobra as facetas: desloca os 3 vértices de cada face ao longo da
  // normal. Só reescreve o buffer quando o valor muda de verdade (perf).
  let lastDisp = -1;
  function applyUnfold(disp) {
    if (Math.abs(disp - lastDisp) < 0.0006) return;
    lastDisp = disp;
    const pos = gemGeo.attributes.position;
    const arr = pos.array;
    for (let f = 0; f < faceCount; f++) {
      const n = faceNormals[f];
      const offset = disp * faceVariance[f] * 0.55;
      for (let v = 0; v < 3; v++) {
        const idx = (f * 3 + v) * 3;
        arr[idx] = basePos[idx] + n.x * offset;
        arr[idx + 1] = basePos[idx + 1] + n.y * offset;
        arr[idx + 2] = basePos[idx + 2] + n.z * offset;
      }
    }
    pos.needsUpdate = true;
    gemGeo.computeBoundingSphere(); // mantém o raycast (clique) correto
  }

  // Animações visuais contínuas: órbita das luzes (centrada NO GEM, para a
  // iluminação ficar constante pela tela toda), pulso do emissive, transição
  // de cor por face e o estado de energia (evento shutdown) / sono.
  function updateVisuals(t, delta, state = {}) {
    const power = state.power !== undefined ? state.power : 1;
    const sleeping = !!state.sleeping;

    const gx = gem.position.x;
    const gy = gem.position.y;
    purpleLight.position.set(
      gx + Math.cos(t * 0.32) * 6,
      gy + Math.sin(t * 0.24) * 3.5,
      Math.sin(t * 0.32) * 6
    );
    amberLight.position.set(
      gx - Math.cos(t * 0.32) * 6,
      gy + Math.cos(t * 0.24 + 1.1) * 3.5,
      -Math.sin(t * 0.32) * 6
    );
    whiteLight.position.set(gx, gy, 7);

    // Energia: desligada → luzes quase zero e vertex colors escurecem
    const lightPower = 0.05 + 0.95 * power;
    purpleLight.intensity = 6 * lightPower;
    amberLight.intensity = 5 * lightPower;
    whiteLight.intensity = 0.5 * lightPower;
    ambient.intensity = 0.2 * (0.15 + 0.85 * power);
    material.color.setScalar(0.12 + 0.88 * power);

    // Emissive pulsa entre roxo e âmbar; dormindo, "respira" baixinho
    const mood = (Math.sin(t * 0.18) + 1) / 2;
    material.emissive.lerpColors(COLORS[0], COLORS[2], mood);
    const baseEmissive = sleeping
      ? 0.12 + (Math.sin(t * 1.2) + 1) * 0.05
      : 0.55;
    material.emissiveIntensity = THREE.MathUtils.damp(
      material.emissiveIntensity,
      baseEmissive * (0.04 + 0.96 * power),
      2,
      delta
    );

    const colorAttr = gemGeo.attributes.color;
    for (let f = 0; f < faceCount; f++) {
      const target = COLORS[faceTargetIdx[f]];
      const c = faceColors[f];
      c.lerp(target, delta * faceSpeeds[f] * 2.0);

      const dr = c.r - target.r, dg = c.g - target.g, db = c.b - target.b;
      if (dr * dr + dg * dg + db * db < 0.001) {
        let next = Math.floor(Math.random() * COLORS.length);
        if (next === faceTargetIdx[f]) next = (next + 1) % COLORS.length;
        faceTargetIdx[f] = next;
      }
      for (let v = 0; v < 3; v++) {
        const idx = (f * 3 + v) * 3;
        colorAttr.array[idx] = c.r;
        colorAttr.array[idx + 1] = c.g;
        colorAttr.array[idx + 2] = c.b;
      }
    }
    colorAttr.needsUpdate = true;
  }

  return { scene, camera, renderer, gem, mesh, material, applyUnfold, updateVisuals };
}
