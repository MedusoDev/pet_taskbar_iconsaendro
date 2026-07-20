# 07 – Fala e interface (`speech.js`, `prompt.js`, `effects.js`, `affectionBar.js`, `index.html`)

Tudo que o pet "mostra" além do corpo 3D: os balõezinhos, os efeitos de coração/gota,
a barrinha de carinho e o CSS que dá o glow. São elementos **HTML/DOM** desenhados por
cima do canvas — não são 3D. Cada frame, o `liveAnimation.js` reposiciona todos eles
pra seguir o gem.

Um padrão comum aqui: cada um desses módulos **cria o próprio CSS e o próprio DOM** no
boot (injeta um `<style>` e um `<div>`). Você não vê esses elementos no `index.html` —
eles nascem em JavaScript. Isso mantém cada peça autocontida.

---

## `speech.js` — o balão de fala (com fila)

O balão único onde o pet "fala". A regra de ouro: **uma fala nunca atropela a outra**.

Dois jeitos de falar:
- **`speak('gatilho')`** — fala de **banco** (as `lines` da personalidade). Se o balão
  está ocupado, é **descartada** (falas ambientes sempre voltam a acontecer, não faz
  falta). Tem cooldown de 6s entre falas de banco.
- **`speak.text('texto livre', 'tag')`** — texto **importante** (chat, avisos, vínculo,
  curiosidade). Se o balão está ocupado, entra numa **fila** curta (máx. 2) e aparece
  quando a atual terminar. Nunca se perde.

Detalhes que importam:
- `MIN_READ_MS = 2600` — toda fala segura o balão pelo menos isso, pra dar tempo de ler.
- `canSpeak()` — se o pet está apagado/caindo (shutdown), ele fica **mudo**; eventos
  assíncronos esperam ele religar.
- Gatilhos `_parked` (ex.: `petting_parked`) caem na versão base (`petting`) se a
  personalidade não tiver a variante estacionada.

> **Onde mexer:** tempo na tela = `SPEECH_DURATION`/`durationFor`. Cooldown entre falas
> ambientes = `SPEECH_COOLDOWN`. Tamanho da fila = `QUEUE_MAX`.

---

## `prompt.js` — o balão de PERGUNTA (clicável)

Diferente do balão de fala, este **recebe clique/digitação**. É usado por dois
sistemas: o **estacionar/liberar** (`interactions.js`) e a **curiosidade**
(`curiosity.js`).

Dois modos:
- **`show(pergunta, rótuloBotão, aoEscolher, aoMurchar)`** — pergunta com um botão só
  (ex.: "Fica aqui"). Some sozinha em 8s.
- **`ask(pergunta, placeholder, aoResponder, aoMurchar)`** — pergunta com **campo de
  texto** (a curiosidade). Você digita e o texto vai pro callback. Fica 22s na tela.

O `interactions.js` liga o click-through/foco quando o cursor entra na pergunta (senão
o clique no botão ou a digitação morreriam). O `stopPropagation` nos handlers impede
que clicar no botão vire um cutucão no pet.

---

## `effects.js` — os efeitos efêmeros

Cria elementos DOM que animam por CSS e se autodestroem. As funções:

| Função | O quê | Quando |
|--------|-------|--------|
| `floatHearts(x, y, count)` | corações subindo | Excited, flerte, resposta de curiosidade, level-up |
| `burstLiquid(x, y, intensity)` | respingo de gotas brancas + anel | saída envergonhada do Excited (shy/shy2) |
| `flashRing(x, y, intensity)` | onda circular que expande | clímax do respingo / celebração |
| `sparkBurst(x, y, count)` | chuva de faíscas coloridas | level-up de vínculo |
| `updateBlush(visible, x, y)` | o "///" de vergonha na bochecha | chamado todo frame; liga/desliga |

Os efeitos "de disparo" (hearts, burst, spark) são chamados por vários sistemas. O
`updateBlush` é o único chamado por frame (pra seguir o gem e ligar/desligar).

> **Onde mexer:** as cores/tamanhos/durações estão no bloco CSS no topo do arquivo e
> nos `setProperty('--...')`. Ex.: a paleta de corações é o parâmetro `palette` de
> `floatHearts` (padrão `['💜','💗','💕','❤️‍🔥']`).

---

## `affectionBar.js` — a barrinha de cafuné

O medidor visual que aparece acima do gem enquanto há carinho. Mostra `state.affection`
(0→1) preenchendo, fica dourada e pulsa quando **transborda** (>1), e o coração ao lado
ganha uma **aura crescente** com a supercarga (`state.petCharge`, a caminho do Excited).
Some sozinha quando o medidor zera.

---

## `index.html` — a página e o CSS "fixo"

O HTML é minúsculo: um `<canvas>` (onde o 3D é desenhado) e três divs de UI que já
nascem no HTML (`#zzz`, `#site-icon`, `#speech`). O resto da UI é criado por JS.

O CSS aqui cuida do que é **fixo/ambiente**:
- **O glow externo do corpo** — o `filter: drop-shadow(...)` no `canvas` é a "aura"
  roxa+âmbar ao redor do pet. No modo Excited, a classe `.excited-glow` (ligada em
  `liveAnimation.js`) troca pra um glow rosa que **pulsa** (o `@keyframes excited-throb`).
- **A animação do "z z z"** do sono.
- **O balão de fala** (`#speech`) e o bob do ícone de site.

> **Onde mexer:** quer mudar a "aura" ao redor do pet? É o `drop-shadow` do `canvas`
> aqui — não confunda com as luzes 3D (que são no `scene.js`) nem com o emissive. São
> três "brilhos" diferentes: luzes (iluminam as faces), emissive (brilho interno do
> material) e drop-shadow (halo externo, puro CSS).

Próximo: [08 – Conhecimento e conversa](08-CONHECIMENTO.md).
</content>
