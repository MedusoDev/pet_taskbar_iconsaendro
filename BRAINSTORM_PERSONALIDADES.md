# Brainstorm — Sistema de Personalidades v2

Status (2026-07-16): **Normality, Zen e Excited implementados**
(código abaixo). Máquina de estados completa: Normality ⇄ Zen ⇄ Excited.

## Implementação atual

```
Normality ──(tecla Z)──▶ Zen (zen_breathing: imóvel, respira, sem viajar)
  Zen ──(2min contínuos em zen_breathing)──▶ zen_aura ──(termina)──▶ Normality
  Zen ──(carregado bem alto [+14] e solto)──▶ Normality
  Zen ──(carinho contínuo por 20s)──▶ zen_much_more_excited (treme/vermelho) ──▶ Excited
    Excited: need_you (segue o mouse, corações) ──▶ please_pet (pede carinho)
      please_pet ──(carinho demais, 8s acumulados)──▶ Normality (envergonhado)
      please_pet ──(5s sem carinho)──▶ Normality (desiste)
```

- `renderer/personalities/normality.js` — base, paleta roxo/âmbar
  original, sem `signature` própria.
- `renderer/personalities/zen.js` — `signature` = `zen_breathing` (loop
  contínuo enquanto imóvel, não mais um evento periódico de 4.6s solto).
  `zenAura` = evento único, não interrompível, encerra o Zen ao terminar.
  Linha nova `zen_annoyed` pro `zen_much_more_excited`.
- `renderer/personalities/excited.js` — **substitui `ousado.js`**. Só é
  alcançada via `zen_much_more_excited`, nunca direto do Normality. Linhas
  `need_you`, `please_pet`, `please_pet_shy` (saída por excesso),
  `please_pet_giveup` (saída por abandono).
- `renderer/behaviors/personalityState.js` — reescrito por completo.
  `state.mode` agora é `'normality' | 'zen' | 'excited'`. Zen guarda
  `state.zen = { breathing, aura, transition, pettingStreakStart }`;
  Excited guarda `state.excitedState = { phase: 'needYou'|'pleasePet', ... }`.
- **Removido o sistema antigo** de "carinho geral ≥ 0.65 vira Ousado"
  (`state.excited` boolean + `OUSADO` em `liveAnimation.js`) — esse era um
  atalho de Normality direto pro modo quente que contradizia a regra nova
  ("só a partir do Zen"). `state.affection`/`petLean` continuam existindo
  só pro bookkeeping visual do carinho (encolher/derreter), sem mais
  disparar troca de personalidade sozinhos.
- **Gatilho manual de teste**: tecla **Z** entra no Zen a partir do
  Normality. O timer automático de "2min sem interação → Zen" continua
  desligado, por pedido.
- `zen_aura` e `zen_much_more_excited` reaproveitam a mesma flag
  `state.zenAuraActive` pra bloquear poke/drag-novo/petting e suprimir o
  relógio de tédio; e cancelam qualquer `reloc` em andamento na hora que
  começam (não pulam de tela no meio da animação).
- `zen_breathing` bloqueia só a viagem entre poleiros
  (`state.zenBreathingActive` em `wander.js`) — poke, drag e carinho
  continuam liberados (é assim que dá pra testar o gesto de
  levantar-e-soltar, e pra carinho contínuo dar aupgrade pro
  zen_much_more_excited).
- `need_you`/`please_pet` reaproveitam o motor de "seguir o mouse"/hop que
  já existia (antes ligado a `state.excited`), agora gatilhado por
  `state.mode === 'excited'`.

## Pontos conhecidos, não resolvidos

- "Corações" do `need_you` são só falas (`💜` no balão de fala) — não há
  sistema de partículas no código, então não tem coraçãozinho flutuando de
  verdade. Se quiser isso visualmente, precisa de um elemento novo (tipo o
  `zzzEl`/`site-icon`) e uma pequena animação CSS.
- `please_pet` não força o pet a ficar fisicamente colado no cursor — ele
  só fica com `visitChance` sempre 1 (sempre "visita" o mouse quando decide
  viajar) mais o follow-mouse direto já existente. Pode não parecer
  "implorando bem debaixo do cursor" o tempo todo.
- Threshold de "carregado bem alto" (14 unidades de mundo) e os tempos
  (20s carinho, 8s excesso, 5s timeout, 2min escalada) são palpites
  iniciais — ajustar depois de testar.

## Brainstorm original / cruzamento com o código (histórico)

## Estado atual do código (referência)

- `personalities/index.js`: alternância **estrita por dia par/ímpar** entre
  `ousado` e `tranquilo`. Não há transição em runtime — a personalidade só
  muda à meia-noite.
- Só existem **2** personalidades no código (`ousado`, `tranquilo`). O
  brainstorm propõe uma 3ª (`Base/Idle`) e redefine `ousado` como `Excited`.
- Cada personalidade já tem: `palette`, `movement` (hoverMeanSec, speed,
  micro, approach, spin, yRange), uma `signature` (animação exclusiva) e
  `lines` (falas por gatilho: poke, dizzy, fidget, sleep, wake, drag,
  site_*, petting, excited, calmdown).
- Já existe a noção de `petting → excited → calmdown` nas *falas*, mas não
  como máquina de estado real (sem medidor, sem transição de personalidade).

## 1. Base / Idle (Normal)

Comportamento: igual ao movimento atual (wander/hover), observa o que o
usuário acessa no navegador (via `Ico_Eye`/`siteEye.js`), comenta ocasional.

| Animação (brainstorm) | Equivalente no código atual | Status |
|---|---|---|
| tick (pulinho / giro seco / arrepio) | Fidget → Hop / Shake / Shiver | ✅ já existe |
| stretch | Stretch (espreguiçada, 32s parado) | ✅ já existe |
| dizzy (3+ cliques) | Dizzy | ✅ já existe |
| flip (hora cheia) | Hourly Backflip | ✅ já existe |
| poke | Poke | ✅ já existe |
| drag/release | Drag / Drop | ✅ já existe |
| sleep/wake | Sleep / Wake Startle | ✅ já existe |
| shutdown | Shutdown Event | ✅ já existe |
| respiração/bob/tilt contínuos | Breathe / Organic Tilt | ✅ já existe (idle motion de fundo) |
| **petting → medidor → excited** | falas `petting`/`excited`/`calmdown` já existem, mas **sem medidor nem troca de personalidade** | ❌ falta implementar (máquina de estado + UI de medidor?) |

Conclusão: a personalidade **Base é essencialmente o que já existe hoje**
como comportamento genérico do pet, mas hoje não existe como entidade
separada — o motor de movimento/animações de base não depende de qual das
duas personalidades (`ousado`/`tranquilo`) está ativa.

## 2. Zen (Tranquila)

Já existe no código como `tranquilo`: `speed: 0.7`, `hoverMeanSec: 12`,
menos pulos. As 3 animações novas descritas não existem ainda:

- **`zen_aura`** — anda quase parado, levita mais alto, aura
  azul/dourado/laranja ao redor, cubo vai tomando tons dourados, aura some,
  volta ao zen normal. **Não interrompível** por clique/movimento até
  terminar. Falas: "Quase virei um ser vivo", "Quase eu toquei o user no
  físico...".
  - Nota: isso é parecido em espírito com a `signature` atual do
    `tranquilo` ("Zen Float"/meditação) — pode ser uma evolução dela, ou uma
    2ª assinatura exclusiva.
- **`zen_breathing`** — várias respirações seguidas (facetas afastam/voltam,
  tipo stretch ampliado). Diferente de `zen_aura`: **pode mover o pet**
  durante a animação, só não sai dela antes do tempo. Fala motivacional
  (calma).
- **`zen_much_more_excited`** — transição/gatilho: petting excessivo no
  modo zen → falas de reclamação ("atrapalha minha concentração") → perde
  azul, fica vermelho progressivamente → "explode" → **troca de
  personalidade para Excited**.

Pontos em aberto:
- `zen_aura` e `zen_breathing` competem entre si e com o resto do
  relógio de tédio atual (Fidget/Stretch/Sleep)? Precisam de janela própria
  de agendamento ou reaproveitam o "ciclo de tédio" existente?
- `zen_much_more_excited` implica um **medidor de petting acumulado**
  específico do modo zen — é o mesmo medidor do item de Base/petting, ou
  outro?

## 3. Excited (Animado/Ousado)

Já existe no código como `ousado`: `speed: 1.2`, `hoverMeanSec: 6`, mais
pulos/spin. As 2 animações novas descritas não existem ainda:

- **`need_you`** — passa a seguir o cursor do mouse, jogando coraçõezinhos.
  (Hoje `approach: 1.0` já faz o poleiro gravitar pro cursor parado, mas
  "seguir o mouse ativamente seguindo pra todo lugar" + partículas de
  coração é novo.)
- **`please_pet`** — vai até o mouse pedir carinho.
  - Com carinho: solta muitos corações; carinho **excessivo/repetido**:
    solta "líquido branco", fica envergonhado, **sai do modo excited**.
  - Sem carinho: **sai do modo** sozinho e volta pra Base.

Pontos em aberto:
- Ambas as saídas de `please_pet` (com ou sem carinho) levam pra **Base**,
  não para Zen — confirma que o fluxo é
  `Base → (zen ocasional) → zen_much_more_excited → Excited → please_pet → Base`?
  Ou Excited pode voltar direto pra Zen também?
- "Líquido branco" ficando envergonhado — confirmar se é uma referência
  cômica pretendida mesmo (pra não ficar ambíguo/pesado no tom do resto do
  pet) ou se é um placeholder de outra ideia.

## Perguntas em aberto (arquitetura, para decidir depois)

1. Trocar a seleção de personalidade de "sorteio por dia par/ímpar" para
   "estado dinâmico por comportamento" (Base default; Zen e Excited
   acessados por gatilho) — confirmado como próximo passo a decidir, ainda
   **não decidido nesta sessão**.
2. Precisa de uma personalidade `Base` de verdade no código (`base.js`,
   paleta própria, `movement` próprio) ou ela é só "o estado sem
   `tranquilo`/`ousado` ativo", herdando o motor default?
3. O "medidor de carinho" (petting meter) é um estado novo a persistir
   (`state.js`?) compartilhado entre as 3 personalidades, com thresholds
   diferentes por personalidade (Base→Excited vs Zen→Excited)?
4. `zen_aura` sendo não-interrompível é uma exceção às regras de
   prioridade atuais do `ANIMATIONS.md` (que hoje só dão essa prioridade
   pro Shutdown Event) — precisa entrar na tabela de "Regras de
   prioridade".

## Máquina de estados definida (v1, confirmada)

Renomeando: a personalidade Base passa a se chamar **Normality**. Zen e
Excited deixam de ser "sorteadas por dia" e passam a ser **estados
alcançados por comportamento do usuário**, sempre voltando pro Normality.

```
Normality
  │  2min sem NENHUMA interação (mouse/clique/drag) — timer reseta a
  │  cada interação, igual ao relógio de tédio atual
  ▼
Zen
  │  roda zen_breathing (repetível, várias vezes) e, ocasionalmente,
  │  zen_aura
  │
  ├─ zen_aura termina normalmente → volta pro Normality
  │
  └─ +20s de petting contínuo (só conta a partir do Zen) → dispara
     zen_much_more_excited (fica vermelho, reclama, "explode")
        │
        ▼
      Excited
        │  entra em please_pet (vai até o mouse pedir carinho)
        │
        ├─ carinho excessivo/repetido → solta partícula branca,
        │  fica envergonhado → volta pro Normality
        │
        └─ timeout sem petting (X segundos sem carinho) → desiste →
           volta pro Normality
```

Regras confirmadas:
- Timer do Zen (2min) reseta a cada interação, mesma lógica do relógio de
  tédio hoje em `state.js`/`boredom.js`.
- O gatilho de petting de 20s **só é avaliado dentro do estado Zen** — em
  Normality, petting longo não faz nada especial (não pula direto pra
  Excited).
- Saída do Excited por "falta de carinho" = **timeout sem petting** depois
  que `please_pet` começa (não é "qualquer input que não seja petting").
- `zen_aura` é quem fecha o ciclo do Zen: ao terminar, sai do estado (não
  interrompível antes disso, como já registrado acima). `zen_breathing`
  pode rodar várias vezes dentro do Zen sem encerrar o estado.
- Ambas as saídas do Excited (`please_pet` com ou sem carinho) levam
  sempre pro **Normality**, nunca direto pro Zen.

Em aberto para quando formos implementar:
- Valor exato do timeout de "sem petting" dentro de `please_pet` (sugestão
  inicial: algo entre 6–10s, a definir).
- Onde entra esse "state machine" de personalidade no código: provável
  novo módulo (`renderer/behaviors/personalityState.js`?) que decide qual
  personalidade ativa está em vigor, substituindo
  `pickPersonalityForToday` como fonte de verdade.
- Precisa existir de fato um arquivo `normality.js` com palette/movement
  próprios, ou Normality herda os valores "neutros" atuais do motor
  (sem personalidade aplicada)?

## Próximos passos sugeridos

- Decidir a pergunta de arquitetura (item 1 acima).
- Se for pra frente: desenhar a máquina de estados
  Base ⇄ Zen ⇄ Excited (diagrama simples) antes de tocar em código.
- Definir o "medidor de carinho" como um valor único em `state.js` ou algo
  por-personalidade.
- Depois disso, dá pra planejar a implementação por partes (1 animação
  nova por vez) sem trombar com o relógio de tédio existente.
