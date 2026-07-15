# Icozaendrinho

Cópia separada e autocontida do icosaedro-mascote do portfólio (MedusoPortifolio),
para servir de ponto de partida para um projeto próprio.

## Arquivos

- **Icosaendro3D.tsx** — versão standalone do gem (usada como card/mini/full-size
  com `OrbitControls`), sem nenhuma dependência do resto do portfólio além de
  `three`, `@react-three/fiber`, `@react-three/drei` e `framer-motion`.
- **IcosaGem.tsx** — versão "hero" do gem (`IcosaHero` original), com todo o
  sistema de vida idle: cutucar, tédio, espreguiçada, dormir, etc. Ainda espera
  receber `phase` e `sectionIndex` de fora (herdado do layout de seções do
  portfólio) — ajuste essa parte se for usar fora desse contexto.
- **IdleEvents.tsx** — os eventos especiais isolados: `StarRain` (shooting
  stars), `ShutdownScene` (bixinhos desligando/religando) e `LoveHearts`
  (ai_loveyou). Importado por `IcosaGem.tsx`.

## Dependências

Precisa de: `three`, `@react-three/fiber`, `@react-three/drei`, `framer-motion`.

## Observação

`IcosaGem.tsx` ainda tem lógica atrelada às seções do portfólio original
(Início/Projetos/Trajetória/Tecnologias/Contato via `sectionIndex`). Para um
projeto novo, provavelmente vale simplificar essa parte e manter só as fases
"intro" + eventos de vida.
