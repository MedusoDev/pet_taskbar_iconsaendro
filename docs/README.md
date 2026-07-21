# Documentação do Icozinho 💜

Esta pasta explica **como o código do pet funciona por dentro** — pra você entender
o que cada parte faz, por que faz, e conseguir fazer suas próprias alterações sem
depender de ninguém.

## Como ler

Se você é novo no código, leia **na ordem**. Cada documento assume que você leu o
anterior. Se já conhece e só quer mexer em algo, pule direto pro [09 – Receitas](09-RECEITAS.md),
que é um "como eu mudo X" prático com o arquivo e a linha exatos.

| # | Documento | O que cobre |
|---|-----------|-------------|
| 00 | [Visão geral](00-VISAO-GERAL.md) | O que é o programa, os dois "processos", o loop de cada frame, o modelo mental |
| 01 | [Processo principal](01-PROCESSO-PRINCIPAL.md) | `main.js` + `preload.js`: a janela, a bandeja, o monitor de sistema, a ponte com o renderer, a API da Groq |
| 02 | [A cena 3D](02-CENA-3D.md) | `scene.js`: o icosaedro, as 80 faces, cores, luzes, o "desdobrar" e a mudança de forma |
| 03 | [Estado e loop](03-ESTADO-E-LOOP.md) | `state.js` + `movement.js`: o objeto de estado central e a fiação do loop principal |
| 04 | [Movimento e pose](04-MOVIMENTO.md) | `wander.js` + `liveAnimation.js`: pairar, viajar, girar, respirar, cair |
| 05 | [Personalidades](05-PERSONALIDADES.md) | `personalityState.js` + `personalities/*`: a máquina de humores (Normality/Zen/Excited) |
| 06 | [Interações e tédio](06-INTERACOES.md) | `interactions.js` + `boredom.js`: mouse, cafuné, arrastar, estacionar, o relógio de ócio |
| 07 | [Fala e interface](07-FALA-E-UI.md) | `speech.js`, `prompt.js`, `effects.js`, `affectionBar.js`, `index.html` |
| 08 | [Conhecimento e conversa](08-CONHECIMENTO.md) | `brain.js`, `lorebook.js`, `chat.js`, `petMemory.js`, `curiosity.js`, `siteEye.js`, `sysMonitor.js`, `bond.js` |
| 09 | [Receitas](09-RECEITAS.md) | Cookbook: como mudar cores, falas, tempos, adicionar personalidade, etc. |

## Regra de ouro pra não quebrar nada

O pet é um monte de sistemas que **escrevem no mesmo estado** e **desenham no mesmo
corpo** a cada frame. Antes de mexer, entenda **quem mais escreve na mesma coisa que
você quer mudar**. Ex.: a posição vertical (`gem.position.y`) é escrita por vários
lugares (respiração, pulinho, queda, sono). Se você somar mais uma coisa sem cuidado,
dois sistemas brigam e o pet "treme". Os documentos apontam esses lugares.

## Glossário rápido

- **gem** — o corpo 3D do pet (o icosaedro). No código é um `THREE.Group`.
- **renderer** — o "site" que roda dentro da janela (tudo em `renderer/`).
- **main / processo principal** — o `main.js`, que controla a janela do Windows.
- **IPC** — o canal de mensagens entre o main e o renderer (eles não compartilham memória).
- **estado** — o objeto único criado em `state.js`, passado pra todo mundo.
- **pose** — deslocamentos temporários de posição/escala/rotação de uma animação.
- **unfold** — o quanto as facetas estão "abertas" (afastadas do centro).
- **bond / vínculo** — os pontos de relacionamento que sobem de nível.
</content>
</invoke>
