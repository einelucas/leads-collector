const fs = require('fs');
const path = require('path');
const { DIR_SAIDA, garantirPasta } = require('./util');
const { analisar } = require('./analise');

const ORDEM = ['SEM_CATALOGO', 'CATALOGO_FRACO', 'JA_TEM_LOJA', 'DESCARTAR'];
const ROTULO = {
  SEM_CATALOGO: 'SEM CATÁLOGO', CATALOGO_FRACO: 'CATÁLOGO FRACO', JA_TEM_LOJA: 'JÁ TEM LOJA', DESCARTAR: 'DESCARTADOS',
};

function ordenar(leads) {
  return [...leads].sort((a, b) =>
    ORDEM.indexOf(a.classificacao) - ORDEM.indexOf(b.classificacao)
    || b.prioridade - a.prioridade
    || b.seguidores - a.seguidores);
}

const celula = (v) => {
  const s = v == null ? '' : String(v).replace(/\r?\n/g, ' ⏎ ');
  return /[;"]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function gerarCsv(leads) {
  const cols = [
    ['handle', 'arroba'], ['nomePerfil', 'nome'], ['urlPerfil', 'url_perfil'], ['foto', 'url_foto'], ['bio', 'bio'],
    ['seguidores', 'seguidores'], ['posts', 'posts'], ['link', 'link_bio'], ['cidade', 'cidade'], ['estado', 'estado'],
    ['whatsapp', 'whatsapp'], ['email', 'email'], ['comercial', 'conta_comercial'], ['categoria', 'categoria'],
    ['img1', 'img_post_1'], ['img2', 'img_post_2'], ['img3', 'img_post_3'], ['ultimoPost', 'ultimo_post'],
    ['diasDesdeUltimoPost', 'dias_desde_ultimo_post'], ['hashtagOrigem', 'origem'],
    ['classificacao', 'classificacao'], ['motivo', 'motivo'], ['prioridade', 'prioridade'],
    ['detalhesPontos', 'detalhes_pontuacao'], ['mensagem', 'mensagem'],
  ];
  const linhas = ordenar(leads).map((l) => {
    const v = { ...l, img1: l.imagens[0] || '', img2: l.imagens[1] || '', img3: l.imagens[2] || '', comercial: l.comercial ? 'sim' : 'não' };
    return cols.map(([k]) => celula(v[k])).join(';');
  });
  return '﻿' + [cols.map(([, t]) => t).join(';'), ...linhas].join('\r\n') + '\r\n';
}

function gerarTxt(leads) {
  const out = [`LEADS DE PROSPECÇÃO — flores de chenille (${leads.length} perfis)`, `Gerado em ${new Date().toLocaleString('pt-BR')}`, ''];
  for (const cls of ORDEM) {
    const grupo = ordenar(leads.filter((l) => l.classificacao === cls));
    out.push('='.repeat(70), `${ROTULO[cls]} (${grupo.length})`, '='.repeat(70), '');
    if (!grupo.length) out.push('(nenhum)', '');
    for (const l of grupo) {
      out.push(`@${l.handle} — ${l.nomePerfil || '-'}${['SEM_CATALOGO', 'CATALOGO_FRACO'].includes(cls) ? `   [prioridade ${l.prioridade}/100]` : ''}`);
      out.push(`  Perfil: ${l.urlPerfil}`);
      out.push(`  Seguidores: ${l.seguidores} | Posts: ${l.posts} | Último post: ${l.diasDesdeUltimoPost == null ? '?' : 'há ' + l.diasDesdeUltimoPost + ' dias'}`);
      if (l.cidade || l.estado) out.push(`  Local: ${[l.cidade, l.estado].filter(Boolean).join(' - ')}`);
      if (l.whatsapp) out.push(`  WhatsApp: ${l.whatsapp}`);
      if (l.email) out.push(`  E-mail: ${l.email}`);
      if (l.link) out.push(`  Link da bio: ${l.link}`);
      out.push(`  Motivo: ${l.motivo}`);
      if (l.detalhesPontos) out.push(`  Pontuação: ${l.detalhesPontos}`);
      if (l.mensagem) out.push('  Mensagem:', ...l.mensagem.split('\n').map((x) => '    | ' + x));
      out.push('');
    }
  }
  return out.join('\n');
}

function gerarHtml(leads) {
  const modelo = fs.readFileSync(path.join(__dirname, 'painel.template.html'), 'utf8');
  const dados = ordenar(leads).map((l) => ({
    handle: l.handle, nome: l.nomePerfil, url: l.urlPerfil, foto: l.foto, bio: l.bio,
    seguidores: l.seguidores, posts: l.posts, link: l.link, cidade: l.cidade, estado: l.estado,
    whatsapp: l.whatsapp, email: l.email, imagens: l.imagens, ultimoPost: l.ultimoPost,
    dias: l.diasDesdeUltimoPost, classificacao: l.classificacao, motivo: l.motivo,
    prioridade: l.prioridade, mensagem: l.mensagem,
  }));
  const BS = String.fromCharCode(92);
  const json = JSON.stringify(dados).split('<').join(BS + 'x3c').split(String.fromCharCode(0x2028)).join(BS + 'u2028').split(String.fromCharCode(0x2029)).join(BS + 'u2029');
  return modelo
    .replace('/*__DADOS__*/[]', () => json)
    .replace('__GERADO_EM__', () => new Date().toLocaleString('pt-BR'));
}

/** perfisColetados: objeto handle -> dados brutos. Reaplica a análise sempre (regras podem mudar). */
function gerarSaidas(perfisColetados, dir = DIR_SAIDA) {
  garantirPasta(dir);
  const leads = Object.values(perfisColetados).map(analisar);
  fs.writeFileSync(path.join(dir, 'leads.csv'), gerarCsv(leads), 'utf8');
  fs.writeFileSync(path.join(dir, 'leads.txt'), gerarTxt(leads), 'utf8');
  fs.writeFileSync(path.join(dir, 'leads.html'), gerarHtml(leads), 'utf8');
  return leads;
}

module.exports = { gerarSaidas };
