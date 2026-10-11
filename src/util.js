const fs = require('fs');
const path = require('path');
const readline = require('readline');

const RAIZ = path.resolve(__dirname, '..');
const DIR_DADOS = path.join(RAIZ, 'dados');
const DIR_SAIDA = path.join(RAIZ, 'saida');
const DIR_SESSAO = path.join(RAIZ, 'sessao-instagram');
const ARQ_PROGRESSO = path.join(DIR_DADOS, 'progresso.json');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const aleatorio = (min, max) => Math.floor(min + Math.random() * (max - min + 1));
const pausaAleatoria = (minS, maxS) => sleep(aleatorio(minS * 1000, maxS * 1000));

function esperarEnter(mensagem) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(mensagem, () => { rl.close(); resolve(); }));
}

function normalizar(s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function garantirPasta(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function carregarProgresso(arquivo = ARQ_PROGRESSO) {
  try {
    const p = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
    return { fila: [], perfis: {}, hashtagsVisitadas: {}, ...p };
  } catch {
    return { fila: [], perfis: {}, hashtagsVisitadas: {} };
  }
}

function salvarProgresso(prog, arquivo = ARQ_PROGRESSO) {
  garantirPasta(path.dirname(arquivo));
  const tmp = arquivo + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(prog, null, 2), 'utf8');
  fs.renameSync(tmp, arquivo);
}

module.exports = {
  RAIZ, DIR_DADOS, DIR_SAIDA, DIR_SESSAO, ARQ_PROGRESSO,
  sleep, aleatorio, pausaAleatoria, esperarEnter, normalizar,
  garantirPasta, carregarProgresso, salvarProgresso,
};
