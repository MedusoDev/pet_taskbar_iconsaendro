// AI_Live — banco de personalidades, sem IA por enquanto (isso fica pra
// depois, possivelmente plugando uma API de verdade aqui no mesmo lugar).
//
// Cada personalidade vive no seu próprio arquivo em personalities/ e exporta:
//   id, name    — identidade
//   palette     — as 6 cores do degradê de facetas + emissive (troca o
//                 visual inteiro do gem, não só um tint)
//   movement    — modula o motor de movimento (ver campos abaixo)
//   signature   — animação periódica exclusiva (ou null, se não tiver):
//                 { type, label, duration, apply(p) -> {z,y,scale,unfold,spinMul} }
//                 p vai de 0 a 1 ao longo de `duration` segundos.
//   lines       — falas por gatilho
//
// A personalidade ATIVA não é mais sorteada por dia: é controlada pela
// máquina de estados em behaviors/personalityState.js — Normality é a base,
// Zen e Excited são alcançados por comportamento do usuário e sempre voltam
// pro Normality. `PERSONALITIES` aqui é só o catálogo bruto.
//
// Campos de `movement`:
//   hoverMeanSec — tempo médio pairando antes de decidir ir pra outro lugar
//   speed        — multiplicador da velocidade de viagem
//   micro        — amplitude da micro-deriva enquanto paira
//   approach     — 0..1: quanto gravita na direção do cursor parado por perto
//   spin         — multiplicador da rotação própria
//   yRange       — 0..1: quão alto costuma pairar (1 = faixa toda)

import { excited } from './excited.js';
import { zen } from './zen.js';
import { normality } from './normality.js';

export const PERSONALITIES = [normality, zen, excited];
