# 05 – Personalidades (`personalityState.js` + `personalities/*`)

O pet tem três humores: **Normality** (base), **Zen** (tranquilo) e **Excited**
(animado/ousado). Eles NÃO são sorteados por dia — são uma **máquina de estados**:
sempre começa e volta pro Normality, e os outros são alcançados por comportamento seu.

Duas metades:
- **`personalities/*.js`** — o "conteúdo" de cada humor (cores, falas, movimento,
  animação de assinatura). São dados, quase sem lógica.
- **`personalityState.js`** — a **máquina**: quando entra/sai de cada humor, e as
  poses especiais de transição.

---

## O que é uma personalidade (`personalities/normality.js` etc.)

Cada arquivo exporta um objeto com:

```js
export const zen = {
  id: 'zen',
  name: 'Zen',
  palette: ['#38BDF8', '#0C4A6E', ...],  // as 6 cores do corpo (setPalette)
  movement: { hoverMeanSec, speed, micro, approach, spin, yRange },
  signature: { type, label, duration, apply(p) => {z,y,scale,unfold,spinMul} },
  lines: { poke: [...], petting: [...], site_nsfw: [...], flirt1: [...], ... },
};
```

- **`palette`** — as 6 cores-base. Trocar o humor troca a paleta inteira (suave).
- **`movement`** — modula o motor de movimento. Cada campo:
  - `hoverMeanSec` — tempo médio pairando antes de decidir viajar.
  - `speed` — multiplicador da velocidade de viagem.
  - `micro` — amplitude da micro-deriva ao pairar.
  - `approach` — 0..1: quanto ele gravita pro cursor parado por perto.
  - `spin` — multiplicador do giro.
  - `yRange` — 0..1: quão alto costuma pairar.
- **`signature`** — a animação periódica exclusiva do humor (ou `null`). O `apply(p)`
  recebe `p` de 0 a 1 ao longo de `duration` segundos e devolve deslocamentos de pose.
  Normality **não tem** (`signature: null`); Zen tem a respiração; Excited tem a shimmy.
- **`lines`** — os bancos de fala **por gatilho**. O `speak('poke')` sorteia uma linha
  de `lines.poke` do humor ATIVO. Isso dá voz própria a cada humor. Se um gatilho não
  existe no banco do humor, a fala simplesmente não sai (exceto os `_parked`, que caem
  na versão base — ver [07](07-FALA-E-UI.md)).

> **Onde mexer:** trocar as cores de um humor = editar `palette`. Mudar o jeito de se
> mover = os números de `movement`. Adicionar/editar falas = os arrays em `lines`.
> Tudo isso é dado puro, seguro de mexer.

O catálogo `personalities/index.js` só junta os três num array (`PERSONALITIES`).

---

## A máquina de estados (`personalityState.js`)

O diagrama completo está no comentário do topo do arquivo. Resumido:

```
Normality ──(1min de ócio)──▶ Zen (respiração imóvel)
  Zen ──(4min respirando)──────▶ zen_aura ──(termina)──▶ Normality
  Zen ──(carregado bem alto e solto)──▶ Normality
  Zen ──(~6s de cafuné contínuo)──▶ transição ──▶ Excited

Normality ──(barra de carinho cheia + cafuné continua ~4s)──▶ Excited (supercarga)
Normality ──(site adulto aberto ~35s)──▶ Excited (arousal, "culpa do navegador")

Excited (livre): needYou (segue o mouse) ──▶ pleasePet (implora carinho)
  pleasePet ──(carinho DEMAIS)──▶ shy (respinga, blush) ──▶ Normality
    shy ──(carinho continua)──▶ shy2/much_petting (2x intenso) ──▶ NOCAUTE (dorme ~1min)
  pleasePet ──(sem carinho)──▶ Normality
Excited (estacionado): trapped (implora ofegante pra sair)
  trapped ──(liberado)──▶ rush (corre pro mouse) ──▶ alívio ──▶ afterglow ──▶ Normality
  trapped ──(14s preso)──▶ se acaba ali ──▶ Normality
```

### Como está organizado o código

- No topo, um monte de **constantes de tempo** (linhas ~24–81) — TODOS os "quanto
  tempo" da máquina. É o primeiro lugar pra mexer se quiser tornar algo mais rápido/
  lento pra testar. Exemplos:
  - `ZEN_BREATHING_ESCALATE_MS` (4min pra virar aura),
  - `ZEN_EXCITED_PET_MS` (6s de cafuné no zen pra virar Excited — reduzido pra teste),
  - `PET_CHARGE_FILL_SEC` (4s de cafuné cheio pra supercarga),
  - `NSFW_CHARGE_FILL_SEC` (35s de exposição),
  - `PLEASE_PET_EXCESS_MS` (3s de carinho no pleasePet vira vergonha).

- `createPersonalityState({...})` devolve `{ enterZen, update }`.
  - **`enterZen`** é chamado pelo relógio de tédio (`boredom.js`) após 1min de ócio.
  - **`update(now, delta)`** é chamado todo frame por `liveAnimation.js` ANTES do resto
    da animação. Ele retorna uma **pose** `{z,y,scale,unfold,spinMul}` (que tem
    prioridade sobre a assinatura normal) ou `null` (segue a animação normal).

- As funções `enterX`/`exitX` (enterZen, enterExcited, startShyExit, startKnockout...)
  fazem a **transição**: trocam `state.mode` + `state.personality`, chamam `setPalette`,
  limpam animações em curso e falam a linha certa.

- `updateZen`, `updateExcited`, `updateNormalityCharge` são as máquinas de cada humor,
  avaliadas por frame.

### Padrões que se repetem (e por que existem)

Toda transição faz um "kit de limpeza" parecido:
- `cancelReloc()` — mata uma viagem em curso (senão ela brigaria com a nova pose).
- `state.signatureAnim = null` — cancela a assinatura em curso.
- `setPalette(...)` — troca a cor.
- re-agenda `nextSignatureAt` quando necessário (pra a assinatura não disparar no mesmo
  frame da entrada, por cima da explosão).

Isso é o cerne de "não deixar dois sistemas de pose brigando". Se você adicionar um
novo humor ou transição, siga o mesmo kit.

### O rubor (detalhe charmoso)

Ao sair do Excited **com o cafuné ainda rolando**, a cor vermelha do Excited não volta
seca pro roxo — ela **segura por alguns segundos** (`paletteHoldMaxUntil`) e derrete de
volta quando o carinho para ou no teto. É o "rubor" pós-vergonha. Está em
`exitExcitedToNormality` + `updateNormalityCharge`.

---

## Como a forma do corpo entra nisso

A mudança de forma (orbe liso + anéis no Zen, espinhos latejando + faíscas no Excited,
com a transição animada entre elas) NÃO está aqui — ela é dirigida pelo `movement.js`,
que chama `setShapeMode(state.mode)` todo frame. A `personalityState` só troca o
`state.mode`; a `scene.js` faz o resto. Ver [02](02-CENA-3D.md).

Isso é bom saber: **a forma segue o `mode` automaticamente**. Se você criar um humor
novo, decida no `setShapeMode` (em `scene.js`) qual forma ele usa.

Próximo: [06 – Interações e tédio](06-INTERACOES.md).
</content>
