"use client";

/**
 * IcosaHero — o icosaedro-marca em tela cheia.
 *
 * Fases:
 *  - "intro":    núcleo no centro da tela preta, girando livre.
 *  - "anchored": após o clique, burst de desdobramento, ancora na lateral
 *                esquerda e gira 72° por seção (simetria pentagonal).
 *                No Contato ele se remonta e dá um backflip de celebração.
 *
 * Vida (idle, estilo Sonic parado):
 *  - Curiosidade: inclina sutilmente na direção do cursor.
 *  - ~14s parado: tiques de impaciência (pulinho, giro seco, arrepio).
 *  - ~20s: um evento especial pode acontecer (ver HeroIdleFx):
 *      · "stars"    (intro): chove estrelas e a gema acompanha com o olhar,
 *                    priorizando as coloridas.
 *      · "shutdown" (intro): um bixinho puxa a alavanca — a gema apaga, cai
 *                    como bolinha de gude, quica 2x e fica no chão até outro
 *                    bixinho religar; ela acorda assustada e volta ao lugar.
 *      · "love"     (Início): a gema encolhe, se esfrega na foto soltando
 *                    corações; volta se o usuário clicar ou mexer.
 *  - ~32s: espreguiçada — desdobra devagar as facetas e "boceja" de volta.
 *  - ~65s: dorme — afunda, quase para de girar, brilho respira baixo (zzz);
 *          qualquer input acorda com susto.
 *  - Cutucar (clique nele): giro de peão + burst; 3+ cliques → fica tonto.
 *
 * Câmera com FOV 40 (estreito) — elimina a distorção "ovo" quando a gema
 * fica longe do eixo central em telas largas.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { AnimatePresence, motion } from "framer-motion";
import * as THREE from "three";

import {
  EVENT_DUR,
  LoveHearts,
  SHUTDOWN_OFF_AT,
  SHUTDOWN_ON_AT,
  ShutdownScene,
  StarRain,
  type Gaze,
  type IdleEvent,
  type IdleEventType,
} from "./IdleEvents";

export type HeroPhase = "intro" | "anchored";
type Mood = "awake" | "sleeping";

const COLORS = [
  new THREE.Color("#7C3AED"), // roxo vivo — Dev
  new THREE.Color("#4C1D95"), // roxo profundo
  new THREE.Color("#D97706"), // âmbar — Games
  new THREE.Color("#92400E"), // âmbar escuro
  new THREE.Color("#6D28D9"), // violeta — ponte
  new THREE.Color("#B45309"), // âmbar médio
];

const STEP = (Math.PI * 2) / 5; // 72° — uma "faceta" de rotação por seção

// Relógio de tédio (segundos parado)
const REST_AT    = 14; // tiques de impaciência
const EVENT_AT   = 20; // janela dos eventos especiais (até 50s)
const STRETCH_AT = 32; // espreguiçada (uma vez por ciclo de tédio)
const SLEEP_AT   = 65; // dorme

// Clima de luz por seção: [intensidade roxa, intensidade âmbar]
const MOODS: [number, number][] = [
  [6, 5],     // Início
  [7.5, 3.5], // Projetos
  [5.5, 5.5], // Trajetória
  [3.5, 7.5], // Tecnologias
  [7, 7],     // Contato — remontado, brilho máximo
];

const clamp  = (v: number, a: number, b: number) => Math.min(Math.max(v, a), b);
const smooth = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
/** 0 → 1 → 0 ao longo de p ∈ [0,1] */
const pulse  = (p: number) => Math.sin(clamp(p, 0, 1) * Math.PI);
/** sobe, segura, desce — envelope da espreguiçada */
const stretchEnv = (p: number) =>
  p < 0.3 ? smooth(p / 0.3) : p < 0.62 ? 1 : smooth((1 - p) / 0.38);

type SharedRefs = {
  pointerRef:  React.MutableRefObject<{ x: number; y: number }>;
  activityRef: React.MutableRefObject<number>;
  pokeRef:     React.MutableRefObject<number>;
  eventRef:    React.MutableRefObject<IdleEvent>;
  gazeRef:     React.MutableRefObject<Gaze>;
};

type HeroProps = { phase: HeroPhase; sectionIndex: number };
type GemProps  = HeroProps & SharedRefs & { onMood: (m: Mood) => void };

/** Mantém o DPR correto ao mover a janela entre monitores diferentes */
function DprSync() {
  const setDpr = useThree((s) => s.setDpr);
  useEffect(() => {
    const sync = () => setDpr(Math.min(window.devicePixelRatio || 1, 2));
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, [setDpr]);
  return null;
}

function HeroLights({ phase, sectionIndex, eventRef }: HeroProps & { eventRef: React.MutableRefObject<IdleEvent> }) {
  const purpleRef  = useRef<THREE.PointLight>(null!);
  const amberRef   = useRef<THREE.PointLight>(null!);
  const ambientRef = useRef<THREE.AmbientLight>(null!);
  const whiteRef   = useRef<THREE.PointLight>(null!);

  useFrame((state, delta) => {
    const t = state.clock.getElapsedTime();
    const ev  = eventRef.current;
    const evT = ev ? (performance.now() - ev.start) / 1000 : 0;
    const off = ev?.type === "shutdown" && evT >= SHUTDOWN_OFF_AT && evT < SHUTDOWN_ON_AT;

    const mood = phase === "intro" ? [5.5, 5] : (MOODS[sectionIndex] ?? MOODS[0]!);
    const purple  = off ? 0.5  : mood[0]!;
    const amber   = off ? 0.5  : mood[1]!;
    const ambient = off ? 0.05 : 0.2;
    const white   = off ? 0.06 : 0.5;

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
    purpleRef.current.intensity  = THREE.MathUtils.damp(purpleRef.current.intensity,  purple,  3, delta);
    amberRef.current.intensity   = THREE.MathUtils.damp(amberRef.current.intensity,   amber,   3, delta);
    ambientRef.current.intensity = THREE.MathUtils.damp(ambientRef.current.intensity, ambient, 3, delta);
    whiteRef.current.intensity   = THREE.MathUtils.damp(whiteRef.current.intensity,   white,   3, delta);
  });

  return (
    <>
      <ambientLight ref={ambientRef} intensity={0.2} />
      <pointLight ref={purpleRef} color="#7C3AED" intensity={6} distance={14} />
      <pointLight ref={amberRef}  color="#D97706" intensity={5} distance={14} />
      <pointLight ref={whiteRef} position={[0, 0, 7]} color="#ffffff" intensity={0.5} />
    </>
  );
}

function HeroGem({ phase, sectionIndex, pointerRef, activityRef, pokeRef, eventRef, gazeRef, onMood }: GemProps) {
  const groupRef = useRef<THREE.Group>(null!);
  const meshRef  = useRef<THREE.Mesh>(null!);
  const matRef   = useRef<THREE.MeshStandardMaterial>(null!);
  const { viewport } = useThree();

  const faceColors    = useRef<THREE.Color[]>([]);
  const faceTargetIdx = useRef<number[]>([]);
  const faceSpeeds    = useRef<number[]>([]);

  // Estado de movimento
  const prevPhase   = useRef<HeroPhase>("intro");
  const prevSection = useRef(0);
  const spin        = useRef(0);
  const spinTarget  = useRef(0);
  const unfold      = useRef(0);
  const lastDisp    = useRef(0);
  const scaleRef    = useRef(0.8);
  const posX        = useRef(0);
  const posY        = useRef(0);
  const rotX        = useRef(0.22);
  const rotZ        = useRef(0);
  const lookYaw     = useRef(0);
  const lookPitch   = useRef(0);

  // Estado de "vida"
  const wasAsleep    = useRef(false);
  const pokesSeen    = useRef(0);
  const pokeVel      = useRef(0);
  const pokeTimes    = useRef<number[]>([]);
  const dizzyStart   = useRef(-1);
  const flipStart    = useRef(-1);
  const ticStart     = useRef(-1);
  const ticType      = useRef(0);
  const nextTicAt    = useRef(0);
  const stretchStart = useRef(-1);
  const stretchDone  = useRef(false);

  // Estado dos eventos especiais
  const prevEvent   = useRef<IdleEventType | "none">("none");
  const power       = useRef(1);  // 1 = ligada, 0 = desligada
  const fallPhase   = useRef<"idle" | "falling" | "rest" | "done">("idle");
  const fallVy      = useRef(0);
  const bounces     = useRef(0);
  const startledAt  = useRef(-1);

  const { gemGeo, edgeGeo, basePos, faceNormals, faceVariance, faceCount } = useMemo(() => {
    const base       = new THREE.IcosahedronGeometry(1.5, 1);
    const nonIndexed = base.toNonIndexed();
    base.dispose();

    const pos       = nonIndexed.attributes.position;
    const posCount  = pos.count;      // 240 (detail=1)
    const faceCount = posCount / 3;   // 80 faces
    const basePos   = new Float32Array(pos.array as Float32Array);

    // Normal + amplitude própria por face — usadas no desdobramento
    const faceNormals  = new Float32Array(faceCount * 3);
    const faceVariance = new Float32Array(faceCount);
    const vA = new THREE.Vector3(), vB = new THREE.Vector3(), vC = new THREE.Vector3();
    const ab = new THREE.Vector3(), cb = new THREE.Vector3();
    for (let f = 0; f < faceCount; f++) {
      vA.fromBufferAttribute(pos, f * 3);
      vB.fromBufferAttribute(pos, f * 3 + 1);
      vC.fromBufferAttribute(pos, f * 3 + 2);
      cb.subVectors(vC, vB);
      ab.subVectors(vA, vB);
      cb.cross(ab).normalize();
      faceNormals[f * 3]     = cb.x;
      faceNormals[f * 3 + 1] = cb.y;
      faceNormals[f * 3 + 2] = cb.z;
      faceVariance[f] = 0.55 + Math.random() * 0.9;
    }

    // Cores independentes por face — mesma identidade do Icosaendro3D
    const colors = new Float32Array(posCount * 3);
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
        const idx       = (f * 3 + v) * 3;
        colors[idx]     = color.r;
        colors[idx + 1] = color.g;
        colors[idx + 2] = color.b;
      }
    }
    faceColors.current    = fc;
    faceTargetIdx.current = ft;
    faceSpeeds.current    = fs;
    nonIndexed.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const baseEdge = new THREE.IcosahedronGeometry(1.52, 1);
    const edgeGeo  = new THREE.EdgesGeometry(baseEdge);
    baseEdge.dispose();

    return { gemGeo: nonIndexed, edgeGeo, basePos, faceNormals, faceVariance, faceCount };
  }, []);

  useEffect(() => () => { gemGeo.dispose(); edgeGeo.dispose(); }, [gemGeo, edgeGeo]);

  useFrame((state, delta) => {
    const t     = state.clock.getElapsedTime();
    const group = groupRef.current;
    if (!group) return;

    const isNarrow  = viewport.width < 4.2; // ~mobile (em unidades de mundo, FOV 40 / z 8)
    const isContato = sectionIndex === MOODS.length - 1;

    // ── Evento especial em andamento? ──
    const ev      = eventRef.current;
    const evType  = ev?.type ?? "none";
    const evT     = ev ? (performance.now() - ev.start) / 1000 : 0;
    const inEvent = evType !== "none";

    if (evType !== prevEvent.current) {
      // Reset dos estados de evento ao trocar/encerrar
      fallPhase.current = "idle";
      bounces.current   = 0;
      fallVy.current    = 0;
      prevEvent.current = evType;
    }

    // ── Relógio de tédio ──
    const idle     = (performance.now() - activityRef.current) / 1000;
    const sleeping = idle >= SLEEP_AT && !inEvent;

    if (wasAsleep.current && !sleeping) {
      // Acorda com susto
      unfold.current  = Math.max(unfold.current, 1.0);
      pokeVel.current += 5;
    }
    if (wasAsleep.current !== sleeping) {
      wasAsleep.current = sleeping;
      onMood(sleeping ? "sleeping" : "awake");
    }
    if (idle < REST_AT) {
      stretchDone.current = false;
      nextTicAt.current   = t + 4 + Math.random() * 4;
    }
    if (!sleeping && !inEvent && idle >= STRETCH_AT && !stretchDone.current && stretchStart.current < 0) {
      stretchStart.current = t;
      stretchDone.current  = true;
    }
    if (
      !sleeping && !inEvent && idle >= REST_AT &&
      t >= nextTicAt.current && ticStart.current < 0 && stretchStart.current < 0
    ) {
      ticStart.current  = t;
      ticType.current   = Math.floor(Math.random() * 3);
      nextTicAt.current = t + 4 + Math.random() * 5;
    }

    // ── "Me desligaram.." — energia + queda ──
    const powerOff = evType === "shutdown" && evT >= SHUTDOWN_OFF_AT && evT < SHUTDOWN_ON_AT;
    power.current  = THREE.MathUtils.damp(power.current, powerOff ? 0 : 1, 5, delta);

    if (evType === "shutdown") {
      if (fallPhase.current === "idle" && evT >= SHUTDOWN_OFF_AT && evT < SHUTDOWN_ON_AT) {
        fallPhase.current = "falling";
        fallVy.current    = 0;
        bounces.current   = 0;
      }
      if ((fallPhase.current === "falling" || fallPhase.current === "rest") && evT >= SHUTDOWN_ON_AT) {
        // Religaram — acorda assustada e flutua de volta
        fallPhase.current  = "done";
        startledAt.current = t;
        unfold.current     = Math.max(unfold.current, 0.9);
      }
      if (fallPhase.current === "falling") {
        fallVy.current -= 7.5 * delta;                 // gravidade
        posY.current   += fallVy.current * delta;
        const floor = -viewport.height / 2 + 1.5 * scaleRef.current + 0.05;
        if (posY.current <= floor) {
          posY.current = floor;
          if (bounces.current < 2 && Math.abs(fallVy.current) > 0.6) {
            fallVy.current = -fallVy.current * 0.42;   // quica como bolinha de gude
            bounces.current += 1;
          } else {
            fallVy.current    = 0;
            fallPhase.current = "rest";
          }
        }
      }
    }
    const freefall = fallPhase.current === "falling" || fallPhase.current === "rest";

    // ── Cutucadas ──
    if (pokeRef.current > pokesSeen.current) {
      const news = pokeRef.current - pokesSeen.current;
      pokesSeen.current = pokeRef.current;
      pokeVel.current  += 8 * news;
      unfold.current    = Math.max(unfold.current, 0.8);
      pokeTimes.current.push(t);
      pokeTimes.current = pokeTimes.current.filter((pt) => t - pt < 2.5);
      if (pokeTimes.current.length >= 3) {
        dizzyStart.current = t;   // ficou tonto
        pokeTimes.current  = [];
      }
    }

    // ── Transições de fase / seção ──
    if (phase !== prevPhase.current) {
      if (phase === "anchored") {
        unfold.current     = 1.35;
        spinTarget.current = (Math.floor(spin.current / STEP) + 2) * STEP;
        if (sectionIndex === MOODS.length - 1) flipStart.current = t;
      } else {
        spin.current      %= Math.PI * 2;
        spinTarget.current = spin.current;
      }
      prevPhase.current   = phase;
      prevSection.current = sectionIndex;
    }
    if (phase === "anchored" && sectionIndex !== prevSection.current) {
      spinTarget.current += (sectionIndex - prevSection.current) * STEP;
      unfold.current      = Math.min(unfold.current + 0.45, 1.2);
      if (isContato) flipStart.current = t; // backflip de celebração
      prevSection.current = sectionIndex;
    }

    // ── Envelopes dos gestos ──
    let ticYaw = 0, ticHop = 0, unfoldExtra = 0, scaleExtra = 1;
    if (ticStart.current >= 0) {
      const p = (t - ticStart.current) / 0.8;
      if (p >= 1) ticStart.current = -1;
      else if (ticType.current === 0) ticHop = pulse(p) * 0.28;               // pulinho
      else if (ticType.current === 1) ticYaw = Math.sin(p * Math.PI * 2) * STEP * 0.35; // giro seco vai-e-volta
      else unfoldExtra += pulse(p) * 0.22;                                    // arrepio de facetas
    }
    if (stretchStart.current >= 0) {
      const p = (t - stretchStart.current) / 4.2;
      if (p >= 1) stretchStart.current = -1;
      else {
        unfoldExtra += stretchEnv(p) * 0.5;   // espreguiçada
        scaleExtra   = 1 + stretchEnv(p) * 0.05;
      }
    }
    let dizzyRoll = 0;
    if (dizzyStart.current >= 0) {
      const p = (t - dizzyStart.current) / 2.6;
      if (p >= 1) dizzyStart.current = -1;
      else dizzyRoll = Math.sin((t - dizzyStart.current) * 9) * 0.3 * (1 - p); // cambaleia
    }
    let flipX = 0;
    if (flipStart.current >= 0) {
      const p = (t - flipStart.current) / 1.15;
      if (p >= 1) flipStart.current = -1;
      else flipX = -smooth(p) * Math.PI * 2; // backflip completo
    }
    // Olhar assustado pós-religada / pós-susto
    let startleLook = 0;
    if (startledAt.current >= 0) {
      const p = (t - startledAt.current) / 1.4;
      if (p >= 1) startledAt.current = -1;
      else startleLook = Math.sin((t - startledAt.current) * 11) * 0.35 * (1 - p);
    }

    // ── Olhar — cursor, estrelas cadentes ou a foto ──
    let wantYaw = 0, wantPitch = 0, lookLambda = 3;
    if (!sleeping && !powerOff && !freefall) {
      if (evType === "stars" && gazeRef.current.active) {
        // Segue a estrela líder (preferindo as coloridas)
        const gx = gazeRef.current.x * viewport.width  / 2;
        const gy = gazeRef.current.y * viewport.height / 2;
        wantYaw    = clamp((gx - group.position.x) * 0.1,  -0.5,  0.5);
        wantPitch  = clamp(-(gy - group.position.y) * 0.12, -0.45, 0.45);
        lookLambda = 4;
      } else if (evType === "love") {
        wantYaw = 0.3; // olhando pra foto
      } else {
        const wx = pointerRef.current.x * viewport.width  / 2;
        const wy = pointerRef.current.y * viewport.height / 2;
        wantYaw   = clamp((wx - group.position.x) * 0.06, -0.32, 0.32);
        wantPitch = clamp(-(wy - group.position.y) * 0.08, -0.26, 0.26);
      }
    }
    lookYaw.current   = THREE.MathUtils.damp(lookYaw.current,   wantYaw,   lookLambda, delta);
    lookPitch.current = THREE.MathUtils.damp(lookPitch.current, wantPitch, lookLambda, delta);

    // ── Rotação ──
    if (sleeping || power.current < 0.6) {
      spin.current += delta * 0.02; // quase parado (dormindo ou desligada)
    } else if (phase === "intro") {
      spin.current += delta * 0.28;
    } else if (pokeVel.current > 0.02) {
      spin.current += pokeVel.current * delta; // peão da cutucada
    } else {
      spin.current = THREE.MathUtils.damp(spin.current, spinTarget.current, 3, delta);
    }
    pokeVel.current *= Math.exp(-2.2 * delta);

    const targetRx = phase === "intro"
      ? 0.22 + Math.sin(t * 0.2) * 0.14
      : 0.24 + Math.sin(t * 0.25) * 0.08;
    const targetRz = phase === "intro"
      ? Math.cos(t * 0.13) * 0.05
      : Math.cos(t * 0.17) * 0.04;
    rotX.current = THREE.MathUtils.damp(rotX.current, targetRx, 2, delta);
    rotZ.current = THREE.MathUtils.damp(rotZ.current, targetRz, 2, delta);

    // AI_loveyou — esfrega na foto
    let loveWiggle = 0, loveLean = 0;
    if (evType === "love" && evT > 1.1) {
      loveWiggle = Math.sin(t * 5.2) * 0.07;
      loveLean   = -0.2 + Math.sin(t * 5.2) * 0.05;
    }

    group.rotation.y = spin.current + lookYaw.current + ticYaw + startleLook;
    group.rotation.x = rotX.current + lookPitch.current + flipX;
    group.rotation.z = rotZ.current + dizzyRoll + loveLean;

    // ── Posição + escala ──
    let tx = 0, ty = 0, ts = 0.8;
    if (phase === "anchored") {
      if (isNarrow) {
        // Mobile: gema pequena no canto superior direito, como assinatura viva
        tx = viewport.width  / 2 - 0.55;
        ty = viewport.height / 2 - 0.75;
        ts = 0.22;
      } else {
        tx = -viewport.width / 2 + Math.min(viewport.width * 0.21, 2.4);
        ty = 0;
        ts = 0.66;
      }
    }
    if (evType === "love" && !isNarrow) {
      // Encolhe e se aninha em cima da foto
      tx = -viewport.width * 0.03;
      ty = 0.15;
      ts = 0.45;
    }
    if (sleeping) ty -= phase === "anchored" && isNarrow ? 0.12 : 0.35; // afunda dormindo

    const bob = (phase === "anchored" && isNarrow) || freefall ? 0
      : Math.sin(t * (sleeping ? 0.3 : 0.48)) * (sleeping ? 0.06 : 0.13);

    posX.current = THREE.MathUtils.damp(posX.current, tx, 2.2, delta);
    if (!freefall) posY.current = THREE.MathUtils.damp(posY.current, ty, 2.2, delta);
    group.position.x = posX.current + loveWiggle;
    group.position.y = freefall ? posY.current : posY.current + bob + ticHop;

    scaleRef.current = THREE.MathUtils.damp(scaleRef.current, ts, 2.2, delta);
    const breathe = sleeping ? 1 + Math.sin(t * 1.3) * 0.012 : 1;
    group.scale.setScalar(scaleRef.current * scaleExtra * breathe);

    // ── Desdobramento — faces deslocadas ao longo das normais ──
    const unfoldTarget =
      sleeping || powerOff ? 0.015                          // fechadinho
      : phase === "intro" ? 0
      : isContato         ? 0                               // remontado — ciclo fechado
      : 0.055 + Math.sin(t * 0.7) * 0.03;                   // respiração das facetas
    unfold.current = THREE.MathUtils.damp(unfold.current, unfoldTarget, 2.4, delta);

    const disp = unfold.current + unfoldExtra;
    if (meshRef.current && (disp > 0.0006 || lastDisp.current > 0.0006)) {
      const posAttr = meshRef.current.geometry.attributes.position!;
      const arr     = posAttr.array as Float32Array;
      for (let f = 0; f < faceCount; f++) {
        const d  = disp * faceVariance[f]! * 0.55;
        const nx = faceNormals[f * 3]!     * d;
        const ny = faceNormals[f * 3 + 1]! * d;
        const nz = faceNormals[f * 3 + 2]! * d;
        for (let v = 0; v < 3; v++) {
          const i    = (f * 3 + v) * 3;
          arr[i]     = basePos[i]!     + nx;
          arr[i + 1] = basePos[i + 1]! + ny;
          arr[i + 2] = basePos[i + 2]! + nz;
        }
      }
      posAttr.needsUpdate = true;
    }
    lastDisp.current = disp;

    // ── Emissive + energia ──
    if (matRef.current) {
      const moodMix = (Math.sin(t * 0.18) + 1) / 2;
      matRef.current.emissive.lerpColors(COLORS[0]!, COLORS[2]!, moodMix);
      const targetEmissive = sleeping
        ? 0.12 + (Math.sin(t * 1.2) + 1) * 0.05
        : phase === "anchored" && isContato ? 0.85 : 0.55;
      matRef.current.emissiveIntensity = THREE.MathUtils.damp(
        matRef.current.emissiveIntensity,
        targetEmissive * (0.04 + 0.96 * power.current),
        2, delta,
      );
      // Desligada: as faces escurecem (color multiplica as vertex colors)
      matRef.current.color.setScalar(0.12 + 0.88 * power.current);
    }

    // ── Cores por face — cada uma no seu próprio ritmo ──
    if (meshRef.current) {
      const colorAttr = meshRef.current.geometry.attributes.color!;
      for (let f = 0; f < faceCount; f++) {
        const speed  = faceSpeeds.current[f]!;
        const target = COLORS[faceTargetIdx.current[f]!]!;

        const c = faceColors.current[f]!;
        c.lerp(target, delta * speed * 2.0);

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
      {/* Casca wireframe — não desdobra; fica como "memória" do sólido */}
      <lineSegments>
        <primitive object={edgeGeo} attach="geometry" />
        <lineBasicMaterial color="#c4b5fd" transparent opacity={0.18} />
      </lineSegments>
    </group>
  );
}

export default function IcosaHero({ phase, sectionIndex }: HeroProps) {
  const [mood,      setMood]      = useState<Mood>("awake");
  const [idleEvent, setIdleEvent] = useState<IdleEvent>(null);

  const pointerRef  = useRef({ x: 0, y: 0 });
  const activityRef = useRef(0);
  const pokeRef     = useRef(0);
  const eventRef    = useRef<IdleEvent>(null);
  const gazeRef     = useRef<Gaze>({ x: 0, y: 0.5, active: false });
  const lastFxRef   = useRef<IdleEventType | null>(null); // evita repetir o mesmo evento em seguida

  useEffect(() => { eventRef.current = idleEvent; }, [idleEvent]);

  // Qualquer input do usuário = atividade (zera o relógio de tédio)
  useEffect(() => {
    activityRef.current = performance.now();
    const bump = () => {
      activityRef.current = performance.now();
      // AI_loveyou é tímido: clique/movimento manda a gema de volta
      if (eventRef.current?.type === "love") setIdleEvent(null);
    };
    const move = (e: PointerEvent) => {
      pointerRef.current = {
        x: (e.clientX / window.innerWidth) * 2 - 1,
        y: -((e.clientY / window.innerHeight) * 2 - 1),
      };
      bump();
    };
    window.addEventListener("pointermove", move,  { passive: true });
    window.addEventListener("pointerdown", bump,  { passive: true });
    window.addEventListener("wheel",       bump,  { passive: true });
    window.addEventListener("keydown",     bump);
    window.addEventListener("touchstart",  bump,  { passive: true });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerdown", bump);
      window.removeEventListener("wheel",       bump);
      window.removeEventListener("keydown",     bump);
      window.removeEventListener("touchstart",  bump);
    };
  }, []);

  // Navegar / entrar também conta como atividade e cancela eventos
  useEffect(() => {
    activityRef.current = performance.now();
    setIdleEvent(null);
  }, [phase, sectionIndex]);

  // Agendador — a cada ~30s parado, sorteia um evento especial (sem repetir
  // o anterior). O fim de um evento zera o relógio de tédio, então o próximo
  // vem ~30s depois enquanto o usuário continuar parado.
  useEffect(() => {
    const id = setInterval(() => {
      const now = performance.now();
      const cur = eventRef.current;

      if (cur) {
        if ((now - cur.start) / 1000 >= EVENT_DUR[cur.type]) {
          activityRef.current = now; // reinicia o ciclo de 30s
          setIdleEvent(null);
        }
        return;
      }

      const idle = (now - activityRef.current) / 1000;
      if (idle < 30) return;

      let pool: IdleEventType[] = [];
      if (phase === "intro") {
        pool = ["stars", "shutdown"];
      } else if (sectionIndex === 0 && window.matchMedia("(min-width: 768px)").matches) {
        pool = ["love"];
      }
      if (pool.length > 1) pool = pool.filter((p) => p !== lastFxRef.current);

      const type = pool[Math.floor(Math.random() * pool.length)];
      if (!type) return;
      lastFxRef.current = type;
      setIdleEvent({ type, start: now });
    }, 800);
    return () => clearInterval(id);
  }, [phase, sectionIndex]);

  return (
    <>
      {/* Eventos especiais — camada DOM */}
      <AnimatePresence>
        {idleEvent?.type === "stars"    && <StarRain key="stars" gazeRef={gazeRef} />}
        {idleEvent?.type === "shutdown" && <ShutdownScene key="shutdown" />}
        {idleEvent?.type === "love"     && <LoveHearts key="love" />}
      </AnimatePresence>

      {/* Durante o AI_loveyou a gema sobe de camada — fica POR CIMA da foto */}
      <div
        className={`pointer-events-none fixed inset-0 ${idleEvent?.type === "love" ? "z-[14]" : "z-[5]"}`}
        style={{
          filter:
            "drop-shadow(0 0 24px rgba(124,58,237,0.35)) drop-shadow(0 0 52px rgba(217,119,6,0.18))",
        }}
      >
        <Canvas camera={{ position: [0, 0, 8], fov: 40 }} dpr={[1, 2]} gl={{ antialias: true }}>
          <DprSync />
          <HeroLights phase={phase} sectionIndex={sectionIndex} eventRef={eventRef} />
          <HeroGem
            phase={phase}
            sectionIndex={sectionIndex}
            pointerRef={pointerRef}
            activityRef={activityRef}
            pokeRef={pokeRef}
            eventRef={eventRef}
            gazeRef={gazeRef}
            onMood={setMood}
          />
        </Canvas>
      </div>

      {/* Área clicável sobre a gema — cutucar */}
      {phase === "anchored" && (
        <button
          type="button"
          aria-label="Cutucar o icosaedro"
          onClick={() => { pokeRef.current += 1; }}
          className="fixed z-[12] cursor-pointer rounded-full
            right-2 top-6 h-16 w-16
            md:right-auto md:top-1/2 md:left-[21%] md:h-[24vmin] md:w-[24vmin] md:-translate-x-1/2 md:-translate-y-1/2"
        />
      )}

      {/* z z z — enquanto dorme */}
      <AnimatePresence>
        {mood === "sleeping" && (
          <motion.div
            key="zzz"
            className={`pointer-events-none fixed z-[15] flex items-end gap-1 ${
              phase === "intro"
                ? "left-[58%] top-[30%]"
                : "right-14 top-8 md:left-[28%] md:right-auto md:top-[34%]"
            }`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.3 } }}
          >
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                className="font-mono text-white/50"
                style={{ fontSize: 12 + i * 5 }}
                animate={{ opacity: [0, 0.9, 0], y: [-2, -16] }}
                transition={{ repeat: Infinity, duration: 2.4, delay: i * 0.55, ease: "easeOut" }}
              >
                z
              </motion.span>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
