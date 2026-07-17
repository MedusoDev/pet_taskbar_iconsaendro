// Estado compartilhado do pet: um único objeto mutável que os sistemas de
// comportamento (wander, boredom, shutdown, interactions, liveAnimation)
// leem e escrevem. Evita variáveis soltas espalhadas pelos módulos e permite
// que cada sistema só dependa do que precisa, sem imports circulares.

export function createState(now, groundY) {
  return {
    // posição / corpo
    restX: 0,
    restY: groundY,
    anchor: { x: 0, y: groundY + 1.0 },
    reloc: null, // { x0, y0, x1, y1, start, dur, toCursor }
    nextRelocateAt: now + 4000,
    prevX: 0,
    prevY: groundY,
    velXSm: 0,
    velYSm: 0,
    takeoffAt: -1e9,
    landAt: -1e9,
    bobPhase: 0,
    breathePhase: 0,

    // cursor global
    cursor: { x: -1, y: -1 },
    cursorVel: 0,
    lastCursorAt: 0,
    flinchUntil: 0,

    // assinatura da personalidade
    signatureAnim: null, // { start, sig }
    nextSignatureAt: now + 20000,

    // carinho (medidor visual; entrada/saída do modo Excited é decidida em
    // behaviors/personalityState.js)
    affection: 0,
    pettingNow: false,
    lastPetAt: 0,
    lastPetLogAt: 0,
    petLean: 0,
    excitedHopStart: -1e9,
    nextExcitedHopAt: 0,
    orbitAngle: 0,       // órbita de empolgação em volta do cursor parado
    vibeStart: -1e9,     // pulso de vibração de excitação em andamento
    nextVibeAt: 0,

    // parked: segurado por 3s → perguntou → ficou parado no lugar
    // (clicar nele parado pergunta se pode voltar a passear)
    parked: false,
    parkHome: null, // { x, y } — poleiro prometido; volta pra cá após um susto
    awaitingParkAnswer: false, // soltou com a pergunta aberta → paira esperando

    // drag
    dragging: false,
    dragOffsetX: 0,
    dragOffsetY: 0,
    dragDistance: 0,
    releaseFall: null, // { vy, bounces }

    // rotação / escala
    spin: 0,
    pokeVel: 0,
    unfold: 0.055,
    tiltX: 0.22,
    tiltZ: 0,
    lookYaw: 0,
    lookPitch: 0,
    scaleCur: 1,

    // energia
    sleeping: false,
    power: 1,

    // relógio de tédio
    lastInput: now,
    nextTickAt: 0,
    tick: null, // { type: 0|1|2, start }
    stretch: null, // { start }
    stretchDone: false,
    shutdownAt: 0,
    shutdownDone: false,
    shutdown: null, // { start, vy, falling, bounces, startled }

    // tonta (3+ cliques)
    clickTimes: [],
    dizzy: null, // { start }

    // eventos extras
    flip: null, // { start } — backflip de hora cheia
    lastHour: new Date().getHours(),
    wakeJolt: 0,

    // interação de mouse
    ignoringMouseEvents: true,
    lastPointerScreen: { x: 0, y: 0 },

    // câmera / chão (atualizados em resize)
    halfWidth: 0,
    viewTop: 0,
    groundY,
    screenConfig: null, // { displays: [{ x, width, floorY }] } — chão por monitor (main.js)

    // AI_Live: máquina de personalidade (ver behaviors/personalityState.js)
    personality: null,
    mode: 'normality',
    zen: null,
    excitedState: null,
    zenAuraActive: false,
    zenBreathingActive: false,

    // saída envergonhada do Excited (ver personalityState.js / effects.js)
    pendingBurst: false,       // liveAnimation dispara o respingo no próximo frame
    pendingBurstIntense: false, // respingo dobrado (much_petting)
    blushUntil: 0,             // blush "///" visível até este timestamp
    excitedCooldownUntil: 0,   // vergonha recente → supercarga não recarrega
    shyRoundUntil: 0,          // janela pós-shy: carinho contínuo → much_petting
    muchPettingMs: 0,          // ms de carinho acumulado dentro da janela
    paletteHoldMaxUntil: 0,    // rubor: cor do Excited segura enquanto há cafuné
    rushArrived: false,        // fase rush: chegou perto do mouse (liveAnimation)
  };
}
