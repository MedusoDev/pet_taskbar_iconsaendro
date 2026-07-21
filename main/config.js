// ── Configuração persistida em disco: pet.config.json e pet.tuning.json ──
// Nada aqui muta `state` diretamente — quem chama decide o que fazer com o
// resultado (ver bootstrap em ../main.js), então este módulo pode ser
// testado/lido isoladamente do resto do processo main.
const { app } = require('electron');
const path = require('path');
const fs = require('fs');

// ── pet.tuning.json: tudo que a janela de Configurações deixa editar ao
// vivo (ver settings/ e renderer/behaviors/settingsBridge.js) pode ser
// "salvo como padrão" — em vez de reescrever arquivos-fonte (frágil e
// arriscado), os valores vão pra um JSON só, lido aqui no boot e
// reaplicado. `main` hidrata state ANTES da janela ser criada; `renderer`
// é repassado pro pet via IPC (evento 'tuning-config') assim que a página
// carrega, reaproveitando o mesmo caminho que a edição ao vivo usa
// (settingsBridge.applyTuningConfig).
function loadTuning() {
  const p = path.join(app.getPath('userData'), 'pet.tuning.json');
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return {};
  }
}

function saveTuning(tuning) {
  const p = path.join(app.getPath('userData'), 'pet.tuning.json');
  fs.writeFileSync(p, JSON.stringify(tuning, null, 2));
}

// ── pet.config.json ──
// { "aiProvider": "ollama"|"groq"|"none", "ollamaModel": "llama3.2:3b",
//   "groqApiKey": "gsk_...", "petName": "Ico", "userName": "..." } — tudo
// opcional. aiProvider escolhe o cérebro de IA (default: "groq" se houver
// groqApiKey, senão "none"); sem provider disponível, o pet usa o cérebro
// local (offline) no chat. GROQ_API_KEY no ambiente também vale.
//
// Os DOIS arquivos são lidos e MESCLADOS (não é "o primeiro que existir
// vence"): primeiro o que fica ao lado do código (base/dev — no .exe
// empacotado, dentro do asar, geralmente nem existe), depois o de
// %APPDATA%/Icozinho (editado ao vivo pela janela de Configurações via
// setApiKey()/saveAsDefault() — menu da bandeja abre essa pasta), que
// sobrescreve campo a campo por cima. Antes disso era "primeiro que existir
// vence" — um pet.config.json de %APPDATA% quase vazio (ex.: {} criado por
// "Salvar como padrão" sem chave nenhuma configurada) escondia por completo
// o arquivo da raiz do projeto, mesmo tendo aiProvider/ollamaModel corretos
// nele.
function loadConfig() {
  const candidates = [
    path.join(__dirname, '..', 'pet.config.json'),
    path.join(app.getPath('userData'), 'pet.config.json'),
  ];
  let merged = {};
  let foundAny = false;
  for (const p of candidates) {
    let raw;
    try {
      raw = fs.readFileSync(p, 'utf8');
    } catch (err) {
      if (err.code !== 'ENOENT') console.log(`[pet] config: erro lendo ${p}: ${err.message}`);
      continue;
    }
    try {
      const parsed = JSON.parse(raw);
      console.log(`[pet] config carregada de: ${p}`);
      console.log(`[pet] config conteúdo: ${JSON.stringify(parsed)}`);
      merged = { ...merged, ...parsed };
      foundAny = true;
    } catch (err) {
      // Achou o arquivo mas o JSON é inválido — sem isto, esse candidato seria
      // pulado em silêncio (mesmo catch{} que trata "arquivo não existe") e o
      // próximo da lista assumiria sem ninguém saber por quê.
      console.log(`[pet] config: ${p} existe mas o JSON é inválido (${err.message}) — ignorando`);
    }
  }
  if (!foundAny) {
    console.log('[pet] config: nenhum pet.config.json encontrado em nenhum candidato — usando defaults ({})');
  } else {
    console.log(`[pet] config final (mesclada): ${JSON.stringify(merged)}`);
  }
  return merged;
}

module.exports = { loadTuning, saveTuning, loadConfig };
