# Catálogo de animações e interações — v1.1 (em andamento)

Referência de tudo que o pet já faz. Nomes são só identificadores de
conversa/código, não strings visíveis em lugar nenhum.

## Contínuas (sempre ativas)

| Nome | O que faz | Onde |
|---|---|---|
| **Hover** | paira em volta de um poleiro (âncora) com micro-deriva por ruído Simplex — é o estado da maior parte do tempo | `movement.js` → bloco "Pairando" |
| **Relocate** | de tempos em tempos (agenda irregular estilo Poisson, média por personalidade) *decide* mudar de poleiro: arrancada → viagem ease-in-out → chegada | `startRelocate` / `scheduleNextRelocate` |
| **Body Feel** | o corpo sente o movimento: inclina (bank) na direção da velocidade, estica na arrancada, amassa na chegada | `bankZ`/`pitchVel` + `takeoffAt`/`landAt` |
| **Breathe** | desdobramento sutil das 80 faces, com ritmo E amplitude vagando por ruído (sem frequência fixa) | `breathePhase` → `applyUnfold` |
| **Organic Tilt** | inclinação orgânica em X/Z + spin em Y com velocidade vagando por ruído | `tiltX` / `tiltZ` / `spinRate` |
| **Face Mood** | cada uma das 80 faces troca de cor sozinha entre a paleta roxo/âmbar, cada uma no seu ritmo | `scene.js` → `updateVisuals` |
| **Emissive Pulse** | o brilho geral pulsa entre roxo e âmbar (+ tint sutil da personalidade do dia por cima) | `scene.js` → `updateVisuals` |

## Reativas a input

| Nome | Gatilho | O que faz |
|---|---|---|
| **Gaze** (curiosidade/olhar) | mouse em qualquer lugar da tela (não só na janela) | inclina o "olhar" (yaw/pitch) na direção do cursor |
| **Poke** (cutucão) | clique nele (sem arrastar) | giro de peão (`pokeVel`) decaindo + facetas abrem a 0.8 |
| **Dizzy** (tontura) | 3+ cliques em 2.5s | cambaleia em Z por 2.6s, decaindo |
| **Drag** | segurar e mover o mouse sobre ele | sai do Hover e segue o cursor, encolhe levemente (0.92) enquanto seguro |
| **Drop** (soltar do drag) | soltar o botão do mouse | cai com gravidade, 1 quique, reancora onde caiu e volta ao Hover |
| **Flinch** (susto de proximidade) | cursor voando rápido (>1300px/s) pra cima dele | esquiva rápida pro lado oposto + arrepio nas facetas; cooldown de 5s |
| **Approach** (aproximação curiosa) | cursor parado/lento bem perto dele | olhar acompanha mais forte; o poleiro gravita na direção do cursor conforme o `approach` da personalidade (Manhoso = 1.0, Sonolento = 0.15) |
| **Click-through** | mouse fora do gem | clique passa pro que tá embaixo (taskbar, janelas) — interação estrutural, não visual |

## Relógio de tédio (zera com qualquer input; contagem em segundos parado)

| Nome | Quando dispara | O que faz |
|---|---|---|
| **Fidget** (tiques de impaciência) | a partir de 14s, repete a cada 4–9s | sorteia 1 de 3: **Hop** (pulinho) / **Shake** (giro seco vai-e-volta) / **Shiver** (arrepio nas facetas) |
| **Stretch** (espreguiçada) | 32s parado, 1x por ciclo de tédio | facetas abrem + escala +5%, envelope sobe-segura-desce, 4.2s |
| **Shutdown Event** | sorteado entre 30–50s parado, 1x por ciclo | desliga (luzes caem, cor escurece, facetas fecham) → cai com gravidade → quica 2x → religa assustado (facetas 0.9 + olhar trêmulo) → flutua de volta ao lugar. **Tem prioridade sobre tudo o resto** enquanto ativo |
| **Sleep** (dormir) | 65s parado | para o Drift, pousa no chão, rotação quase nula, emissive baixo, facetas quase fechadas, "z z z" flutuando ao lado |
| **Wake Startle** (susto ao acordar) | qualquer input enquanto dorme | facetas saltam pra 1.0 + giro rápido; volta a flutuar |

## Eventos de calendário

| Nome | Gatilho | O que faz |
|---|---|---|
| **Hourly Backflip** | virada de hora cheia (ex: 14:59→15:00) | backflip completo em X, 1.15s |

## Ico_Eye (v1.1)

| Nome | Gatilho | O que faz |
|---|---|---|
| **Site Tint** | janela ativa do navegador configurado muda de categoria (Spotify/Email/X) | tinge cor + emissive do gem na cor da categoria, ícone flutuando acima (🎵/✉️/✕) |

## Regras de prioridade (estados excludentes)

- **Shutdown Event** ativo suprime tudo: Fidget, Stretch, Drift, Gaze, Drag (não dá pra segurar durante o shutdown).
- **Sleep** suprime Gaze, Fidget, Stretch, Drift.
- **Drag** suprime Drift enquanto durar; ao soltar, entra em queda (**Drop**) e só depois volta a fazer Drift.
- Qualquer input (mouse na tela, clique ou drag) zera o relógio de tédio e cancela Fidget/Stretch em andamento; se estava dormindo, dispara Wake Startle.

---

*Gerado a partir do estado do código em `renderer/movement.js` e `renderer/scene.js` na v1.1.*
