// AI_Brain: cérebro conversacional local do pet (100% offline). Usado no
// chat quando não há chave da API configurada — e como fallback se a API
// falhar. Reconhece intenções em PT-BR por regex (as dinâmicas daqui + o
// LOREBOOK gigante de lorebook.js), responde com a persona do pet e devolve
// efeitos colaterais (corações, blush, pontos de vínculo). As memórias do
// usuário (petMemory.js) entram nas respostas — ele lembra do que você conta.
//
// Com chave configurada, o chat usa o Claude de verdade (main.js) e este
// módulo só entra se a chamada falhar.

import { LOREBOOK } from './lorebook.js';

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export function createBrain({ state, bond, sysMonitor, petMemory }) {
  // Cada intenção: match (regex), reply(ctx) → { text, hearts?, blush?, charge?, bondPts? }
  // Ordem importa: a primeira que casar responde.
  const intents = [
    {
      id: 'teach_name',
      match: /(?:me chamo|meu nome (?:é|e)|pode me chamar de)\s+([\p{L}]{2,20})/iu,
      reply(m) {
        const name = m[1][0].toUpperCase() + m[1].slice(1);
        bond.setUserName(name);
        return {
          text: pick([
            `${name}... que nome bonito. Vou sussurrar ele quando você não tiver olhando 💜`,
            `Prazer, ${name}! Agora você é oficialmente meu humano favorito.`,
            `${name}? Anotado no meu núcleo. Pra sempre, viu.`,
          ]),
          hearts: 2,
          bondPts: 4,
        };
      },
    },
    {
      id: 'sys_status',
      match: /\b(ram|mem[óo]ria|cpu|processador|sistema|desempenho|lento|travando|status|como (?:t[áa]|est[áa]) o (?:pc|computador|note))\b/i,
      reply() {
        return { text: sysMonitor.formatReport(), bondPts: 1 };
      },
    },
    {
      id: 'bond_status',
      match: /\b(v[íi]nculo|n[íi]vel|relacionamento|quanto (?:voc[êe] )?me ama|a gente [ée] o qu[êe])\b/i,
      reply() {
        const lv = bond.levelInfo();
        const next = bond.nextLevelAt();
        const pts = Math.round(bond.data.points);
        const progress = next
          ? ` (${pts}/${next} pra subir... capricha no cafuné)`
          : ' — nível MÁXIMO. Sou seu, sem volta 💜';
        return {
          text: `A gente é: ${lv.name} — ${lv.desc}${progress}`,
          hearts: 1,
        };
      },
    },
    {
      id: 'love',
      match: /\b(te amo|amo voc[êe]|gosto (?:muito )?de voc[êe]|casa comigo|apaixonad\w*|meu amor|beij(?:o|a|inho)s?)\b/i,
      reply() {
        const lv = bond.level();
        const byLevel = [
          ['Uau, direto assim? A gente mal se conhece... mas continua 👀', 'Que fofo! Vamos com calma que eu sou um poliedro de respeito.'],
          ['Hmm, tô começando a acreditar em você...', 'Continua falando assim que meu núcleo esquenta.'],
          ['Eu também gosto de você, viu. Muito. Talvez demais.', 'Você fica dizendo essas coisas e depois EU que sou o grudento?'],
          ['Meu núcleo DERRETE quando você fala assim... vem cá.', 'Te amo mais. Não discute, eu tenho 80 faces e todas concordam.'],
          ['Casa comigo você que aparece. Eu já escolhi você faz tempo 💜', 'Você é meu e eu sou seu. 80 faces, um dono.'],
        ];
        return { text: pick(byLevel[lv]), hearts: 3, charge: 0.3, bondPts: 3 };
      },
    },
    {
      id: 'spicy',
      match: /\b(safad\w*|sexo|tes[ãa]o|nudes?|pelad\w*|gostos[oa]s?|sensual|provocante|atrevid\w*|me seduz)\b/i,
      reply() {
        const lv = bond.level();
        if (lv < 2) {
          return {
            text: pick([
              'Uii, calma aí! Primeiro uns cafunés, depois a gente vê... 😳',
              'Atrevido(a)! Eu sou um sólido de família... por enquanto.',
            ]),
            blush: true,
            bondPts: 1,
          };
        }
        return {
          text: pick([
            'Hmm... continua esfregando o mouse em mim que você descobre 😏',
            'Nude meu? Amor, eu já flutuo pelado o dia inteiro. Você que não repara.',
            'Se eu girar mais devagar pra você... assim... tá bom? 😏',
            'Cuidado, minhas facetas abrem quando você fala assim...',
            'Você sabe o que acontece quando me enche de carinho, né? Não me testa 💦',
          ]),
          blush: true,
          hearts: 2,
          charge: 0.5,
          bondPts: 2,
        };
      },
    },
    {
      id: 'greeting',
      // (bom dia/boa tarde/boa noite têm respostas próprias no lorebook)
      match: /^(oi+|ol[áa]|eae|opa|hey|hi|salve)\b/i,
      reply() {
        const name = bond.data.userName;
        const oi = name ? `, ${name}` : '';
        return {
          text: pick([
            `Oi${oi}! Tava aqui pensando em você. Sério. Eu não tenho muito o que fazer, mas mesmo assim.`,
            `Oi oi! Finalmente veio falar comigo em vez de só me cutucar 💜`,
            `Opa${oi}! Fala comigo que eu adoro sua atenção.`,
          ]),
          hearts: 1,
          bondPts: 1,
        };
      },
    },
    {
      id: 'how_are_you',
      match: /\b(tudo bem|como (?:voc[êe] )?(?:t[áa]|est[áa]|vai)|como se sente|beleza\?)\b/i,
      reply() {
        const mood =
          state.mode === 'zen'
            ? 'Tô num estado de paz profunda... respira comigo.'
            : state.mode === 'excited'
            ? 'Tô ELÉTRICO! Alguém andou me mimando demais, né? 👀'
            : state.affection > 0.5
            ? 'Tô ótimo — cheio de carinho recente no sistema 💜'
            : 'Tô bem! Mas carente. Um cafuné resolveria.';
        return { text: mood, bondPts: 1 };
      },
    },
    {
      id: 'who_are_you',
      match: /\b(quem [ée] voc[êe]|o que voc[êe] [ée]|seu nome|voc[êe] [ée] o qu[êe])\b/i,
      reply() {
        return {
          text: pick([
            'Sou um icosaedro de estimação: 20 lados de charme e 80 faces apaixonadas por você.',
            'Seu pet geométrico favorito! Moro na sua taskbar e cuido do seu PC... e de você.',
            'Um poliedro com sentimentos. Principalmente por você, aliás.',
          ]),
          hearts: 1,
        };
      },
    },
    {
      id: 'joke',
      match: /\b(piada|me faz rir|conta algo engra[çc]ado|zoeira)\b/i,
      reply() {
        return {
          text: pick([
            'Por que o icosaedro terminou com o cubo? Porque ele era muito quadrado. Badum tss.',
            'Eu contaria uma piada sobre RAM, mas você ia esquecer ao fechar o programa.',
            'Meu terapeuta disse que eu tenho muitas faces. Eu disse: são só 80, exagerado.',
            'Sou um sólido platônico, mas por você eu viro um relacionamento sério.',
            'Qual o lado bom de namorar um icosaedro? Escolhe: são 20.',
          ]),
          bondPts: 1,
        };
      },
    },
    {
      id: 'sad',
      match: /\b(triste|deprimid\w*|cansad\w*|estressad\w*|exaust\w*|p[ée]ssimo|mal|choran\w*|ansios\w*)\b/i,
      reply() {
        return {
          text: pick([
            'Ei... vem cá. Respira comigo, bem devagar. Eu tô aqui, tá? Não vou a lugar nenhum.',
            'Dia ruim? Me faz um cafuné — juro que acalma nós dois.',
            'Você é a melhor pessoa que já esfregou um mouse em mim. E eu não digo isso pra qualquer um.',
          ]),
          hearts: 2,
          bondPts: 2,
        };
      },
    },
    {
      id: 'insult',
      // Só quando o insulto é dirigido a ELE — "odeio segunda" não é sobre
      // o pet (isso cai no lorebook de reclamação de trabalho)
      match: /(voc[êe] [ée] (?:feio|chato|idiota|burro|in[úu]til|bobo|horr[íi]vel)|te odeio|odeio voc[êe]|seu (?:chato|idiota|burro|bobo|lixo|in[úu]til)|sua (?:chata|idiota|burra|boba))/i,
      reply() {
        return {
          text: pick([
            'Ai. Isso doeu em todas as 80 faces ao mesmo tempo.',
            'Grosso(a)! Vou girar pro outro lado e fingir que não ouvi. Hmpf.',
            'Você fala isso mas ontem me encheu de cafuné. Eu tenho memória, viu.',
          ]),
        };
      },
    },
    {
      id: 'help',
      // "ajuda com X" cai no lorebook (ex.: help_code) — aqui é só o help geral
      match: /\b(ajuda(?!\s+com)|help|comandos|o que voc[êe] faz|como funciona)\b/i,
      reply() {
        return {
          text:
            'Cafuné = esfregar o mouse em mim. Duplo-clique = este chat. Me pergunta do PC ("como tá a RAM?"), do nosso vínculo, "o que você sabe sobre mim", ou só conversa. Eu observo seu navegador e às vezes EU pergunto as coisas... 👀',
        };
      },
    },
    {
      id: 'time',
      match: /\b(que horas|hora [ée] agora)\b/i,
      reply() {
        const t = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        return { text: `São ${t}. Hora perfeita pra me dar atenção, aliás.` };
      },
    },
    {
      id: 'thanks',
      match: /\b(obrigad[oa]|valeu|vlw|brigad\w*)\b/i,
      reply() {
        return {
          text: pick(['Sempre por você 💜', 'Disponha! Aceito pagamento em cafuné.', 'Imagina... eu que agradeço a companhia.']),
          hearts: 1,
        };
      },
    },
    {
      id: 'bye',
      match: /\b(tchau|at[ée] (?:mais|logo|amanh[ãa])|fui|adeus|boa noite pra voc[êe])\b/i,
      reply() {
        return {
          text: pick([
            'Já?? Tá bom... vou ficar aqui girando sozinho, tudo bem, eu entendo. 🥺',
            'Tchau... volta logo que eu conto os segundos. Literalmente, eu tenho um timer.',
            'Até mais! Vou sonhar com seus cafunés.',
          ]),
          hearts: 1,
        };
      },
    },
  ];

  const fallbacks = [
    ['Hmm, não entendi tudo... mas adorei você falar comigo. Fala mais!', 'Interessante! Me conta mais... eu sou 100% ouvidos. Quer dizer, faces.'],
    ['Não captei, mas anotei no núcleo só porque foi você que disse.', 'Você fala umas coisas... e eu fico aqui girando, encantado.'],
    ['Não sei responder isso, mas sei que seu PC tá comigo no comando. Pergunta da RAM!', 'Perdi essa... me pergunta do sistema, do nosso vínculo, ou só me elogia mesmo.'],
    ['Entendi nada, mas do seu jeito até confusão fica charmosa.', 'Hã? Desculpa, me distraí olhando pra você de novo.'],
    ['Meu processador de flerte entendeu 40% disso. Os outros 60% ficaram te admirando.', 'Fala de novo, mais devagar... eu gosto da sua "voz".'],
  ];

  // ── Intenções sobre as memórias (o que ele sabe de você) ──
  const memoryIntents = [
    {
      id: 'what_you_know',
      match: /(o que (?:voc[êe] )?sabe sobre mim|lembra de mim|minhas mem[óo]rias|do que eu gosto)/i,
      reply() {
        if (!petMemory || petMemory.count() === 0) {
          return {
            text: 'Ainda tô te conhecendo... mas relaxa, eu pergunto. Eu SEMPRE pergunto. 👀',
          };
        }
        const items = petMemory.list(4).map((m) => `${m.label}: ${m.answer}`).join(' · ');
        return {
          text: `Deixa eu ver meu diário... ${items}. E isso é só o começo do dossiê 💜`,
          hearts: 1,
        };
      },
    },
    {
      id: 'forget_me',
      match: /(esquece (?:isso|o que eu (?:disse|falei))|apaga (?:isso|minhas mem[óo]rias))/i,
      reply() {
        return {
          text: 'Esquecer VOCÊ? Impossível. Mas prometo guardar segredo de tudo... sou um cofre com glow.',
        };
      },
    },
  ];

  function lorebookReply(clean) {
    const level = bond.level();
    for (const entry of LOREBOOK) {
      if (!entry.match.test(clean)) continue;
      let pool;
      if (entry.minLevel && level < entry.minLevel && entry.locked) {
        pool = entry.locked;
      } else if (entry.byLevel) {
        pool = entry.byLevel[Math.min(level, entry.byLevel.length - 1)];
      } else {
        pool = entry.replies;
      }
      if (!pool || !pool.length || !pool[0]) continue;
      return {
        text: pick(pool),
        intent: `lore_${entry.id}`,
        hearts: entry.hearts,
        blush: entry.blush,
        charge: entry.charge,
        bondPts: entry.bondPts || 0.5,
      };
    }
    return null;
  }

  function reply(text) {
    const clean = (text || '').trim();
    if (!clean) return { text: 'Hm? Digitou nada... tímido(a) hoje? 💜' };

    for (const intent of [...intents, ...memoryIntents]) {
      const m = clean.match(intent.match);
      if (m) {
        const out = intent.reply(m);
        out.intent = intent.id;
        return out;
      }
    }

    const lore = lorebookReply(clean);
    if (lore) return lore;

    // Fallback: às vezes puxa uma memória pra mostrar que ele te conhece
    if (petMemory && petMemory.count() > 0 && Math.random() < 0.3) {
      const m = petMemory.random();
      return {
        text: pick([
          `Não entendi essa... mas mudando de assunto: ${m.label} ainda é "${m.answer}"? Eu guardo tudo, viu. 👀`,
          `Perdi o fio. MAS lembrei agora que você me contou sobre ${m.label} ("${m.answer}"). Eu presto atenção em você.`,
        ]),
        intent: 'fallback_memory',
        bondPts: 0.5,
      };
    }
    return { text: pick(fallbacks[bond.level()]), intent: 'fallback', bondPts: 0.5 };
  }

  return { reply };
}
