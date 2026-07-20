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

// Proporção unidades-de-mundo/pixel fixa (3.84 de meia-altura pra 160px →
// 0.024/px). A altura da janela agora varia com o setup de monitores (main.js
// estica a faixa pra cobrir o chão de cada tela), então a meia-altura da
// vista é derivada da altura real — o gem mantém o mesmo tamanho em pixels.
export const WORLD_HALF_PER_PX = 0.024;
const viewHalfHeight = () => window.innerHeight * WORLD_HALF_PER_PX;

export function initScene(canvas) {
  const scene = new THREE.Scene();

  // Câmera ORTOGRÁFICA: a janela é larguíssima (tela inteira) e uma câmera
  // perspectiva estica o gem ("distorção ovo") quando ele anda para longe do
  // centro. Com projeção ortográfica ele fica idêntico em qualquer ponto da
  // taskbar — e a rotação continua sendo 3D de verdade.
  const vh = viewHalfHeight();
  const aspect = window.innerWidth / window.innerHeight;
  const camera = new THREE.OrthographicCamera(
    -vh * aspect,
    vh * aspect,
    vh,
    -vh,
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

  // ── Morph de forma por personalidade ────────────────────────────────────
  // O corpo é SEMPRE o icosaedro (a identidade dele), mas tensiona e relaxa:
  // no Zen ele arredonda em direção a uma esfera (perde as arestas, respira);
  // no Excited ele se eriça (algumas facetas jutam pra fora viram espinhos).
  // Guardo dois "deltas" por vértice (esfera − ico, espinhos − ico) e um
  // escalar contínuo shapeCur ∈ [-1, +1]: -1 = esfera (zen), 0 = ico puro
  // (normality), +1 = espinhos (excited). Como qualquer transição passa por
  // 0, ir de um humor pro outro nunca dá "pop" — cruza o icosaedro no meio.
  const dSphere = new Float32Array(basePos.length); // esfera − ico, por vértice
  const dSpiky = new Float32Array(basePos.length);  // espinhos − ico, por vértice
  {
    const v = new THREE.Vector3();
    // Esfera: cada vértice puxado pro raio (arredonda a silhueta).
    for (let i = 0; i < basePos.length; i += 3) {
      v.set(basePos[i], basePos[i + 1], basePos[i + 2]).setLength(GEM_RADIUS);
      dSphere[i] = (v.x - basePos[i]) * 0.9; // 0.9: arredonda sem virar bola perfeita
      dSphere[i + 1] = (v.y - basePos[i + 1]) * 0.9;
      dSphere[i + 2] = (v.z - basePos[i + 2]) * 0.9;
    }
    // Espinhos: ~60% das faces jutam pra fora ao longo da normal (amplitude
    // irregular → eriçado, não uniforme); as outras ficam quase paradas.
    for (let f = 0; f < faceCount; f++) {
      const n = faceNormals[f];
      const amp = Math.random() < 0.6 ? (0.35 + Math.random() * 0.65) * GEM_RADIUS : 0;
      for (let vtx = 0; vtx < 3; vtx++) {
        const idx = (f * 3 + vtx) * 3;
        dSpiky[idx] = n.x * amp;
        dSpiky[idx + 1] = n.y * amp;
        dSpiky[idx + 2] = n.z * amp;
      }
    }
  }

  // shapeCur persegue shapeTarget (setado por setShapeMode). O avanço é feito
  // dentro de applyUnfold (que roda todo frame), usando delta de relógio real.
  let shapeCur = 0;
  let shapeTarget = 0;
  let lastShapeTime = 0;
  const morphedBase = new Float32Array(basePos.length); // ico + morph, base do unfold

  // Chamado a cada troca de humor (movement.js passa state.mode todo frame; é
  // idempotente — só reage quando o alvo muda de verdade).
  function setShapeMode(mode) {
    const target = mode === 'zen' ? -1 : mode === 'excited' ? 1 : 0;
    if (target !== shapeTarget) shapeTarget = target;
  }

  // ── Cores dinâmicas ──
  // setPalette: troca as 6 cores do degradê inteiro (Face Mood + emissive) —
  // usado pela personalidade do dia. As faces derivam suavemente pras cores
  // novas sozinhas, porque o lerp por face persegue a paleta atual.
  // setTint (Ico_Eye): camada por cima, com prioridade quando ativa.
  let siteTintColor = null;
  let siteTintMix = 0;
  const WHITE = new THREE.Color(1, 1, 1);
  const tintMultiplier = new THREE.Color(1, 1, 1);
  const emissiveTint = new THREE.Color();

  function setTint(hexOrNull) {
    siteTintColor = hexOrNull ? new THREE.Color(hexOrNull) : null;
  }

  function setPalette(hexes) {
    for (let i = 0; i < COLORS.length; i++) {
      COLORS[i].set(hexes[i % hexes.length]);
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
    const newVh = viewHalfHeight();
    const newAspect = window.innerWidth / window.innerHeight;
    camera.left = -newVh * newAspect;
    camera.right = newVh * newAspect;
    camera.top = newVh;
    camera.bottom = -newVh;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // Desdobra as facetas: desloca os 3 vértices de cada face ao longo da
  // normal, a partir da base morfada (ico ↔ esfera/espinhos). Só reescreve o
  // buffer quando algo muda de verdade — disp (respiração) OU a forma.
  let lastDisp = -1;
  let lastShape = -999;
  function applyUnfold(disp) {
    // Avança o morph de forma até o alvo do humor atual (delta de relógio real,
    // já que applyUnfold não recebe delta e roda uma vez por frame).
    const now = performance.now();
    if (lastShapeTime) {
      const dt = Math.min((now - lastShapeTime) / 1000, 0.05);
      shapeCur += (shapeTarget - shapeCur) * (1 - Math.exp(-2.6 * dt));
      if (Math.abs(shapeTarget - shapeCur) < 0.0008) shapeCur = shapeTarget;
    }
    lastShapeTime = now;

    const shapeMoved = Math.abs(shapeCur - lastShape) >= 0.0008;
    if (Math.abs(disp - lastDisp) < 0.0006 && !shapeMoved) return;
    lastDisp = disp;
    lastShape = shapeCur;

    // Base morfada: cruza o icosaedro no meio (shapeCur=0), então zen↔excited
    // nunca dá pop. Negativo puxa pra esfera, positivo empurra pros espinhos.
    const s = shapeCur;
    if (s < 0) {
      const k = -s;
      for (let i = 0; i < basePos.length; i++) morphedBase[i] = basePos[i] + dSphere[i] * k;
    } else if (s > 0) {
      for (let i = 0; i < basePos.length; i++) morphedBase[i] = basePos[i] + dSpiky[i] * s;
    } else {
      morphedBase.set(basePos);
    }

    const pos = gemGeo.attributes.position;
    const arr = pos.array;
    for (let f = 0; f < faceCount; f++) {
      const n = faceNormals[f];
      const offset = disp * faceVariance[f] * 0.55;
      for (let v = 0; v < 3; v++) {
        const idx = (f * 3 + v) * 3;
        arr[idx] = morphedBase[idx] + n.x * offset;
        arr[idx + 1] = morphedBase[idx + 1] + n.y * offset;
        arr[idx + 2] = morphedBase[idx + 2] + n.z * offset;
      }
    }
    pos.needsUpdate = true;
    // O unfold puro desliza ao longo da normal e não muda a orientação da
    // face — mas o morph de forma muda: recalcula as normais só quando a forma
    // está mexendo, senão a iluminação fica "presa" no icosaedro.
    if (shapeMoved) gemGeo.computeVertexNormals();
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

    // Tint do Ico_Eye por cima da paleta da personalidade (que já está nas
    // próprias COLORS via setPalette)
    siteTintMix = THREE.MathUtils.damp(siteTintMix, siteTintColor ? 1 : 0, 3, delta);
    const scalarPower = 0.12 + 0.88 * power;
    tintMultiplier.copy(WHITE);
    if (siteTintColor) tintMultiplier.lerp(siteTintColor, siteTintMix * 0.7);
    material.color.set(
      tintMultiplier.r * scalarPower,
      tintMultiplier.g * scalarPower,
      tintMultiplier.b * scalarPower
    );

    // Emissive pulsa entre as duas cores-âncora da paleta atual
    const mood = (Math.sin(t * 0.18) + 1) / 2;
    emissiveTint.lerpColors(COLORS[0], COLORS[2], mood);
    if (siteTintColor && siteTintMix > 0.001) emissiveTint.lerp(siteTintColor, siteTintMix);
    material.emissive.copy(emissiveTint);
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

  return { scene, camera, renderer, gem, mesh, material, applyUnfold, updateVisuals, setTint, setPalette, setShapeMode };
}
