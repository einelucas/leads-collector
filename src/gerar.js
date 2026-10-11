// Regenera saida/ a partir de dados/progresso.json, sem abrir o navegador.
const { carregarProgresso } = require('./util');
const { gerarSaidas } = require('./saidas');

const prog = carregarProgresso();
const leads = gerarSaidas(prog.perfis);
console.log(`Arquivos gerados em ./saida para ${leads.length} perfis.`);
