// Editor seguro de código-fonte: usado pela aba "Cérebro e Falas" da janela
// de Configurações pra gravar direto em renderer/personalities/*.js,
// renderer/behaviors/lorebook.js e renderer/behaviors/curiosity.js sem
// quebrar a sintaxe.
//
// Estratégia (por que NÃO regeneramos o arquivo inteiro): esses arquivos são
// bem comentados em PT-BR (comentários de seção, explicações). Se a gente
// desmontasse o arquivo inteiro num AST e reimprimisse tudo, perderíamos
// todo comentário que não faz parte dos DADOS (id/match/replies/...). Em vez
// disso, usamos o `acorn` só pra ACHAR os limites exatos (start/end) do
// trecho que precisa mudar, e fazemos um splice cirúrgico de texto ali —
// todo o resto do arquivo (comentários, formatação) fica intocado.
//
// Depois de qualquer escrita: fazemos backup (.bak, sobrescrito a cada save)
// ANTES de tocar no arquivo original, e validamos o resultado com um novo
// parse (acorn.parse) antes de gravar de vez — se o texto gerado não for JS
// válido, a escrita é abortada e o chamador recebe { ok:false, error }.
const fs = require('fs');
const path = require('path');
const acorn = require('acorn');

const RENDERER_DIR = path.join(__dirname, '..', 'renderer');
const PERSONALITIES_DIR = path.join(RENDERER_DIR, 'personalities');
const LOREBOOK_PATH = path.join(RENDERER_DIR, 'behaviors', 'lorebook.js');
const CURIOSITY_PATH = path.join(RENDERER_DIR, 'behaviors', 'curiosity.js');

// ── parsing / localização ────────────────────────────────────────────────
function parse(source) {
  return acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
}

/** Acha o `init` de `export const <name> = ...` OU de um `const <name> = ...`
 * de nível de módulo sem export (ex.: curiosity.js guarda GENERIC_QUESTIONS/
 * SITE_QUESTIONS/NSFW_QUESTIONS como consts internas, não exportadas). */
function findExportedInit(ast, name) {
  for (const node of ast.body) {
    let decl = null;
    if (node.type === 'ExportNamedDeclaration' && node.declaration && node.declaration.type === 'VariableDeclaration') {
      decl = node.declaration;
    } else if (node.type === 'VariableDeclaration') {
      decl = node;
    }
    if (!decl) continue;
    for (const d of decl.declarations) {
      if (d.id.type === 'Identifier' && d.id.name === name) return d.init;
    }
  }
  return null;
}

function propValue(objNode, key) {
  if (!objNode || objNode.type !== 'ObjectExpression') return null;
  for (const p of objNode.properties) {
    if (p.type !== 'Property') continue;
    const k = p.key.type === 'Identifier' ? p.key.name : p.key.type === 'Literal' ? String(p.key.value) : null;
    if (k === key) return p.value;
  }
  return null;
}

function propNode(objNode, key) {
  if (!objNode || objNode.type !== 'ObjectExpression') return null;
  for (const p of objNode.properties) {
    if (p.type !== 'Property') continue;
    const k = p.key.type === 'Identifier' ? p.key.name : p.key.type === 'Literal' ? String(p.key.value) : null;
    if (k === key) return p;
  }
  return null;
}

function itemsOf(containerNode) {
  return containerNode.type === 'ArrayExpression' ? containerNode.elements : containerNode.properties;
}

// ── texto / formatação ───────────────────────────────────────────────────
function lineIndent(source, pos) {
  let i = pos;
  while (i > 0 && source[i - 1] !== '\n') i--;
  const m = /^[ \t]*/.exec(source.slice(i, pos));
  return m ? m[0] : '';
}

function quoteString(s) {
  return "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n') + "'";
}

function serializeStringArray(arr, indent) {
  const list = Array.isArray(arr) ? arr : [];
  if (!list.length) return '[]';
  const quoted = list.map((s) => quoteString(String(s)));
  // Array curto (1-2 itens, cabe numa linha razoável): mantém compacto —
  // é assim que a maioria dos byLevel/replies de 1 frase já vive no
  // arquivo; multi-linha por entrada de 1 item só deixava tudo mais
  // verboso sem ganhar nada em legibilidade.
  const oneLine = '[' + quoted.join(', ') + ']';
  if (list.length <= 2 && oneLine.length <= 100) return oneLine;
  const inner = indent + '  ';
  return '[\n' + quoted.map((q) => inner + q).join(',\n') + ',\n' + indent + ']';
}

function regexLiteral(source, flags) {
  return '/' + source + '/' + (flags || '');
}

/** Acha, a partir de `pos`, a próxima vírgula pulando só espaço em branco
 * (nunca comentários) — usada pra saber onde emendar um item novo/removido
 * sem comer um comentário de seção por engano. */
function skipToComma(source, pos) {
  let i = pos;
  while (i < source.length && /[ \t\r\n]/.test(source[i])) i++;
  return source[i] === ',' ? i + 1 : pos;
}

// ── operações genéricas sobre listas (ArrayExpression.elements ou
//    ObjectExpression.properties) ──────────────────────────────────────────
function replaceNodeSpan(source, node, newText) {
  return source.slice(0, node.start) + newText + source.slice(node.end);
}

function removeItem(source, containerNode, index) {
  const items = itemsOf(containerNode);
  const item = items[index];
  const delStart = index === 0 ? containerNode.start + 1 : items[index - 1].end;
  let delEnd = item.end;
  if (index === 0 && items.length > 1) {
    delEnd = skipToComma(source, item.end);
  }
  return source.slice(0, delStart) + source.slice(delEnd);
}

/** Insere `newItemText` (SEM vírgula) na posição `index` (0-based;
 * index === items.length agrega no fim). */
function insertItem(source, containerNode, index, newItemText) {
  const items = itemsOf(containerNode);
  const indent = lineIndent(source, containerNode.start) + '  ';
  const piece = '\n' + indent + newItemText.trim() + ',';

  if (items.length === 0) {
    const closeIndent = lineIndent(source, containerNode.start);
    return source.slice(0, containerNode.start + 1) + piece + '\n' + closeIndent + source.slice(containerNode.start + 1);
  }
  if (index >= items.length) {
    const last = items[items.length - 1];
    const afterComma = skipToComma(source, last.end);
    if (afterComma === last.end) {
      return source.slice(0, last.end) + ',' + piece + source.slice(last.end);
    }
    return source.slice(0, afterComma) + piece + source.slice(afterComma);
  }
  const insertAt = index === 0 ? containerNode.start + 1 : skipToComma(source, items[index - 1].end);
  return source.slice(0, insertAt) + piece + source.slice(insertAt);
}

/** Troca o CONTEÚDO de dois itens (usado pra mover pra cima/baixo) sem
 * mexer no que está ENTRE eles — comentários/divisores de seção continuam
 * exatamente onde estavam no arquivo. */
function swapItems(source, containerNode, i, j) {
  const items = itemsOf(containerNode);
  const [a, b] = i < j ? [items[i], items[j]] : [items[j], items[i]];
  const aText = source.slice(a.start, a.end);
  const bText = source.slice(b.start, b.end);
  return source.slice(0, a.start) + bText + source.slice(a.end, b.start) + aText + source.slice(b.end);
}

// ── ler/gravar arquivo com validação + backup ───────────────────────────
function readFile(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

/** Valida (reparse) e só então faz backup + grava. Nunca deixa um arquivo
 * quebrado no disco: se o reparse falhar, devolve { ok:false, error } e não
 * toca em nada. */
function validateAndWrite(filePath, newSource, sanityCheck) {
  let ast;
  try {
    ast = parse(newSource);
  } catch (err) {
    return { ok: false, error: 'Sintaxe inválida depois da edição: ' + err.message };
  }
  if (sanityCheck) {
    try {
      const problem = sanityCheck(ast, newSource);
      if (problem) return { ok: false, error: problem };
    } catch (err) {
      return { ok: false, error: 'Falha ao validar a estrutura resultante: ' + err.message };
    }
  }
  try {
    fs.copyFileSync(filePath, filePath + '.bak');
  } catch (err) {
    return { ok: false, error: 'Falha ao criar backup (.bak) — nada foi gravado: ' + err.message };
  }
  try {
    fs.writeFileSync(filePath, newSource, 'utf8');
  } catch (err) {
    return { ok: false, error: 'Falha ao gravar o arquivo: ' + err.message };
  }
  return { ok: true };
}

module.exports = {
  RENDERER_DIR,
  PERSONALITIES_DIR,
  LOREBOOK_PATH,
  CURIOSITY_PATH,
  parse,
  findExportedInit,
  propValue,
  propNode,
  itemsOf,
  lineIndent,
  quoteString,
  serializeStringArray,
  regexLiteral,
  skipToComma,
  replaceNodeSpan,
  removeItem,
  insertItem,
  swapItems,
  readFile,
  validateAndWrite,
};
