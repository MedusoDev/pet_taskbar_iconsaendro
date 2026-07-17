# Catálogo de animações e comportamentos — v1.2

Referência de tudo que o pet faz e como funciona. Nomes são identificadores
de conversa/código, não strings visíveis. Fonte da verdade: o código em
`renderer/` — este arquivo é o mapa.

## Arquitetura rápida

- `movement.js` — bootstrap + loop principal (um frame = boredom clock →
  `updateAlive` OU `updateShutdown` → `updateVisuals` → render).
- `behaviors/state.js` — objeto de estado único compartilhado por todos os sistemas.
- `behaviors/liveAnimation.js` — compõe quadro a quadro tudo que não é shutdown.
- `behaviors/wander.js` — pairar (hover) + viagens (relocate) + queda do drag.
- `behaviors/boredom.js` — relógio de tédio e reação a input.
- `behaviors/shutdown.js` — evento shutdown (+ variante nocaute do much_petting).
- `behaviors/interactions.js` — mouse: cutucão, drag, cafuné, click-through.
- `behaviors/personalityState.js` — máquina de personalidade (Normality ⇄ Zen ⇄ Excited).
- `behaviors/effects.js` — efeitos DOM: respingo de gotículas + blush "///".
- `behaviors/prompt.js` — balão de pergunta clicável (Park/Unpark).
- `behaviors/affectionBar.js` — barrinha de carinho + aura de supercarga.
- `behaviors/speech.js` / `siteEye.js` — balão de fala / reação ao site ativo.
- `personalities/` — Normality, Zen e Excited (paleta, movimento, assinatura, falas).

## Contínuas (sempre ativas)

| Nome | O que faz | Onde |
|---|---|---|
| **Hover** | paira em volta de um poleiro (âncora) com micro-deriva por ruído Simplex — o estado da maior parte do tempo | `wander.js` → `updateRestPosition` |
| **Relocate** | de tempos em tempos (agenda irregular estilo Poisson, média por personalidade) *decide* mudar de poleiro: arrancada → viagem ease-in-out → chegada. Às vezes a viagem é "de visita" ao mouse (chance sobe com `approach`) | `startRelocate` / `scheduleNextRelocate` / `pickWanderTarget` |
| **Body Feel** | o corpo sente o movimento: inclina (bank) na direção da velocidade, estica na arrancada, amassa na chegada | `liveAnimation.js` → `bankZ`/`pitchVel` + `takeoffAt`/`landAt` |
| **Breathe** | desdobramento sutil das 80 faces, com ritmo E amplitude vagando por ruído (sem frequência fixa) | `breathePhase` → `applyUnfold` |
| **Organic Tilt** | inclinação orgânica em X/Z + spin em Y com velocidade vagando por ruído (nunca metrônomo) | `tiltX` / `tiltZ` / `spinRate` |
| **Face Mood** | cada uma das 80 faces troca de cor sozinha dentro da paleta da personalidade ativa, cada uma no seu ritmo | `scene.js` → `updateVisuals` |
| **Emissive Pulse** | o brilho geral pulsa entre as duas cores-âncora da paleta (+ tint do Ico_Eye por cima quando ativo) | `scene.js` → `updateVisuals` |

## Reativas a input

| Nome | Gatilho | O que faz |
|---|---|---|
| **Gaze** (olhar curioso) | mouse em qualquer lugar da tela (cursor global via IPC) | inclina o "olhar" (yaw/pitch) na direção do cursor; ganho maior perto/devagar, em visita ao mouse, ou empolgado |
| **Poke** (cutucão) | clique nele (sem arrastar) | giro de peão (`pokeVel`) decaindo + facetas abrem a 0.8 |
| **Dizzy** (tontura) | 3+ cliques em 2.5s | cambaleia em Z por 2.6s, decaindo |
| **Drag** | segurar e mover o mouse sobre ele | sai do Hover e segue o cursor, encolhe levemente (0.92) enquanto seguro |
| **Drop** (soltar do drag) | soltar o botão | cai com gravidade, 1 quique, reancora onde caiu |
| **Petting** (cafuné) | esfregar o cursor em cima dele (2+ inversões de direção em 1s engatam; depois qualquer movimento sobre ele mantém; 400ms parado encerra) | enche `state.affection` (até 1.2), derrete: gira mais devagar, "encosta" (`petLean`), facetas abrem um tico. Enquanto rola, ele não sai andando (Relocate adiado) e não se assusta |
| **Flinch** (susto) | cursor voando >1300px/s pra cima dele (não vale durante cafuné nem no Excited) | esquiva rápida pro lado oposto + arrepio; cooldown 5s |
| **Approach** | cursor parado/lento bem perto | o poleiro gravita na direção do cursor conforme `approach` da personalidade |
| **Park** (estacionar) | segurar ele no colo por 3s | aparece um balão de pergunta clicável (`prompt.js`): "Quer que eu fique paradinho aqui?" — ao soltar o mouse ele NÃO cai, fica pairando esperando a resposta. Clicou "Fica aqui" → `parked`: sem Relocate, sem Approach, sem perseguição do Excited; só as animações de corpo (hover no lugar, breathe, tilt, tédio). Sem resposta em 8s, o balão some e ele volta ao normal |
| **Unpark** (liberar) | clicar nele enquanto estacionado | em vez de cutucão, pergunta "Posso voltar a passear?" — clicou "Pode ir!" → volta a vagar. Arrastar ele estacionado funciona: ele re-estaciona onde for solto |
| **Click-through** | mouse fora do gem | clique passa pro que está embaixo (estrutural, via `setIgnoreMouseEvents`); o balão de pergunta também segura o clique quando o cursor está sobre ele |

## Relógio de tédio (zera com qualquer input; segundos parado)

Suprimido inteiro no modo Excited e durante shutdown/zen_aura.

| Nome | Quando | O que faz |
|---|---|---|
| **Fidget** (tiques) | a partir de 14s, repete a cada 4–9s | sorteia 1 de 3: **Hop** (pulinho) / **Shake** (giro seco vai-e-volta) / **Shiver** (arrepio nas facetas) |
| **Stretch** (espreguiçada) | 32s, 1x por ciclo | facetas abrem + escala +5%, envelope sobe-segura-desce, 4.2s |
| **Shutdown Event** | sorteado entre 30–50s, 1x por ciclo | desliga (luzes caem, cor escurece, facetas fecham) → cai → quica 2x → religa assustado → flutua de volta. **Prioridade sobre tudo** enquanto ativo |
| **Sleep** | 65s | pousa no chão, rotação quase nula, emissive baixo, facetas quase fechadas, "z z z" flutuando ao lado |
| **Wake Startle** | qualquer input dormindo | facetas saltam pra 1.0 + giro rápido; reancora onde estava e volta a flutuar |

## Eventos de calendário

| Nome | Gatilho | O que faz |
|---|---|---|
| **Hourly Backflip** | virada de hora cheia | backflip completo em X, 1.15s |

## Ico_Eye

| Nome | Gatilho | O que faz |
|---|---|---|
| **Site Tint** | janela ativa do navegador muda de categoria (Spotify 🎵 / Email ✉️ / X ✕) | tinge cor + emissive na cor da categoria, ícone flutuando acima do gem, fala só quando a categoria MUDA |

## Máquina de personalidade (`personalityState.js`)

Normality é a base; Zen e Excited são alcançados por comportamento do
usuário e sempre voltam pro Normality. Cada personalidade tem paleta,
parâmetros de movimento (`hoverMeanSec/speed/micro/approach/spin/yRange`) e
banco de falas próprios. A troca de paleta é sempre suave: as faces
perseguem as cores novas por lerp sozinhas.

```
Normality ──(tecla Z, gatilho manual de teste)──▶ Zen (zen_breathing)
  Zen ──(2min contínuos respirando)──▶ zen_aura ──(termina)──▶ Normality
  Zen ──(carregado bem alto e solto)──▶ Normality
  Zen ──(cafuné contínuo ~6s)──▶ zen_much_more_excited ──▶ Excited
Normality ──(barra cheia + cafuné contínuo ~4s = supercarga)──▶ Excited
  Excited ESTACIONADO (parked): trapped — implora ofegante pra sair
    trapped ──(unpark)──▶ rush: barra cheia, corre pro mouse ──(chegou a
      <90px)──▶ solta as gotículas + blush ──▶ Normality
    trapped ──(14s sem liberar)──▶ se acaba ali mesmo ──▶ Normality
  Excited: need_you (persegue/orbita o mouse) ──▶ please_pet (implora carinho)
    please_pet ──(sem carinho 5s)──▶ Normality (desiste)
    please_pet ──(carinho 3s)──▶ shy (Shy Exit) ──▶ Normality
      shy ──(carinho continua na janela de 15s)──▶ shy2 (Much Petting)
        shy2 ──▶ nocaute: shutdown + z z z por ~1min ──▶ Normality
```

### Zen (paleta azul/ciano/verde-água, movimento lento)

| Nome | Gatilho | O que faz |
|---|---|---|
| **zen_breathing** | assinatura do Zen (pose com prioridade, repetível) | facetas afastam e voltam em 3 respirações por ciclo de 4.6s, spin desacelera junto. Entrar no Zen estacionado tem fala própria ("perfeito pro autocontrole") — ele não pede pra sair |
| **zen_aura** | 2min contínuos respirando | evento único NÃO interrompível (6.5s): levita 1.4 mais alto, facetas 0.55, spin quase para, tint dourado. Ao terminar volta pro Normality |
| **zen_much_more_excited** | cafuné contínuo ~6s durante o breathing | transição de 3.2s: treme cada vez mais forte, infla, gira acelerando, tint vermelho — e "explode" no Excited |

### Excited (paleta rosa/vermelho/roxo, movimento rápido)

| Nome | Gatilho | O que faz |
|---|---|---|
| **Excited Chase** | fase need_you/please_pet, mouse em movimento | segue o mouse continuamente por âncora, a tela toda. Sem Relocate, sem tédio, sem Flinch — nada trava a perseguição |
| **Excited Hops** | durante a perseguição | pulinhos (0.85) a cada 1.1–2.4s tentando alcançar o cursor |
| **Orbit** (órbita de empolgação) | need_you + cursor parado (<160px/s) + sem cafuné rolando | dá voltas em elipse em torno do cursor (raio ~3.2×1.8, ~2.2rad/s) em vez de só encostar do lado; mouse voltou a mexer → volta pra perseguição |
| **Vibe** (vibração de excitação) | qualquer fase de perseguição | pulsos curtos (450ms, a cada 2.2–5s) de tremedeira de alta frequência em Z + y — não consegue ficar parado |
| **Shimmy** | assinatura, a cada 6–12s | requebra de charme: Z oscila decaindo + pulinho + facetas |
| **Trapped** (preso estacionado) | Excited disparado com `parked` ativo | não persegue: fica no lugar respirando ofegante (facetas pulsando rápido, pulinhos, tremidinha), implorando pra sair a cada 2–3.5s; o clique nele mostra a súplica "ME SOLTA! Por favor—" [Vai!]. Sem liberar em 14s → se acaba ali mesmo (gotículas + blush) e volta pro Normality |
| **Rush** (liberado) | unpark durante o Trapped | sai com a barra de carinho CHEIA (1.2) correndo pro mouse; ao chegar a <90px solta as gotículas + blush, alivia e volta pro Normality |
| **need_you** | fase inicial (8–13s) | persegue/orbita jogando falas de coraçõezinhos (💜) a cada 1.2–2s |
| **please_pet** | após need_you | vai até o mouse e implora carinho; sem carinho por 5s desiste e volta pro Normality |
| **Shy Exit** | carinho 3s acumulados no please_pet | gotículas brancas espirram em arco (`effects.burstLiquid`), blush "///" rosado acende na bochecha, para de perseguir, treme de vergonha e murcha devagar por 4.2s → Normality. Blush fica mais 2.5s; supercarga em cooldown 30s |
| **Rubor** | cafuné ainda rolando na hora que o shy termina | a paleta do Excited (rosa/vermelho) se mantém enquanto o carinho continuar (teto de 8s) — solta quando o carinho para e derrete de volta pro roxo/âmbar por lerp. Nocaute não tem rubor (apaga escuro) |
| **Much Petting** | carinho contínuo ~2.5s dentro de 15s após o Shy Exit | reincide direto na sobrecarga (shy2), MUITO mais intensa: 3.5s tremendo forte, pulando, facetas 0.5, spin 3–7x, respinga 2x com intensidade 2.2x. No fim **apaga** |
| **Knockout** (nocaute) | fim do shy2 | shutdown variante nocaute: desliga em 0.5s (exausto), cai, quica — e fica dormindo apagado com "z z z" por 60s. Religa assustado e volta ao Normality; supercarga em cooldown 2min; se estava no colo, escorrega |

### Supercarga (Normality → Excited)

Barra de carinho cheia (≥1.0) + cafuné continuando → uma aura dourada/
vermelha cresce no coração da barrinha (`state.petCharge`, enche em ~4s,
esvazia em ~2s se parar). Cheia → entra no Excited. Bloqueada durante os
cooldowns de vergonha/nocaute.

## UI que acompanha o gem

| Elemento | Quando aparece |
|---|---|
| **Barrinha de carinho** (`affectionBar.js`) | enquanto há afeição acumulada ou cafuné rolando; transborda dourado acima de 1.0; coração 💜 com aura de supercarga |
| **Balão de fala** (`speech.js`) | fala sorteada do banco da personalidade por gatilho; cooldown 6s (gatilhos de personalidade forçam); some em 3.5s |
| **z z z** | dormindo (Sleep) e no Knockout (posicionado pelo próprio shutdown) |
| **Ícone de site** (Ico_Eye) | categoria de site ativa |
| **Blush "///"** (`effects.js`) | Shy Exit / Much Petting, grudado na bochecha |

## Regras de prioridade (estados excludentes)

- **Shutdown Event** (incluindo Knockout) ativo suprime tudo: vida inteira
  (`updateAlive` não roda), tédio, drag, cutucão e cafuné.
- **zen_aura / zen_much_more_excited** são não interrompíveis: bloqueiam
  relógio de tédio, Relocate, drag e cutucão até terminarem.
- **Excited** suprime o relógio de tédio inteiro (Fidget/Stretch/Shutdown/
  Sleep), o Relocate e o Flinch. Nas fases **shy/shy2** a perseguição,
  os pulinhos, a órbita e a vibração também param.
- **Sleep** suprime Gaze, Fidget, Stretch, Relocate.
- **Drag** suprime Hover/Relocate; ao soltar entra em **Drop** e só depois
  volta ao normal.
- **Cafuné em andamento** adia Relocate e imuniza contra Flinch.
- **Parked** suprime Relocate, Approach e a perseguição/órbita do Excited —
  mas cutucão (vira a pergunta de liberar), cafuné, drag e tédio continuam.
  Zen estacionado é bem-vindo (autocontrole); Excited estacionado vira
  **Trapped** (implora pra sair).
- A janela ancora sempre no rodapé da tela: taskbar embaixo usa o workArea;
  taskbar oculta (auto-hide) ou em outra borda usa o fundo do monitor
  (`main.js` → `getWindowBounds`).
- Poses da máquina de personalidade (zen_breathing/zen_aura/transição/
  shy/shy2) têm prioridade sobre a assinatura normal (Shimmy etc.).
- Qualquer input zera o relógio de tédio; Fidget/Stretch em andamento
  TERMINAM sozinhos (são curtos — cortar dava pop de pose). Se dormia,
  Wake Startle.
- Transições de idle (Zen, Sleep, Shutdown, Stretch) esperam o corpo ficar
  livre: nunca disparam no meio de tique, espreguiçada, tonta ou viagem
  (`boredom.js`). O fim do Shutdown reancora o pet onde ele caiu e NÃO
  zera o relógio de idle (senão o Zen dos 60s nunca chegava).
- Cortes secos residuais no Y da pose (troca de fase, assinatura cancelada)
  são absorvidos por um amortecedor de descontinuidade em `liveAnimation.js`
  (resíduo que decai em ~250ms).
- Tint: durante zen_aura/transição, o tint do Ico_Eye fica em espera em
  `state.siteTint` e é restaurado na saída do zen.

---

*Gerado a partir do estado do código em `renderer/` na v1.2.*
