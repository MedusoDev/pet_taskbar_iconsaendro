# 08 – Conhecimento e conversa

Este é o "cérebro" do pet: como ele conversa, o que sabe sobre você, como reage ao que
você navega, como cuida do PC e como o vínculo evolui. São vários módulos que se
complementam. Vou dos mais centrais aos de apoio.

---

## `chat.js` — o painel de conversa

O painel que abre com **duplo-clique** no pet. Ele decide de onde vem a resposta:

```
você digita → send()
  ├─ tem chave de API? → window.petAPI.sendChat() → Claude (main.js)
  │     └─ falhou? → cai no cérebro local
  └─ sem chave       → cérebro local (brain.js) na hora
```

- Com IA, ele monta um **contexto vivo curto** (`buildContext`): humor, vínculo,
  carinho recente, site que está vendo, RAM/CPU, nome, memórias, hora. Esse contexto
  viaja junto da mensagem (o `main.js` injeta como `[contexto: ...]`).
- Sem IA, chama `brain.reply(text)` e aplica os **efeitos colaterais** que o cérebro
  local pede (corações, blush, pontos de vínculo) via `applyEffects`.
- A resposta aparece no painel **e** sobe no balão de fala (`speak.text`), pra conversa
  viver "no corpo" do pet.

O painel cria o próprio DOM/CSS. Cuida também do foco de teclado (abre → captura foco;
fecha → devolve o click-through).

---

## `brain.js` + `lorebook.js` — o cérebro local (offline)

Este é o coração do "conversar sem API". Funciona por **casamento de padrões (regex)**
em português: ele testa a sua mensagem contra uma lista de intenções e responde com a
persona do pet.

### `brain.js` — o roteador

`createBrain({...}).reply(text)` tenta, **nesta ordem**:

1. **Intenções dinâmicas** (`intents`) — as que precisam de lógica: ensinar o nome,
   status do sistema, status do vínculo, "te amo" (escala com nível), spicy (escala com
   nível), saudação, piada, tristeza, etc. Cada uma tem `match` (regex) e `reply()` que
   devolve `{ text, hearts?, blush?, charge?, bondPts? }`.
2. **Intenções de memória** (`memoryIntents`) — "o que você sabe sobre mim", "esquece
   isso".
3. **O lorebook** (`lorebookReply`) — o banco GIGANTE de respostas por assunto.
4. **Fallback** — se nada casou, uma resposta genérica; às vezes puxa uma memória sua
   pra parecer que te conhece.

A "ordem importa": a primeira intenção que casar responde. Por isso as mais específicas
vêm antes das genéricas.

### `lorebook.js` — o banco de assuntos

Um array grande (`LOREBOOK`). Cada entrada:

```js
{
  id: 'good_morning',
  match: /\bbom dia\b/i,          // o gatilho (regex)
  hearts: 1, bondPts: 1,          // efeitos opcionais
  replies: ['...', '...'],        // respostas sorteadas
}
```

Variações:
- **`byLevel: [[nível0...], [nível1...], ...]`** — respostas que **escalam com o
  vínculo**. O `brain` pega `byLevel[min(nível, len-1)]`. Mais íntimo a cada nível.
- **`minLevel` + `locked`** — abaixo do nível mínimo, responde com as travadas
  (ex.: conteúdo mais quente só destrava com vínculo alto).

> **Onde mexer:** adicionar um assunto novo = adicionar um objeto ao array. Cuidado com
> a **ordem** (regex genérica no topo "rouba" mensagens de entradas específicas abaixo)
> e escreva a `match` cobrindo variações de escrita. Ver a receita no [09](09-RECEITAS.md).

---

## `petMemory.js` — o que ele sabe sobre você

Um banco local (localStorage, chave `ico_memory_v1`) de coisas que você respondeu.
Cada memória: `{ id, label, question, answer, at }`. API: `remember`, `recall`, `has`,
`list`, `random`, `count`, `contextLine` (a linha compacta que vai pro contexto do
chat com IA). Guarda até 60; some as mais antigas.

Ele não inventa memórias — elas nascem das perguntas da curiosidade (abaixo).

---

## `curiosity.js` — o pet faz perguntas

De tempos em tempos (a primeira depois de ~2.5min, depois a cada 9–16min), **com você
por perto**, o pet fica curioso e pergunta algo sobre você. A resposta vira uma
memória e rende pontos de vínculo.

Três bancos de perguntas, em ordem de prioridade:
1. **NSFW** (`NSFW_QUESTIONS`) — só com site adulto ativo e vínculo suficiente.
2. **Do site ativo** (`SITE_QUESTIONS`) — pergunta sobre o que você está vendo.
3. **Genéricas** (`GENERIC_QUESTIONS`) — cor favorita, comida, hobby, etc.

Só pergunta o que **ainda não** foi respondido (`petMemory.has`). Usa o `prompt.ask`
(o balão com campo de texto). O `thanks` de cada pergunta usa `{a}` como marcador da
sua resposta.

> **Onde mexer:** adicionar perguntas = adicionar objetos aos arrays. Cada uma precisa
> de `id` único (a chave da memória), `label`, `q` (a pergunta), `ph` (placeholder) e
> `thanks`. Os tempos de espera estão nas constantes no topo.

---

## `siteEye.js` — o Ico_Eye (reage ao que você navega)

Recebe do `main.js` (via IPC) o app/site ativo e o **categoriza** por regex numa lista
grande (`SITE_CATEGORIES`): nsfw, ai, youtube, streaming, spotify, github, games, etc.
Cada categoria tem cor (tint), ícone, rótulo e falas. Ao mudar de categoria, ele:
- aplica o tint da cor no corpo,
- mostra o ícone flutuante,
- comenta (com a voz da personalidade ativa, se ela tiver `site_<id>`; senão as falas
  genéricas da categoria),
- reações de corpo: NSFW → blush + liga o `state.nsfwActive` (que o `personalityState`
  transforma em excitação); AI → ciúmes (giro seco).

> **Onde mexer:** adicionar um site/app = adicionar uma categoria ao array (com a regex
> do título) e, se for um app de desktop, tratar no `categorize()` + colocar o processo
> em `WATCHED_APPS` no `main.js`. Ver receita no [09](09-RECEITAS.md).

---

## `sysMonitor.js` — o Ico_Guard (cuida do PC)

Recebe RAM/CPU/uptime do `main.js` a cada 5s, guarda em `state.sysStats`, e **avisa
espontaneamente** quando algo passa do ponto (RAM > 88%, CPU > 85% sustentado por 15s,
bateria < 20%, uptime > 7 dias), com cooldown de 10min por tipo pra não virar alarme de
carro. Também formata o **relatório completo** (`formatReport`) pro chat quando você
pergunta "como tá o PC?".

Os avisos usam a voz da personalidade (`sys_ram_high` etc. nas `lines`) com fallback
genérico. Só avisa acordado, ligado e no Normality.

---

## `bond.js` — o vínculo (a conquista de verdade)

O relacionamento persistente (localStorage, `ico_bond_v1`). Pontos entram por carinho,
conversa e presença; o total define o **nível**:

```js
BOND_LEVELS = [
  { at: 0,   name: 'Desconhecidos' },
  { at: 60,  name: 'Colegas' },
  { at: 180, name: 'Amigos' },
  { at: 420, name: 'Crush' },
  { at: 900, name: 'Almas Gêmeas' },
];
```

O nível (`state.bondLevel`) destrava os bancos de flerte mais íntimos (o `byLevel` do
lorebook e das personalidades) e muda o tom no chat. Há um **teto diário** de 90 pontos
(`DAILY_CAP`) — conquista é maratona, não sprint. Quando cruza um nível, dispara a
celebração (faíscas + fala), com a lógica de "guardar pra quando religar" se estava
apagado (montada no `movement.js`).

`sessionGreeting()` monta a saudação de chegada (hora do dia + quanto tempo de saudade
desde a última sessão).

> **Onde mexer:** os limiares de nível e os nomes estão em `BOND_LEVELS`. O teto diário
> em `DAILY_CAP`. Quanto cada ação vale está espalhado (`addBond(1.5, 'cafuné')` no
> `movement.js`, `addBond(3, ...)` na curiosidade, etc.).

Próximo: [09 – Receitas](09-RECEITAS.md).
</content>
