// Camada de domínio sobre sourceEditor.js: sabe o FORMATO de cada arquivo
// (personalities/*.js `lines`, lorebook.js `LOREBOOK`, curiosity.js
// `GENERIC_QUESTIONS`/`SITE_QUESTIONS`/`NSFW_QUESTIONS`) e expõe funções de
// leitura (pra popular a aba "Cérebro e Falas") e escrita (add/editar/
// remover/mover), cada uma devolvendo { ok:true, ... } ou { ok:false, error }
// — nunca lança pro chamador, e nunca deixa um arquivo quebrado no disco
// (ver validateAndWrite em sourceEditor.js).
const path = require('path');
const {
  PERSONALITIES_DIR,
  LOREBOOK_PATH,
  CURIOSITY_PATH,
  parse,
  findExportedInit,
  propValue,
  itemsOf,
  lineIndent,
  serializeStringArray,
  regexLiteral,
  replaceNodeSpan,
  removeItem,
  insertItem,
  swapItems,
  readFile,
  validateAndWrite,
} = require('./sourceEditor');

const MOOD_IDS = ['normality', 'zen', 'excited'];
function personalityPath(moodId) {
  return path.join(PERSONALITIES_DIR, moodId + '.js');
}

function literalToArray(node) {
  if (!node || node.type !== 'ArrayExpression') return [];
  return node.elements.filter((e) => e && e.type === 'Literal').map((e) => String(e.value));
}

// ═══════════════════════════ Falas por humor ═══════════════════════════
function readPersonalityLines(moodId) {
  if (!MOOD_IDS.includes(moodId)) return { ok: false, error: 'Humor desconhecido: ' + moodId };
  let source;
  try {
    source = readFile(personalityPath(moodId));
  } catch (err) {
    return { ok: false, error: 'Não consegui ler o arquivo: ' + err.message };
  }
  let ast;
  try {
    ast = parse(source);
  } catch (err) {
    return { ok: false, error: 'Arquivo com sintaxe inválida: ' + err.message };
  }
  const moodNode = findExportedInit(ast, moodId);
  const linesNode = propValue(moodNode, 'lines');
  if (!linesNode || linesNode.type !== 'ObjectExpression') {
    return { ok: false, error: "Não encontrei o campo 'lines' em " + moodId + '.js' };
  }
  const triggers = {};
  for (const p of linesNode.properties) {
    if (p.type !== 'Property') continue;
    const key = p.key.type === 'Identifier' ? p.key.name : p.key.type === 'Literal' ? String(p.key.value) : null;
    if (!key) continue;
    triggers[key] = literalToArray(p.value);
  }
  return { ok: true, triggers };
}

/** Substitui a lista INTEIRA de frases de um gatilho (a UI manda o array
 * final depois de add/editar/remover uma frase). */
function savePersonalityTriggerPhrases(moodId, trigger, phrases) {
  if (!MOOD_IDS.includes(moodId)) return { ok: false, error: 'Humor desconhecido: ' + moodId };
  if (!Array.isArray(phrases) || phrases.some((p) => typeof p !== 'string')) {
    return { ok: false, error: 'Lista de frases inválida.' };
  }
  const filePath = personalityPath(moodId);
  let source;
  try {
    source = readFile(filePath);
  } catch (err) {
    return { ok: false, error: 'Não consegui ler o arquivo: ' + err.message };
  }
  let ast;
  try {
    ast = parse(source);
  } catch (err) {
    return { ok: false, error: 'Arquivo com sintaxe inválida: ' + err.message };
  }
  const moodNode = findExportedInit(ast, moodId);
  const linesNode = propValue(moodNode, 'lines');
  if (!linesNode) return { ok: false, error: "Não encontrei o campo 'lines'." };
  let target = null;
  for (const p of linesNode.properties) {
    if (p.type !== 'Property') continue;
    const key = p.key.type === 'Identifier' ? p.key.name : p.key.type === 'Literal' ? String(p.key.value) : null;
    if (key === trigger) target = p.value;
  }
  if (!target) return { ok: false, error: "Gatilho '" + trigger + "' não existe em " + moodId + '.js.' };

  const indent = lineIndent(source, target.start);
  const newArrayText = serializeStringArray(phrases, indent);
  const newSource = replaceNodeSpan(source, target, newArrayText);

  return validateAndWrite(filePath, newSource, (newAst) => {
    const m = findExportedInit(newAst, moodId);
    const l = propValue(m, 'lines');
    if (!l) return "O campo 'lines' sumiu depois da edição — abortado.";
    return null;
  });
}

// ═══════════════════════════ Lorebook ═══════════════════════════
function entryFromNode(node, index) {
  const idN = propValue(node, 'id');
  const matchN = propValue(node, 'match');
  const heartsN = propValue(node, 'hearts');
  const bondPtsN = propValue(node, 'bondPts');
  const blushN = propValue(node, 'blush');
  const chargeN = propValue(node, 'charge');
  const minLevelN = propValue(node, 'minLevel');
  const topicN = propValue(node, 'topic');
  const repliesN = propValue(node, 'replies');
  const byLevelN = propValue(node, 'byLevel');
  const lockedN = propValue(node, 'locked');
  return {
    index,
    id: idN ? String(idN.value) : '',
    matchSource: matchN && matchN.regex ? matchN.regex.pattern : '',
    matchFlags: matchN && matchN.regex ? matchN.regex.flags : 'i',
    hearts: heartsN ? Number(heartsN.value) : null,
    bondPts: bondPtsN ? Number(bondPtsN.value) : null,
    blush: !!(blushN && blushN.value),
    charge: chargeN ? Number(chargeN.value) : null,
    minLevel: minLevelN ? Number(minLevelN.value) : null,
    // topic (topicTracker.js): categoria de assunto pra continuidade de
    // conversa E pro agrupamento da aba "Cérebro e Falas" — null = "geral"
    // (balde-padrão, sem tag específica).
    topic: topicN ? String(topicN.value) : null,
    replies: repliesN ? literalToArray(repliesN) : null,
    byLevel: byLevelN && byLevelN.type === 'ArrayExpression' ? byLevelN.elements.map((tier) => literalToArray(tier)) : null,
    locked: lockedN ? literalToArray(lockedN) : null,
  };
}

function readLorebook() {
  let source;
  try {
    source = readFile(LOREBOOK_PATH);
  } catch (err) {
    return { ok: false, error: 'Não consegui ler lorebook.js: ' + err.message };
  }
  let ast;
  try {
    ast = parse(source);
  } catch (err) {
    return { ok: false, error: 'lorebook.js com sintaxe inválida: ' + err.message };
  }
  const arr = findExportedInit(ast, 'LOREBOOK');
  if (!arr || arr.type !== 'ArrayExpression') return { ok: false, error: 'LOREBOOK não encontrado.' };
  const entries = arr.elements.map((node, i) => entryFromNode(node, i));
  return { ok: true, entries };
}

function validateRegex(source, flags) {
  try {
    // eslint-disable-next-line no-new
    new RegExp(source, flags);
    return null;
  } catch (err) {
    return 'Regex inválida (' + source + '): ' + err.message;
  }
}

function serializeLorebookEntry(entry, indent) {
  const inner = indent + '  ';
  const lines = [];
  lines.push(inner + 'id: ' + JSON.stringify(entry.id).replace(/"/g, "'") + ',');
  lines.push(inner + 'match: ' + regexLiteral(entry.matchSource, entry.matchFlags) + ',');
  if (entry.hearts) lines.push(inner + 'hearts: ' + Number(entry.hearts) + ',');
  if (entry.bondPts) lines.push(inner + 'bondPts: ' + Number(entry.bondPts) + ',');
  if (entry.blush) lines.push(inner + 'blush: true,');
  if (entry.charge) lines.push(inner + 'charge: ' + Number(entry.charge) + ',');
  if (entry.minLevel !== undefined && entry.minLevel !== null && entry.minLevel !== '') {
    lines.push(inner + 'minLevel: ' + Number(entry.minLevel) + ',');
  }
  if (entry.topic) {
    lines.push(inner + 'topic: ' + JSON.stringify(entry.topic).replace(/"/g, "'") + ',');
  }
  if (entry.locked && entry.locked.length) {
    lines.push(inner + 'locked: ' + serializeStringArray(entry.locked, inner) + ',');
  }
  if (entry.byLevel && entry.byLevel.length) {
    const tierIndent = inner + '  ';
    const tiers = entry.byLevel.map((tier) => tierIndent + serializeStringArray(tier, tierIndent));
    lines.push(inner + 'byLevel: [\n' + tiers.join(',\n') + ',\n' + inner + '],');
  } else {
    lines.push(inner + 'replies: ' + serializeStringArray(entry.replies || [], inner) + ',');
  }
  return '{\n' + lines.join('\n') + '\n' + indent + '}';
}

function lorebookSanity(newAst, expectedLength) {
  const arr = findExportedInit(newAst, 'LOREBOOK');
  if (!arr || arr.type !== 'ArrayExpression') return 'LOREBOOK sumiu depois da edição — abortado.';
  if (expectedLength !== undefined && arr.elements.length !== expectedLength) {
    return 'Número de entradas do LOREBOOK mudou de forma inesperada — abortado.';
  }
  return null;
}

function checkLorebookId(entries, id, ignoreIndex) {
  if (!id || !id.trim()) return 'O id não pode ficar vazio.';
  const clash = entries.some((e, i) => e.id === id && i !== ignoreIndex);
  return clash ? "Já existe uma entrada do lorebook com id '" + id + "'." : null;
}

function saveLorebookEntry(index, updatedEntry) {
  const current = readLorebook();
  if (!current.ok) return current;
  if (index < 0 || index >= current.entries.length) return { ok: false, error: 'Índice inválido.' };
  const idErr = checkLorebookId(current.entries, updatedEntry.id, index);
  if (idErr) return { ok: false, error: idErr };
  const reErr = validateRegex(updatedEntry.matchSource, updatedEntry.matchFlags);
  if (reErr) return { ok: false, error: reErr };

  const source = readFile(LOREBOOK_PATH);
  const ast = parse(source);
  const arr = findExportedInit(ast, 'LOREBOOK');
  const node = arr.elements[index];
  const indent = lineIndent(source, node.start);
  const newText = serializeLorebookEntry(updatedEntry, indent);
  const newSource = replaceNodeSpan(source, node, newText);
  return validateAndWrite(LOREBOOK_PATH, newSource, (newAst) => lorebookSanity(newAst, current.entries.length));
}

function addLorebookEntry(newEntry, atIndex) {
  const current = readLorebook();
  if (!current.ok) return current;
  const idErr = checkLorebookId(current.entries, newEntry.id, -1);
  if (idErr) return { ok: false, error: idErr };
  const reErr = validateRegex(newEntry.matchSource, newEntry.matchFlags);
  if (reErr) return { ok: false, error: reErr };

  const source = readFile(LOREBOOK_PATH);
  const ast = parse(source);
  const arr = findExportedInit(ast, 'LOREBOOK');
  const indent = lineIndent(source, arr.start);
  const newText = serializeLorebookEntry(newEntry, indent);
  const index = Number.isFinite(atIndex) ? atIndex : current.entries.length;
  const newSource = insertItem(source, arr, index, newText);
  return validateAndWrite(LOREBOOK_PATH, newSource, (newAst) => lorebookSanity(newAst, current.entries.length + 1));
}

function removeLorebookEntry(index) {
  const current = readLorebook();
  if (!current.ok) return current;
  if (index < 0 || index >= current.entries.length) return { ok: false, error: 'Índice inválido.' };
  const source = readFile(LOREBOOK_PATH);
  const ast = parse(source);
  const arr = findExportedInit(ast, 'LOREBOOK');
  const newSource = removeItem(source, arr, index);
  return validateAndWrite(LOREBOOK_PATH, newSource, (newAst) => lorebookSanity(newAst, current.entries.length - 1));
}

function moveLorebookEntry(index, direction) {
  const current = readLorebook();
  if (!current.ok) return current;
  const target = direction === 'up' ? index - 1 : index + 1;
  if (index < 0 || index >= current.entries.length || target < 0 || target >= current.entries.length) {
    return { ok: false, error: 'Não dá pra mover pra essa direção.' };
  }
  const source = readFile(LOREBOOK_PATH);
  const ast = parse(source);
  const arr = findExportedInit(ast, 'LOREBOOK');
  const newSource = swapItems(source, arr, index, target);
  return validateAndWrite(LOREBOOK_PATH, newSource, (newAst) => lorebookSanity(newAst, current.entries.length));
}

// ═══════════════════════════ Curiosidade ═══════════════════════════
const CURIOSITY_ARRAY_BANKS = { generic: 'GENERIC_QUESTIONS', nsfw: 'NSFW_QUESTIONS' };

function questionFromNode(node, index) {
  const idN = propValue(node, 'id');
  const minLevelN = propValue(node, 'minLevel');
  const labelN = propValue(node, 'label');
  const qN = propValue(node, 'q');
  const phN = propValue(node, 'ph');
  const thanksN = propValue(node, 'thanks');
  return {
    index,
    id: idN ? String(idN.value) : '',
    minLevel: minLevelN ? Number(minLevelN.value) : null,
    label: labelN ? String(labelN.value) : '',
    q: qN ? String(qN.value) : '',
    ph: phN ? String(phN.value) : '',
    thanks: thanksN ? String(thanksN.value) : '',
  };
}

function serializeQuestion(q, indent) {
  const inner = indent + '  ';
  const lines = [];
  lines.push(inner + 'id: ' + JSON.stringify(q.id).replace(/"/g, "'") + ',');
  if (q.minLevel !== undefined && q.minLevel !== null && q.minLevel !== '') {
    lines.push(inner + 'minLevel: ' + Number(q.minLevel) + ',');
  }
  lines.push(inner + 'label: ' + JSON.stringify(q.label).replace(/"/g, "'") + ',');
  lines.push(inner + 'q: ' + JSON.stringify(q.q).replace(/"/g, "'") + ',');
  lines.push(inner + 'ph: ' + JSON.stringify(q.ph).replace(/"/g, "'") + ',');
  lines.push(inner + 'thanks: ' + JSON.stringify(q.thanks).replace(/"/g, "'") + ',');
  return '{\n' + lines.join('\n') + '\n' + indent + '}';
}

function readCuriosity() {
  let source;
  try {
    source = readFile(CURIOSITY_PATH);
  } catch (err) {
    return { ok: false, error: 'Não consegui ler curiosity.js: ' + err.message };
  }
  let ast;
  try {
    ast = parse(source);
  } catch (err) {
    return { ok: false, error: 'curiosity.js com sintaxe inválida: ' + err.message };
  }
  const out = { generic: [], nsfw: [], site: [] };
  for (const [bank, exportName] of Object.entries(CURIOSITY_ARRAY_BANKS)) {
    const arr = findExportedInit(ast, exportName);
    if (arr && arr.type === 'ArrayExpression') {
      out[bank] = arr.elements.map((node, i) => questionFromNode(node, i));
    }
  }
  const siteObj = findExportedInit(ast, 'SITE_QUESTIONS');
  if (siteObj && siteObj.type === 'ObjectExpression') {
    siteObj.properties.forEach((p, i) => {
      if (p.type !== 'Property') return;
      const siteId = p.key.type === 'Identifier' ? p.key.name : p.key.type === 'Literal' ? String(p.key.value) : null;
      const q = questionFromNode(p.value, i);
      q.siteId = siteId;
      out.site.push(q);
    });
  }
  return { ok: true, ...out };
}

function allCuriosityIds(current, ignoreBank, ignoreIndex) {
  const ids = [];
  ['generic', 'nsfw'].forEach((bank) => {
    current[bank].forEach((q, i) => {
      if (bank === ignoreBank && i === ignoreIndex) return;
      ids.push(q.id);
    });
  });
  current.site.forEach((q, i) => {
    if (ignoreBank === 'site' && i === ignoreIndex) return;
    ids.push(q.id);
  });
  return ids;
}

function checkCuriosityId(current, id, ignoreBank, ignoreIndex) {
  if (!id || !id.trim()) return 'O id não pode ficar vazio.';
  const clash = allCuriosityIds(current, ignoreBank, ignoreIndex).includes(id);
  return clash ? "Já existe uma pergunta (em algum banco) com id '" + id + "'." : null;
}

function curiositySanity(newAst) {
  for (const exportName of Object.values(CURIOSITY_ARRAY_BANKS)) {
    const arr = findExportedInit(newAst, exportName);
    if (!arr || arr.type !== 'ArrayExpression') return exportName + ' sumiu depois da edição — abortado.';
  }
  const siteObj = findExportedInit(newAst, 'SITE_QUESTIONS');
  if (!siteObj || siteObj.type !== 'ObjectExpression') return 'SITE_QUESTIONS sumiu depois da edição — abortado.';
  return null;
}

function saveCuriosityQuestion(bank, index, updated) {
  const exportName = CURIOSITY_ARRAY_BANKS[bank];
  if (!exportName) return { ok: false, error: 'Banco desconhecido: ' + bank };
  const current = readCuriosity();
  if (!current.ok) return current;
  const idErr = checkCuriosityId(current, updated.id, bank, index);
  if (idErr) return { ok: false, error: idErr };

  const source = readFile(CURIOSITY_PATH);
  const ast = parse(source);
  const arr = findExportedInit(ast, exportName);
  if (!arr || index < 0 || index >= arr.elements.length) return { ok: false, error: 'Índice inválido.' };
  const node = arr.elements[index];
  const indent = lineIndent(source, node.start);
  const newText = serializeQuestion(updated, indent);
  const newSource = replaceNodeSpan(source, node, newText);
  return validateAndWrite(CURIOSITY_PATH, newSource, curiositySanity);
}

function addCuriosityQuestion(bank, question, atIndex) {
  const exportName = CURIOSITY_ARRAY_BANKS[bank];
  if (!exportName) return { ok: false, error: 'Banco desconhecido: ' + bank };
  const current = readCuriosity();
  if (!current.ok) return current;
  const idErr = checkCuriosityId(current, question.id, null, -1);
  if (idErr) return { ok: false, error: idErr };

  const source = readFile(CURIOSITY_PATH);
  const ast = parse(source);
  const arr = findExportedInit(ast, exportName);
  if (!arr) return { ok: false, error: exportName + ' não encontrado em curiosity.js.' };
  const indent = lineIndent(source, arr.start);
  const newText = serializeQuestion(question, indent);
  const index = Number.isFinite(atIndex) ? atIndex : arr.elements.length;
  const newSource = insertItem(source, arr, index, newText);
  return validateAndWrite(CURIOSITY_PATH, newSource, curiositySanity);
}

function removeCuriosityQuestion(bank, index) {
  const exportName = CURIOSITY_ARRAY_BANKS[bank];
  if (!exportName) return { ok: false, error: 'Banco desconhecido: ' + bank };
  const source = readFile(CURIOSITY_PATH);
  const ast = parse(source);
  const arr = findExportedInit(ast, exportName);
  if (!arr || index < 0 || index >= arr.elements.length) return { ok: false, error: 'Índice inválido.' };
  const newSource = removeItem(source, arr, index);
  return validateAndWrite(CURIOSITY_PATH, newSource, curiositySanity);
}

function saveSiteQuestion(siteId, updated) {
  const current = readCuriosity();
  if (!current.ok) return current;
  const existingIndex = current.site.findIndex((q) => q.siteId === siteId);
  const idErr = checkCuriosityId(current, updated.id, 'site', existingIndex);
  if (idErr) return { ok: false, error: idErr };

  const source = readFile(CURIOSITY_PATH);
  const ast = parse(source);
  const siteObj = findExportedInit(ast, 'SITE_QUESTIONS');
  if (!siteObj) return { ok: false, error: 'SITE_QUESTIONS não encontrado em curiosity.js.' };
  const prop = siteObj.properties.find((p) => {
    const k = p.key.type === 'Identifier' ? p.key.name : p.key.type === 'Literal' ? String(p.key.value) : null;
    return k === siteId;
  });
  const indent = lineIndent(source, siteObj.start);
  if (prop) {
    const newValueText = serializeQuestion(updated, indent);
    const newSource = replaceNodeSpan(source, prop.value, newValueText);
    return validateAndWrite(CURIOSITY_PATH, newSource, curiositySanity);
  }
  // categoria nova: insere a propriedade inteira (chave + valor)
  const valueText = serializeQuestion(updated, indent);
  const propText = siteId + ': ' + valueText;
  const newSource = insertItem(source, siteObj, siteObj.properties.length, propText);
  return validateAndWrite(CURIOSITY_PATH, newSource, curiositySanity);
}

function removeSiteQuestion(siteId) {
  const source = readFile(CURIOSITY_PATH);
  const ast = parse(source);
  const siteObj = findExportedInit(ast, 'SITE_QUESTIONS');
  if (!siteObj) return { ok: false, error: 'SITE_QUESTIONS não encontrado em curiosity.js.' };
  const index = siteObj.properties.findIndex((p) => {
    const k = p.key.type === 'Identifier' ? p.key.name : p.key.type === 'Literal' ? String(p.key.value) : null;
    return k === siteId;
  });
  if (index === -1) return { ok: false, error: "Categoria de site '" + siteId + "' não encontrada." };
  const newSource = removeItem(source, siteObj, index);
  return validateAndWrite(CURIOSITY_PATH, newSource, curiositySanity);
}

module.exports = {
  MOOD_IDS,
  readPersonalityLines,
  savePersonalityTriggerPhrases,
  readLorebook,
  saveLorebookEntry,
  addLorebookEntry,
  removeLorebookEntry,
  moveLorebookEntry,
  readCuriosity,
  saveCuriosityQuestion,
  addCuriosityQuestion,
  removeCuriosityQuestion,
  saveSiteQuestion,
  removeSiteQuestion,
};
