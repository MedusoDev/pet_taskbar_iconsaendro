# 04 – Movimento e pose (`wander.js` + `liveAnimation.js`)

Estes dois arquivos fazem o pet **se mexer e parecer vivo**. O `wander.js` cuida de
"pra ONDE ele vai" (pairar num lugar, viajar pra outro, cair). O `liveAnimation.js`
cuida de "como ele SE MEXE naquele lugar" (respirar, girar, inclinar, pulinhos) e
compõe tudo num frame.

---

## `wander.js` — pra onde ele vai

A filosofia: a maior parte do tempo o pet **paira** em volta de um ponto-âncora, com
uma micro-deriva suave; de tempos em tempos ele **decide** ir pra outro lugar —
arrancada, viagem com aceleração/desaceleração, chegada. Intenção + pausa + arrancada,
em vez de deriva uniforme (que parecia fumaça, não bichinho).

### Conceitos-chave

- **`anchor`** — o ponto ao redor do qual ele paira.
- **`restX`/`restY`** — a posição "de descanso" calculada (o gem segue isso).
- **`reloc`** — se existe, ele está no meio de uma viagem: `{ x0,y0, x1,y1, start, dur }`.

### O "chão" por monitor: `groundAtX(state, x)` — linhas ~45–71

Esta é a função mais importante e mais sutil. Em vários monitores, cada tela pode ter
o rodapé/taskbar numa altura diferente. Dado um X de mundo, ela devolve o chão do
monitor **embaixo daquele ponto** — assim o pet "sobe pra flutuar" na borda de um
monitor mais baixo em vez de sumir.

Detalhe fino: perto da divisa entre dois monitores, o chão vira uma **rampa** (mistura
dos dois lados) numa faixa de 160px, senão o pet levava um "soco vertical" ao cruzar
a fronteira. Se você tem um monitor só, isso nunca dispara — cai no `state.groundY`
global.

### Agendar a próxima viagem: `scheduleNextRelocate` — linhas ~75–79

Usa um **intervalo exponencial** (processo de Poisson): `-log(1-random) * média`.
Isso dá intervalos irregulares de verdade, sem cadência perceptível — ele não muda de
lugar "a cada X segundos", muda "em média a cada X segundos, imprevisível". A média
vem de `personality.movement.hoverMeanSec`.

### Fazer a viagem: `startRelocate` e `updateRestPosition` — linhas ~84–207

- `startRelocate(...)` monta o `reloc`: duração proporcional à distância, modulada
  pela `movement.speed` da personalidade e por um `speedMul` (urgência — um susto usa
  `speedMul` alto pra fugir rápido).
- `updateRestPosition(...)` é chamada todo frame quando ele está acordado e livre:
  - Se há `reloc`, interpola `restX/restY` de x0→x1 com `smooth(p)` (ease-in-out).
  - Senão, paira: `restX = damp(restX, anchor + ruído)`. A deriva vertical quase
    some quando ele está pousado na taskbar (bichinho assentado, não bolha de sabão) e
    é normal quando flutua alto — controlado pelo `heightFactor`.
  - E decide quando começar a próxima viagem, respeitando um monte de "não agora":
    recebendo cafuné, no Excited (que segue o mouse por âncora), parado (parked),
    com chat/pergunta aberto, no meio de uma assinatura, etc.

### Escolher o destino: `pickWanderTarget` — linhas ~122–146

Às vezes um ponto aleatório; às vezes ele "vai fazer companhia pro mouse" (pousa perto
do cursor). A chance de visitar o mouse cresce com `movement.approach`; no Excited é
**sempre** o mouse. E na maioria das vezes o destino é o **chão** (`PERCH_CHANCE = 0.65`)
— parado ele assenta como bicho de verdade; flutuar é coisa de viagem.

### Cair ao soltar: `updateReleaseFall` — linhas ~236–257

Quando você solta ele do colo, vira uma queda com gravidade + **1 quique** e volta a
flutuar. Física simples: `vy -= gravidade * delta`, quica com 40% da energia.

---

## `liveAnimation.js` — como ele se mexe (o `updateAlive`)

Esta é a função central da "vida acordada". Ela roda todo frame (fora do shutdown) e
**monta a pose final camada por camada**. Vale ler ela inteira uma vez com calma —
é onde mais coisa acontece.

O padrão geral, de novo: **acumula contribuições em variáveis locais e soma no fim**.

### As camadas, na ordem em que aparecem

1. **Pose da personalidade** (linhas ~54–93). Primeiro pergunta pra máquina de
   personalidade (`personalityCtl.update`) se ela tem uma pose própria pra este frame
   (a respiração do Zen, a explosão do Excited...). Se tiver (`zenPose`), ela tem
   prioridade. Senão, roda a **assinatura** normal da personalidade (a shimmy do
   Excited, por ex.) se estiver na hora. Tudo isso vira `sigY`, `sigZ`, `sigScale`,
   `sigUnfold`, `sigSpinMul`.

2. **Carinho / medidor** (linhas ~95–100): decai `affection` quando não há cafuné;
   `petLean` (o quanto ele "derrete" pro carinho) persegue 0/1 por `damp`.

3. **Pulinhos e vibração do Excited** (linhas ~102–131): só nas fases de perseguição.
   Pulinhos tentando alcançar o cursor (`hopY`), tremedeira de excitação (`vibeZ/vibeY`)
   e o **heartbeat** (pulso de escala "tum-tum" enquanto persegue). Note os cuidados
   de NÃO agendar pulinho durante a shimmy (senão dois sistemas escrevem o Y e vira um
   salto duplo).

4. **Corações flutuantes e flerte espontâneo** (linhas ~137–161): dispara efeitos de
   coração nas fases certas, e de tempos em tempos (só no Normality, com vínculo ≥ 1)
   ele puxa assunto sozinho (`speak('flirt1..4')`).

5. **Rotação base** (linhas ~163–172): a velocidade de giro **varia por ruído** (nunca
   metrônomo), modulada por `movement.spin`, pela assinatura e pelo carinho (recebendo
   cafuné ele gira mais devagar — "derrete"). Some o impulso de cutucão (`pokeVel`),
   que decai sozinho.

6. **Curiosidade + espaço pessoal do cursor** (linhas ~174–308): calcula onde o gem e
   o cursor estão em pixels, e daí:
   - o **olhar** (`lookYaw`/`lookPitch`) mira o cursor, com ganho maior quando perto/
     devagar ou perseguindo;
   - **susto**: cursor voando pra cima dele rápido demais → esquiva pro lado oposto;
   - **poleiro**: se estacionado e o cursor passa calmo, acena;
   - **volta pro poleiro**: se saiu do lugar prometido (susto/queda), volta exato;
   - **seguir o mouse** (Excited) ou **gravitar** (cursor parado por perto).

   Esta é a seção mais densa. Cada `if` tem um comentário explicando POR QUE ele só
   vale em certos modos — quase sempre pra dois sistemas de pose não brigarem.

7. **Tiques** (linhas ~310–323): pulinho ou giro seco de impaciência (agendados pelo
   relógio de tédio).

8. **Espreguiçada e tonta** (linhas ~325–348): envelopes temporários de unfold/escala
   e de rotação Z.

9. **Respiração / unfold** (linhas ~353–364): `breathePhase` avança por ruído; o alvo
   de unfold soma respiração + espreguiçada + susto + assinatura + carinho, tudo
   limitado a [0,1], perseguido por `damp`, e finalmente **`applyUnfold(state.unfold)`**
   (a única chamada que de fato deforma o corpo — ver [02](02-CENA-3D.md)).

10. **Posição final** (linhas ~366–398): o `bob` (balanço) por ruído, um **amortecedor
    de corte seco** (`poseResidueY`) que suaviza saltos bruscos de pose, e aí escolhe:
    arrastando → `syncFromDrag`; caindo → `updateReleaseFall`; acordado →
    `updateRestPosition` + soma de todas as contribuições no `gem.position.y`;
    dormindo → `updateSleepPosition`.

11. **Escala** (linhas ~400–409): 1 + espreguiçada + "juice" (estica na arrancada,
    amassa na chegada) + carinho + heartbeat, perseguido por `damp`.

12. **Inclinação pela velocidade** (linhas ~411–436): mede a velocidade real do gem e
    "deita" ele na curva (`bankZ`) e sobe/desce o nariz (`pitchVel`). Compõe a rotação
    final: `mesh.rotation.y/x/z` recebem a soma de spin + olhar + tiques + tilts +
    tonta + banking + assinatura + vibração.

13. **UI grudada no gem** (linhas ~438–486): posiciona o "zzz", o ícone do site, o
    balão de fala, a barrinha de carinho, o balão de pergunta e o painel de chat —
    todos seguem o gem em X e Y. E dispara o respingo/blush pendentes.

> **Onde mexer (exemplos):**
> - Ele gira rápido demais? O `0.28` na rotação base (linha ~167).
> - A respiração é forte demais? Os fatores no `breathe` (linhas ~355–357).
> - Quer mudar o quanto ele "deita" nas curvas? O `-0.055` do `bankZ`.
> - O olhar segue pouco/muito o mouse? Os `0.45`/`0.35` e os limites em `wantYaw/wantPitch`.

Próximo: [05 – Personalidades](05-PERSONALIDADES.md).
</content>
