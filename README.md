# pet_taskbar_icosaendro

Um "bichinho de estimação" 3D — um icosaedro procedural, sem sprites nem
texturas — que vive flutuando sobre a taskbar do Windows, atravessa todos os
monitores conectados, reage ao mouse e ao navegador ativo, e tem personalidade
própria: humor que muda com o jeito que você trata ele.

Feito em **Electron** (processo principal em Node) + **Three.js puro** no
renderer (sem framework de UI — DOM/CSS manual para os balões e barrinhas).

> Esta documentação cobre a branch `versionamento` (o estado atual do
> repositório). O projeto também tem uma branch `master`, mais adiantada, que
> acrescenta um sistema de IA (Groq/Ollama), lorebook, memória/vínculo
> persistente, monitor de sistema e uma janela de Configurações inteira — não
> documentado aqui porque ainda não é o que está de fato em uso nesta branch.

---

## Índice

1. [Como rodar](#como-rodar)
2. [Estrutura de pastas](#estrutura-de-pastas)
3. [Arquitetura geral](#arquitetura-geral)
4. [Processo principal (`main.js` / `preload.js`)](#processo-principal-mainjs--preloadjs)
5. [Estado central (`behaviors/state.js`)](#estado-central-behaviorsstatejs)
6. [Loop principal (`movement.js`)](#loop-principal-movementjs)
7. [Cena 3D (`scene.js`)](#cena-3d-scenejs)
8. [Sistema de personalidades](#sistema-de-personalidades)
9. [Máquina de estados de personalidade (`personalityState.js`)](#máquina-de-estados-de-personalidade-personalitystatejs)
10. [Sistema de interações e comportamentos](#sistema-de-interações-e-comportamentos)
11. [Interface flutuante (balões, barra, efeitos)](#interface-flutuante-balões-barra-efeitos)
12. [Ico_Eye — reação ao navegador ativo](#ico_eye--reação-ao-navegador-ativo)
13. [Utilitários (`mathUtils.js`, `noise.js`)](#utilitários-mathutilsjs-noisejs)
14. [Canais de IPC (main ↔ renderer)](#canais-de-ipc-main--renderer)
15. [Arquivos legados (`.tsx`)](#arquivos-legados-tsx)
16. [Arquivo `.bak` órfão](#arquivo-bak-órfão)

---

## Como rodar

```bash
npm install
npm start
```

`npm start` executa `electron .`, que carrega `main.js` como processo
principal. Não há passo de build — o renderer é ES modules puro, carregado
direto pelo Chromium do Electron (`<script type="module">` em
`renderer/index.html`).

Dependências de runtime: `electron` (dev), `active-win` (detecta a janela
ativa do Windows) e `three` (motor 3D). Sem `electron-builder` configurado
nesta branch — o app roda só em modo dev, não gera `.exe`.

---

## Estrutura de pastas

```
pet_taskbar_icosaendro/
├── main.js                  # processo principal Electron: janela, monitores, IPC
├── preload.js                # ponte contextBridge — expõe window.petAPI ao renderer
├── package.json / package-lock.json
├── ANIMATIONS.md             # catálogo de referência de toda animação/comportamento
├── README.md                 # este arquivo
├── assets/                   # pasta de ícones do app (vazia nesta branch, só .gitkeep)
├── elec_out.log / elec_err.log  # saída de execução do Electron (não deveriam estar versionados)
├── IcosaGem.tsx               # componente React legado — NÃO faz parte do app (ver seção 15)
├── Icosaendro3D.tsx           # idem
├── IdleEvents.tsx             # idem
│
└── renderer/                  # tudo que roda dentro da janela do pet (Three.js)
    ├── index.html              # canvas + divs de UI fixas (#zzz, #site-icon, #speech)
    ├── movement.js              # bootstrap: monta cena/estado/sistemas e roda o loop (animate())
    ├── scene.js                 # cena 3D: icosaedro, câmera ortográfica, luzes, cores, unfold
    ├── noise.js                 # Simplex noise 2D (movimento orgânico, sem libs externas)
    │
    ├── behaviors/                # cada arquivo é um "sistema" que lê/escreve o state central
    │   ├── state.js               # createState() — o objeto de estado único e compartilhado
    │   ├── mathUtils.js            # clamp / smooth / pulse / stretchEnv / damp
    │   ├── liveAnimation.js        # updateAlive() — compõe a pose do pet a cada frame
    │   ├── wander.js               # hover (pairar) + relocate (viagens) + chão por monitor
    │   ├── boredom.js              # relógio de tédio (tiques → espreguiçada → zen → sono → shutdown)
    │   ├── shutdown.js             # evento de desligar/cair/religar (com variante nocaute)
    │   ├── interactions.js         # mouse: cutucão, drag, cafuné, estacionar, click-through
    │   ├── personalityState.js     # máquina de estados: Normality ⇄ Zen ⇄ Excited
    │   ├── speech.js                # balão de fala (sorteia linha do banco da personalidade)
    │   ├── prompt.js                # balão de PERGUNTA clicável (estacionar/liberar)
    │   ├── effects.js               # respingo de gotículas + blush "///" (vergonha)
    │   ├── affectionBar.js          # barrinha de carinho flutuante acima do gem
    │   └── siteEye.js               # Ico_Eye — reage à categoria do site ativo no navegador
    │
    └── personalities/             # o "banco" de humores do pet
        ├── index.js                 # catálogo: PERSONALITIES = [normality, zen, excited]
        ├── normality.js              # humor base — sem assinatura própria
        ├── zen.js                    # humor calmo — respiração, aura
        ├── excited.js                # humor animado/carente — persegue o mouse, pede carinho
        └── normality.js.bak          # arquivo órfão não rastreado (ver seção 16)
```

---

## Arquitetura geral

```
┌─────────────────────────── processo principal (Node) ───────────────────────────┐
│ main.js                                                                          │
│  - cria a janela transparente/sem-frame que cobre todos os monitores            │
│  - faz polling do cursor global (50ms) e da janela ativa via active-win (1s)     │
│  - repassa tudo pro renderer via IPC (webContents.send)                          │
└──────────────────────────────────┬───────────────────────────────────────────────┘
                                    │ preload.js (contextBridge) expõe window.petAPI
┌──────────────────────────────────▼───────────────────────────────────────────────┐
│ renderer/ (Chromium, ES modules, Three.js)                                       │
│                                                                                    │
│  movement.js (bootstrap + loop)                                                  │
│    ├─ scene.js         → cena 3D, luzes, cores, geometria do gem                 │
│    ├─ state.js         → cria o objeto de estado único                          │
│    ├─ personalities/   → catálogo de humores (paleta/movimento/falas)            │
│    └─ behaviors/*      → cada sistema lê/escreve o state a cada frame            │
│                                                                                    │
│  a cada frame (requestAnimationFrame):                                           │
│    shutdown ativo? → updateShutdown()                                            │
│    senão            → updateBoredomClock() + updateAlive()                       │
│    sempre           → updateVisuals() (scene.js) + render()                      │
└────────────────────────────────────────────────────────────────────────────────┘
```

A janela do pet é `transparent`, `frame: false`, `alwaysOnTop`, `skipTaskbar` e
cobre a largura de **todos os monitores** simultaneamente. Ela normalmente
ignora eventos de mouse (`setIgnoreMouseEvents`), deixando cliques passarem
para o que estiver por baixo — só passa a capturar o mouse quando o cursor
está de fato em cima do gem (raycaster) ou sobre um balão de UI, alternando
isso a cada `mousemove` (ver `interactions.js`).

---

## Processo principal (`main.js` / `preload.js`)

**`main.js`** não tem framework nenhum por trás — é só Electron + `active-win`:

- **`displayFloorY(display)`** — calcula o "chão" de um monitor: o topo da
  taskbar quando ela está visível na borda de baixo, ou o próprio rodapé da
  tela quando a taskbar está oculta/auto-hide ou em outra borda.
- **`getWindowBounds()`** — a janela cobre a largura do desktop virtual
  inteiro (todos os monitores lado a lado), e verticalmente vai do chão mais
  alto até o mais baixo entre as telas — necessário para o pet não "sumir" ao
  viajar para um monitor com resolução/chão diferente.
- **`getScreenConfig()`** — geometria (`x`, `width`, `floorY`) de cada monitor,
  enviada ao renderer para calcular o chão sob qualquer ponto X (ver
  `wander.js` → `groundAtX`).
- **Polling de cursor** (`setInterval`, 50ms) — o pet "vê" o mouse na tela
  inteira, não só dentro da própria janela, para o relógio de tédio e a
  curiosidade funcionarem globalmente.
- **Polling de janela ativa** (`setInterval`, 1000ms via `active-win`) — só
  repassa o título ao renderer se o app ativo for o navegador configurado em
  `TARGET_BROWSER_NAME` (hoje hardcoded como `'brave'`); qualquer outro
  processo é ignorado antes mesmo de chegar no renderer.
- Reposiciona a janela automaticamente quando um monitor é conectado, removido
  ou reconfigurado (`screen.on('display-added'|'display-removed'|'display-metrics-changed')`).
- `ipcMain.on('set-ignore-mouse-events', ...)` — alterna o click-through e
  também o `focusable`, para liberar foco de teclado só no instante em que o
  cursor está sobre o gem (a janela é `focusable: false` por padrão, para
  nunca roubar foco do resto do sistema).
- `ipcMain.on('pet-log', ...)` — recebe o "diário" do pet (todo evento que ele
  vive) do renderer e imprime no terminal com horário — é como se acompanha a
  vida do bichinho rodando.

**`preload.js`** expõe um único objeto global, `window.petAPI`, via
`contextBridge` (contexto isolado, sem `nodeIntegration`):

| Método | Direção | Uso |
|---|---|---|
| `setIgnoreMouseEvents(ignore)` | renderer → main | liga/desliga o click-through |
| `onCursorMove(cb)` | main → renderer | posição global do cursor (curiosidade, tédio) |
| `onScreenConfig(cb)` | main → renderer | geometria dos monitores (chão por tela) |
| `onActiveSite(cb)` | main → renderer | título da janela do navegador-alvo (Ico_Eye) |
| `log(line)` | renderer → main | escreve uma linha no diário do terminal |

---

## Estado central (`behaviors/state.js`)

`createState(now, groundY)` devolve **um único objeto mutável** que todos os
sistemas de comportamento leem e escrevem — evita variáveis soltas espalhadas
pelos módulos e imports circulares entre eles. É criado uma vez em
`movement.js` e passado por referência para cada sistema.

Grupos de campos principais:

- **Posição/corpo**: `restX/restY` (poleiro atual), `anchor` (ponto que o
  hover persegue), `reloc` (viagem em andamento), `prevX/prevY`/`velXSm/velYSm`
  (velocidade suavizada, usada para inclinar o corpo).
- **Cursor global**: `cursor`, `cursorVel`, `flinchUntil`.
- **Assinatura da personalidade**: `signatureAnim`, `nextSignatureAt`.
- **Carinho**: `affection` (0 a 1.2), `pettingNow`, `petLean`, mais os campos
  de órbita/pulos do modo Excited (`orbitAngle`, `vibeStart`...).
- **Estacionar (park)**: `parked`, `parkHome`, `awaitingParkAnswer`.
- **Drag**: `dragging`, `dragOffsetX/Y`, `releaseFall` (queda ao soltar).
- **Rotação/escala**: `spin`, `pokeVel`, `unfold`, `tiltX/Z`, `lookYaw/Pitch`,
  `scaleCur`.
- **Energia**: `sleeping`, `power` (usado pelo shutdown para apagar luzes).
- **Tédio**: `lastInput`, `nextTickAt`, `tick`, `stretch`, `zenCycleDone`,
  `shutdownAt`, `shutdown`.
- **Tonta**: `clickTimes`, `dizzy`.
- **Personalidade ativa**: `personality` (o objeto do humor atual — `normality`
  / `zen` / `excited`), `mode` (string equivalente), `zen`, `excitedState`.
- **Saída envergonhada do Excited**: `pendingBurst`, `blushUntil`,
  `excitedCooldownUntil`, `shyRoundUntil`, `muchPettingMs`,
  `paletteHoldMaxUntil`, `rushArrived`.
- **Câmera/chão**: `halfWidth`, `viewTop`, `groundY`, `screenConfig`.

---

## Loop principal (`movement.js`)

`movement.js` é só "fiação": monta a cena (`initScene`), o estado
(`createState`), injeta dependências em cada sistema (`createSpeech`,
`createPersonalityState`, `setupSiteEye`, `createRegisterInput` /
`createBoredomClock`, `setupInteractions`, `createAffectionBar`,
`createEffects`, `createPrompt`) e conduz o relógio de cada frame.

A cada `requestAnimationFrame` (`animate()`):

1. Calcula `delta` (tempo desde o frame anterior, limitado a 0.1s) e
   `idleSec` (segundos desde o último input).
2. Se `state.shutdown` está ativo → só roda `updateShutdown()` (tem
   prioridade absoluta sobre tudo o mais).
3. Senão:
   - Se não está em `zen_aura` (não interrompível) → `updateBoredomClock()`.
   - `updateAlive()` — compõe toda a pose do frame (ver seção de
     interações abaixo).
4. Sempre: `updateVisuals()` (scene.js — luzes, cores, pulso do emissive) e
   `renderer.render(scene, camera)`.
5. Quando a aba/janela perde visibilidade (`document.hidden`), o loop pausa
   (`rafPaused`) e descarta o tempo parado ao voltar, para não gerar um salto
   gigante de `delta`.

O cursor global chega via `window.petAPI.onCursorMove`: além de guardar a
posição, calcula a velocidade suavizada do cursor (usada pelo susto/Flinch) e
chama `registerInput()` sempre que o mouse se move de verdade — o que zera o
relógio de tédio e, se o pet estava dormindo, o acorda com um susto.

---

## Cena 3D (`scene.js`)

Não há sprites nem texturas de imagem — o corpo do pet é **inteiramente
procedural**:

- **Câmera ortográfica** (não perspectiva): como a janela é larguíssima
  (cobre todos os monitores), uma câmera perspectiva distorceria o gem
  ("efeito ovo") ao se afastar do centro. Com projeção ortográfica ele
  mantém o mesmo tamanho aparente em qualquer ponto da tela.
- **Geometria**: um `IcosahedronGeometry` de raio `1.5` com `detail: 1` (80
  faces, 240 vértices), convertido para não-indexado (`.toNonIndexed()`) para
  cada face poder ter sua própria cor.
- **Face Mood**: cada uma das 80 faces recebe uma cor inicial aleatória da
  paleta e "deriva" continuamente em direção a um alvo aleatório dentro da
  mesma paleta, cada face no seu próprio ritmo (`faceSpeeds`) — sorteia um
  novo alvo sempre que chega perto o bastante do atual. Cria o efeito de
  cristal "vivo", sem nunca ficar estático.
- **Emissive Pulse**: o brilho geral do material pulsa devagar entre duas
  cores-âncora da paleta ativa.
- **`setPalette(hexes)`**: troca as 6 cores-base da paleta inteira (chamado
  pela máquina de personalidade ao trocar de humor) — a transição é sempre
  suave porque as faces perseguem a nova paleta por lerp, nunca "trocam" de
  uma vez.
- **`setTint(hexOrNull)`**: uma camada de cor por cima da paleta, usada pelo
  Ico_Eye (cor da categoria do site ativo) — se sobrepõe visualmente à
  paleta da personalidade sem substituí-la de fato.
- **`applyUnfold(disp)`**: desloca os 3 vértices de cada face ao longo da sua
  normal, proporcional a `disp` — é o efeito de "respirar"/abrir facetas
  usado por quase toda animação (respiração, susto, cutucão, espreguiçada,
  cafuné). Só reescreve o buffer da GPU quando o valor muda de verdade, por
  performance, e recalcula a bounding sphere para o raycast (clique) continuar
  precisso.
- Há também uma casca **wireframe lilás** ligeiramente maior que nunca
  desdobra — fica como "memória" da forma sólida original enquanto as facetas
  internas se abrem.
- Duas luzes pontuais (roxa e âmbar) orbitam o gem em sentidos opostos,
  sempre centradas nele (para a iluminação parecer constante em qualquer
  posição na tela); uma luz branca fixa por cima.
- `updateVisuals(t, delta, {power, sleeping})` roda todo frame: recoloca as
  luzes, ajusta a intensidade delas conforme `power` (usado pelo shutdown
  para "apagar" o pet), mistura o tint do Ico_Eye e avança o lerp de cor de
  cada face.

---

## Sistema de personalidades

`renderer/personalities/index.js` é o catálogo central:

```js
import { excited } from './excited.js';
import { zen } from './zen.js';
import { normality } from './normality.js';

export const PERSONALITIES = [normality, zen, excited];
```

Existem **exatamente 3 personalidades** (humores) — não são sorteadas por dia
nem escolhidas pelo usuário: são estados de uma máquina controlada por
`behaviors/personalityState.js`, descrita na próxima seção. Cada arquivo
exporta um objeto com o mesmo formato:

```js
{
  id, name,                 // identidade
  palette: [6 hex],          // as 6 cores do degradê de facetas (scene.js → setPalette)
  movement: {
    hoverMeanSec,             // tempo médio pairando antes de decidir ir pra outro lugar
    speed,                    // multiplicador da velocidade de viagem
    micro,                    // amplitude da micro-deriva enquanto paira
    approach,                 // 0..1 — quanto gravita na direção do cursor parado por perto
    spin,                     // multiplicador da rotação própria
    yRange,                   // 0..1 — quão alto costuma pairar (1 = faixa toda)
  },
  signature: {                // animação periódica exclusiva, ou null
    type, label, duration,
    apply(p) { return { z, y, scale, unfold, spinMul }; }, // p vai de 0 a 1 ao longo de `duration`
  },
  lines: { <gatilho>: [frases...] }, // banco de falas por gatilho, sorteado por speech.js
}
```

### Normality (base)

```js
palette: ['#7C3AED', '#4C1D95', '#D97706', '#92400E', '#6D28D9', '#B45309'] // roxo/âmbar
movement: { hoverMeanSec: 9, speed: 1.0, micro: 0.9, approach: 0.55, spin: 1.0, yRange: 0.85 }
signature: null // não tem animação exclusiva além das contínuas (respirar/inclinar)
```

Humor de repouso — sempre volta para cá depois de Zen ou Excited. Gatilhos de
fala: `poke`, `dizzy`, `fidget`, `sleep`, `wake`, `drag`, `site_spotify`,
`site_email`, `site_x`, `petting`, `flinch_parked`, `excited`, `calmdown`.

### Zen (Tranquila)

```js
palette: ['#38BDF8', '#0C4A6E', '#34D399', '#155E75', '#22D3EE', '#0EA5E9'] // azul/ciano/verde-água
movement: { hoverMeanSec: 12, speed: 0.7, micro: 0.7, approach: 0.35, spin: 0.75, yRange: 0.7 }
```

- **`signature` (`zen_breathing`)**: repetível a cada 4.6s enquanto o Zen
  estiver ativo — as facetas se afastam e voltam em 3 "respirações"
  completas, e o spin desacelera junto. Pode ser interrompida por movimento
  sem sair do modo Zen.
- **`zenAura`** (campo extra, só nesta personalidade): evento único e **não
  interrompível** de 6.5s — o pet levita mais alto, ganha um tint dourado, as
  facetas se abrem bastante e o spin quase para; ao terminar, sai do Zen e
  volta para Normality.

Gatilhos de fala extras: `zen_enter`, `zen_parked`, `zen_breathing`,
`zen_aura`, `zen_annoyed` (quando o carinho atrapalha a meditação).

### Excited (Animado/Ousado)

```js
palette: ['#F43F5E', '#9D174D', '#FB7185', '#7C3AED', '#E11D48', '#C026D3'] // rosa/vermelho/roxo
movement: { hoverMeanSec: 6, speed: 1.2, micro: 1.1, approach: 1.0, spin: 1.15, yRange: 1.0 }
```

- **`signature` ("Shimmy")**: requebra de charme de 1.6s — oscila em Z
  decaindo, dá um pulinho e abre as facetas — toca de tempos em tempos
  enquanto ele está na fase de perseguir o mouse.

Tem, de longe, o banco de falas mais rico: `need_you` (coraçõezinhos
enquanto persegue), `please_pet`/`please_pet_shy`/`please_pet_giveup`,
`let_me_out`/`trapped_giveup` (estacionado e preso), `rush_release`/
`rush_done`, `much_petting`, `knockout`, além dos gatilhos comuns
(`poke`, `dizzy`, `drag`, etc., todos com um tom mais safado/carente).

---

## Máquina de estados de personalidade (`personalityState.js`)

Normality é sempre a base. Zen e Excited são alcançados por **comportamento
do usuário**, nunca por sorteio ou horário, e sempre voltam para Normality no
fim da linha:

```
Normality ──(1 min parado, ver boredom.js)──▶ Zen (zen_breathing, imóvel)
  Zen ──(4 min contínuos respirando)──▶ zen_aura ──(termina, 6.5s)──▶ Normality
  Zen ──(carregado bem alto no colo e solto)──▶ Normality (quebrou a respiração)
  Zen ──(cafuné contínuo ~6s durante a respiração)──▶ transição (3.2s, treme e "explode")──▶ Excited

Normality ──(barra de carinho cheia + cafuné contínuo ~4s = "supercarga")──▶ Excited

Excited (estacionado / parked):
  trapped (implora ofegante pra sair) ──(liberado/unpark)──▶ rush (barra cheia, corre pro mouse)
    ──(chegou a <90px do mouse)──▶ solta as gotículas + blush ──▶ Normality
  trapped ──(14s sem ser liberado)──▶ se acaba ali mesmo ──▶ Normality

Excited (livre):
  need_you (persegue/orbita o mouse, 8–13s) ──▶ please_pet (implora carinho)
    please_pet ──(sem carinho por 5s)──▶ Normality (desistiu)
    please_pet ──(carinho acumulado 3s)──▶ shy (treme, respinga, blush) ──▶ Normality
      shy ──(carinho volta a rolar dentro de 15s)──▶ much_petting/shy2 (2x mais intenso)
        shy2 ──▶ Knockout: shutdown variante nocaute, dorme ~1min ──▶ Normality
```

Cada transição faz sempre a mesma "faxina": cancela qualquer viagem em
andamento (`cancelReloc`), zera `signatureAnim`, troca a paleta
(`setPalette`) e reagenda `nextSignatureAt` — para nenhum sistema antigo
brigar com o novo humor.

Detalhes que valem a pena destacar:

- **Supercarga** (`Normality → Excited`): com a barra de carinho cheia
  (`affection ≥ 1.0`) e o cafuné continuando, uma aura cresce no coraçãozinho
  da barrinha (`state.petCharge`, ~4s para encher, ~2s para esvaziar se
  parar) — ao encher de vez, entra no Excited. Fica bloqueada durante os
  cooldowns de vergonha (`excitedCooldownUntil`) e do nocaute
  (`KNOCKOUT_COOLDOWN_MS`, 2 minutos).
- **`updateNormalityCharge`** também cuida do **rubor**: se ele sai do
  Excited com o cafuné ainda rolando, a paleta rosa/vermelha do Excited se
  mantém por até 8s (`SHY_PALETTE_HOLD_MAX_MS`) em vez de voltar de imediato
  ao roxo/âmbar — só derrete de volta quando o carinho parar de verdade.
- **`much_petting`**: se, depois de já ter saído envergonhado (`shy`), o
  carinho volta a rolar dentro de uma janela de 15s, ele reincide direto numa
  sobrecarga muito mais intensa (`shy2`) — sem passar de novo pelo Excited
  "normal" — e termina apagando (`startKnockout`): a paleta volta ao normal
  sem rubor (dormindo escuro), e o `shutdown.js` assume com a variante
  `knockout` (desliga quase na hora, dorme ~1min, religa assustado).
- **Estacionado (`parked`)** muda o comportamento de todas as transições:
  entrar no Zen estacionado é tranquilo (ele nem reclama — "perfeito pro
  autocontrole"); já entrar no Excited estacionado o prende na fase `trapped`
  (implora para sair em vez de perseguir o mouse).
- O gatilho manual da tecla `Z` para entrar no Zen foi removido do código, e o
  timer automático de "muito tempo sem interação → Zen" ainda não está ligado
  — atualmente `enterZen` fica exportado esperando o gatilho definitivo (não
  é chamado por nenhum caminho ativo nesta branch além do relógio de tédio,
  ver `boredom.js`).

---

## Sistema de interações e comportamentos

### Movimento — pairar e viajar (`wander.js`)

A maior parte do tempo o pet **paira** (hover) em torno de um ponto-âncora,
com uma micro-deriva contínua gerada por **ruído Simplex** (nunca `Math.sin`
puro — evita qualquer sensação de metrônomo). De tempos em tempos ele
**decide** ir para outro lugar:

- `scheduleNextRelocate` agenda a próxima decisão com um **intervalo
  exponencial** (processo de Poisson) em torno da média `hoverMeanSec` da
  personalidade ativa — o resultado é um ritmo irregular de verdade, sem
  cadência perceptível.
- `pickWanderTarget` sorteia um ponto aleatório na "pista", ou — com chance
  maior quanto maior for `approach` da personalidade (e sempre no Excited) —
  decide ir "fazer companhia" pousando perto de onde o cursor está.
- `startRelocate` inicia a viagem com duração proporcional à distância (via
  ease-in-out, `smooth()`), podendo ser acelerada (`speedMul`) em fugas de
  susto.
- `groundAtX(state, x)` calcula o **chão por monitor**: em setups com vários
  monitores, cada tela pode ter um rodapé/taskbar num Y diferente. Perto da
  divisa entre dois monitores, o chão vira uma **rampa** (mistura suave dos
  dois lados, `GROUND_BLEND_PX = 160px`) em vez de um degrau — sem isso a
  micro-deriva cruzando a fronteira geraria um "soco" vertical no pet.
- `updateReleaseFall` — ao soltar o pet do colo, ele cai com gravidade
  simulada e dá 1 quique antes de assentar e voltar a flutuar.

### Interações de mouse (`interactions.js`)

A janela cobre a tela inteira, então o pet só recebe eventos quando o cursor
está de fato sobre ele (`isPointerOverPet`, via `THREE.Raycaster`) — fora
disso o clique atravessa (click-through).

| Interação | Como funciona |
|---|---|
| **Cutucão (poke)** | Clique simples sem arrastar: dá um giro de peão (`pokeVel`) que decai sozinho e abre as facetas por um instante. |
| **Tontura (dizzy)** | 3 ou mais cliques em 2.5s: cambaleia em Z por 2.6s, com a amplitude decaindo. |
| **Drag (colo)** | Segurar (botão esquerdo) e mover: sai do modo pairar, segue o cursor 1:1 (com clamp nas bordas da tela e no chão), encolhe levemente (escala 0.92) enquanto seguro. |
| **Soltar (drop)** | Ao soltar o botão, cai com gravidade e 1 quique — a menos que a pergunta de estacionar esteja aberta, caso em que fica pairando no ar esperando resposta. |
| **Cafuné (petting)** | Não basta passar o mouse por cima: precisa **esfregar de verdade** — o sistema conta inversões de direção do cursor (`PET_FLIPS_NEEDED = 2` dentro de 1s) para engatar; depois de engatado, qualquer movimento sobre ele mantém, e 400ms parado encerra. Enche `state.affection` (até 1.2), o faz girar mais devagar e "encostar" no cursor (`petLean`). |
| **Susto (flinch)** | Cursor "voando" (>1300px/s) na direção dele fora de um cafuné em andamento e fora do Excited: esquiva rápida para o lado oposto + arrepio, com cooldown de 5s. |
| **Aproximação (approach)** | Cursor parado/lento bem perto: o poleiro gravita na direção dele, proporcional ao `approach` da personalidade. |
| **Estacionar (park)** | Segurando ele no colo, um clique do **botão direito** abre um balão de pergunta clicável ("Quer que eu fique paradinho aqui?"). Aceitando, ele para de viajar e de perseguir (mesmo no Excited — vira `trapped`), só mantendo as animações de corpo. |
| **Liberar (unpark)** | Clicar nele estacionado pergunta "Posso voltar a passear?" em vez de contar como cutucão; no Excited a súplica é bem mais veemente ("ME SOLTA! Por favor—"). |
| **Menu de contexto** | Suprimido enquanto arrastando ou sobre o pet (o botão direito é reservado para o gatilho de estacionar). |

### Relógio de tédio (`boredom.js`)

Conta segundos desde o último input real do usuário (`state.lastInput`) e
dispara, em ordem crescente de tempo parado:

| Marco | Tempo | O que acontece |
|---|---|---|
| **Tique (fidget)** | a partir de 14s, repetindo a cada 4–9s | pulinho ou giro seco, sorteado |
| **Espreguiçada (stretch)** | 32s, uma vez por ciclo | facetas abrem + escala 5% maior, com envelope sobe-segura-desce de 4.2s |
| **Zen** | 60s, uma vez por ciclo | entra no modo Zen (respiração) |
| **Sono (sleep)** | 65s (só depois do ciclo de Zen já ter acontecido) | pousa no chão, quase para de girar, "z z z" flutuando ao lado |
| **Shutdown** | sorteado entre 30–50s parado | desliga, cai, quica, religa assustado — tem prioridade sobre tudo enquanto ativo |

Todo esse relógio só roda no modo **Normality** — no Excited ele está
"elétrico" (nunca entediado) e no Zen a meditação já tem seus próprios
temporizadores (rodar os dois ao mesmo tempo faria dois sistemas de pose
brigarem). Também é suprimido durante drag, queda ou com a pergunta de
estacionar aberta.

Qualquer input de verdade (`registerInput`) zera tudo: se ele estava
dormindo, acorda com um susto visível (facetas abrem, giro rápido) e
reancora onde estiver, sem "voar" de volta ao poleiro antigo.

### Shutdown (`shutdown.js`)

Evento com **prioridade absoluta**: enquanto ativo, nada mais do `updateAlive`
roda. Sequência: desliga (luzes caem, cor escurece, facetas fecham) → cai com
gravidade e até 2 quiques → religa assustado (facetas saltam para 1.0 e
voltam, olhar trêmulo) → flutua de volta ao normal. Duração total ~12.5s.

Tem uma variante, **knockout** (disparada pelo `much_petting`, ver seção
anterior): desliga quase instantaneamente (0.5s, "exausto de carinho") e fica
dormindo apagado com "z z z" por ~60s antes de religar — sem o rubor nem a
queda dramática do shutdown comum.

---

## Interface flutuante (balões, barra, efeitos)

Toda a UI acima do gem é DOM/CSS puro, criada dinamicamente por cada módulo
(cada um injeta seu próprio `<style>` e elementos) e reposicionada a cada
frame por `liveAnimation.js`, seguindo a posição em pixels do gem na tela.

- **`speech.js`** — balão de fala. `speak(gatilho, force?)` sorteia uma linha
  do banco (`lines`) da personalidade **atualmente ativa** para aquele
  gatilho, respeitando um cooldown mínimo entre falas (6s normal, 1.5s
  quando `force: true` — usado em cadeias de eventos como vergonha → respingo
  → rubor, para uma fala não atropelar a outra). Fica visível por 3.5s.
- **`prompt.js`** — balão de **pergunta clicável**, diferente do balão de
  fala porque recebe clique de verdade (o `interactions.js` desliga o
  click-through quando o cursor está sobre ele). Usado por estacionar/liberar.
  Murcha sozinho em 8s sem resposta, com um callback de timeout opcional para
  quem precisa desfazer um estado pendente.
- **`effects.js`** — `burstLiquid(x, y, intensity)` espalha gotículas
  brancas em arco (saída envergonhada do Excited; `much_petting` dobra a
  intensidade), e `updateBlush(visible, x, y)` liga/desliga o "///" de
  vergonha grudado na bochecha do gem.
- **`affectionBar.js`** — barrinha de carinho flutuando acima do gem,
  visível enquanto há `affection` acumulada ou cafuné rolando. Fica dourada e
  pulsa ao "transbordar" (`affection > 1.0`). O coraçãozinho ao lado ganha uma
  aura crescente (`--charge`, CSS custom property) conforme `state.petCharge`
  sobe rumo à supercarga.
- **`#zzz`** (fixo em `index.html`) — três "z" flutuando com animação
  escalonada, visível dormindo e durante o knockout.

---

## Ico_Eye — reação ao navegador ativo

`siteEye.js` recebe (via `window.petAPI.onActiveSite`) o título da janela do
navegador-alvo sempre que ele muda, repassado pelo `main.js` (que já filtrou
para só deixar passar títulos do processo configurado em
`TARGET_BROWSER_NAME`). Categoriza o título por regex:

```js
const SITE_CATEGORIES = [
  { id: 'spotify', match: /spotify/i,          color: '#1DB954', icon: '🎵' },
  { id: 'email',   match: /gmail|outlook|inbox/i, color: '#4285F4', icon: '✉️' },
  { id: 'x',       match: /\/\s*x\s*$|twitter/i,  color: '#71767B', icon: '✕' },
];
```

Quando a categoria muda, aplica um **tint** de cor na cena (`setTint`, por
cima da paleta da personalidade), mostra um ícone flutuando acima do gem e
dispara uma fala (`site_spotify` / `site_email` / `site_x`) — mas só na
**troca** de categoria, não a cada mudança de título dentro da mesma (senão
falaria toda hora que a música mudasse no Spotify, por exemplo).

---

## Utilitários (`mathUtils.js`, `noise.js`)

- **`mathUtils.js`**: `clamp`, `smooth` (easing suave 0→1), `pulse` (envelope
  0→1→0 ao longo de `p ∈ [0,1]`, usado em quase toda animação pontual),
  `stretchEnv` (envelope sobe-segura-desce da espreguiçada) e `damp`
  (reexport de `THREE.MathUtils.damp`, usado para toda suavização
  frame-a-frame independente de FPS).
- **`noise.js`**: implementação compacta de **Simplex noise 2D** (algoritmo
  clássico de Stefan Gustavson), sem nenhuma dependência externa. Cada
  `createNoise2D(seed)` gera uma função de ruído determinística e contínua,
  usada em todo movimento "orgânico" do pet (micro-deriva ao pairar, ritmo da
  respiração, variação de spin/tilt) — o objetivo é nunca ter frequência fixa
  perceptível, o que denunciaria um loop de animação.

---

## Canais de IPC (main ↔ renderer)

| Canal | Direção | Payload | Consumido em |
|---|---|---|---|
| `cursor-pos` | main → renderer | `{x, y}` (coordenadas de tela) | `movement.js` (cursor global) |
| `screen-config` | main → renderer | `{displays: [{x, width, floorY}]}` | `wander.js` (`groundAtX`) |
| `active-site` | main → renderer | `{title}` ou `{title: null}` | `siteEye.js` |
| `set-ignore-mouse-events` | renderer → main | `boolean` | `main.js` (click-through) |
| `pet-log` | renderer → main | `string` | `main.js` (imprime no terminal) |

---

## Arquivos legados (`.tsx`)

`IcosaGem.tsx`, `Icosaendro3D.tsx` e `IdleEvents.tsx`, na raiz do projeto, são
componentes **React/Next.js** (`"use client"`, `@react-three/fiber`,
`@react-three/drei`, `framer-motion`) copiados de um portfólio pessoal
anterior do autor — foi de lá que veio a inspiração visual do icosaedro (a
mesma paleta roxo/âmbar, o mesmo sistema de vida idle). **Não fazem parte do
app Electron em execução** — o app usa Three.js puro, sem React nenhum. Ficam
aqui só como referência histórica/ponto de partida do design:

- **`Icosaendro3D.tsx`** — versão standalone do gem (card/mini/full-size, com
  `OrbitControls`).
- **`IcosaGem.tsx`** — versão "hero" original, com o sistema de vida idle
  completo (cutucar, tédio, espreguiçada, dormir). Ainda espera receber
  `phase`/`sectionIndex` de fora, herdados do layout de seções do portfólio
  original.
- **`IdleEvents.tsx`** — os eventos especiais isolados: `StarRain` (chuva de
  estrelas), `ShutdownScene` (desligar/religar) e `LoveHearts`. Importado por
  `IcosaGem.tsx`.

---

## Arquivo `.bak` órfão

`renderer/personalities/normality.js.bak` é um arquivo **não rastreado pelo
git** (`git status` mostra como untracked) que sobrou no disco — é um backup
automático gerado por uma ferramenta de edição de personalidades que existe
na branch `master` (um editor de "Cérebro e Falas" na janela de
Configurações, que grava backups `.bak` antes de reescrever os arquivos de
personalidade). Ele contém uma versão mais rica do `normality.js` (com
gatilhos de flerte e avisos de sistema que só existem em `master`). Pode ser
apagado com segurança — não é lido por nenhum código desta branch.
