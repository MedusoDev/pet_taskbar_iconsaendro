# 02 – A cena 3D (`scene.js`)

Este arquivo constrói o **corpo** do pet e tudo que é visual "de baixo nível": a
geometria do icosaedro, as cores das faces, as luzes, a câmera, o "desdobrar" das
facetas e a mudança de forma por humor. Ele NÃO decide comportamento — só oferece
funções que o resto do código chama.

`initScene(canvas)` roda uma vez no boot e devolve um objeto com tudo que o loop
precisa:

```js
return { scene, camera, renderer, gem, mesh, material,
         applyUnfold, updateVisuals, setTint, setPalette, setShapeMode };
```

---

## Conceitos de Three.js (mínimo pra se virar)

- **scene** — o "mundo" que contém tudo.
- **camera** — o ponto de vista. Aqui é **ortográfica** (ver abaixo).
- **renderer** — desenha a cena na `<canvas>`.
- **geometry** — a malha de vértices/triângulos de um objeto.
- **material** — como a superfície reage à luz (cor, brilho, metal...).
- **mesh** — geometry + material = um objeto desenhável.
- **group** — um saco que agrupa objetos e pode ser movido/escalado junto.

No nosso caso: `gem` é um **Group** que contém o `mesh` (o icosaedro colorido) e as
`edges` (a casca de arame). Mover/escalar o `gem` move o pet inteiro; girar o `mesh`
gira só o sólido por dentro.

---

## A câmera é ortográfica (e por quê) — linhas ~30–41

Uma câmera **perspectiva** (a comum) faz coisas longe do centro parecerem esticadas.
Como a janela é larguíssima (a tela toda), o pet ficava com "distorção de ovo" ao andar
pras beiradas. A câmera **ortográfica** não tem perspectiva: o pet fica idêntico em
qualquer ponto horizontal. A rotação 3D continua real; só a projeção é "chapada".

`WORLD_HALF_PER_PX = 0.024` fixa a proporção unidades-de-mundo por pixel. Como a altura
da janela varia com o setup de monitores, a meia-altura da câmera é derivada da altura
real da janela — assim o gem mantém **o mesmo tamanho em pixels** independente da tela.
`GEM_RADIUS = 1.5` é o raio do corpo em unidades de mundo.

---

## O corpo: 80 faces com cor própria — linhas ~62–90

```js
const base = new THREE.IcosahedronGeometry(GEM_RADIUS, 1); // detail=1
const gemGeo = base.toNonIndexed();
```

- `IcosahedronGeometry(raio, 1)` — um icosaedro (20 lados) com **detail=1**, que
  subdivide cada lado em 4 triângulos → **80 faces / 240 vértices**.
- `.toNonIndexed()` — "desamarra" os vértices: cada face passa a ter seus 3 vértices
  próprios (não compartilhados). Isso é essencial pra dar **cor própria por face** e
  pra empurrar cada face separada no unfold.

Depois, um loop dá a cada face uma cor sorteada da paleta e uma "velocidade" própria
de transição. Cada face fica trocando de cor devagar, no seu ritmo — é o efeito de
degradê vivo.

> **`faceColors`, `faceTargetIdx`, `faceSpeeds`** guardam, por face: a cor atual, o
> índice da cor-alvo na paleta, e a velocidade de transição.

---

## Desdobrar as facetas: `applyUnfold(disp)` — linhas ~180–235

Esta é a função mais chamada do arquivo (uma vez por frame). Ela **empurra os 3
vértices de cada face pra fora, ao longo da normal da face**, na quantidade `disp`
(de 0 a ~1). `disp=0` = sólido fechado; `disp` alto = facetas "explodidas".

Isso é usado o tempo todo:
- respiração (facetas pulsando levemente),
- espreguiçada, cutucão, susto (abrem mais),
- a assinatura do Zen e do Excited.

Pré-calculado no init (linhas ~93–109): `basePos` (as posições originais dos 240
vértices), `faceNormals` (a normal de cada face) e `faceVariance` (uma amplitude
aleatória por face, pra não abrirem todas igual).

> **Por que empurrar ao longo da normal preserva a iluminação:** deslizar uma face
> reta ao longo da sua própria normal não muda a orientação dela — então a normal
> continua válida e o sombreamento não precisa ser recalculado. (Isso muda com a
> mudança de forma; ver abaixo.)

---

## Mudança de forma por humor: o morph — linhas ~111–160 e dentro do `applyUnfold`

Esta é a parte que faz o corpo **tensionar e relaxar** conforme o humor (foi a
adição mais recente). A ideia central:

> O corpo é SEMPRE o icosaedro (a identidade do pet), mas deforma:
> **Zen** arredonda em direção a uma esfera; **Excited** se eriça (espinhos).

Como funciona, em 4 peças:

1. **Dois "deltas" por vértice**, pré-calculados no init a partir dos MESMOS 240
   vértices:
   - `dSphere[i]` = (posição na esfera − posição no ico). A versão esfera é cada
     vértice puxado pro raio.
   - `dSpiky[i]` = empurrão pra fora ao longo da normal, com amplitude irregular
     (~60% das faces viram espinho, o resto fica quase parado).

2. **Um escalar contínuo `shapeCur`** que vai de **−1 a +1**:
   - `−1` = esfera (zen)
   - `0` = icosaedro puro (normality)
   - `+1` = espinhos (excited)

   Como qualquer transição **passa por 0**, ir de um humor pro outro cruza o
   icosaedro no meio e nunca dá um "pop" (salto visual).

3. **`setShapeMode(mode)`** (chamado todo frame pelo `movement.js`) só ajusta o
   `shapeTarget` (−1/0/+1) conforme o humor. É idempotente.

4. Dentro do `applyUnfold`, a cada frame:
   - `shapeCur` persegue `shapeTarget` suavemente (usando o relógio real, já que a
     função não recebe `delta`).
   - Monta a base morfada: `morphedBase = basePos + (shapeCur<0 ? dSphere*|shapeCur| : dSpiky*shapeCur)`.
   - Aí sim aplica o unfold em cima dessa base.
   - **Recalcula as normais** (`computeVertexNormals`) SÓ enquanto a forma está
     mudando — porque aí a orientação das faces muda de verdade e a luz precisa
     acompanhar. Parado, custo zero.

> **Onde mexer:** quer a esfera mais "bola"? Aumente o `0.9` no cálculo do `dSphere`.
> Quer espinhos maiores ou mais numerosos? Mexa no `0.6` (fração de faces que
> espetam) e no `(0.35 + ...*0.65)` (amplitude) dentro do loop do `dSpiky`. Quer que
> a transição seja mais rápida/lenta? O `2.6` no `Math.exp(-2.6 * dt)`.

---

## Cores dinâmicas: `setPalette` e `setTint` — linhas ~120–130

Existem **duas camadas de cor**:

- **`setPalette(hexes)`** — troca as 6 cores-base do degradê (a `COLORS`). É o que a
  **personalidade** usa: Normality (roxo/âmbar), Zen (azuis), Excited (vermelho/rosa).
  A troca é suave sozinha, porque cada face persegue a cor nova por `damp` no
  `updateVisuals`.
- **`setTint(hexOrNull)`** — uma cor por CIMA da paleta, com prioridade. É o que o
  **Ico_Eye** usa (a cor do site ativo). Some quando o site sai.

Regra de precedência quando os dois brigam: durante a `zen_aura` e a transição
zen→excited, a aura é "dona" do tint (dourado/vermelho), e o tint do site fica em
espera até a saída (ver `personalityState.js` / `movement.js`).

---

## As luzes e o `updateVisuals` — linhas ~200–265

Duas luzes pontuais (roxa e âmbar) orbitam em torno do gem em sentidos opostos — a
órbita é **centrada no gem** pra iluminação ficar constante pela tela toda. Mais uma
luz branca fraca de frente e uma ambiente.

`updateVisuals(t, delta, state)` roda todo frame DEPOIS da animação e cuida de:

- posicionar as luzes (órbita),
- o `state.power` (energia) — no shutdown as luzes e as cores escurecem quase a zero,
- misturar o tint do site por cima,
- pulsar o **emissive** (o "brilho interno") entre duas cores da paleta,
- avançar a transição de cor de cada face (o `damp` por face).

> **Onde mexer:** intensidade do brilho interno = `emissiveIntensity` (base 0.55).
> Cor/força das luzes orbitais = os valores em `purpleLight`/`amberLight`. O glow
> EXTERNO (a "aura" ao redor) não é aqui — é CSS no `index.html` (`drop-shadow` no
> canvas). Ver [07](07-FALA-E-UI.md).

---

## A casca de arame (edges) — linhas ~142–153

Um `IcosahedronGeometry` levemente maior, transformado em `EdgesGeometry` (só as
arestas), lilás e bem transparente. Ela **nunca desdobra nem muda de forma** — fica
como "memória do sólido verdadeiro" flutuando por cima do corpo tensionado. É de
propósito: dá um charme e ancora a identidade icosaédrica mesmo quando o corpo virou
esfera ou espinho.

Próximo: [03 – Estado e loop](03-ESTADO-E-LOOP.md).
</content>
