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

// ─── Utilitários da transição de humor ───────────────────────────────────────
// Cada humor entra com uma ease com a cara dele: o Excited ESTOURA (overshoot
// elástico — os espinhos passam do ponto e assentam), o Zen desliza como seda
// e o Normality volta num cubic neutro.
const easeInOutSine = (p) => 0.5 - Math.cos(Math.PI * p) / 2;
const easeInOutCubic = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const easeOutBack = (p) => {
  const c1 = 2.4;
  return 1 + (c1 + 1) * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
};

// Heartbeat "tum-tum" (~0.86s, mesmo desenho do liveAnimation.js): no Excited
// ele rege os espinhos, a casca de arame, as faíscas e o emissive.
const HEARTBEAT_PERIOD_MS = 860;
function heartbeat(nowMs) {
  const bt = (nowMs % HEARTBEAT_PERIOD_MS) / HEARTBEAT_PERIOD_MS;
  const lub = Math.exp(-Math.pow((bt - 0.1) / 0.055, 2));
  const dub = Math.exp(-Math.pow((bt - 0.38) / 0.07, 2)) * 0.55;
  return lub + dub;
}

// Cor-assinatura de cada humor (anel de choque da transição)
const MODE_ACCENT = {
  normality: '#c4b5fd',
  zen: '#22D3EE',
  excited: '#FB7185',
};

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
  // O corpo é SEMPRE o icosaedro (a identidade dele), mas cada humor tem uma
  // FORMA própria de verdade:
  //   Zen     → orbe: esfera completa com sombreamento LISO (as normais
  //             fundem pra radial dentro do applyUnfold) — vira uma bola de
  //             vidro serena, sem arestas.
  //   Excited → eriçado: facetas jutam pra fora viram espinhos, e os
  //             espinhos LATEJAM no ritmo do heartbeat.
  // Guardo dois "deltas" por vértice (esfera − ico, espinhos − ico) e um
  // escalar contínuo shapeCur ∈ [-1, +1]: -1 = orbe (zen), 0 = ico puro
  // (normality), +1 = espinhos (excited). Como qualquer transição passa por
  // 0, ir de um humor pro outro nunca dá "pop" — cruza o icosaedro no meio.
  const dSphere = new Float32Array(basePos.length); // esfera − ico, por vértice
  const dSpiky = new Float32Array(basePos.length);  // espinhos − ico, por vértice
  {
    const v = new THREE.Vector3();
    // Orbe: cada vértice puxado pro raio — esfera completa; o "liso" de
    // verdade vem do blend de normais no applyUnfold.
    for (let i = 0; i < basePos.length; i += 3) {
      v.set(basePos[i], basePos[i + 1], basePos[i + 2]).setLength(GEM_RADIUS);
      dSphere[i] = v.x - basePos[i];
      dSphere[i + 1] = v.y - basePos[i + 1];
      dSphere[i + 2] = v.z - basePos[i + 2];
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

  // ── Transição de humor: timeline com personalidade ──
  // setShapeMode detecta a troca e arma morphAnim: shapeCur viaja de from→to
  // com a ease do humor de destino, enquanto transBurst (0→1→0) rege o
  // estouro de facetas, o flash do emissive, o soco de escala e o shockwave.
  let shapeCur = 0;
  let visualMode = 'normality';
  let morphAnim = null;  // { start, from, to, dur, ease, burstAmp }
  let shockwave = null;  // { start, dur, color }
  let transBurst = 0;    // envelope do estouro (já multiplicado por burstAmp)
  const morphedBase = new Float32Array(basePos.length); // ico + morph, base do unfold

  // Chamado a cada frame pelo movement.js com state.mode — idempotente, só
  // reage quando o humor muda de verdade.
  function setShapeMode(mode) {
    const m = mode === 'zen' || mode === 'excited' ? mode : 'normality';
    if (m === visualMode) return;
    visualMode = m;
    morphAnim = {
      start: performance.now(),
      from: shapeCur,
      to: m === 'zen' ? -1 : m === 'excited' ? 1 : 0,
      dur: m === 'excited' ? 1150 : m === 'zen' ? 2300 : 1500,
      ease: m === 'excited' ? easeOutBack : m === 'zen' ? easeInOutSine : easeInOutCubic,
      // estouro de facetas: forte no excited, sopro suave no zen
      burstAmp: m === 'excited' ? 0.85 : m === 'zen' ? 0.32 : 0.5,
    };
    shockwave = {
      start: morphAnim.start,
      dur: m === 'excited' ? 750 : 1200,
      color: new THREE.Color(MODE_ACCENT[m]),
    };
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

  // Casca wireframe lilás — a "memória" do sólido. No Zen ela SOME (o orbe é
  // liso, sem arestas); no Excited esquenta pra rosa e pulsa com o heartbeat.
  const baseEdge = new THREE.IcosahedronGeometry(GEM_RADIUS * 1.013, 1);
  const edgeGeo = new THREE.EdgesGeometry(baseEdge);
  baseEdge.dispose();
  const EDGE_BASE = new THREE.Color('#c4b5fd');
  const EDGE_HOT = new THREE.Color('#FB7185');
  const edgeMat = new THREE.LineBasicMaterial({ color: '#c4b5fd', transparent: true, opacity: 0.18 });
  const edges = new THREE.LineSegments(edgeGeo, edgeMat);

  // ── Adereços por humor (entram/saem por fade — a troca nunca corta seco) ──
  // Textura suave circular pros pontos (vagalumes/faíscas), gerada na hora.
  const softTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.45, 'rgba(255,255,255,0.55)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();

  // Zen: dois anéis "ensō" inclinados em precessão lenta + vagalumes orbitando
  const zenGroup = new THREE.Group();
  const ringMat1 = new THREE.MeshBasicMaterial({ color: '#22D3EE', transparent: true, opacity: 0, depthWrite: false });
  const ringMat2 = new THREE.MeshBasicMaterial({ color: '#34D399', transparent: true, opacity: 0, depthWrite: false });
  const ring1 = new THREE.Mesh(new THREE.TorusGeometry(GEM_RADIUS * 1.55, 0.022, 8, 96), ringMat1);
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(GEM_RADIUS * 1.85, 0.014, 8, 96), ringMat2);
  ring1.rotation.x = 1.25;
  ring2.rotation.x = -1.05;
  ring2.rotation.y = 0.6;
  zenGroup.add(ring1, ring2);

  const MOTE_COUNT = 12;
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MOTE_COUNT * 3), 3));
  const moteMat = new THREE.PointsMaterial({
    map: softTex, color: '#a5f3fc', size: 0.34, transparent: true, opacity: 0,
    depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const motes = new THREE.Points(moteGeo, moteMat);
  motes.frustumCulled = false;
  const moteSeeds = [];
  for (let i = 0; i < MOTE_COUNT; i++) {
    moteSeeds.push({
      ang: Math.random() * Math.PI * 2,
      speed: (0.18 + Math.random() * 0.25) * (Math.random() < 0.5 ? 1 : -1),
      radius: GEM_RADIUS * (1.7 + Math.random() * 0.7),
      yAmp: 0.35 + Math.random() * 0.5,
      phase: Math.random() * Math.PI * 2,
    });
  }
  zenGroup.add(motes);
  zenGroup.visible = false;

  // Excited: enxame de faíscas tremendo por entre os espinhos
  const SPARK_COUNT = 20;
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SPARK_COUNT * 3), 3));
  const sparkMat = new THREE.PointsMaterial({
    map: softTex, color: '#FB7185', size: 0.22, transparent: true, opacity: 0,
    depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const sparks = new THREE.Points(sparkGeo, sparkMat);
  sparks.frustumCulled = false;
  const sparkSeeds = [];
  for (let i = 0; i < SPARK_COUNT; i++) {
    sparkSeeds.push({
      ang: Math.random() * Math.PI * 2,
      speed: (1.6 + Math.random() * 2.4) * (Math.random() < 0.5 ? 1 : -1),
      radius: GEM_RADIUS * (1.45 + Math.random() * 0.7),
      yAmp: 0.5 + Math.random() * 0.9,
      phase: Math.random() * Math.PI * 2,
      wob: 3 + Math.random() * 4,
    });
  }
  sparks.visible = false;

  // Anel de choque da transição: expande e some na cor do humor de destino.
  // Fica no plano XY — de frente pra câmera ortográfica.
  const shockMat = new THREE.MeshBasicMaterial({
    color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
  });
  const shockRing = new THREE.Mesh(new THREE.TorusGeometry(GEM_RADIUS * 1.15, 0.05, 8, 64), shockMat);
  shockRing.visible = false;

  // group = posição/escala (movimento); o mesh interno cuida do visual.
  const gem = new THREE.Group();
  gem.add(mesh, edges, zenGroup, sparks, shockRing);
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
  // normal, a partir da base morfada (ico ↔ orbe/espinhos). Só reescreve o
  // buffer quando algo muda de verdade — disp (respiração), a forma, ou o
  // latejo dos espinhos.
  let lastDisp = -1;
  let lastShape = -999;
  const nTmp = new THREE.Vector3();
  function applyUnfold(disp) {
    const now = performance.now();

    // Timeline da transição de humor (armada pelo setShapeMode)
    if (morphAnim) {
      const p = (now - morphAnim.start) / morphAnim.dur;
      if (p >= 1) {
        shapeCur = morphAnim.to;
        transBurst = 0;
        morphAnim = null;
      } else {
        shapeCur = morphAnim.from + (morphAnim.to - morphAnim.from) * morphAnim.ease(Math.max(p, 0));
        transBurst = Math.sin(p * Math.PI) * morphAnim.burstAmp;
      }
    }

    // Espinhos latejam com o heartbeat (só com o corpo eriçado); o estouro
    // da transição entra como unfold extra — as facetas explodem no meio do
    // caminho e reassentam já na forma nova.
    const sEff = shapeCur > 0 ? shapeCur * (0.86 + 0.14 * heartbeat(now)) : shapeCur;
    const dispTotal = disp + transBurst;

    const shapeMoved = Math.abs(sEff - lastShape) >= 0.0008;
    if (Math.abs(dispTotal - lastDisp) < 0.0006 && !shapeMoved) return;
    lastDisp = dispTotal;
    lastShape = sEff;

    // Base morfada: cruza o icosaedro no meio (shapeCur=0), então zen↔excited
    // nunca dá pop. Negativo puxa pro orbe, positivo empurra pros espinhos
    // (sEff pode passar de 1 de leve — é o overshoot elástico do easeOutBack).
    const s = sEff;
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
      const offset = dispTotal * faceVariance[f] * 0.55;
      for (let v = 0; v < 3; v++) {
        const idx = (f * 3 + v) * 3;
        arr[idx] = morphedBase[idx] + n.x * offset;
        arr[idx + 1] = morphedBase[idx + 1] + n.y * offset;
        arr[idx + 2] = morphedBase[idx + 2] + n.z * offset;
      }
    }
    pos.needsUpdate = true;

    // O unfold puro desliza ao longo da normal e não muda a orientação da
    // face — mas o morph de forma muda: recalcula as normais só quando a
    // forma está mexendo. No lado do orbe (s<0), as normais fundem pra
    // radial na mesma proporção — é isso que apaga as facetas e deixa o Zen
    // com cara de bola de vidro lisa.
    if (shapeMoved) {
      gemGeo.computeVertexNormals();
      const k = s < 0 ? Math.min(-s, 1) : 0;
      if (k > 0.01) {
        const nrm = gemGeo.attributes.normal.array;
        for (let i = 0; i < arr.length; i += 3) {
          nTmp.set(arr[i], arr[i + 1], arr[i + 2]).normalize();
          let nx = nrm[i] + (nTmp.x - nrm[i]) * k;
          let ny = nrm[i + 1] + (nTmp.y - nrm[i + 1]) * k;
          let nz = nrm[i + 2] + (nTmp.z - nrm[i + 2]) * k;
          const len = Math.hypot(nx, ny, nz) || 1;
          nrm[i] = nx / len;
          nrm[i + 1] = ny / len;
          nrm[i + 2] = nz / len;
        }
        gemGeo.attributes.normal.needsUpdate = true;
      }
    }
    gemGeo.computeBoundingSphere(); // mantém o raycast (clique) correto
  }

  // Animações visuais contínuas: órbita das luzes (centrada NO GEM, para a
  // iluminação ficar constante pela tela toda), pulso do emissive, transição
  // de cor por face, adereços de humor (anéis/vagalumes/faíscas), shockwave
  // da transição e o estado de energia (evento shutdown) / sono.
  let zenMix = 0;      // fade dos adereços do Zen
  let excMix = 0;      // fade dos adereços do Excited
  let moodPhase = 0;   // fase do pulso do emissive (frequência muda por humor)
  let emissiveCur = 0.55;
  function updateVisuals(t, delta, state = {}) {
    const power = state.power !== undefined ? state.power : 1;
    const sleeping = !!state.sleeping;
    const nowMs = performance.now();
    const heart = heartbeat(nowMs);

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

    // Fade dos adereços de humor + atenuação por energia/sono
    zenMix = THREE.MathUtils.damp(zenMix, visualMode === 'zen' ? 1 : 0, 2.4, delta);
    excMix = THREE.MathUtils.damp(excMix, visualMode === 'excited' ? 1 : 0, 3, delta);
    const dimmer = (0.1 + 0.9 * power) * (sleeping ? 0.35 : 1);

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

    // Emissive pulsa entre as duas cores-âncora da paleta atual. A frequência
    // acompanha o humor: quase parada no Zen, acelerada no Excited (e lá o
    // heartbeat ainda soma um latejo por cima).
    moodPhase += delta * 0.18 * (1 - zenMix * 0.65) * (1 + excMix * 3.2);
    const mood = (Math.sin(moodPhase) + 1) / 2;
    emissiveTint.lerpColors(COLORS[0], COLORS[2], mood);
    if (siteTintColor && siteTintMix > 0.001) emissiveTint.lerp(siteTintColor, siteTintMix);
    if (transBurst > 0.001) emissiveTint.lerp(WHITE, transBurst * 0.6); // flash da transição
    material.emissive.copy(emissiveTint);
    const baseEmissive = sleeping
      ? 0.12 + (Math.sin(t * 1.2) + 1) * 0.05
      : 0.55;
    emissiveCur = THREE.MathUtils.damp(
      emissiveCur,
      baseEmissive * (0.04 + 0.96 * power),
      2,
      delta
    );
    material.emissiveIntensity =
      emissiveCur + transBurst * 1.1 + (sleeping ? 0 : heart * 0.28 * excMix);

    // Soco de escala da transição (no mesh interno — não briga com a escala
    // do group, que é do movimento): incha no estouro pro Excited, "inspira"
    // encolhendo a caminho do Zen.
    const punch = transBurst * (visualMode === 'excited' ? 0.16 : visualMode === 'zen' ? -0.18 : -0.1);
    mesh.scale.setScalar(1 + punch);

    // Casca de arame: some no Zen (orbe liso), esquenta e pulsa no Excited
    edgeMat.color.copy(EDGE_BASE).lerp(EDGE_HOT, excMix);
    edgeMat.opacity = (0.18 * (1 - zenMix) + 0.3 * excMix * (0.5 + 0.5 * heart)) * dimmer;
    edges.scale.setScalar((1 + excMix * heart * 0.05) * (1 + punch));

    // Zen: anéis precessam devagar, vagalumes orbitam em paz
    if (zenMix > 0.003) {
      zenGroup.visible = true;
      zenGroup.scale.setScalar(0.55 + 0.45 * zenMix); // crescem junto com o fade
      zenGroup.rotation.y += delta * 0.16;
      ring1.rotation.z += delta * 0.05;
      ring2.rotation.z -= delta * 0.04;
      ringMat1.opacity = 0.5 * zenMix * dimmer;
      ringMat2.opacity = 0.34 * zenMix * dimmer;
      moteMat.opacity = 0.85 * zenMix * dimmer;
      const mp = moteGeo.attributes.position.array;
      for (let i = 0; i < MOTE_COUNT; i++) {
        const sd = moteSeeds[i];
        sd.ang += delta * sd.speed;
        mp[i * 3] = Math.cos(sd.ang) * sd.radius;
        mp[i * 3 + 1] = Math.sin(t * 0.4 + sd.phase) * sd.yAmp;
        mp[i * 3 + 2] = Math.sin(sd.ang) * sd.radius;
      }
      moteGeo.attributes.position.needsUpdate = true;
    } else {
      zenGroup.visible = false;
    }

    // Excited: faíscas tremem rápido por entre os espinhos, no compasso do
    // heartbeat (opacidade e tamanho latejam junto)
    if (excMix > 0.003) {
      sparks.visible = true;
      sparkMat.opacity = (0.5 + 0.4 * heart) * excMix * dimmer;
      sparkMat.size = 0.2 + heart * 0.08;
      const sp = sparkGeo.attributes.position.array;
      for (let i = 0; i < SPARK_COUNT; i++) {
        const sd = sparkSeeds[i];
        sd.ang += delta * sd.speed;
        const r = sd.radius + Math.sin(t * sd.wob + sd.phase) * 0.25;
        sp[i * 3] = Math.cos(sd.ang) * r + (Math.random() - 0.5) * 0.12;
        sp[i * 3 + 1] = Math.sin(sd.ang * 1.7 + sd.phase) * sd.yAmp + (Math.random() - 0.5) * 0.12;
        sp[i * 3 + 2] = Math.sin(sd.ang) * r + (Math.random() - 0.5) * 0.12;
      }
      sparkGeo.attributes.position.needsUpdate = true;
    } else {
      sparks.visible = false;
    }

    // Onda de choque da transição de humor
    if (shockwave) {
      const p = (nowMs - shockwave.start) / shockwave.dur;
      if (p >= 1) {
        shockwave = null;
        shockRing.visible = false;
      } else {
        shockRing.visible = true;
        shockRing.scale.setScalar(0.6 + p * 2.6);
        shockMat.color.copy(shockwave.color);
        shockMat.opacity = (1 - p) * 0.8;
      }
    }

    // Transição de cor por face: quase congela no Zen (calma), dança no
    // Excited (as cores correm pelo corpo)
    const colorPace = 2.0 * (1 - zenMix * 0.72) * (1 + excMix * 1.6);
    const colorAttr = gemGeo.attributes.color;
    for (let f = 0; f < faceCount; f++) {
      const target = COLORS[faceTargetIdx[f]];
      const c = faceColors[f];
      c.lerp(target, delta * faceSpeeds[f] * colorPace);

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
