# 03 – Estado e loop (`state.js` + `movement.js`)

Estes dois arquivos são o **esqueleto** do renderer. O `state.js` cria o objeto que
todo mundo compartilha; o `movement.js` monta todos os sistemas e roda o loop que
pulsa 60x por segundo.

---

## `state.js` — o objeto de estado central

`createState(now, groundY)` devolve **um único objeto** com todas as variáveis do pet.
Não há classes nem "objetos do pet" — é literalmente um saco de propriedades que os
sistemas leem e escrevem.

**Por que assim?** Porque dezenas de sistemas precisam saber coisas uns dos outros
(o movimento precisa saber se está dormindo; a fala precisa saber o humor; o tédio
precisa saber se está no colo...). Passar tudo por parâmetro seria um inferno. Um
estado compartilhado deixa cada sistema depender só do que precisa, sem imports
circulares.

O objeto é grande, mas está **agrupado por assunto** com comentários. Os grupos:

| Grupo | Exemplos | Quem usa |
|-------|----------|----------|
| posição/corpo | `restX`, `restY`, `anchor`, `reloc`, `bobPhase` | wander, liveAnimation |
| cursor global | `cursor`, `cursorVel`, `flinchUntil` | liveAnimation, boredom |
| assinatura | `signatureAnim`, `nextSignatureAt` | liveAnimation, personalityState |
| carinho | `affection`, `pettingNow`, `petCharge`, `petLean` | interactions, personalityState |
| parked | `parked`, `parkHome`, `awaitingParkAnswer` | interactions, wander |
| drag | `dragging`, `dragOffset*`, `releaseFall` | interactions, wander |
| rotação/escala | `spin`, `pokeVel`, `unfold`, `tiltX`, `scaleCur` | liveAnimation |
| energia | `sleeping`, `power` | boredom, shutdown |
| relógio de tédio | `lastInput`, `nextTickAt`, `tick`, `stretch`, `shutdown` | boredom, shutdown |
| humor | `personality`, `mode`, `zen`, `excitedState` | personalityState |
| conversa/UI | `chatOpen`, `askingQuestion`, `siteInfo`, `sysStats`, `bondLevel` | chat, curiosity, sysMonitor |
| vergonha/rubor | `pendingBurst`, `blushUntil`, `excitedCooldownUntil` | personalityState, effects |

> **Onde mexer:** se você criar uma nova variável de estado, **declare ela aqui** com
> um comentário curto. Não crie variáveis soltas no meio de um behavior — se outro
> sistema precisar, ninguém acha. O estado é a fonte única da verdade.

Detalhe: `mode` é o humor atual como string (`'normality'`/`'zen'`/`'excited'`), e
`personality` é o objeto de personalidade correspondente (de `personalities/*`). Os
dois são trocados juntos pela máquina de personalidade.

---

## `movement.js` — bootstrap + loop principal

Este arquivo é dividido em duas metades:

### Metade 1: a montagem (linhas ~25–187)

É pura **fiação**. Ele:

1. Inicia a cena (`initScene`) e pega o canvas e as divs de UI do HTML.
2. Cria o estado (`createState`) e ajusta a posição inicial no chão.
3. Cria CADA sistema de comportamento, injetando o que ele precisa. Repare no padrão:
   cada `createX({...})` ou `setupX({...})` recebe só suas dependências (o estado,
   o logger, o `speak`, etc.). É a "injeção de dependência" na unha.

A ordem de criação importa um pouco (uns dependem dos outros): `speak` antes de
`personalityCtl`; `bond` e `petMemory` antes do `brain`; `brain` antes do `chat`.

Repare em duas "pontes" montadas aqui:

- **Level-up durante shutdown** (linhas ~94–112): se o pet sobe de nível enquanto está
  apagado/dormindo, a celebração fica **pendente** (`pendingLevelUp`) e só toca quando
  ele religa — senão ele "comemorava" caído no chão.
- **Tint do site vs. aura** (linhas ~133–142): o `setTint` do site é embrulhado pra
  passar por `state.siteTint`; durante a zen_aura (dona da cor dourada) a troca fica
  em espera.

E também: o listener do **cursor global** (linhas ~151–164) que calcula a velocidade
suavizada do mouse (`cursorVel`) e chama `registerInput` (zera o tédio) quando o mouse
mexe de verdade.

### Metade 2: o loop `animate()` (linhas ~213–262)

Roda via `requestAnimationFrame` (~60fps). A cada frame:

```js
const delta = Math.min(clock.getDelta(), 0.1); // segundos desde o último frame (teto de 0.1s)
const t = clock.getElapsedTime();              // segundos totais desde o início
const now = performance.now();                 // relógio em ms
const idleSec = (now - state.lastInput) / 1000;// há quanto tempo sem input
```

> **Por que o teto de 0.1s no delta?** Se a aba fica em segundo plano e volta, o
> `delta` seria gigante e o pet "teleportaria". O teto limita o salto.

Depois:

1. **Vínculo por cafuné** (linhas ~223–239): acumula `delta` enquanto `pettingNow`;
   a cada 6s de carinho, +1.5 ponto de vínculo. O nocaute de amor vale +5.
2. **Decide o macro-estado**:
   - Se `state.shutdown` existe → só `updateShutdown()` (tem prioridade sobre tudo).
   - Senão → relógio de tédio + `updateAlive()` (a vida normal).
   - Exceção: durante a `zen_aura` (não interrompível), o relógio de tédio é pulado.
3. **`setShapeMode(state.mode)`** — forma acompanha o humor.
4. **`updateVisuals(...)`** — cores e luzes.
5. **`renderer.render(...)`** — desenha.

Há também um handler de `visibilitychange` (linhas ~204–211): quando a janela some/
volta, ele pausa o loop e descarta o tempo parado, pra não teleportar ao voltar.

---

## A ordem dentro de um frame (por que importa)

O grande cuidado do projeto é: **muita coisa escreve na mesma propriedade**. Por
exemplo, `gem.position.y` recebe contribuição de respiração, pulinho, pose da
personalidade, queda, sono... Se dois sistemas escrevessem "cru" em ordens diferentes,
um apagaria o outro e o pet tremeria.

A solução é que o `updateAlive()` (ver [04](04-MOVIMENTO.md)) **acumula tudo em
variáveis locais** (`sigY`, `hopY`, `vibeY`, `bob`...) e só no fim soma tudo e escreve
UMA vez em `gem.position.y`. Guarde essa lógica: quando for adicionar uma nova
"contribuição" de movimento, some ela na composição final, não escreva direto no gem.

Próximo: [04 – Movimento e pose](04-MOVIMENTO.md).
</content>
