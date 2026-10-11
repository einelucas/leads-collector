# leads-collector

Monta uma lista de prospecção de artesãs que vendem **flores de chenille** no Instagram e **ainda não têm
catálogo digital/loja online**. Para cada perfil o projeto coleta os dados públicos, classifica, dá uma nota de
prioridade (0–100), escreve uma mensagem de abordagem personalizada e gera um painel (`leads.html`) para
acompanhar o contato com cada lead.

> **Aviso:** a coleta automatizada vai contra os termos de uso do Instagram e pode levar a captcha ou bloqueio
> da conta. O projeto usa pausas aleatórias, limite de 60 perfis por execução e para ao primeiro sinal de
> verificação. Use com moderação, espalhe as execuções ao longo dos dias e use por sua conta e risco.

## Requisitos

- Node.js 18 ou superior
- Google Chrome instalado (se não houver, o script usa o Chromium do Playwright)

## Instalação

```bash
npm install
npx playwright install chromium
```

## Como usar

### 1. Informe os perfis de partida (sementes)

Crie `dados/sementes.txt` com um perfil por linha (`@fulana`, `fulana` ou a URL do perfil). Linhas começando
com `#` são ignoradas. Veja `sementes.exemplo.txt`.

O script parte desses perfis e segue as **"Sugestões para você"** de cada um que seja do nicho
(chenille/haste/cachimbo + flores), porque perfis do mesmo nicho costumam se seguir. Os relacionados entram no
fim da fila e a lista vai crescendo sozinha. Também dá para descobrir perfis por hashtag com `--hashtags=a,b`.

### 2. Rode a coleta

```bash
npm run teste      # teste: 5 perfis
npm run coletar    # execução normal: até 60 perfis
node src/index.js --max=20                      # limite personalizado (máx. 60)
node src/index.js --hashtags=floresdechenille   # também descobre perfis por hashtag
```

Na primeira vez abre o Chrome com o perfil salvo em `./sessao-instagram`. Se você não estiver logado, o script
pausa: **faça o login manualmente na janela** e aperte Enter no terminal. A senha nunca é pedida nem gravada.

O progresso é salvo em `dados/progresso.json` a cada perfil. Se você rodar de novo, ele continua de onde parou e
não repete perfis já coletados.

Se aparecer verificação, captcha ou "Tente novamente mais tarde", o script **para na hora**, salva tudo e avisa
no terminal. Resolva a verificação pelo Instagram normal e espere várias horas antes de rodar de novo.

### 3. Veja os resultados

Os arquivos ficam em `saida/`:

| Arquivo | Conteúdo |
| --- | --- |
| `leads.csv` | uma linha por perfil (`;`, UTF-8 com BOM, abre direto no Excel) |
| `leads.txt` | legível, agrupado por classificação e ordenado por prioridade |
| `leads.html` | painel visual de arquivo único; abra **direto no navegador** (não na prévia do VS Code) |

Para refazer os arquivos sem abrir o navegador (por exemplo, depois de mudar uma regra):

```bash
npm run gerar
```

## Classificação

| Classe | Significado |
| --- | --- |
| `SEM_CATALOGO` | sem link na bio, ou link só de WhatsApp/rede social |
| `CATALOGO_FRACO` | Linktree/bio.site sem loja, PDF/Drive, ou catálogo só no WhatsApp |
| `JA_TEM_LOJA` | site próprio, Nuvemshop, Loja Integrada, Elo7, Shopee, Mercado Livre, Shopify etc. |
| `DESCARTAR` | não vende (tutorial/DIY), matéria-prima, estrangeiro, sem flores, sem post há mais de 90 dias, privado |

Links de Linktree e similares são abertos para ver se algum botão leva a uma loja. O campo `motivo` registra por
que cada perfil recebeu sua classificação.

## Prioridade (0–100)

Para `SEM_CATALOGO` e `CATALOGO_FRACO`: sinais de venda na bio/posts (até 30) + WhatsApp na bio (20) + perfil
ativo, post nos últimos 14 dias (20) + 500 a 20.000 seguidores (20) + menciona Correios/envio para todo o
Brasil (10).

## Painel (`leads.html`)

- contadores no topo, filtros (classificação, status, estado), busca e ordenação;
- botões: abrir perfil, abrir link da bio, WhatsApp (já com a mensagem) e copiar mensagem;
- status por lead (Novo, Contatado, Respondeu, Negociando, Fechado, Sem interesse) salvo no `localStorage` do
  navegador, com botão **Exportar status** (CSV);
- tema claro/escuro e layout responsivo. As fotos do Instagram expiram; quando não carregam, aparece um
  placeholder com as iniciais.

## Estrutura

```
src/index.js        orquestra a coleta (sementes, fila, limites, bloqueio)
src/coletar.js      navegador, login, leitura de perfil, relacionados, verificação de Linktree
src/analise.js      classificação, pontuação e mensagem de abordagem
src/saidas.js       gera leads.csv, leads.txt e leads.html
src/painel.template.html   modelo do painel
src/gerar.js        regenera a saída a partir de dados/progresso.json
```

## Cuidados

- `sessao-instagram/` guarda seus cookies de login. **Nunca** compartilhe nem versione essa pasta (já está no
  `.gitignore`, assim como `dados/` e `saida/`, que têm dados de terceiros).
- O layout do Instagram muda com frequência. Se a leitura de algum campo falhar, os seletores ficam em
  `src/coletar.js` (`lerPaginaPerfil` e `lerRelacionados`).
