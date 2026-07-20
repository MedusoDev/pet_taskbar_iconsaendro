# 00 – Visão geral

## O que é o programa

O Icozinho é um **app Electron**. Electron = um navegador (Chromium) + Node.js
empacotados como um programa de desktop. Na prática isso significa que o pet é uma
**página web** (HTML + CSS + JavaScript) rodando dentro de uma janela sem bordas,
transparente, que fica flutuando por cima da taskbar.

O corpo 3D dele é desenhado com **Three.js**, uma biblioteca de gráficos 3D pra web
(usa WebGL). Não tem nada de "engine de jogo" pesada — é só uma cena 3D simples com
um objeto (o icosaedro), duas luzes e uma câmera.

## Os dois processos (isso é o mais importante de entender)

Todo app Electron tem **dois lados que rodam separados** e só conversam por mensagens:

```
┌─────────────────────────────┐         ┌──────────────────────────────────┐
│   PROCESSO PRINCIPAL (main) │         │   RENDERER (a "página" do pet)   │
│   main.js                   │◀──IPC──▶│   renderer/*                     │
│                             │         │                                  │
│  • cria a janela            │         │  • desenha o pet (Three.js)      │
│  • sabe onde está a taskbar │         │  • toda a "vida" e comportamento │
│  • lê RAM/CPU do sistema    │         │  • reage ao mouse                │
│  • vê a janela ativa (Eye)  │         │  • fala, anima, lembra           │
│  • bandeja do sistema       │         │  • conversa (cérebro local)      │
│  • chama a API do Claude    │         │                                  │
└─────────────────────────────┘         └──────────────────────────────────┘
```

**Por que separado?** É como o Electron funciona por segurança: a página (renderer)
não pode acessar o sistema de arquivos, o Windows, etc. diretamente. Só o main pode.
Então o renderer **pede** as coisas pro main através de uma "ponte" (o `preload.js`),
e o main **manda** informações de volta (posição do mouse, RAM, site ativo...).

- O **main** é Node.js puro. Não enxerga o pet, não desenha nada.
- O **renderer** é a página. É onde 90% do código de comportamento vive
  (a pasta `renderer/behaviors/`). Não enxerga o Windows.

A ponte entre os dois é o **IPC** (Inter-Process Communication). Ver
[01 – Processo principal](01-PROCESSO-PRINCIPAL.md) pros detalhes.

## O modelo mental do renderer

Dentro do renderer, o desenho é assim:

1. **Um objeto de estado central** (`state.js`) — um único objeto JavaScript com
   TODAS as variáveis do pet (posição, humor, se está dormindo, nível de carinho...).
   Todo sistema lê e escreve nesse mesmo objeto. Isso evita variáveis soltas e
   deixa cada sistema independente.

2. **Vários "sistemas de comportamento"** (`renderer/behaviors/*.js`) — cada arquivo
   cuida de uma coisa: movimento, interação de mouse, personalidade, fala, tédio, etc.
   Eles não se conhecem diretamente; conversam pelo estado.

3. **Um loop principal** (`movement.js`) — uma função `animate()` que roda ~60 vezes
   por segundo. A cada volta (a cada "frame") ela chama os sistemas na ordem certa e,
   no fim, desenha a cena. É o coração pulsando.

## O que acontece em UM frame

Isso é o que `animate()` faz, 60x por segundo (ver `movement.js:213`):

```
1. Calcula quanto tempo passou desde o último frame (delta)
2. Acumula pontos de vínculo se está recebendo cafuné
3. Decide o estado macro:
     • Se está em shutdown (desligou/nocaute) → updateShutdown() e mais nada
     • Senão:
         - relógio de tédio (updateBoredomClock): decide dormir/meditar/tique
         - updateAlive(): compõe TODA a animação do frame
4. setShapeMode(): a forma do corpo acompanha o humor
5. updateVisuals(): cores, luzes, emissive
6. renderer.render(): desenha na tela
```

O grosso da mágica está no `updateAlive()` (arquivo `liveAnimation.js`). Ele monta,
camada por camada, a posição e a rotação final do corpo naquele frame — somando
respiração + pulinhos + pose da personalidade + inclinação pela velocidade + etc.
Ver [04 – Movimento e pose](04-MOVIMENTO.md).

## Por que tudo é "amortecido" (damp) e "por ruído"

Você vai ver por todo lado duas técnicas. Vale entender agora:

- **`damp(atual, alvo, velocidade, delta)`** — em vez de setar um valor direto
  (que dá um "pulo" seco), o valor **persegue** o alvo suavemente. É o que faz o pet
  parecer que tem peso e inércia, não teletransporte. Vem do Three.js
  (`THREE.MathUtils.damp`), reexportado em `mathUtils.js`.

- **Ruído (noise)** — em vez de `Math.sin(tempo)` puro (que dá um vai-e-vem de
  metrônomo, robótico), o projeto usa **Simplex noise** (`noise.js`): uma função
  contínua e suave que nunca repete o mesmo padrão. É o que faz o giro, a respiração
  e o balanço parecerem orgânicos, vivos. Sempre que você vê `noiseMod(...)`, é isso:
  "varia esse valor de um jeito natural, sem cadência perceptível".

Guarde esses dois conceitos — eles explicam 80% do "por que esse número está aqui".

## Mapa de arquivos (o território)

```
main.js                      processo principal (janela, sistema, IPC, tray, API)
preload.js                   a ponte segura entre main e renderer
pet.config.example.json      modelo de config (apiKey, nome...) — opcional

renderer/
  index.html                 a página: canvas + divs de UI (zzz, fala, ícone) + CSS
  movement.js                BOOTSTRAP + LOOP PRINCIPAL (a fiação de tudo)
  scene.js                   a cena 3D: gem, faces, cores, luzes, unfold, forma
  noise.js                   Simplex noise (movimento orgânico)

  behaviors/
    state.js                 o objeto de estado central
    mathUtils.js             helpers de matemática (clamp, damp, pulse...)

    liveAnimation.js         compõe a animação de cada frame (vida acordada)
    wander.js                pairar/viajar/cair, e o "chão" por monitor
    shutdown.js              evento de desligar/cair/quicar/religar
    boredom.js               relógio de tédio (tique, espreguiçada, sono, zen)
    interactions.js          mouse: cutucar, arrastar, cafuné, estacionar

    personalityState.js      a máquina de humores (Normality ⇄ Zen ⇄ Excited)

    speech.js                balão de fala (com fila)
    prompt.js                balão de PERGUNTA clicável (com botão/input)
    effects.js               efeitos DOM (corações, gotas, blush, faíscas)
    affectionBar.js          a barrinha de cafuné acima do gem

    bond.js                  vínculo persistente (pontos, níveis, saudação)
    petMemory.js             o que o pet sabe sobre você (banco local)
    curiosity.js             o pet faz perguntas → alimenta o petMemory
    brain.js                 cérebro conversacional local (offline)
    lorebook.js              o banco gigante de respostas do cérebro local
    chat.js                  o painel de conversa (duplo-clique)
    siteEye.js               Ico_Eye: reage ao site/app ativo
    sysMonitor.js            Ico_Guard: avisa de RAM/CPU/bateria

  personalities/
    index.js                 catálogo das personalidades
    normality.js             humor base (roxo/âmbar)
    zen.js                   humor tranquilo (azul)
    excited.js               humor animado/ousado (vermelho/rosa)
```

Cada um desses tem um documento ou uma seção adiante. Próximo:
[01 – Processo principal](01-PROCESSO-PRINCIPAL.md).
</content>
