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

const clamp01 = (v) => Math.min(Math.max(v, 0), 1);

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

  // ── Zen: núcleo + anéis orbitais ──────────────────────────────────────────
  // Só o Zen usa isso: em vez de "respirar" abrindo as facetas como todo
  // mundo, o núcleo dele fica quase fechado (ver breatheMul em
  // liveAnimation.js + unfold reduzido em personalities/zen.js) e a
  // respiração migra pra um halo de dois anéis finos precessionando em eixos
  // cruzados, tipo giroscópio suspenso — silhueta bem diferente do "ouriço"
  // facetado das outras personalidades. Ligam/desligam suave (fade + escala)
  // ao entrar/sair do Zen; ganham tint dourado na zen_aura e vermelho na
  // zen_much_more_excited (ver zenPose.ringTint em liveAnimation.js).
  const RING_COLOR_A = new THREE.Color('#22D3EE'); // ciano — paleta do Zen
  const RING_COLOR_B = new THREE.Color('#34D399'); // verde-água — paleta do Zen
  const ringGroup = new THREE.Group();
  gem.add(ringGroup);

  function makeRing(radius, tube, tiltX, tiltZ, color) {
    const pivot = new THREE.Group();
    pivot.rotation.set(tiltX, 0, tiltZ);
    const geo = new THREE.TorusGeometry(radius, tube, 8, 96);
    const mat = new THREE.MeshBasicMaterial({
      color: color.clone(),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    pivot.add(new THREE.Mesh(geo, mat));
    ringGroup.add(pivot);
    return { pivot, mat, baseColor: color };
  }

  const ringA = makeRing(GEM_RADIUS * 1.55, 0.018, THREE.MathUtils.degToRad(62), THREE.MathUtils.degToRad(8), RING_COLOR_A);
  const ringB = makeRing(GEM_RADIUS * 1.92, 0.014, THREE.MathUtils.degToRad(-46), THREE.MathUtils.degToRad(-15), RING_COLOR_B);
  const ringTintColor = new THREE.Color();
  let ringMix = 0; // 0 = escondido, 1 = Zen ativo — transição suave (damp)
  let ringPrecessA = 0, ringPrecessB = Math.PI * 0.35;

  // ── Cenário de humor atrás do gem: lótus (Zen) e coração (Excited) ────────
  // Preso ao GRUPO (acompanha posição/escala, não a rotação do mesh). O Zen
  // "senta" numa flor de lótus que desabrocha pétala por pétala atrás dele;
  // o Excited ganha um coração pulsando em batida lub-dub. Additive +
  // depthTest off + renderOrder negativo = sempre um brilho POR TRÁS do
  // corpo, nunca oclusão.
  const backdrop = new THREE.Group();
  gem.add(backdrop);

  function makePetalGeo(len, wid) {
    const s = new THREE.Shape();
    s.moveTo(0, 0.55);
    s.quadraticCurveTo(wid, 0.55 + len * 0.38, 0, 0.55 + len);
    s.quadraticCurveTo(-wid, 0.55 + len * 0.38, 0, 0.55);
    return new THREE.ShapeGeometry(s, 10);
  }

  function makeLotusLayer(count, len, wid, hex, z) {
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(hex), transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
      side: THREE.DoubleSide,
    });
    const layer = new THREE.Group();
    layer.position.z = z;
    const geo = makePetalGeo(len, wid);
    const petals = [];
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(geo, mat);
      m.rotation.z = (i / count) * Math.PI * 2;
      m.renderOrder = -3;
      layer.add(m);
      petals.push(m);
    }
    backdrop.add(layer);
    return { layer, mat, petals, baseColor: new THREE.Color(hex) };
  }

  const lotusOuter = makeLotusLayer(8, 2.6, 0.52, '#34D399', -1.7);
  const lotusInner = makeLotusLayer(6, 1.8, 0.44, '#22D3EE', -1.6);
  let lotusMix = 0;

  function makeHeartGeo(scale) {
    const s = new THREE.Shape();
    s.moveTo(0.5, 0.5);
    s.bezierCurveTo(0.5, 0.5, 0.4, 0, 0, 0);
    s.bezierCurveTo(-0.6, 0, -0.6, 0.7, -0.6, 0.7);
    s.bezierCurveTo(-0.6, 1.1, -0.3, 1.54, 0.5, 1.9);
    s.bezierCurveTo(1.2, 1.54, 1.6, 1.1, 1.6, 0.7);
    s.bezierCurveTo(1.6, 0.7, 1.6, 0, 1, 0);
    s.bezierCurveTo(0.7, 0, 0.5, 0.5, 0.5, 0.5);
    const g = new THREE.ShapeGeometry(s, 10);
    g.center();
    g.rotateZ(Math.PI); // ponta pra baixo
    g.scale(scale, scale, 1);
    return g;
  }

  function makeHeart(scale, hex, z, order) {
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(hex), transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
      side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(makeHeartGeo(scale), mat);
    m.position.z = z;
    m.renderOrder = order;
    backdrop.add(m);
    return { mesh: m, mat };
  }

  const heartBig = makeHeart(2.3, '#F43F5E', -1.8, -5);
  const heartCore = makeHeart(1.5, '#FB7185', -1.75, -4);
  let heartMix = 0;
  const backdropTintTmp = new THREE.Color();

  // lotus/heart: alvo 0..1 (fade interno por damp). lotusBreath pulsa as
  // pétalas junto com a respiração; tint/tintMix reaproveitam o tint do halo
  // (dourado na aura, vermelho na transição); heartPulse é o envelope da
  // batida lub-dub calculado em liveAnimation.js.
  function updateBackdrop(delta, { lotus = 0, lotusBreath = 0, tint = null, tintMix = 0, heart = 0, heartPulse = 0 } = {}) {
    lotusMix = THREE.MathUtils.damp(lotusMix, lotus, 1.6, delta);
    heartMix = THREE.MathUtils.damp(heartMix, heart, 2.5, delta);

    const lotusOn = lotusMix > 0.004;
    lotusOuter.layer.visible = lotusInner.layer.visible = lotusOn;
    if (lotusOn) {
      // pétalas desabrocham em sequência ao redor do círculo
      for (const L of [lotusOuter, lotusInner]) {
        const n = L.petals.length;
        for (let i = 0; i < n; i++) {
          const v = clamp01((lotusMix - (i / n) * 0.5) / 0.5);
          L.petals[i].scale.setScalar(Math.max(v, 0.0001) * (1 + lotusBreath * 0.06));
        }
        if (tint && tintMix > 0.001) {
          backdropTintTmp.set(tint);
          L.mat.color.copy(L.baseColor).lerp(backdropTintTmp, tintMix);
        } else {
          L.mat.color.copy(L.baseColor);
        }
      }
      lotusOuter.layer.rotation.z += delta * 0.05;
      lotusInner.layer.rotation.z -= delta * 0.08;
      lotusOuter.mat.opacity = lotusMix * (0.34 + lotusBreath * 0.2);
      lotusInner.mat.opacity = lotusMix * (0.28 + lotusBreath * 0.22);
    }

    const heartOn = heartMix > 0.004;
    heartBig.mesh.visible = heartCore.mesh.visible = heartOn;
    if (heartOn) {
      heartBig.mesh.scale.setScalar(heartMix * (1 + heartPulse * 0.16));
      heartCore.mesh.scale.setScalar(heartMix * (1 + heartPulse * 0.24));
      heartBig.mat.opacity = heartMix * (0.2 + heartPulse * 0.3);
      heartCore.mat.opacity = heartMix * (0.16 + heartPulse * 0.34);
    }
  }

  // ── Rastro de facetas (Zen viajando): triângulos que caem e se desfazem ──
  // Vivem no MUNDO (scene), não no gem: ficam pra trás quando ele viaja,
  // caindo como pétalas — mas são facetas, tingidas pela paleta atual.
  const TRAIL_MAX = 26;
  const trailFacets = [];
  {
    const triGeo = new THREE.BufferGeometry();
    const r = 0.2;
    triGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      0, r, 0, -r * 0.87, -r * 0.5, 0, r * 0.87, -r * 0.5, 0,
    ]), 3));
    for (let i = 0; i < TRAIL_MAX; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      });
      const m = new THREE.Mesh(triGeo, mat);
      m.visible = false;
      scene.add(m);
      trailFacets.push({ mesh: m, mat, age: 0, life: 1, vx: 0, vy: 0, spin: 0 });
    }
  }
  let trailCursor = 0;

  function emitTrailFacet(x, y) {
    const f = trailFacets[trailCursor];
    trailCursor = (trailCursor + 1) % TRAIL_MAX;
    f.age = 0;
    f.life = 1.0 + Math.random() * 0.7;
    f.vx = (Math.random() - 0.5) * 0.8;
    f.vy = -(0.4 + Math.random() * 0.6);
    f.spin = (Math.random() - 0.5) * 6;
    f.mesh.position.set(x + (Math.random() - 0.5) * 1.2, y + (Math.random() - 0.5) * 1.2, -0.5);
    f.mesh.rotation.z = Math.random() * Math.PI * 2;
    f.mesh.scale.setScalar(0.8 + Math.random() * 0.7);
    f.mat.color.copy(COLORS[Math.floor(Math.random() * COLORS.length)]);
    f.mesh.visible = true;
  }

  function updateTrail(delta) {
    for (const f of trailFacets) {
      if (!f.mesh.visible) continue;
      f.age += delta;
      if (f.age >= f.life) {
        f.mesh.visible = false;
        f.mat.opacity = 0;
        continue;
      }
      f.vy -= delta * 1.6; // gravidade suave
      f.mesh.position.x += f.vx * delta;
      f.mesh.position.y += f.vy * delta;
      f.mesh.rotation.z += f.spin * delta;
      f.mat.opacity = (1 - f.age / f.life) * 0.8;
    }
  }

  // active: Zen ligado? breath: envelope 0-1 da respiração (pulsa raio/
  // opacidade); tint/tintMix: cor especial (aura dourada / transição
  // vermelha) por cima da cor base do anel.
  function updateRings(delta, { active = false, breath = 0, tint = null, tintMix = 0 } = {}) {
    ringMix = THREE.MathUtils.damp(ringMix, active ? 1 : 0, 2.2, delta);
    ringGroup.visible = ringMix > 0.003;
    if (!ringGroup.visible) return;

    // Precessão cruzada: cada anel cambaleia no seu próprio ritmo, nunca
    // sincroniza com o outro — reforça a leitura de "giroscópio vivo".
    ringPrecessA += delta * 0.24;
    ringPrecessB -= delta * 0.17;
    ringA.pivot.rotation.y = ringPrecessA;
    ringB.pivot.rotation.y = ringPrecessB;

    const pulse = 1 + breath * 0.08;
    ringA.pivot.scale.setScalar(ringMix * pulse);
    ringB.pivot.scale.setScalar(ringMix * pulse * 1.02);

    const baseOpacity = 0.5 + breath * 0.4;
    ringA.mat.opacity = ringMix * baseOpacity;
    ringB.mat.opacity = ringMix * baseOpacity * 0.75;

    if (tint && tintMix > 0.001) {
      ringTintColor.set(tint);
      ringA.mat.color.copy(ringA.baseColor).lerp(ringTintColor, tintMix);
      ringB.mat.color.copy(ringB.baseColor).lerp(ringTintColor, tintMix);
    } else {
      ringA.mat.color.copy(ringA.baseColor);
      ringB.mat.color.copy(ringB.baseColor);
    }
  }

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

  const rainbowTmp = new THREE.Color();
  const faceDisplayTmp = new THREE.Color();

  // Animações visuais contínuas: órbita das luzes (centrada NO GEM, para a
  // iluminação ficar constante pela tela toda), pulso do emissive, transição
  // de cor por face e o estado de energia (evento shutdown) / sono.
  // rainbow (0..1): tinge as faces num arco-íris cíclico por cima da paleta
  // (respiração do Zen — sobe conforme se aproxima da zen_aura).
  // glowBoost (0..~1.4): flash de brilho extra (morph de personalidade,
  // batida do coração do Excited).
  function updateVisuals(t, delta, state = {}) {
    const power = state.power !== undefined ? state.power : 1;
    const sleeping = !!state.sleeping;
    const rainbow = state.rainbow || 0;
    const glowBoost = state.glowBoost || 0;

    updateTrail(delta);

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
    if (rainbow > 0.001) {
      rainbowTmp.setHSL((t * 0.1) % 1, 0.9, 0.6);
      emissiveTint.lerp(rainbowTmp, rainbow * 0.85);
    }
    material.emissive.copy(emissiveTint);
    const baseEmissive = sleeping
      ? 0.12 + (Math.sin(t * 1.2) + 1) * 0.05
      : 0.55;
    material.emissiveIntensity = THREE.MathUtils.damp(
      material.emissiveIntensity,
      baseEmissive * (0.04 + 0.96 * power) * (1 + rainbow * 0.5 + glowBoost),
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
      // Rainbow: por cima da cor "real" da face (sem mutá-la — quando o
      // arco-íris acaba, a paleta continua de onde estava), cada face num
      // ponto do círculo cromático (espalhado por razão áurea) girando devagar
      let outC = c;
      if (rainbow > 0.001) {
        rainbowTmp.setHSL((f * 0.618 + t * 0.1) % 1, 0.9, 0.62);
        outC = faceDisplayTmp.copy(c).lerp(rainbowTmp, rainbow);
      }
      for (let v = 0; v < 3; v++) {
        const idx = (f * 3 + v) * 3;
        colorAttr.array[idx] = outC.r;
        colorAttr.array[idx + 1] = outC.g;
        colorAttr.array[idx + 2] = outC.b;
      }
    }
    colorAttr.needsUpdate = true;
  }

  return {
    scene, camera, renderer, gem, mesh, material,
    applyUnfold, updateVisuals, updateRings, updateBackdrop, emitTrailFacet,
    setTint, setPalette,
  };
}
