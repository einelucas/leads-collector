const { normalizar } = require('./util');

const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];

const DOMINIOS_LOJA = [
  'nuvemshop', 'lojavirtualnuvem', 'mitiendanube', 'lojaintegrada', 'elo7', 'shopee', 'mercadolivre',
  'mercadolibre', 'shopify', 'myshopify', 'tray.com.br', 'traycommerce', 'yampi', 'vtex', 'bagy',
  'dooca', 'amazon', 'magazinevoce', 'magalu', 'olist', 'cloudfy', 'kyte.link', 'ola.click',
  'wixsite', 'lojasonline', 'loja2', 'iset', 'woocommerce', 'etsy', 'aliexpress', 'americanas',
];
const DOMINIOS_AGREGADOR = [
  'linktr.ee', 'linktree', 'beacons.ai', 'taplink', 'bio.link', 'biolink', 'linkin.bio', 'campsite.bio',
  'lnk.bio', 'bio.site', 'solo.to', 'allmylinks', 'linkme', 'carrd.co', 'msha.ke', 'link.bio',
  'instabio', 'lnk.to', 'direct.me', 'hoo.be', 'flow.page', 'linkfly', 'bio.fm', 'withkoji',
];
const DOMINIOS_ENCURTADOR = ['bit.ly', 'tinyurl', 'encurtador', 'is.gd', 'cutt.ly', 'rebrand.ly', 'l.instagram.com', 't.ly', 'ow.ly'];
const DOMINIOS_WHATSAPP = ['wa.me', 'api.whatsapp.com', 'whatsapp.com', 'wa.link', 'web.whatsapp.com'];
const DOMINIOS_DOCUMENTO = ['drive.google', 'docs.google', 'canva.com', 'dropbox', 'forms.gle', 'onedrive', '1drv.ms', 'notion.site', 'my.flipsnack', 'issuu'];
const DOMINIOS_SOCIAL = ['instagram.com', 'facebook.com', 'fb.com', 'fb.me', 'youtube.com', 'youtu.be', 'tiktok.com', 'pinterest.', 'twitter.com', 'x.com', 'threads.net', 'kwai'];

function hostEUrl(url) {
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : 'https://' + url);
    return { host: u.hostname.toLowerCase().replace(/^www\./, ''), full: u.href.toLowerCase(), path: u.pathname.toLowerCase() };
  } catch {
    return { host: '', full: (url || '').toLowerCase(), path: '' };
  }
}

const contem = (alvo, lista) => lista.some((d) => alvo.includes(d));

/** Tipo do link: nenhum | whatsapp | agregador | encurtador | documento | loja | social | site */
function tipoLink(url) {
  if (!url) return 'nenhum';
  const { host, full, path } = hostEUrl(url);
  if (contem(host, DOMINIOS_WHATSAPP)) return 'whatsapp';
  if (contem(host, DOMINIOS_LOJA)) return 'loja';
  if (contem(host, DOMINIOS_AGREGADOR)) return 'agregador';
  if (contem(host, DOMINIOS_ENCURTADOR)) return 'encurtador';
  if (path.endsWith('.pdf') || contem(host, DOMINIOS_DOCUMENTO)) return 'documento';
  if (contem(host, DOMINIOS_SOCIAL)) return 'social';
  if (contem(full, ['/loja', '/shop', '/produto', '/catalogo'])) return 'loja';
  return 'site';
}

// ---------- extração de contatos e localização ----------

function extrairWhatsapp(texto, links = []) {
  const candidatos = [];
  for (const l of links) {
    const m = (l || '').match(/(?:wa\.me\/|phone=)\+?(\d{10,15})/i);
    if (m) candidatos.push(m[1]);
  }
  const re = /(?:\+?\s*55[\s.-]*)?\(?\b([1-9]\d)\)?[\s.-]*(9?\d{4})[\s.-]?(\d{4})\b/g;
  let m;
  while ((m = re.exec(texto || ''))) candidatos.push('55' + m[1] + m[2] + m[3]);
  for (let c of candidatos) {
    c = c.replace(/\D/g, '');
    if (c.length === 10 || c.length === 11) c = '55' + c;
    if (/^55[1-9]\d(9?\d{8})$/.test(c) && (c.length === 12 || c.length === 13)) return c;
  }
  return '';
}

function extrairEmail(texto) {
  const m = (texto || '').match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/);
  return m ? m[0].toLowerCase() : '';
}

function extrairLocal(texto) {
  const t = (texto || '').replace(/[\r\n]+/g, ' | ');
  const ufs = UFS.join('|');
  const re = new RegExp(`([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][\\p{L}'.]+(?:\\s(?:d[aeo]s?\\s)?[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][\\p{L}'.]+){0,3})\\s*[-/,|–]\\s*(${ufs})\\b`, 'u');
  const m = t.match(re);
  if (m) return { cidade: m[1].trim(), estado: m[2] };
  const so = t.match(new RegExp(`[📍🏠]\\s*([\\p{L} ]{3,30})`, 'u'));
  return { cidade: so ? so[1].trim() : '', estado: '' };
}

// ---------- sinais de texto ----------

const SINAIS_VENDA = [
  /encomend/, /chama no direct/, /chame no direct/, /valor(es)? no direct/, /preco(s)? no direct/,
  /pronta entrega/, /envio para todo/, /enviamos para todo/, /orcamento/, /fa[cç]a seu pedido/,
  /pedidos/, /personalizad/, /sob encomenda/, /chame no whats/, /chama no whats/,
];
const RE_CORREIOS = /correios|sedex|todo o brasil|todo brasil|todo pais|todo o pais|todos os estados|envio nacional|enviamos para todo|envio para todo/;
const RE_CHENILLE = /chenil|pelucia|aramad|cachimbo|flores? (de )?arame|flores? eterna|buque eterno|buques eternos|haste/;
// vendedoras nem sempre escrevem "chenille": buquês/flores artesanais em vários posts também contam
const RE_FLORAL = /buque|flor|lirio|girassol|tulipa|rosas?\b|arranjo|vasinho|margarida|orquidea/;
const RE_TUTORIAL = /tutorial|passo a passo|aula|curso|diy|como fazer|apostila|molde|ensino|workshop|oficina/;
const RE_MATERIA_PRIMA = /atacado|fornecedor|materia[- ]?prima|insumos|armarinho|distribuidor|chenille por metro|fio de chenille|venda de (chenille|arame|materiais)|loja de materiais|material para artesanato/;

const PRODUTOS = [
  ['girassol', 'o', 'girassol'], ['rosa', 'a', 'rosa'], ['tulipa', 'a', 'tulipa'], ['margarida', 'a', 'margarida'],
  ['lirio', 'o', 'lírio'], ['orquidea', 'a', 'orquídea'], ['buque de noiva', 'o', 'buquê de noiva'],
  ['buque', 'o', 'buquê'], ['lembrancinha', 'a', 'lembrancinha'], ['arranjo', 'o', 'arranjo'],
  ['vasinho', 'o', 'vasinho'], ['lavanda', 'a', 'lavanda'],
];

const STOP_PT = /\b(de|para|com|que|em|um|uma|nao|voce|nosso|nossa|feito|feitas|feitos|mao|encomendas|flores|amor)\b/g;
const STOP_EN = /\b(the|and|with|handmade|flowers|order|orders|shipping|your|our|from|custom)\b/g;
const STOP_ES = /\b(el|los|las|con|hecho|hechas|pedidos|envios|nuestro|nuestras|ramos|flores)\b/g;

function idiomaEstrangeiro(textoNorm, bio) {
  const cod = (bio || '').match(/\+\s?(\d{1,3})[\s(.-]/);
  if (cod && cod[1] !== '55') return true;
  if (textoNorm.length < 40) return false;
  const pt = (textoNorm.match(STOP_PT) || []).filter((x) => !['flores'].includes(x)).length;
  const en = (textoNorm.match(STOP_EN) || []).length;
  const es = (textoNorm.match(STOP_ES) || []).filter((x) => x !== 'flores').length;
  return pt === 0 && en + es >= 2;
}

function textoDoPerfil(p) {
  return normalizar([p.bio, p.categoria, ...(p.legendas || [])].join(' \n '));
}

/** Vale seguir as contas semelhantes deste perfil? Precisa ser do nicho (chenille/haste/cachimbo + flores). */
function ehNichoChenille(p) {
  if (p.indisponivel || p.privado) return false;
  const bioN = normalizar(p.bio);
  const legs = (p.legendas || []).map(normalizar);
  const chenille = legs.filter((l) => RE_CHENILLE.test(l)).length;
  const floral = legs.filter((l) => RE_FLORAL.test(l)).length;
  return RE_CHENILLE.test(bioN) || chenille >= 2 || (chenille >= 1 && floral >= 3);
}

// ---------- classificação ----------

function classificar(p) {
  const bioN = normalizar(p.bio);
  const textoN = textoDoPerfil(p);

  if (p.indisponivel) return { classificacao: 'DESCARTAR', motivo: p.indisponivel };
  if (p.privado) return { classificacao: 'DESCARTAR', motivo: 'Perfil privado (não dá para ver os posts)' };
  if (idiomaEstrangeiro(textoN, p.bio)) return { classificacao: 'DESCARTAR', motivo: 'Perfil estrangeiro (idioma/telefone fora do Brasil)' };
  if (!RE_CHENILLE.test(textoN)) return { classificacao: 'DESCARTAR', motivo: 'Sem posts ou bio com flores de chenille' };

  // flores precisam estar na bio ou em vários posts; 1-2 posts soltos = perfil de conteúdo geral
  const postsFloral = (p.legendas || []).filter((l) => RE_FLORAL.test(normalizar(l))).length;
  if (!RE_CHENILLE.test(bioN) && !RE_FLORAL.test(bioN) && postsFloral < 3) {
    return { classificacao: 'DESCARTAR', motivo: `Flores/buquês aparecem em só ${postsFloral} post(s) e não na bio (perfil de conteúdo geral)` };
  }

  const vende = SINAIS_VENDA.some((r) => r.test(textoN));
  if (RE_MATERIA_PRIMA.test(bioN) && !/encomend|buque|sob encomenda/.test(bioN)) {
    return { classificacao: 'DESCARTAR', motivo: 'Parece loja de matéria-prima/atacado, não artesã' };
  }
  if (!vende && (RE_TUTORIAL.test(bioN) || (p.legendas || []).filter((l) => RE_TUTORIAL.test(normalizar(l))).length >= 3)) {
    return { classificacao: 'DESCARTAR', motivo: 'Só conteúdo de tutorial/DIY, sem sinal de venda' };
  }
  if (p.diasDesdeUltimoPost == null) return { classificacao: 'DESCARTAR', motivo: 'Sem posts publicados' };
  if (p.diasDesdeUltimoPost > 90) {
    return { classificacao: 'DESCARTAR', motivo: `Inativo: último post há ${p.diasDesdeUltimoPost} dias` };
  }

  // link da bio
  const v = p.linkVerificacao || {};
  switch (p.linkTipo) {
    case 'nenhum':
      if (/catalogo/.test(bioN) && /whats/.test(bioN)) {
        return { classificacao: 'CATALOGO_FRACO', motivo: 'Sem link; bio cita catálogo apenas no WhatsApp (Business)' };
      }
      return { classificacao: 'SEM_CATALOGO', motivo: 'Sem link na bio' };
    case 'whatsapp':
      if (/catalogo/.test(bioN)) return { classificacao: 'CATALOGO_FRACO', motivo: 'Link da bio vai para WhatsApp e a bio cita catálogo no WhatsApp Business' };
      return { classificacao: 'SEM_CATALOGO', motivo: 'Link da bio é só WhatsApp (wa.me/api.whatsapp)' };
    case 'social':
      return { classificacao: 'SEM_CATALOGO', motivo: `Link da bio é só outra rede social (${p.linkHost})` };
    case 'documento':
      return { classificacao: 'CATALOGO_FRACO', motivo: `Link da bio é PDF/Drive/documento (${p.linkHost})` };
    case 'loja':
      return { classificacao: 'JA_TEM_LOJA', motivo: `Link da bio é loja online (${p.linkHost})` };
    case 'agregador':
    case 'encurtador':
      if (v.lojaEncontrada) return { classificacao: 'JA_TEM_LOJA', motivo: `${p.linkHost} tem botão que leva a loja (${v.lojaUrl})` };
      if (v.tipoFinal === 'whatsapp') return { classificacao: 'SEM_CATALOGO', motivo: 'Link encurtado leva só para WhatsApp' };
      if (v.tipoFinal === 'site' && p.linkTipo === 'encurtador') return { classificacao: 'JA_TEM_LOJA', motivo: `Link encurtado leva para site próprio (${v.hostFinal})` };
      if (v.erro) return { classificacao: 'CATALOGO_FRACO', motivo: `${p.linkHost} não pôde ser aberto (${v.erro}); tratado como link de agregador sem loja` };
      return { classificacao: 'CATALOGO_FRACO', motivo: `${p.linkHost} sem nenhum botão que leve a uma loja` };
    case 'site':
    default:
      return { classificacao: 'JA_TEM_LOJA', motivo: `Site próprio na bio (${p.linkHost})` };
  }
}

// ---------- pontuação ----------

function pontuar(p) {
  const textoN = textoDoPerfil(p);
  const detalhes = [];
  let total = 0;

  const sinais = SINAIS_VENDA.filter((r) => r.test(textoN)).length;
  const pVenda = Math.min(30, sinais * 10);
  if (pVenda) detalhes.push(`venda +${pVenda}`);
  total += pVenda;

  if (p.whatsapp) { total += 20; detalhes.push('whatsapp +20'); }
  if (p.diasDesdeUltimoPost != null && p.diasDesdeUltimoPost <= 14) { total += 20; detalhes.push('ativo +20'); }
  if (p.seguidores >= 500 && p.seguidores <= 20000) { total += 20; detalhes.push('seguidores +20'); }
  if (RE_CORREIOS.test(textoN)) { total += 10; detalhes.push('envio +10'); }
  return { prioridade: total, detalhesPontos: detalhes.join(', ') };
}

// ---------- mensagem ----------

function hashSimples(s) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

// o nome do perfil quase sempre é nome de marca ("Jardim de Pelúcia"), então só cumprimenta por nome
// quando a bio se apresenta ("sou a Ana", "meu nome é Ana")
function primeiroNome(p) {
  const m = (p.bio || '').match(/(?:\bsou (?:a |o )?|meu nome (?:é|e) )([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][\p{L}]{2,13})/u);
  return m ? m[1] : '';
}

function gerarMensagem(p) {
  if (!['SEM_CATALOGO', 'CATALOGO_FRACO'].includes(p.classificacao)) return '';
  const h = hashSimples(p.handle);
  const textoN = textoDoPerfil(p);
  const nome = primeiroNome(p);
  const prod = PRODUTOS.find(([k]) => textoN.includes(k));
  const correios = RE_CORREIOS.test(textoN);

  const o = prod ? `${prod[1]} ${prod[2]}` : 'as flores de chenille';
  const local = p.cidade ? ` (aí de ${p.cidade})` : '';
  const l1 = `Oi${nome ? ', ' + nome : ''}, tudo bem? Vi ${o} no @${p.handle}${local} e achei lindo o seu trabalho 💐`;

  let l2;
  if (p.classificacao === 'CATALOGO_FRACO') {
    const onde = p.linkTipo === 'documento' ? 'um arquivo/PDF' : p.linkTipo === 'nenhum' ? 'o catálogo do WhatsApp' : 'uma lista de links';
    l2 = `Vi que seu link da bio leva para ${onde}, então quem quer ver preço ainda acaba te chamando no direct, um por um.`;
  } else {
    const opcoes = [
      'Imagino que você passe boa parte do dia respondendo preço no direct, um cliente por vez, e quem chega não vê tudo o que você faz.',
      'Deve ser corrido responder valor no direct pra cada pessoa, e muita gente nem chega a ver tudo o que você cria.',
    ];
    l2 = opcoes[h % opcoes.length];
  }
  if (correios) l2 += ' E ainda calcular frete de cada pedido…';

  const l3 = 'Tenho um catálogo digital que adapto com a sua marca e seus produtos: vitrine com fotos e preços por categoria, carrinho que já manda o pedido pronto pro seu WhatsApp e frete calculado pelo CEP.';
  const l4 = 'Cada produto tem link próprio com foto na prévia, e você mesma cadastra e edita tudo pelo celular.';
  const l5 = h % 2 ? 'Posso te mandar um exemplo?' : 'Posso te mandar um exemplo pra você ver como fica?';

  return [l1, l2, l3, l4, l5].join('\n');
}

/** Roda classificação + pontuação + mensagem sobre um perfil coletado. */
function analisar(p) {
  const c = classificar(p);
  const out = { ...p, ...c, prioridade: 0, detalhesPontos: '' };
  if (['SEM_CATALOGO', 'CATALOGO_FRACO'].includes(c.classificacao)) Object.assign(out, pontuar(p));
  out.mensagem = gerarMensagem(out);
  return out;
}

module.exports = {
  tipoLink, hostEUrl, DOMINIOS_LOJA, extrairWhatsapp, extrairEmail, extrairLocal,
  classificar, pontuar, gerarMensagem, analisar, ehNichoChenille, UFS,
};
