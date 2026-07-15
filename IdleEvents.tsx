"use client";

/**
 * HeroIdleFx — eventos especiais de tédio da gema (camada DOM).
 *
 *  - StarRain:      céu estrelado + chuva de estrelas cadentes; publica a
 *                   posição da estrela "líder" (preferindo as coloridas) em
 *                   gazeRef para a gema acompanhar com o olhar.
 *  - ShutdownScene: alavanca no canto + bixinho roxo que desliga a gema e
 *                   bixinho âmbar que religa. A física da queda fica no
 *                   IcosaHero; aqui é só a encenação, sincronizada pelos
 *                   mesmos timestamps.
 *  - LoveHearts:    corações subindo perto da foto durante o AI_loveyou.
 */

import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

export type IdleEventType = "stars" | "shutdown" | "love";
export type IdleEvent = { type: IdleEventType; start: number } | null;

export type Gaze = { x: number; y: number; active: boolean };

/** Duração total de cada evento (s) */
export const EVENT_DUR: Record<IdleEventType, number> = {
  stars:    14,
  shutdown: 12.5,
  love:     9,
};

// Roteiro do "me desligaram..": momentos em que a alavanca é puxada
export const SHUTDOWN_OFF_AT = 2.2;
export const SHUTDOWN_ON_AT  = 8.8;

// ─── Chuva de estrelas ────────────────────────────────────────────────────────

type Shot = {
  x: number; y: number;
  vx: number; vy: number;
  colored: boolean;
  color: string;
  born: number;
};

export function StarRain({ gazeRef }: { gazeRef: React.MutableRefObject<Gaze> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx    = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let raf = 0;
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener("resize", resize);

    const start = performance.now();
    let prev    = start;
    let lastSpawn = 0;
    const shots: Shot[] = [];
    const DUR = EVENT_DUR.stars;

    // Céu de fundo — pontinhos que piscam
    const twinkles = Array.from({ length: 110 }, () => ({
      x: Math.random(), y: Math.random(),
      r: 0.3 + Math.random() * 1.3,
      ph: Math.random() * Math.PI * 2,
      sp: 0.5 + Math.random() * 1.5,
    }));

    const loop = (now: number) => {
      const t     = (now - start) / 1000;
      const delta = Math.min((now - prev) / 1000, 0.05);
      prev = now;
      const w = canvas.width, h = canvas.height;

      // Fade global de entrada/saída
      const fade = Math.min(t / 1.6, 1) * Math.min(Math.max((DUR - t) / 1.6, 0), 1);
      ctx.clearRect(0, 0, w, h);

      for (const s of twinkles) {
        ctx.globalAlpha = (0.22 + 0.55 * (Math.sin(t * s.sp + s.ph) * 0.5 + 0.5)) * fade;
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(s.x * w, s.y * h * 0.85, s.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // Nascem estrelas cadentes enquanto a chuva dura
      if (t > 0.8 && t < DUR - 2.5 && now - lastSpawn > 420) {
        lastSpawn = now;
        const colored = Math.random() < 0.35;
        shots.push({
          x: w * 0.15 + Math.random() * w * 0.95,
          y: -30,
          vx: -(w * 0.10 + Math.random() * w * 0.08),
          vy: h * 0.28 + Math.random() * h * 0.12,
          colored,
          color: colored ? (Math.random() < 0.5 ? "#a78bfa" : "#fbbf24") : "#e5e7eb",
          born: now,
        });
      }

      // Desenha e escolhe a estrela "líder" (coloridas têm prioridade)
      let lead: Shot | null = null;
      for (let i = shots.length - 1; i >= 0; i--) {
        const s = shots[i]!;
        s.x += s.vx * delta;
        s.y += s.vy * delta;
        if (s.y > h + 60 || s.x < -100) { shots.splice(i, 1); continue; }

        const tail = 0.1; // s de rastro
        const grad = ctx.createLinearGradient(s.x, s.y, s.x - s.vx * tail, s.y - s.vy * tail);
        grad.addColorStop(0, s.color);
        grad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.globalAlpha   = 0.9 * fade;
        ctx.strokeStyle   = grad;
        ctx.lineWidth     = s.colored ? 2.4 : 1.4;
        ctx.lineCap       = "round";
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x - s.vx * tail, s.y - s.vy * tail);
        ctx.stroke();

        ctx.globalAlpha = fade;
        ctx.fillStyle   = s.color;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.colored ? 2.6 : 1.6, 0, Math.PI * 2);
        ctx.fill();

        if (!lead || (s.colored && !lead.colored) || (s.colored === lead.colored && s.born > lead.born)) {
          lead = s;
        }
      }
      ctx.globalAlpha = 1;

      if (lead && lead.y > 0 && lead.y < h * 0.9) {
        gazeRef.current = { x: (lead.x / w) * 2 - 1, y: -((lead.y / h) * 2 - 1), active: true };
      } else {
        gazeRef.current.active = false;
      }

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      gazeRef.current.active = false;
    };
  }, [gazeRef]);

  return (
    <motion.canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-[3]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: 0.6 } }}
      exit={{ opacity: 0, transition: { duration: 0.8 } }}
    />
  );
}

// ─── Me desligaram.. ─────────────────────────────────────────────────────────

function Critter({ color }: { color: string }) {
  return (
    <motion.div
      className="relative h-6 w-6"
      animate={{ y: [0, -2.5, 0] }}
      transition={{ repeat: Infinity, duration: 0.28, ease: "easeInOut" }}
    >
      {/* corpo — uma faceta com pernas */}
      <div
        className="h-5 w-6"
        style={{ background: color, clipPath: "polygon(50% 0, 100% 100%, 0 100%)" }}
      />
      <div className="absolute left-[46%] top-[55%] h-1 w-1 rounded-full bg-black/80" />
      <motion.div
        className="absolute -bottom-1.5 left-1.5 h-1.5 w-0.5 rounded bg-white/70"
        animate={{ y: [0, -1.5, 0] }}
        transition={{ repeat: Infinity, duration: 0.28 }}
      />
      <motion.div
        className="absolute -bottom-1.5 right-1.5 h-1.5 w-0.5 rounded bg-white/70"
        animate={{ y: [-1.5, 0, -1.5] }}
        transition={{ repeat: Infinity, duration: 0.28 }}
      />
    </motion.div>
  );
}

export function ShutdownScene() {
  const D = EVENT_DUR.shutdown;
  const k = (s: number) => s / D;

  return (
    <motion.div
      className="pointer-events-none fixed bottom-6 left-6 z-[6]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: 0.4 } }}
      exit={{ opacity: 0, transition: { duration: 0.5 } }}
    >
      {/* Alavanca */}
      <div className="relative h-16 w-12">
        <motion.div
          className="absolute bottom-3 left-1/2 h-9 w-1 origin-bottom -translate-x-1/2 rounded bg-zinc-400"
          initial={{ rotate: -30 }}
          animate={{ rotate: [-30, -30, 32, 32, -30, -30] }}
          transition={{ duration: D, times: [0, k(2.0), k(2.4), k(8.6), k(9.0), 1], ease: "easeInOut" }}
        >
          <div className="absolute -top-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rounded-full bg-red-400 shadow" />
        </motion.div>
        <div className="absolute bottom-1 left-0 right-0 h-2 rounded bg-zinc-700" />
        <p className="absolute -bottom-4 left-0 font-mono text-[9px] tracking-widest text-white/30">power</p>
      </div>

      {/* Bixinho roxo — desliga */}
      <motion.div
        className="absolute bottom-1 left-0"
        initial={{ x: -150, opacity: 0 }}
        animate={{ x: [-150, 14, 14, -150, -150], opacity: [0, 1, 1, 1, 0] }}
        transition={{ duration: D, times: [0, k(1.9), k(2.8), k(4.6), k(4.8)], ease: "linear" }}
      >
        <Critter color="#a78bfa" />
      </motion.div>

      {/* Bixinho âmbar — religa */}
      <motion.div
        className="absolute bottom-1 left-0"
        initial={{ x: -150, opacity: 0 }}
        animate={{ x: [-150, -150, 14, 14, -150], opacity: [0, 0, 1, 1, 0] }}
        transition={{ duration: D, times: [0, k(6.6), k(8.4), k(9.8), k(11.2)], ease: "linear" }}
      >
        <Critter color="#fbbf24" />
      </motion.div>
    </motion.div>
  );
}

// ─── AI_loveyou ──────────────────────────────────────────────────────────────

export function LoveHearts() {
  const [hearts, setHearts] = useState<{ id: number; dx: number; c: string }[]>([]);

  useEffect(() => {
    let n = 0;
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    const id = setInterval(() => {
      n += 1;
      const heart = {
        id: n,
        dx: Math.random() * 70 - 35,
        c: ["#c084fc", "#fbbf24", "#f472b6"][n % 3]!,
      };
      setHearts((h) => [...h, heart]);
      timeouts.push(setTimeout(() => {
        setHearts((h) => h.filter((x) => x.id !== heart.id));
      }, 2300));
    }, 550);
    return () => { clearInterval(id); timeouts.forEach(clearTimeout); };
  }, []);

  return (
    <motion.div
      className="pointer-events-none fixed z-[15] hidden md:block"
      style={{ left: "47vw", top: "38%" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.4 } }}
    >
      <p className="absolute left-[-70px] top-[110px] whitespace-nowrap font-mono text-[10px] tracking-widest text-white/35">
        {"> AI_loveyou"}
      </p>
      {hearts.map((h) => (
        <motion.span
          key={h.id}
          className="absolute select-none text-sm"
          style={{ color: h.c, left: h.dx }}
          initial={{ opacity: 0, y: 12, scale: 0.6 }}
          animate={{ opacity: [0, 1, 0], y: -72, scale: 1.15 }}
          transition={{ duration: 2.2, ease: "easeOut" }}
        >
          ♥
        </motion.span>
      ))}
    </motion.div>
  );
}
