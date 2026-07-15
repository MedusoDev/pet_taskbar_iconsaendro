"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { motion, AnimatePresence } from "framer-motion";
import * as THREE from "three";

// ─── Paleta de identidade ────────────────────────────────────────────────────
const COLORS = [
  new THREE.Color("#7C3AED"), // roxo vivo — Dev
  new THREE.Color("#4C1D95"), // roxo profundo
  new THREE.Color("#D97706"), // âmbar — Games
  new THREE.Color("#92400E"), // âmbar escuro
  new THREE.Color("#6D28D9"), // violeta — ponte
  new THREE.Color("#B45309"), // âmbar médio
];

// ─── Luzes dinâmicas — roxo + âmbar em órbita oposta ─────────────────────────
function DynamicLights() {
  const purpleRef = useRef<THREE.PointLight>(null!);
  const amberRef  = useRef<THREE.PointLight>(null!);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    purpleRef.current.position.set(
      Math.cos(t * 0.32) * 6,
      Math.sin(t * 0.24) * 3.5,
      Math.sin(t * 0.32) * 6,
    );
    amberRef.current.position.set(
      -Math.cos(t * 0.32) * 6,
      Math.cos(t * 0.24 + 1.1) * 3.5,
      -Math.sin(t * 0.32) * 6,
    );
  });

  return (
    <>
      <ambientLight intensity={0.2} />
      <pointLight ref={purpleRef} color="#7C3AED" intensity={6}  distance={14} />
      <pointLight ref={amberRef}  color="#D97706" intensity={5}  distance={14} />
      <pointLight position={[0, 0, 7]} color="#ffffff" intensity={0.5} />
    </>
  );
}

// ─── FacetGem — cores independentes por face ─────────────────────────────────
function FacetGem({ isInView }: { isInView: boolean }) {
  const groupRef = useRef<THREE.Group>(null!);
  const meshRef  = useRef<THREE.Mesh>(null!);
  const matRef   = useRef<THREE.MeshStandardMaterial>(null!);

  const faceColors    = useRef<THREE.Color[]>([]);
  const faceTargetIdx = useRef<number[]>([]);
  const faceSpeeds    = useRef<number[]>([]);

  const [gemGeo, edgeGeo] = useMemo(() => {
    const base       = new THREE.IcosahedronGeometry(1.5, 1);
    const nonIndexed = base.toNonIndexed();
    base.dispose();

    const posCount  = nonIndexed.attributes.position.count; // 240 (detail=1)
    const faceCount = posCount / 3;                         // 80 faces
    const colors    = new Float32Array(posCount * 3);

    const fc: THREE.Color[] = [];
    const ft: number[]      = [];
    const fs: number[]      = [];

    for (let f = 0; f < faceCount; f++) {
      const ci    = Math.floor(Math.random() * COLORS.length);
      const color = COLORS[ci]!.clone();
      fc.push(color);
      ft.push(ci);
      fs.push(0.05 + Math.random() * 0.12);

      for (let v = 0; v < 3; v++) {
        const idx        = (f * 3 + v) * 3;
        colors[idx]      = color.r;
        colors[idx + 1]  = color.g;
        colors[idx + 2]  = color.b;
      }
    }

    faceColors.current    = fc;
    faceTargetIdx.current = ft;
    faceSpeeds.current    = fs;
    nonIndexed.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const baseEdge = new THREE.IcosahedronGeometry(1.52, 1);
    const edges    = new THREE.EdgesGeometry(baseEdge);
    baseEdge.dispose();

    return [nonIndexed, edges];
  }, []);

  useEffect(() => () => { gemGeo.dispose(); edgeGeo.dispose(); }, [gemGeo, edgeGeo]);

  useFrame((state, delta) => {
    if (!isInView) return;
    const t = state.clock.getElapsedTime();

    // Rotação orgânica multi-eixo
    if (groupRef.current) {
      groupRef.current.rotation.y = t * 0.18;
      groupRef.current.rotation.x = 0.22 + Math.sin(t * 0.2) * 0.14;
      groupRef.current.rotation.z = Math.cos(t * 0.13) * 0.05;
      groupRef.current.position.y = Math.sin(t * 0.48) * 0.2;
    }

    // Emissive geral pulsa entre roxo e âmbar
    if (matRef.current) {
      const mood = (Math.sin(t * 0.18) + 1) / 2;
      matRef.current.emissive.lerpColors(COLORS[0]!, COLORS[2]!, mood);
    }

    // Cores por face — cada uma no seu próprio ritmo
    if (meshRef.current) {
      const colorAttr = meshRef.current.geometry.attributes.color!;
      const faceCount = faceColors.current.length;

      for (let f = 0; f < faceCount; f++) {
        const speed  = faceSpeeds.current[f]!;
        const target = COLORS[faceTargetIdx.current[f]!]!;

        const c = faceColors.current[f]!;
        c.lerp(target, delta * speed * 2.0);

        // Chegou no alvo → novo alvo
        const dr = c.r - target.r, dg = c.g - target.g, db = c.b - target.b;
        if (dr * dr + dg * dg + db * db < 0.001) {
          let next = Math.floor(Math.random() * COLORS.length);
          if (next === faceTargetIdx.current[f]) next = (next + 1) % COLORS.length;
          faceTargetIdx.current[f] = next;
        }
        for (let v = 0; v < 3; v++) {
          const idx = (f * 3 + v) * 3;
          (colorAttr.array as Float32Array)[idx]     = c.r;
          (colorAttr.array as Float32Array)[idx + 1] = c.g;
          (colorAttr.array as Float32Array)[idx + 2] = c.b;
        }
      }

      colorAttr.needsUpdate = true;
    }
  });

  return (
    <group ref={groupRef}>
      <mesh ref={meshRef} geometry={gemGeo}>
        <meshStandardMaterial
          ref={matRef}
          vertexColors
          roughness={0.1}
          metalness={0.88}
          emissive={COLORS[0]}
          emissiveIntensity={0.55}
        />
      </mesh>
      <lineSegments>
        <primitive object={edgeGeo} attach="geometry" />
        <lineBasicMaterial color="#c4b5fd" transparent opacity={0.18} />
      </lineSegments>
    </group>
  );
}

// ─── MiniGem — cor única, leve ───────────────────────────────────────────────
function MiniGem({ isInView }: { isInView: boolean }) {
  const groupRef    = useRef<THREE.Group>(null!);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null!);
  const targetIdx   = useRef(0);
  const progress    = useRef(0);

  const edgeGeom = useMemo(
    () => new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(1.9, 1)),
    []
  );
  useEffect(() => () => edgeGeom.dispose(), [edgeGeom]);

  useFrame((state, delta) => {
    if (!isInView) return;
    const t = state.clock.getElapsedTime();
    if (groupRef.current) {
      groupRef.current.rotation.y = t * 0.38;
      groupRef.current.rotation.x = 0.3 + Math.sin(t * 0.28) * 0.1;
    }
    progress.current += delta * 0.45;
    if (progress.current >= 1) {
      progress.current = 0;
      targetIdx.current = (targetIdx.current + 1) % COLORS.length;
    }
    const next = (targetIdx.current + 1) % COLORS.length;
    if (materialRef.current) {
      materialRef.current.color
        .copy(COLORS[targetIdx.current]!)
        .lerp(COLORS[next]!, progress.current);
      materialRef.current.emissive.copy(materialRef.current.color);
    }
  });

  return (
    <group ref={groupRef}>
      <mesh>
        <icosahedronGeometry args={[1.5, 1]} />
        <meshStandardMaterial
          ref={materialRef}
          color={COLORS[0]}
          roughness={0.2}
          metalness={0.8}
          emissive={COLORS[0]}
          emissiveIntensity={0.45}
        />
      </mesh>
      <lineSegments>
        <primitive object={edgeGeom} attach="geometry" />
        <lineBasicMaterial color="#ddd6fe" transparent opacity={0.18} />
      </lineSegments>
    </group>
  );
}

// ─── Animação de label letra-a-letra ─────────────────────────────────────────
const containerVariants = {
  initial: {},
  visible: { transition: { staggerChildren: 0.012 } },
  exit:    { transition: { staggerChildren: 0.016, staggerDirection: -1 as const } },
};
const letterVariants = {
  initial: { opacity: 0, y: -5 },
  visible: { opacity: 1, y: 0,  transition: { duration: 0.08 } },
  exit:    { opacity: 0, y: 5,  transition: { duration: 0.1  } },
};

// ─── Componente principal ─────────────────────────────────────────────────────
type Icosaendro3DProps = {
  isMini?:         boolean;
  fill?:           boolean;
  currentSection?: string;
};

const Icosaendro3D = ({ isMini = false, fill = false, currentSection = "" }: Icosaendro3DProps) => {
  const [isInView, setIsInView] = useState(true);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsInView(!!entry?.isIntersecting),
      { threshold: 0.1 }
    );
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // isMini tem prioridade sobre fill (evita FacetGem num canvas tiny)
  const containerClass = isMini
    ? "w-14 h-14 md:w-16 md:h-16"
    : fill
    ? "w-full h-full"
    : "w-full h-[350px]";

  // Glow CSS apenas no full-size (complementa o emissive do material)
  const containerStyle: React.CSSProperties | undefined = (!isMini && fill)
    ? {
        filter:
          "drop-shadow(0 0 20px rgba(124,58,237,0.4)) drop-shadow(0 0 44px rgba(217,119,6,0.2))",
      }
    : undefined;

  const isFull = !isMini && fill;

  return (
    <div ref={containerRef} className={`relative ${containerClass}`} style={containerStyle}>
      {isFull ? (
        // Full-size — FacetGem + luzes dinâmicas + OrbitControls
        <Canvas
          style={{ height: "100%", width: "100%" }}
          camera={{ position: [0, 0, 5] }}
          dpr={[1, 2]}
          gl={{ antialias: true }}
        >
          <DynamicLights />
          <FacetGem isInView={isInView} />
          <OrbitControls enableRotate enableZoom={false} enablePan={false} />
        </Canvas>
      ) : (
        // Mini — MiniGem leve, sem pós-processamento
        <Canvas
          style={{ height: "100%", width: "100%" }}
          camera={{ position: [0, 0, 5] }}
          dpr={[1, 1.5]}
          gl={{ powerPreference: "low-power", antialias: false }}
        >
          <ambientLight intensity={0.5} />
          <pointLight position={[10, 10, 10]}    intensity={0.6} />
          <pointLight position={[-10, -10, -10]} intensity={0.4} />
          <MiniGem isInView={isInView} />
          <OrbitControls enableRotate={false} enableZoom={false} enablePan={false} />
        </Canvas>
      )}

      {/* Label letra-a-letra (somente no viajante) */}
      {isMini && (
        <AnimatePresence>
          {currentSection && (
            <motion.div
              key={currentSection}
              className="absolute left-full ml-2 top-1/2 -translate-y-1/2 flex items-center gap-px bg-black/60 backdrop-blur-sm text-white/90 text-xs px-2.5 py-1 rounded-md whitespace-nowrap border border-white/10"
              variants={containerVariants}
              initial="initial"
              animate="visible"
              exit="exit"
            >
              {currentSection.split("").map((char, i) => (
                <motion.span key={i} variants={letterVariants} style={{ display: "inline-block" }}>
                  {char}
                </motion.span>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </div>
  );
};

export default Icosaendro3D;
