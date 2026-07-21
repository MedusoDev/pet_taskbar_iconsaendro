// Continuidade de tópico na conversa: detecta do que o usuário está
// falando no chat (texto digitado) e mantém isso em state.currentTopic por
// um tempo, pro cérebro local (brain.js) e a chamada de API (chat.js)
// saberem que devem continuar na mesma linha do assunto sem precisar que
// ele repita a cada mensagem.
//
// Mesmo padrão de behaviors/siteEye.js (categorização por regex), mas
// analisando o TEXTO DIGITADO em vez do título da janela ativa — e
// reaproveitando as MESMAS regexes de lá onde faz sentido (import de
// SITE_CATEGORIES), em vez de duplicar os padrões. Cada categoria de tópico
// soma a regex equivalente do Ico_Eye (se existir) com um vocabulário extra
// de conversa (as pessoas escrevem "vamos falar de anime" no chat, não
// "anime | crunchyroll" como um título de aba).
import { SITE_CATEGORIES } from './siteEye.js';

// Quanto tempo (ms) um tópico continua valendo sem ser remencionado — depois
// disso, state.currentTopic volta a null sozinho (ver trackTopic).
const TOPIC_HOLD_MS = 5 * 60 * 1000; // 5 minutos

function byId(id) {
  const c = SITE_CATEGORIES.find((s) => s.id === id);
  return c && c.match ? c.match : null;
}

/** Combina várias regexes (e pode ser null) numa só, por alternância. */
function combine(...sources) {
  const parts = sources.filter(Boolean).map((r) => r.source);
  return new RegExp(parts.join('|'), 'i');
}

// 'geral' não tem match de propósito: não é um assunto que se "detecta" no
// texto, é o balde-padrão pra quem não caiu em nenhuma categoria específica
// (usado só como agrupador na aba "Cérebro e Falas" da janela de
// Configurações, ver settings/settings.js).
export const TOPIC_CATEGORIES = [
  {
    id: 'nsfw',
    label: 'conteúdo adulto',
    match: combine(byId('nsfw'), /\bnud[eo]s?\b|\btes[ãa]o\b|\bsafad\w*\b|\bpelad\w*\b|\bgostos[oa]s?\b|\btarad\w*\b/i),
  },
  {
    id: 'series_filmes',
    label: 'séries/filmes',
    match: combine(byId('streaming'), byId('youtube'), /\bs[ée]ries?\b|\bfilmes?\b|\banimes?\b|\bmang[áa]s?\b|\bepis[óo]dios?\b|\btemporadas?\b/i),
  },
  {
    id: 'jogos',
    label: 'jogos',
    match: combine(byId('games'), /\bjog\w*\b|\bgames?\b|\bvideogames?\b|\blol\b|\bvalorant\b|\bcs ?go\b/i),
  },
  {
    id: 'tecnologia',
    label: 'tecnologia',
    match: combine(byId('devdocs'), byId('github'), /\bc[óo]digos?\b|\bprogram\w*\b|\bbugs?\b|\bsoftwares?\b|\bhardwares?\b|\bpcs?\b|\bcomputador(?:es)?\b|\bapps?\b/i),
  },
  {
    id: 'musica',
    label: 'música',
    match: combine(byId('spotify'), /\bm[úu]sicas?\b|\bcanta\w*\b|\bbandas?\b|\bshows?\b|\b[áa]lbuns?\b|\bplaylists?\b/i),
  },
  { id: 'geral', label: 'geral', match: null },
];

/** Chamada a cada mensagem do usuário, ANTES de montar o contexto do chat
 * (ver chat.js send()). Se o texto casa uma categoria, ela vira o tópico
 * atual e o prazo é renovado; sem casar nada, só verifica se o tópico
 * anterior já expirou (não precisa de remenção pra continuar valendo até o
 * prazo — só não é RENOVADO sem remenção). Devolve o id do tópico atual
 * (ou null). */
export function trackTopic(state, text, now) {
  const clean = (text || '').trim();
  const found = clean && TOPIC_CATEGORIES.find((c) => c.match && c.match.test(clean));
  if (found) {
    state.currentTopic = found.id;
    state.topicExpiresAt = now + TOPIC_HOLD_MS;
  } else if (state.currentTopic && now >= state.topicExpiresAt) {
    state.currentTopic = null;
    state.topicExpiresAt = 0;
  }
  return state.currentTopic;
}

export function topicLabel(id) {
  const c = TOPIC_CATEGORIES.find((t) => t.id === id);
  return c ? c.label : id;
}
