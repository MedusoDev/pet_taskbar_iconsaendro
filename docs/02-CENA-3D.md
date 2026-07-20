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

## Mudança de forma por humor: o morph — linhas ~130–200 e dentro do `applyUnfold`

Cada humor tem uma **forma própria de verdade**, não só uma tensão:

> O corpo é SEMPRE o icosaedro (a identidade do pet), mas:
> **Zen** vira um **orbe liso** — esfera completa, com sombreamento suave (as
> facetas somem visualmente) e a casca de arame apagada;
> **Excited** se eriça em **espinhos que latejam** no ritmo do heartbeat.

Como funciona:

1. **Dois "deltas" por vértice**, pré-calculados no init a partir dos MESMOS 240
   vértices:
   - `dSphere[i]` = (posição na esfera − posição no ico). Esfera completa — o
     "liso" de verdade vem do blend de normais (abaixo).
   - `dSpiky[i]` = empurrão pra fora ao longo da normal, com amplitude irregular
     (~60% das faces viram espinho, o resto fica quase parado).

2. **Um escalar contínuo `shapeCur`** que vai de **−1 a +1**:
   - `−1` = orbe (zen)
   - `0` = icosaedro puro (normality)
   - `+1` = espinhos (excited)

   Como qualquer transição **passa por 0**, ir de um humor pro outro cruza o
   icosaedro no meio e nunca dá um "pop" (salto visual).

3. **`setShapeMode(mode)`** (chamado todo frame pelo `movement.js`) detecta a
   troca de humor e arma a **timeline da transição** (`morphAnim`): `shapeCur`
   viaja de onde está até o alvo com uma **ease com a cara do destino** —
   `easeOutBack` (overshoot elástico: os espinhos passam do ponto e assentam)
   pro Excited, `easeInOutSine` (seda, 2.3s) pro Zen, cubic neutro pro
   Normality. Junto viaja o `transBurst` (0→1→0), o envelope do "estouro":
   - **unfold extra** — as facetas explodem no meio do caminho e reassentam
     já na forma nova;
   - **flash branco** no emissive;
   - **soco de escala** no mesh interno (incha pro Excited, "inspira"
     encolhendo pro Zen);
   - **anel de choque** (`shockRing`) que expande e some na cor do humor de
     destino (lilás/ciano/rosa).

4. Dentro do `applyUnfold`, a cada frame:
   - avança a timeline (se houver) e calcula `sEff` — no lado dos espinhos,
     `shapeCur` é modulado pelo heartbeat (é o latejo);
   - monta a base morfada: `morphedBase = basePos + (sEff<0 ? dSphere*|sEff| : dSpiky*sEff)`;
   - aplica o unfold em cima dessa base (`disp + transBurst`);
   - **recalcula as normais** (`computeVertexNormals`) só enquanto a forma
     mexe; **no lado do orbe**, as normais fundem pra **radial** na mesma
     proporção (`k = |sEff|`) — é isso que apaga as facetas e deixa o Zen com
     cara de bola de vidro. Parado no ico, custo zero.

> **Onde mexer:** espinhos maiores/mais numerosos = o `0.6` (fração) e o
> `(0.35 + ...*0.65)` (amplitude) no loop do `dSpiky`. Duração/ease da
> transição = o objeto `morphAnim` dentro do `setShapeMode`. Força do estouro =
> `burstAmp`. Latejo dos espinhos = o `(0.86 + 0.14 * heartbeat)` no
> `applyUnfold`.

---

## Adereços por humor: anéis, vagalumes e faíscas — logo depois das `edges`

Cada humor traz **companhia visual própria**, tudo filho do `gem` (acompanha
posição/escala do corpo, mas NÃO a rotação do mesh):

- **Zen** — `zenGroup`: dois **anéis "ensō"** (torus finos ciano/verde-água)
  inclinados, em precessão lenta, + 12 **vagalumes** (`Points` com textura
  radial gerada em canvas, blending aditivo) orbitando devagar e ondulando no
  Y. Entram crescendo junto com o fade.
- **Excited** — `sparks`: 20 **faíscas** rosas tremendo rápido por entre os
  espinhos; opacidade e tamanho latejam com o heartbeat.
- **Transição** — `shockRing`: o anel de choque descrito acima (plano XY, de
  frente pra câmera ortográfica).

O fade é feito por dois escalares amortecidos no `updateVisuals` (`zenMix` /
`excMix`) — a troca nunca corta seco, e os adereços escurecem junto com o
`power`/sono (`dimmer`). Os **ritmos contínuos também acompanham o humor**: a
transição de cor das faces quase congela no Zen e dança no Excited
(`colorPace`), e o pulso do emissive desacelera no Zen e bate com o coração no
Excited (`moodPhase`).

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

## A casca de arame (edges)

Um `IcosahedronGeometry` levemente maior, transformado em `EdgesGeometry` (só as
arestas). Ela **nunca desdobra nem muda de forma** — é a "memória do sólido
verdadeiro" — mas agora **reage ao humor** no `updateVisuals`:

- **Normality** — lilás, opacidade 0.18 (o visual clássico);
- **Zen** — **some** (fade pra 0): o orbe é liso, sem arestas;
- **Excited** — esquenta pra **rosa** (`#FB7185`), fica mais opaca e **pulsa**
  de escala/brilho com o heartbeat.

Próximo: [03 – Estado e loop](03-ESTADO-E-LOOP.md).
</content>
