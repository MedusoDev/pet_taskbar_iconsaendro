# 09 – Receitas (como eu mudo X)

Este é o documento prático. Cada receita diz **o arquivo, o lugar e o cuidado**. A
ideia é você conseguir fazer as mudanças "mínimas" sozinho. Sempre que possível teste
rodando o app (ver o final).

> Convenção: `arquivo.js:linha` é aproximado — o número pode ter mudado; use a busca
> (Ctrl+F) pelo trecho de código citado.

---

## 🎨 Cores e visual

### Trocar as cores de um humor
`renderer/personalities/normality.js` (ou `zen.js`/`excited.js`), campo **`palette`**.
São 6 cores hexadecimais. A troca no app é suave sozinha. A `palette[0]` e a `[2]` são
as "âncoras" do brilho pulsante (emissive), então escolha essas duas como as
dominantes.

### Mudar a "aura" (halo) ao redor do pet
`renderer/index.html`, o `filter: drop-shadow(...)` no seletor `canvas` (aura normal) e
no `@keyframes excited-throb` (aura pulsante do Excited). **Não** é no `scene.js`.

### Mudar o brilho interno do corpo
`renderer/scene.js`, `material` → `emissiveIntensity` (base `0.55`) e a mistura de
emissive no `updateVisuals`.

### Mudar as luzes que iluminam as faces
`renderer/scene.js`, `purpleLight`/`amberLight` (cor, intensidade, alcance) e a órbita
delas no `updateVisuals`.

---

## 🔷 Forma do corpo

### Deixar a esfera do Zen mais/menos redonda
`renderer/scene.js`, no cálculo do `dSphere`: o fator `* 0.9`. Mais perto de 1.0 = bola
mais perfeita; menor = mantém mais cara de icosaedro.

### Mudar os espinhos do Excited
`renderer/scene.js`, no loop do `dSpiky`:
- `Math.random() < 0.6` → fração de faces que viram espinho (suba pra espetar mais).
- `(0.35 + Math.random() * 0.65) * GEM_RADIUS` → tamanho dos espinhos.

### Velocidade da transição de forma
`renderer/scene.js`, dentro do `applyUnfold`: o `2.6` em `Math.exp(-2.6 * dt)`. Maior =
transição mais rápida.

### Dar uma forma pra um humor novo
`renderer/scene.js`, função `setShapeMode(mode)`: hoje mapeia `zen → -1`, `excited → 1`,
resto `0`. Adicione seu caso. (Só existem dois alvos — esfera e espinho; pra uma forma
nova de verdade você precisaria de um terceiro "delta" pré-calculado no init.)

---

## 💬 Falas

### Editar/adicionar uma fala de um humor
`renderer/personalities/<humor>.js`, objeto **`lines`**. As chaves são gatilhos
(`poke`, `petting`, `sleep`, `drag`, `flirt1..4`, `site_nsfw`, `sys_ram_high`...).
Cada uma é um array; o app sorteia uma. Adicionar uma frase = só pôr no array.

### Criar um gatilho de fala novo
Além de adicionar a chave em `lines`, algo precisa **chamar** `speak('sua_chave')`. Ex.:
um novo evento no `liveAnimation.js` ou `interactions.js`. Sem o `speak(...)`, o banco
nunca é usado.

### Mudar quanto tempo a fala fica na tela
`renderer/behaviors/speech.js`: `SPEECH_DURATION` (falas de banco) e a função
`durationFor` (textos livres, escala com o tamanho).

---

## 🧠 Conversa (cérebro local, sem API)

### Adicionar um assunto novo ao lorebook
`renderer/behaviors/lorebook.js`, adicione um objeto ao array `LOREBOOK`:

```js
{
  id: 'meu_assunto',                 // único
  match: /padr[ãa]o|outra forma/i,   // regex PT-BR, cubra variações
  hearts: 1, bondPts: 1,             // opcional
  replies: ['resposta 1', 'resposta 2'],
},
```

**Cuidados:**
- Ordem importa: a **primeira** entrada cuja `match` casar vence. Ponha assuntos
  específicos ANTES de regex genéricas.
- Teste sua regex mentalmente com frases reais. `\b` marca borda de palavra; `i` ignora
  maiúsculas; `?` torna opcional; `[áa]` cobre acentuação.
- Pra respostas que ficam mais íntimas com o vínculo, use `byLevel: [[...],[...]]` em
  vez de `replies`.

### Adicionar uma intenção com lógica (não só texto fixo)
`renderer/behaviors/brain.js`, array `intents`. Use quando a resposta depende de algo
(nome, sistema, hora). Cada intenção tem `match` e `reply(m)` que retorna
`{ text, hearts?, bondPts?, ... }`. Lembre: `intents` roda ANTES do lorebook.

### Mudar a persona no modo COM API
`main.js`, a constante **`PET_SYSTEM_PROMPT`**. É o texto que define o pet pra Groq.

---

## ❓ Perguntas da curiosidade

### Adicionar uma pergunta
`renderer/behaviors/curiosity.js`, array `GENERIC_QUESTIONS` (ou `SITE_QUESTIONS`/
`NSFW_QUESTIONS`):

```js
{ id: 'signo', label: 'signo', q: 'Qual seu signo?', ph: 'áries, gêmeos...',
  thanks: '{a}? Combinamos, verifiquei nas estrelas 💜' },
```

O `id` vira a chave da memória (precisa ser único). `{a}` no `thanks` é substituído pela
resposta.

### Mudar a frequência das perguntas
`renderer/behaviors/curiosity.js`, constantes `FIRST_ASK_MIN_MS`, `ASK_COOLDOWN_MIN_MS`,
`ASK_COOLDOWN_RAND_MS`.

---

## ⏱️ Ritmo e tempos

### Quando ele fica entediado / medita / dorme / desliga
`renderer/behaviors/boredom.js`, constantes no topo: `REST_AT` (14s tique),
`STRETCH_AT` (32s), `ZEN_AT` (60s), `SLEEP_AT` (65s), `SHUTDOWN_MIN` (30s).
Regra: `SLEEP_AT` tem que ser maior que `ZEN_AT`.

### Tempos das transições de humor
`renderer/behaviors/personalityState.js`, o bloco de constantes no topo (linhas ~24–81).
Ex.: `PET_CHARGE_FILL_SEC` (supercarga), `NSFW_CHARGE_FILL_SEC` (arousal), `SHY_EXIT_MS`,
`TRAPPED_GIVEUP_MS`, etc.

### Deixar o cafuné mais fácil / o medidor encher mais rápido
`renderer/behaviors/interactions.js`: `PET_FLIPS_NEEDED` (inversões pra engatar) e o
`0.0004` no `state.affection += strokes * 0.0004`.

---

## 👁️ Reações a sites/apps (Ico_Eye)

### Adicionar reação a um site (por título do navegador)
`renderer/behaviors/siteEye.js`, array `SITE_CATEGORIES`:

```js
{ id: 'figma', match: /figma/i, color: '#F24E1E', icon: '🎨', label: 'Figma',
  lines: ['Desenhando? Capricha que eu tô olhando 👀'] },
```

### Adicionar reação a um APP de desktop (não navegador)
Dois passos:
1. `main.js`, adicione o nome do processo em **`WATCHED_APPS`** (ex.: `'photoshop'`).
2. `siteEye.js`, trate no `categorize()` (ex.: `if (app === 'photoshop') return ...`)
   e crie a categoria.

Sem o passo 1, o `main.js` nem manda esse app pro renderer.

---

## 💗 Vínculo

### Mudar os níveis / nomes
`renderer/behaviors/bond.js`, array `BOND_LEVELS` (o `at` é o total de pontos pra
alcançar). E `DAILY_CAP` pro teto diário.

### Mudar quanto cada ação rende
Espalhado, mas os principais: cafuné = `movement.js` (`addBond(1.5, 'cafuné')`),
resposta de curiosidade = `curiosity.js` (`addBond(3, ...)`), conversa = `chat.js`.

---

## 🪟 Janela e sistema

### Aumentar a "pista" onde o pet vive
`main.js`, `WINDOW_HEIGHT` (padrão 480). O corpo continua do mesmo tamanho (a câmera
escala junto).

### Medir o sistema com mais/menos frequência
`main.js`, o `5000` do `sysPoll` (RAM/CPU) e o `1000` do `windowPoll` (site ativo).

### Limiares dos avisos de sistema
`renderer/behaviors/sysMonitor.js`: `RAM_WARN_PCT`, `CPU_WARN_PCT`, `BATTERY_WARN_LEVEL`,
`WARN_COOLDOWN_MS`.

---

## ▶️ Como testar uma mudança

Do diretório do projeto, no terminal:

```bash
npm start
```

Se você mexeu **só no renderer** (`renderer/**`), não precisa reabrir tudo: clique com o
botão direito na bandeja (perto do relógio) → **"Reiniciar o pet"**, que recarrega a
página. Se mexeu no **`main.js`**, precisa fechar (bandeja → "Fechar") e `npm start` de
novo.

> Nota de ambiente de dev: se o `npm start` reclamar de `ELECTRON_RUN_AS_NODE`, rode
> `npx electron .` limpando essa variável (no Git Bash: `env -u ELECTRON_RUN_AS_NODE npx electron .`).

O **terminal mostra o "diário" do pet** (via `logEvent`) — cada reação, transição de
humor, fala e ganho de vínculo aparece com hora. É a melhor forma de ver o que está
acontecendo por dentro enquanto testa.

---

## Checklist mental antes de mexer

1. **Quem mais escreve nisso?** Se for posição/rotação/unfold, veja o
   [04](04-MOVIMENTO.md) — provavelmente você deve somar na composição, não escrever cru.
2. **É dado ou lógica?** Cores, falas, tempos e níveis são dados — seguros. Lógica de
   pose/transição pede mais cuidado.
3. **Precisa passar pela ponte?** Se envolve o sistema (arquivos, Windows), lembre do
   `preload.js` (ver [01](01-PROCESSO-PRINCIPAL.md)).
4. **Testou olhando o diário no terminal?**
</content>
