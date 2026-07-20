# 01 – Processo principal (`main.js` + `preload.js`)

O processo principal é o "gerente" do programa. Ele não desenha o pet — ele cria a
janela onde o pet mora, cuida da bandeja, lê dados do Windows (mouse, RAM, janela
ativa) e repassa tudo pro renderer. Também é ele quem fala com a API do Claude.

Se você quer mudar **tamanho da janela, o que o pet "vê", de quanto em quanto tempo
o sistema é medido, a bandeja, ou a integração com a IA** — é aqui.

---

## `preload.js` — a ponte (leia este primeiro, é curtinho)

O renderer (a página) roda **isolado**: por segurança do Electron, ele não pode usar
Node.js nem `ipcRenderer` diretamente. O `preload.js` roda num contexto privilegiado
ANTES da página e **expõe uma API controlada** no objeto global `window.petAPI`.

Ou seja: sempre que no renderer você vê `window.petAPI.algumaCoisa(...)`, quem
implementa esse "algumaCoisa" é o `preload.js`. Ele é o **cardápio** do que a página
pode pedir ao main. Hoje o cardápio é:

| `window.petAPI.*` | Direção | O que faz |
|-------------------|---------|-----------|
| `setIgnoreMouseEvents(ignore, keepFocus)` | renderer → main | Liga/desliga o "click-through" (deixar o clique passar pro que está atrás da janela) |
| `onCursorMove(cb)` | main → renderer | Recebe a posição do mouse na **tela inteira** (50ms) |
| `onScreenConfig(cb)` | main → renderer | Recebe a geometria dos monitores (onde é o chão) |
| `onActiveSite(cb)` | main → renderer | Recebe qual app/site está ativo (Ico_Eye) |
| `onSysStats(cb)` | main → renderer | Recebe RAM/CPU/uptime (5s) |
| `onAIStatus(cb)` | main → renderer | Diz se tem chave de API, nome do pet/usuário |
| `sendChat(text, context)` | renderer → main | Manda mensagem pro Claude e espera a resposta |
| `log(line)` | renderer → main | Imprime uma linha no terminal (o "diário" do pet) |

**Regra:** se você quiser que o renderer acesse algo novo do sistema (ex.: nome do
usuário do Windows, arquivos, etc.), você precisa (1) implementar no `main.js`,
(2) **expor no `preload.js`**, e só então (3) usar via `window.petAPI` no renderer.
Sem o passo 2, a página simplesmente não enxerga.

---

## `main.js` — por seções

### Config do pet (linhas ~24–46)

`loadConfig()` procura um `pet.config.json` em dois lugares (a pasta de dados do app
`%APPDATA%/Icozinho`, e ao lado do código pra dev). Tudo é opcional:

```json
{ "apiKey": "sk-ant-...", "model": "claude-opus-4-8", "petName": "Ico", "userName": "..." }
```

- **Sem `apiKey`** → o chat usa o **cérebro local** (offline). É o modo padrão.
- **Com `apiKey`** → o chat usa o Claude de verdade.
- `ANTHROPIC_API_KEY` no ambiente também vale como chave.

> O nome do app é fixado como `Icozinho` logo no começo (`app.setName`), ANTES de
> qualquer coisa — isso garante que a pasta de dados seja a mesma rodando por
> `npm start` ou pelo `.exe`.

### Onde é o "chão" e o tamanho da janela (linhas ~50–88)

Esta é a parte mais sutil do main. A janela **cobre todos os monitores na
horizontal** (pro pet poder andar até a segunda tela) e tem altura fixa
`WINDOW_HEIGHT = 480` (a "pista" onde ele vive, logo acima da taskbar).

- `displayFloorY(display)` — calcula o "chão" de um monitor em pixels: o topo da
  taskbar se ela estiver visível embaixo; senão, o rodapé da tela.
- `getWindowBounds()` — monta a janela cobrindo da pista **mais alta** até o chão
  **mais baixo** de todos os monitores. Sem isso, o pet "sumia" ao viajar pra um
  monitor com chão em altura diferente.
- `getScreenConfig()` — a geometria (x, largura, chão por monitor) que é mandada pro
  renderer, pra ele saber onde é o chão em cada trecho horizontal.

> **Onde mexer:** quer o pet numa faixa mais alta pra arrastar mais longe? Aumente
> `WINDOW_HEIGHT`. O corpo continua do mesmo tamanho em pixels porque a `scene.js`
> escala a câmera na mesma proporção (ver [02](02-CENA-3D.md)).

### Monitor de sistema (linhas ~90–124)

`getSysStats()` monta RAM (%, GB usados/totais), CPU (%), uptime, modelo e nº de
núcleos. A CPU é calculada por **delta**: `os.cpus()` dá números acumulados desde o
boot; a diferença entre duas leituras dá o uso do intervalo. Por isso a primeira
amostra sempre dá 0 (não tem com o que comparar) — daí o `sampleCpu()` "de aquecimento"
lá embaixo antes de ligar o timer.

### A API do Claude (linhas ~126–190)

- `PET_SYSTEM_PROMPT` — a **persona** do pet, em texto fixo. Fica estável de propósito
  (bom pro cache de prompt do Claude). Regras: sempre PT-BR, máximo 2 frases, primeira
  pessoa, usa o contexto entre colchetes. **Se você quer mudar a personalidade do pet
  no modo com IA, é este texto que você edita.**
- `chatHistory` — guarda as últimas 16 mensagens da sessão (some ao fechar).
- `askClaude(text, context)` — monta a chamada. O **contexto volátil** (humor, RAM,
  site...) viaja DENTRO da mensagem do usuário (`[contexto: ...]`), nunca no system
  prompt — de novo, pra não estragar o cache. Se der erro, desfaz a última mensagem
  do histórico e devolve `{ error }` pro renderer cair no cérebro local.

### A janela em si (linhas ~192–288)

`createWindow()` cria a `BrowserWindow` com as flags que fazem o pet "flutuar":

| Flag | Por quê |
|------|---------|
| `transparent: true` | fundo invisível, só o pet aparece |
| `frame: false` | sem barra de título/bordas |
| `alwaysOnTop: true` | fica por cima de tudo |
| `skipTaskbar: true` | não aparece como janela na taskbar |
| `focusable: false` | **não rouba foco** — cliques e cafuné funcionam sem focar a janela (senão o ícone piscava na taskbar toda passada de mouse) |
| `hasShadow: false` | sem sombra de janela |

Depois de criada, ela **re-aplica os bounds** (`win.setBounds`) porque o Windows
"clampa" janelas não-redimensionáveis ao tamanho de um monitor na criação — sem isso
ela ficava presa na tela 1.

Aqui também ficam os **três timers** que alimentam o renderer:

- **`cursorPoll` (50ms)** — manda a posição do mouse na tela inteira. É por isso que o
  pet "vê" o cursor mesmo fora da janela dele (curiosidade, susto, relógio de tédio).
- **`windowPoll` (1s)** — pergunta ao Windows qual é a janela ativa (`active-win`).
  Só repassa se o app estiver na lista `WATCHED_APPS` (navegadores + Spotify, Discord,
  VS Code, Steam). Todo o resto o pet nem "vê". É o Ico_Eye.
- **`sysPoll` (5s)** — manda RAM/CPU/uptime.

> **Onde mexer:** quer o pet reagir a mais um app? Adicione o nome do processo em
> `WATCHED_APPS` (ex.: `'photoshop'`) e crie a categoria correspondente no
> `siteEye.js` (ver [08](08-CONHECIMENTO.md)). Quer medir o sistema com mais
> frequência? Mude o `5000` do `sysPoll`.

### Foco (linhas ~290–312) — a parte chata mas importante

Normalmente o pet NÃO tem foco de teclado (pra não piscar na taskbar). Mas quando você
abre o **chat** ou uma **pergunta**, ele precisa capturar teclado pra você digitar.
O handler `set-ignore-mouse-events` recebe `{ ignore, keepFocus }`: quando `keepFocus`
liga, ele torna a janela focável e chama `focus()`; quando desliga, devolve. O
`setSkipTaskbar(true)` é re-aplicado porque no Windows tornar focável reseta o "fora
da taskbar". Se você mexer em foco e o ícone começar a piscar, o problema é aqui.

### A bandeja (linhas ~327–372)

`createTray()` cria o ícone perto do relógio com o menu: versão, status da IA, "iniciar
com o Windows", "reiniciar o pet" (recarrega o renderer), "abrir pasta de config" e
"fechar". Como a janela do pet não aparece na taskbar de propósito, **a bandeja é o
único jeito civilizado de fechar/reiniciar** o programa.

---

## Resumo do fluxo main ⇄ renderer

```
main.js                                    renderer (via window.petAPI)
────────                                   ───────────────────────────
cursorPoll (50ms)  ── 'cursor-pos' ──────▶ onCursorMove  → state.cursor
windowPoll (1s)    ── 'active-site' ─────▶ onActiveSite  → siteEye.js
sysPoll (5s)       ── 'sys-stats' ───────▶ onSysStats    → sysMonitor.js
ready              ── 'screen-config' ───▶ onScreenConfig→ state.screenConfig
ready              ── 'ai-status' ───────▶ onAIStatus    → chat.js

chat.js  ── sendChat(text,ctx) ──▶ 'chat-message' ──▶ askClaude() ──▶ resposta
qualquer ── log(line) ──────────▶ 'pet-log' ──▶ console.log no terminal
```

Próximo: [02 – A cena 3D](02-CENA-3D.md).
</content>
