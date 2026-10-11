const fs = require('fs');
const path = require('path');
const {
  DIR_DADOS, carregarProgresso, salvarProgresso, pausaAleatoria,
} = require('./util');
const {
  Bloqueio, abrirNavegador, garantirLogin, descobrirPorHashtag, coletarPerfil, verificarLinkAgregador,
} = require('./coletar');
const { ehNichoChenille } = require('./analise');
const { gerarSaidas } = require('./saidas');

const ARQ_SEMENTES = path.join(DIR_DADOS, 'sementes.txt');
const MAX_PERFIS_POR_EXECUCAO = 60;
const POSTS_POR_HASHTAG = 25;

// uso: node src/index.js [--teste] [--max=N] [--hashtags=a,b]
// Fluxo principal: parte dos @ de dados/sementes.txt e segue as "Sugestões para você" de cada perfil do nicho.
function lerArgs() {
  const a = Object.fromEntries(process.argv.slice(2).map((x) => {
    const [k, v] = x.replace(/^--/, '').split('=');
    return [k, v === undefined ? true : v];
  }));
  const teste = !!a.teste;
  return {
    teste,
    hashtags: a.hashtags ? a.hashtags.split(',') : [],
    max: Math.min(MAX_PERFIS_POR_EXECUCAO, parseInt(a.max, 10) || (teste ? 5 : MAX_PERFIS_POR_EXECUCAO)),
    postsPorHashtag: teste ? 10 : POSTS_POR_HASHTAG,
  };
}

/** Aceita "@fulana", "fulana" ou a URL do perfil; ignora linhas vazias e comentários (#). */
function lerSementes() {
  let texto = '';
  try { texto = fs.readFileSync(ARQ_SEMENTES, 'utf8'); } catch { return []; }
  const handles = [];
  for (const linha of texto.split(/\r?\n/)) {
    const l = linha.split('#')[0].trim();
    if (!l) continue;
    const m = l.match(/instagram\.com\/([A-Za-z0-9._]+)/i) || l.match(/^@?([A-Za-z0-9._]+)$/);
    if (m && !handles.includes(m[1].toLowerCase())) handles.push(m[1].toLowerCase());
  }
  return handles;
}

async function main() {
  const cfg = lerArgs();
  const prog = carregarProgresso();
  const pendentes = () => prog.fila.filter((f) => !prog.perfis[f.handle]);
  const naFila = (h) => prog.fila.some((f) => f.handle === h) || !!prog.perfis[h];

  // sementes novas entram na frente da fila, na ordem em que foram escritas
  const novasSementes = lerSementes().filter((h) => !naFila(h));
  prog.fila.unshift(...novasSementes.map((handle) => ({ handle, hashtag: 'semente', semente: true })));
  const sementesSet = new Set(lerSementes());
  prog.fila.forEach((f) => { if (sementesSet.has(f.handle)) f.semente = true; });

  console.log(`Modo: ${cfg.teste ? 'TESTE' : 'COMPLETO'} | máx ${cfg.max} perfis${cfg.hashtags.length ? ' | hashtags: ' + cfg.hashtags.join(', ') : ''}`);
  console.log(`Sementes: ${sementesSet.size} (${novasSementes.length} novas) | coletados: ${Object.keys(prog.perfis).length} | na fila: ${pendentes().length}`);
  if (!pendentes().length && !cfg.hashtags.length) {
    console.log(`\nNada para coletar. Coloque os @ de partida em ${ARQ_SEMENTES} (um por linha) e rode de novo.`);
    return;
  }

  const { ctx, page } = await abrirNavegador();
  let coletadosNaExecucao = 0;
  let bloqueio = null;

  process.on('SIGINT', async () => {
    console.log('\nInterrompido: salvando progresso e saídas...');
    try { salvarProgresso(prog); gerarSaidas(prog.perfis); } catch { /* ignora */ }
    await ctx.close().catch(() => {});
    process.exit(0);
  });

  try {
    await garantirLogin(ctx, page);

    // descoberta por hashtag (opcional)
    for (const tag of cfg.hashtags) {
      if (pendentes().length >= cfg.max) break;
      const autores = await descobrirPorHashtag(page, tag, cfg.postsPorHashtag);
      for (const handle of autores) if (!naFila(handle)) prog.fila.push({ handle, hashtag: tag });
      prog.hashtagsVisitadas[tag] = new Date().toISOString();
      salvarProgresso(prog);
    }

    // coleta em largura: sementes primeiro; relacionados novos entram no fim da fila
    while (coletadosNaExecucao < cfg.max && pendentes().length) {
      const item = pendentes()[0];
      console.log(`[${coletadosNaExecucao + 1}/${cfg.max}] @${item.handle}  (origem: ${item.hashtag})`);
      const perfil = await coletarPerfil(page, item.handle, item.hashtag);

      if (['agregador', 'encurtador'].includes(perfil.linkTipo)) {
        console.log(`    abrindo ${perfil.linkHost} para procurar loja...`);
        perfil.linkVerificacao = await verificarLinkAgregador(ctx, perfil.link);
      }

      let novos = 0;
      if (item.semente || ehNichoChenille(perfil)) {
        for (const rel of perfil.relacionados || []) {
          if (!naFila(rel)) { prog.fila.push({ handle: rel, hashtag: `relacionado de @${item.handle}` }); novos++; }
        }
      }
      prog.perfis[item.handle] = perfil;
      salvarProgresso(prog);
      coletadosNaExecucao++;
      console.log(`    ${perfil.nomePerfil || '-'} | ${perfil.seguidores} seg | último post: ${perfil.diasDesdeUltimoPost ?? '?'} dias | link: ${perfil.linkHost || 'nenhum'} | +${novos} relacionados na fila`);

      if (coletadosNaExecucao < cfg.max && pendentes().length) await pausaAleatoria(5, 15);
    }
  } catch (e) {
    if (e instanceof Bloqueio) {
      bloqueio = e.message;
    } else {
      console.error('\nErro inesperado:', e);
    }
  } finally {
    salvarProgresso(prog);
    const leads = gerarSaidas(prog.perfis);
    await ctx.close().catch(() => {});
    console.log(`\nSalvo: ${coletadosNaExecucao} perfis nesta execução, ${leads.length} no total, ${pendentes().length} ainda na fila. Saídas em ./saida (leads.csv, leads.txt, leads.html).`);
    if (bloqueio) {
      console.log('\n!!! PAREI POR SEGURANÇA !!!');
      console.log(`Motivo: ${bloqueio}`);
      console.log('Abra o Instagram manualmente, resolva a verificação e espere várias horas antes de rodar de novo. O progresso foi salvo.');
      process.exitCode = 2;
    }
  }
}

main();
