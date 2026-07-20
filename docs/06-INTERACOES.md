# 06 – Interações e tédio (`interactions.js` + `boredom.js`)

Estes dois são os "sentidos" do pet: o `interactions.js` capta o que você faz com o
mouse (cutucar, arrastar, cafuné, estacionar, abrir chat), e o `boredom.js` mede o
oposto — quanto tempo você ficou **sem** fazer nada — e decide quando ele fica
entediado, medita, dorme ou desliga.

---

## `interactions.js` — o mouse

### O problema do "click-through"

A janela do pet cobre a tela toda (transparente). Se ela capturasse todos os cliques,
você não conseguiria clicar em NADA no desktop. A solução: por padrão a janela deixa
o clique **passar** (`setIgnoreMouseEvents(true)`), e só captura quando o cursor está
**de fato em cima do pet** (ou de um balão/painel). Esse liga-desliga é o `mousemove`
mais importante do arquivo.

### Detectar que o cursor está no pet: `isPointerOverPet` — linhas ~24–29

Usa um **raycaster** do Three.js: dispara um raio da câmera pela posição do mouse e vê
se acerta o `mesh`. É "clique 3D de verdade" — respeita a forma atual do corpo (por
isso o `computeBoundingSphere` no `applyUnfold` importa: mantém o alvo do clique certo
quando o corpo cresce com espinhos).

### Cafuné — linhas ~118–148 (a parte mais interessante)

Cafuné exige **esfregar de verdade**, não só passar por cima. O código conta
**inversões de direção** (vai-e-vem) dentro de uma janela de 1s:
- `PET_FLIPS_NEEDED = 2` inversões pra engatar.
- Uma vez engatado, qualquer movimento sobre ele mantém; parar 400ms encerra (isso é
  checado em `liveAnimation.js`).
- Cada movimento soma em `state.affection` (o medidor), até 1.2.

> **Onde mexer:** quer cafuné mais fácil de engatar? Baixe `PET_FLIPS_NEEDED` pra 1.
> Quer o medidor encher mais rápido? O `0.0004` no `state.affection += strokes * 0.0004`.

### Arrastar (drag) — linhas ~42–115, 183–201

- **mousedown** (botão esquerdo, em cima dele) → `state.dragging = true`, guarda o
  offset entre o cursor e o centro do gem.
- **mousemove** enquanto arrasta → escreve `gem.position` direto, limitado às bordas e
  ao chão. Também mede `dragDistance` (pra distinguir um arraste real de um clique).
- **mouseup** → vira `releaseFall` (cai e quica), a não ser que a pergunta de
  estacionar esteja aberta (aí ele fica pairando esperando a resposta).

### Estacionar (parked) — linhas ~42–74, 217–244

Um recurso próprio: segurar ele no colo (drag) e clicar o **botão direito** abre a
pergunta "quer que eu fique paradinho aqui?". Se você confirma, ele vira `parked`:
não passeia mais, fica no `parkHome` (o poleiro prometido), e volta pra lá se um susto
o tirar do lugar. Clicar nele parado abre a pergunta de **liberar**.

### Cutucão, tonta e duplo-clique — linhas ~203–274

- **duplo-clique** → abre/fecha o chat (`chat.toggle()`).
- **clique simples** em cima dele → **cutucão** (giro de peão + facetas abrem), mas
  **adiado ~260ms**: se um duplo-clique chegar nesse meio tempo, o cutucão é cancelado
  (senão ele girava E abria o chat ao mesmo tempo).
- **3+ cliques em 2.5s** → **tonta** na hora.
- No Zen, cliques são ignorados (não quebram a meditação).

> Note o padrão: quase toda ação começa com `registerInput(state, now)` — isso **zera
> o relógio de tédio**. É como o pet "sabe" que você está por perto.

---

## `boredom.js` — o relógio de ócio

Mede `idleSec` = segundos desde o último input. Conforme sobe, dispara eventos.

### As marcas de tempo — linhas ~6–10

```js
const REST_AT = 14;      // começa a dar tiques de impaciência
const STRETCH_AT = 32;   // espreguiçada (uma vez por ciclo)
const ZEN_AT = 60;       // 1min parado → entra no Zen (uma vez por ciclo)
const SLEEP_AT = 65;     // dorme (só depois que o ciclo de Zen já rolou)
const SHUTDOWN_MIN = 30; // evento shutdown: sorteado entre 30 e 50s
```

> **Onde mexer:** estes cinco números controlam TODO o ritmo de ócio do pet. Quer que
> ele demore mais pra dormir? Aumente `SLEEP_AT`. Quer testar o Zen rápido? Baixe
> `ZEN_AT` (mas lembre: `SLEEP_AT` tem que ser maior).

### `resetBoredom` — linhas ~12–18

Zera o relógio: `lastInput = now`, re-sorteia quando o próximo shutdown aconteceria,
limpa os "já fiz isso neste ciclo".

### `createRegisterInput` — linhas ~22–46

A função `registerInput` que todo mundo chama quando há input. Além de zerar o relógio,
ela **acorda o pet com susto** se ele estava dormindo (`wakeJolt`, giro, fala 'wake') e
**rearma o ciclo de Zen** (`zenCycleDone = false`) — assim um input novo faz o próximo
ócio longo levar ao Zen de novo.

### `createBoredomClock` — linhas ~50–103

A função avaliada por frame. Ela é cheia de **guardas de "não agora"** logo no começo
(linhas ~52–70), e vale entender por quê:
- Só age no **Normality** (no Excited ele está elétrico, no Zen tem os próprios timers).
- Não age no colo, caindo, com pergunta/chat aberto (segurar parado não é tédio).
- Não age no meio de um tique/espreguiçada/tonta/viagem (espera terminar — cortar dava
  "pop" de pose).

Passadas as guardas, na ordem: Zen (1min) → sono (65s) → shutdown (30–50s) →
espreguiçada (32s) → tique (14s). Cada um dispara uma vez e marca seu "já fiz".

---

## `shutdown.js` (bônus, mora junto do tédio)

O **evento shutdown** é o pet "puxando a alavanca": desliga (luzes apagam, facetas
fecham), **cai como bolinha e quica**, e depois de uns segundos **religa assustado**.
Tem prioridade sobre tudo enquanto dura (o loop principal só chama `updateShutdown` e
nada mais).

Tem duas variantes:
- **Espontânea** — pelo tédio (30–50s). NÃO conta como input do usuário, então o
  relógio de tédio continua correndo depois.
- **Nocaute (`knockout: true`)** — apagou de tanto carinho (fim do much_petting).
  Apaga quase na hora e fica dormindo com "z z z" por ~1min. Conta como interação:
  acorda descansado, ciclo novo.

Como o `updateAlive` não roda durante o shutdown, este arquivo **também cuida da UI**
(balão, ícone, barrinha seguem o gem enquanto ele despenca).

Próximo: [07 – Fala e interface](07-FALA-E-UI.md).
</content>
