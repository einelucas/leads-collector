const { chromium } = require('playwright');
const {
  DIR_SESSAO, sleep, aleatorio, pausaAleatoria, esperarEnter, salvarProgresso,
} = require('./util');
const {
  tipoLink, hostEUrl, DOMINIOS_LOJA, extrairWhatsapp, extrairEmail, extrairLocal,
} = require('./analise');

const IG = 'https://www.instagram.com';
const RESERVADOS = new Set(['explore', 'p', 'reel', 'reels', 'accounts', 'direct', 'stories', 'tv', 'about', 'legal', 'web', 'api', 'static', 'challenge']);

class Bloqueio extends Error {}

// ---------- detecção de bloqueio ----------

const RE_BLOQUEIO = /tente novamente mais tarde|try again later|confirme que (é|e) voc(ê|e)|verificar sua identidade|suspicious|atividade incomum|unusual activity|captcha|recaptcha|aguarde alguns minutos|please wait a few minutes/i;

async function checarBloqueio(page) {
  const url = page.url();
  if (/\/challenge|\/accounts\/suspended|\/accounts\/login/.test(url)) {
    throw new Bloqueio(`Redirecionado para ${url} (verificação/login pedido)`);
  }
  const texto = await page.evaluate(() => (document.body ? document.body.innerText.slice(0, 3000) : '')).catch(() => '');
  if (RE_BLOQUEIO.test(texto)) throw new Bloqueio('Instagram mostrou tela de verificação/limite ("Tente novamente mais tarde"/captcha)');
}

// ---------- sessão ----------

async function estaLogado(ctx) {
  const cookies = await ctx.cookies(IG);
  return cookies.some((c) => c.name === 'sessionid' && c.value);
}

async function garantirLogin(ctx, page) {
  await page.goto(IG + '/', { waitUntil: 'domcontentloaded' });
  await sleep(3000);
  while (!(await estaLogado(ctx))) {
    console.log('\n>>> Você não está logado. Faça login MANUALMENTE na janela do Chromium (eu nunca vejo nem salvo sua senha).');
    await esperarEnter('>>> Quando terminar de logar, aperte Enter aqui no terminal... ');
    await sleep(1500);
  }
  console.log('Sessão do Instagram ativa.');
}

// ---------- descoberta por hashtag ----------

async function descobrirPorHashtag(page, tag, limitePosts) {
  console.log(`\n# Hashtag #${tag}`);
  await page.goto(`${IG}/explore/tags/${tag}/`, { waitUntil: 'domcontentloaded' });
  await sleep(4000);
  await checarBloqueio(page);

  const links = new Set();
  for (let i = 0; i < 6 && links.size < limitePosts; i++) {
    const achados = await page.$$eval('a[href*="/p/"], a[href*="/reel/"]', (as) => as.map((a) => a.getAttribute('href')));
    achados.forEach((h) => { const m = h && h.match(/\/(p|reel)\/[\w-]+/); if (m) links.add(m[0]); });
    if (links.size >= limitePosts) break;
    await page.mouse.wheel(0, 1500);
    await sleep(aleatorio(1500, 3000));
  }
  const posts = [...links].slice(0, limitePosts);
  console.log(`  ${posts.length} posts encontrados na página`);

  const autores = [];
  for (const rel of posts) {
    await pausaAleatoria(3, 6);
    try {
      await page.goto(IG + '/' + rel.replace(/^\//, '') + '/', { waitUntil: 'domcontentloaded' });
      await sleep(2500);
      await checarBloqueio(page);
      const autor = await page.evaluate((reservados) => {
        const cand = [...document.querySelectorAll('article a[href^="/"], main a[href^="/"], header a[href^="/"]')];
        for (const a of cand) {
          const m = a.getAttribute('href').match(/^\/([A-Za-z0-9._]+)\/$/);
          if (m && !reservados.includes(m[1].toLowerCase())) return m[1];
        }
        return null;
      }, [...RESERVADOS]);
      if (autor) autores.push(autor.toLowerCase());
      console.log(`  ${rel} -> ${autor ? '@' + autor : '(autor não encontrado — seletor pode ter mudado)'}`);
    } catch (e) {
      if (e instanceof Bloqueio) throw e;
      console.log(`  ${rel} -> erro: ${e.message.split('\n')[0]}`);
    }
  }
  return autores;
}

// ---------- coleta de perfil (lê a própria página; a API interna devolve 429) ----------

function paraNumero(s) {
  if (s == null) return 0;
  let t = String(s).trim().toLowerCase().replace(/\s/g, '');
  let mult = 1;
  if (/(mil|k)$/.test(t)) { mult = 1e3; t = t.replace(/(mil|k)$/, ''); }
  else if (/(mi|m)$/.test(t)) { mult = 1e6; t = t.replace(/(mi|m)$/, ''); }
  t = t.replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  const n = parseFloat(t);
  return Number.isFinite(n) ? Math.round(n * mult) : 0;
}

/** Roda dentro da página do perfil e devolve o que está visível no cabeçalho e no grid. */
function lerPaginaPerfil() {
  const header = document.querySelector('header');
  const texto = header ? header.innerText : '';
  const linhas = texto.split('\n').map((l) => l.trim()).filter(Boolean);
  const num = (re) => { const m = texto.match(re); return m ? m[1] : null; };
  const posts = num(/([\d.,]+\s*(?:mil|mi|k|m)?)\s*(?:posts|publica)/i);
  const seguidores = num(/([\d.,]+\s*(?:mil|mi|k|m)?)\s*seguidores/i);
  const idxSeguindo = linhas.findIndex((l) => /seguindo\s*$/i.test(l) || /following\s*$/i.test(l));
  const botoes = /^(seguir|seguindo|enviar mensagem|mensagem|contato|e-mail|email|ligar|como chegar|follow|message)$/i;
  // a bio termina no texto do link, nos botões (Seguir/Mensagem) ou em "Destaques"; o que vem depois são destaques
  const reLinkTexto = /^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/\S*)?(\s+e mais \d+)?$/i;
  const fimBio = (l) => botoes.test(l) || /^destaques$/i.test(l) || reLinkTexto.test(l) || l.toLowerCase() === (linhas[0] || '').toLowerCase();
  const restante = linhas.slice(idxSeguindo + 1);
  const corte = restante.findIndex(fimBio);
  const bio = (corte === -1 ? restante : restante.slice(0, corte)).join('\n');
  const linhaLink = restante.find((l) => reLinkTexto.test(l));
  const linkDoTexto = linhaLink ? linhaLink.split(/\s+/)[0].replace(/^(?!https?:)/i, 'https://') : '';
  const limpar = (h) => {
    try { const u = new URL(h); ['fbclid', 'e', 'utm_source', 'utm_medium', 'utm_content', 'utm_campaign'].forEach((p) => u.searchParams.delete(p)); return u.href; } catch (e) { return h; }
  };
  const links = [...document.querySelectorAll('header a[href]')].map((a) => {
    try {
      const u = new URL(a.href);
      if (u.hostname === 'l.instagram.com') return limpar(u.searchParams.get('u') || '');
      if (/(^|\.)(instagram|threads)\.(com|net)$/.test(u.hostname)) return '';
      return limpar(a.href);
    } catch (e) { return ''; }
  }).filter(Boolean);
  if (!links.length && linkDoTexto) links.push(linkDoTexto);
  const miniaturas = [...document.querySelectorAll('main a[href*="/p/"], main a[href*="/reel/"]')].slice(0, 12);
  const itens = miniaturas.map((a) => {
    const im = a.querySelector('img');
    return {
      href: a.getAttribute('href'),
      src: im ? im.src : '',
      alt: im ? im.alt || '' : '',
      fixado: /fixad|pinned/i.test(a.innerHTML),
    };
  });
  return {
    nome: linhas[1] && linhas[1] !== linhas[0] ? linhas[1] : (linhas[0] || ''),
    posts, seguidores, bio, links,
    foto: (header && header.querySelector('img') || {}).src || '',
    botoes: [...document.querySelectorAll('header button, header a[role="button"], header div[role="button"]')].map((b) => b.innerText.trim()),
    privado: /esta conta (é|e) privada|this account is private/i.test(document.body.innerText),
    itens,
  };
}

/** Clica em "Contas semelhantes" no perfil e devolve os @ de "Sugestões para você" (mesmo nicho). */
async function lerRelacionados(page, handle) {
  try {
    // clica no botão pai do ícone (clicar no <svg> direto falha); mesmo método validado à mão
    const clicou = await page.evaluate(() => {
      const s = document.querySelector('header svg[aria-label="Contas semelhantes"], header svg[aria-label="Similar accounts"]');
      if (!s) return false;
      (s.closest('[role="button"], button') || s.parentElement).click();
      return true;
    });
    if (!clicou) return [];
    await sleep(2500);
    return await page.evaluate(({ self, reservados }) => {
      const titulo = [...document.querySelectorAll('main span, main h2, main div')]
        .find((e) => e.children.length === 0 && /^(sugest(ões|oes) para voc(ê|e)|suggested for you)$/i.test(e.textContent.trim()));
      if (!titulo) return [];
      const y = titulo.getBoundingClientRect().top;
      const out = [];
      for (const a of document.querySelectorAll('main a[href^="/"]')) {
        const m = a.getAttribute('href').match(/^\/([A-Za-z0-9._]+)\/$/);
        if (!m) continue;
        const h = m[1].toLowerCase();
        if (reservados.includes(h) || h === self.toLowerCase() || a.getBoundingClientRect().top < y) continue;
        if (!out.includes(h)) out.push(h);
      }
      return out;
    }, { self: handle, reservados: [...RESERVADOS] });
  } catch {
    return [];
  }
}

async function lerUltimoPost(page, itens) {
  const alvo = itens.find((i) => !i.fixado) || itens[0];
  if (!alvo) return { data: '', legenda: '' };
  await pausaAleatoria(3, 6);
  await page.goto(IG + alvo.href, { waitUntil: 'domcontentloaded' });
  await sleep(aleatorio(2000, 3500));
  await checarBloqueio(page);
  return page.evaluate(() => {
    const t = document.querySelector('time[datetime]');
    const h = document.querySelector('article h1, main h1');
    return { data: t ? t.getAttribute('datetime') : '', legenda: h ? h.innerText : '' };
  });
}

async function coletarPerfil(page, handle, hashtagOrigem) {
  const base = {
    handle, urlPerfil: `${IG}/${handle}/`, hashtagOrigem, coletadoEm: new Date().toISOString(),
    nomePerfil: '', foto: '', bio: '', seguidores: 0, posts: 0, link: '', linkTipo: 'nenhum', linkHost: '',
    cidade: '', estado: '', whatsapp: '', email: '', comercial: false, categoria: '', imagens: [], legendas: [],
    ultimoPost: '', diasDesdeUltimoPost: null, privado: false, indisponivel: '',
  };

  await page.goto(base.urlPerfil, { waitUntil: 'domcontentloaded' });
  await sleep(aleatorio(3000, 4500));
  await checarBloqueio(page);

  const corpo = await page.evaluate(() => (document.body ? document.body.innerText.slice(0, 1500) : ''));
  if (/esta p(á|a)gina n(ã|a)o est(á|a) dispon(í|i)vel|page isn.t available|sorry, this page/i.test(corpo)) {
    return { ...base, indisponivel: 'Perfil não existe ou foi removido' };
  }

  await page.waitForSelector('header', { timeout: 10000 }).catch(() => {});
  // bios longas ficam truncadas atrás do botão "mais"; expande para ler bio e link completos
  await page.locator('header').getByText(/^(mais|more)$/i).first().click({ timeout: 2000 }).catch(() => {});
  await sleep(600);
  const d = await page.evaluate(lerPaginaPerfil);
  if (!d.posts && !d.seguidores && !d.bio) {
    throw new Error('Não consegui ler o cabeçalho do perfil (seletor pode ter mudado)');
  }

  const links = [...new Set(d.links)];
  Object.assign(base, {
    nomePerfil: d.nome, foto: d.foto, bio: d.bio,
    seguidores: paraNumero(d.seguidores), posts: paraNumero(d.posts),
    link: links[0] || '', privado: d.privado,
    comercial: d.botoes.some((b) => /^(contato|e-mail|email|ligar|como chegar)$/i.test(b)),
    imagens: d.itens.slice(0, 3).map((i) => i.src).filter(Boolean),
    legendas: d.itens.map((i) => i.alt).filter(Boolean),
  });

  base.relacionados = d.privado ? [] : await lerRelacionados(page, handle);

  if (!d.privado) {
    const ult = await lerUltimoPost(page, d.itens);
    if (ult.legenda) base.legendas.unshift(ult.legenda);
    if (ult.data) {
      base.ultimoPost = ult.data;
      base.diasDesdeUltimoPost = Math.max(0, Math.floor((Date.now() - new Date(ult.data).getTime()) / 86400000));
    }
  }

  base.whatsapp = extrairWhatsapp(base.bio, links);
  base.email = extrairEmail(base.bio);
  const loc = extrairLocal(base.bio);
  base.cidade = loc.cidade;
  base.estado = loc.estado;
  base.linkTipo = tipoLink(base.link);
  base.linkHost = base.link ? hostEUrl(base.link).host : '';
  return base;
}


// ---------- verificação de Linktree e similares ----------

async function verificarLinkAgregador(ctx, url) {
  const aba = await ctx.newPage();
  const resultado = { lojaEncontrada: false, lojaUrl: '', tipoFinal: '', hostFinal: '', erro: '' };
  try {
    await aba.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await sleep(3500);
    const urlFinal = aba.url();
    resultado.tipoFinal = tipoLink(urlFinal);
    resultado.hostFinal = hostEUrl(urlFinal).host;
    if (resultado.tipoFinal === 'loja') {
      resultado.lojaEncontrada = true; resultado.lojaUrl = urlFinal;
    } else if (resultado.tipoFinal === 'agregador') {
      const hrefs = await aba.$$eval('a[href^="http"]', (as) => as.map((a) => a.href));
      const loja = hrefs.find((h) => tipoLink(h) === 'loja' || /\/(loja|shop|catalogo|produtos?)(\/|$)/i.test(h));
      if (loja) { resultado.lojaEncontrada = true; resultado.lojaUrl = loja; }
    }
  } catch (e) {
    resultado.erro = e.message.split('\n')[0].slice(0, 80);
  } finally {
    await aba.close().catch(() => {});
  }
  return resultado;
}

async function abrirNavegador() {
  const opcoes = {
    headless: false,
    viewport: { width: 1280, height: 900 },
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
  };
  let ctx;
  try {
    ctx = await chromium.launchPersistentContext(DIR_SESSAO, { ...opcoes, channel: 'chrome' });
  } catch {
    console.log('Google Chrome não encontrado; usando o Chromium do Playwright.');
    ctx = await chromium.launchPersistentContext(DIR_SESSAO, opcoes);
  }
  const page = ctx.pages()[0] || (await ctx.newPage());
  return { ctx, page };
}

module.exports = {
  Bloqueio, abrirNavegador, garantirLogin, descobrirPorHashtag, coletarPerfil, verificarLinkAgregador,
  DOMINIOS_LOJA, salvarProgresso,
};
