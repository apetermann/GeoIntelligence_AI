# Áreas Atlântica Minas e Empresas Listadas — Documentação do Projeto

> Aplicativo web (mapa interativo) que mostra, no mapa do Brasil, as **empresas de mineração listadas em bolsa** (ASX, TSX, TSX.V e Nasdaq) com projetos no país e as **áreas de processos minerários da Atlântica Minas**. Inclui cotação da ação e valor de mercado de cada empresa, com atualização diária automática.

- **Site no ar:** https://apetermann.github.io/WebApp_Nexial_Atlantica/
- **Repositório GitHub:** https://github.com/apetermann/WebApp_Nexial_Atlantica
- **Última atualização desta documentação:** 06/07/2026

---

## 1. Visão geral

É um **site estático** (não precisa de servidor/back-end) hospedado gratuitamente no **GitHub Pages**. Toda a lógica roda no navegador do usuário. O mapa usa a biblioteca **Leaflet** (embarcada no próprio projeto, sem depender de CDN externo) sobre um mapa base escuro da CARTO/OpenStreetMap.

O app tem duas grandes partes:

1. **Barra lateral (esquerda no computador / topo→base no celular):** logos, título, busca, filtros, camadas e a lista de empresas com preço e valor de mercado.
2. **Mapa:** marcadores das empresas (por commodity) e polígonos das áreas da Atlântica (por substância), com legenda recolhível.

---

## 2. Conteúdo de dados

### 2.1. Empresas (53 no total, 90 projetos)

Empresas de mineração listadas em bolsa com projetos no Brasil, distribuídas por bolsa:

| Bolsa | Qtde | Exemplos |
|---|---|---|
| **ASX** (Austrália) | 22 | Meteoric, Viridis, Centaurus, St George, Brazilian Rare Earths, Latin Resources, Axel REE, Alvo, Lightning, Summit… |
| **TSX** (Toronto) | 13 | Ero Copper, Kinross, Lundin, Nexa, Largo, Aclara, Jaguar, Serabi, Belo Sun, G Mining, Verde AgriTech… |
| **TSX.V** (juniores) | 14 | Lithium Ionic, Cabral Gold, Lara, Bravo, ValOre, Itafos, South Star, Altamira, Lavras Gold… |
| **NASDAQ** (EUA) | 4 | Sigma Lithium, Atlas Lithium, Atlas Critical Minerals, Aura Minerals |

Cada empresa tem um ou mais **projetos**, e cada projeto vira um **marcador** no mapa, colorido pela **commodity** (terras raras, lítio, ouro, cobre, níquel, ferro, fosfato, grafita, nióbio, urânio, vanádio, platina, etc.).

Cada empresa mostra também **preço da ação** e **valor de mercado** (ver seção 4).

> Observação: dados curados de fontes públicas (Stockhead, MINING.COM, Junior Mining Network, sites das empresas e relatórios NI 43-101 / JORC). Coordenadas são aproximadas (nível de município/projeto). Não é aconselhamento de investimento.

### 2.2. Áreas Atlântica Minas (163 processos)

Polígonos dos **processos minerários da Atlântica Minas** (ANM/SIGMINE), extraídos de um arquivo **KMZ** e convertidos para GeoJSON. Cada área é colorida pela **substância** (predomínio de minério de ferro; também areia, ouro, manganês, fosfato, grafita, terras raras, etc.) e pode ser filtrada por substância. Ao clicar, o popup mostra processo, substância, fase, área (ha), titular e UF.

> Uma segunda camada ("Novas Áreas – Felix", 217 processos) chegou a ser adicionada e depois **removida a pedido**.

---

## 3. Funcionalidades da interface

- **Busca** por nome, projeto ou ticker da empresa.
- **Camada "Empresas"** com liga/desliga e filtros por **bolsa**, **commodity** e **estado**.
- **Camada "Áreas Atlântica Minas"** com liga/desliga, botão **"focar"** (centraliza o mapa nas áreas) e **filtro por substância**.
- **Lista de empresas** clicável: ao clicar, o mapa voa até os projetos da empresa e abre o popup.
- **Cotação e valor de mercado** em cada card e em cada popup.
- **Legenda recolhível** (mostra as cores de commodity e de substância). Começa **recolhida no celular** para dar mais espaço ao mapa; no computador começa aberta.
- **Popups** com detalhes do projeto/empresa e da área.

---

## 4. Cotações automáticas (preço + valor de mercado)

Como o site é estático, as cotações são atualizadas por um **robô no GitHub (GitHub Actions)**:

1. O script `scripts/fetch_quotes.py` (usando a biblioteca **yfinance** / Yahoo Finance) busca o **preço da ação** e o **valor de mercado** de cada empresa.
2. O símbolo no Yahoo é montado a partir da bolsa: `.AX` (ASX), `.TO` (TSX), `.V` (TSX.V), sem sufixo (Nasdaq). Exceção: a Nexa usa `NEXA`.
3. O resultado é gravado em `data/quotes.json`.
4. O workflow `.github/workflows/update-quotes.yml` roda **todo dia às 22:30 UTC** (e pode ser rodado manualmente), grava o `quotes.json` atualizado e faz o commit — o que dispara automaticamente uma nova publicação do site.

Empresas sem dado no Yahoo (baixa liquidez, adquirida/deslistada, etc.) aparecem sem cotação. Os valores são exibidos na moeda de negociação (A$, C$, US$), com mais casas decimais para ações de centavos.

---

## 5. Versão para celular

Layout dedicado para telas até 760px de largura:

- **Mapa no topo**, ocupando ~78% da altura da tela (mínimo 440px).
- **Página com rolagem única**: abaixo do mapa vêm logos, filtros e a lista, rolando naturalmente (sem áreas apertadas com rolagem própria).
- **Alvos de toque maiores** (busca, seletores, caixas de marcação e botões).
- **Legenda recolhida por padrão** (um botãozinho), liberando o máximo de mapa.

No computador o layout continua lado a lado (barra + mapa).

---

## 6. Identidade visual

- **Logos da Atlântica Minas e da Nexial Partners** lado a lado, num cartão branco compacto no topo da barra.
- **Favicon** (ícone da aba do navegador) com o símbolo da Nexial.
- **Tema escuro** consistente; título "Áreas Atlântica Minas e Empresas Listadas".

---

## 7. Estrutura de arquivos

```
site/
├── index.html                     # página principal (estrutura da barra e do mapa)
├── styles.css                     # tema escuro, layout desktop e mobile
├── app.js                         # toda a lógica (mapa, camadas, filtros, cotações)
├── data/
│   ├── companies.json             # 53 empresas e seus projetos
│   ├── tenements.geojson          # 163 áreas Atlântica (polígonos)
│   └── quotes.json                # cotações (atualizado pelo robô diariamente)
├── scripts/
│   └── fetch_quotes.py            # busca preço e valor de mercado (yfinance)
├── assets/
│   ├── atlantica-logo.png
│   ├── nexial-logo.png
│   └── favicon.png
├── vendor/leaflet/                # biblioteca do mapa (embarcada, sem CDN)
├── .github/workflows/
│   ├── deploy-pages.yml           # publica o site no GitHub Pages a cada push
│   └── update-quotes.yml          # atualiza as cotações todo dia
├── .nojekyll
├── README.md
├── HANDOFF.md
└── DOCUMENTACAO.md                # este arquivo
```

---

## 8. Como funciona a publicação (deploy)

- O site é publicado pelo **GitHub Pages** usando **GitHub Actions**.
- A cada `push` na branch **main**, o workflow `deploy-pages.yml` publica a versão nova (~1–2 minutos).
- Ocasionalmente o passo de deploy do GitHub falha com "Deployment failed, try again later" (problema temporário do próprio GitHub, não do conteúdo); basta rodar o workflow de deploy novamente.

### Controle de cache
Os arquivos `styles.css` e `app.js` são referenciados com `?v=N` no `index.html` (atualmente **v=12**). Esse número é incrementado a cada mudança de código para forçar o navegador a baixar a versão nova (evita "versão velha em cache"). Os arquivos de dados são buscados com revalidação (`cache: no-cache`), então sempre pegam a versão mais recente.

---

## 9. Como editar os dados

- **Empresas:** editar `data/companies.json`. Cada empresa tem `ticker`, `name`, `exchange` (ASX/TSX/TSX.V/NASDAQ), `website`, `primaryCommodity` e uma lista de `projects` (nome, commodity, tipo, estado, município, status, `lat`, `lng`, nota).
- **Áreas:** substituir `data/tenements.geojson` (gerado a partir do KMZ da ANM).
- **Cotações:** não precisa mexer — o robô atualiza sozinho. Para rodar na mão: `python scripts/fetch_quotes.py` (requer `pip install yfinance`).

Depois de editar código (JS/CSS), lembrar de **incrementar o `?v=` no `index.html`**.

---

## 10. Tecnologias

- **HTML, CSS e JavaScript** puros (sem framework).
- **Leaflet 1.9.4** (mapa), embarcado localmente.
- **Python + yfinance** (script de cotações, roda no GitHub Actions).
- **GitHub Pages + GitHub Actions** (hospedagem e automações).

---

## 11. Histórico do que foi construído

1. Publicação inicial do app (só ASX) no GitHub e no GitHub Pages.
2. Expansão para **TSX e TSX.V**, com revisão da ASX; filtro por bolsa e novas cores/estados.
3. Inclusão das **163 áreas da Atlântica Minas** (camada de polígonos a partir do KMZ).
4. Adição do **logo da Nexial** e depois do **logo da Atlântica** no cabeçalho + favicon.
5. **Empresas e Áreas como camadas** independentes; áreas coloridas por substância + filtro de substância; legenda em duas seções.
6. Mudança de título e inclusão de **juniores da Nasdaq**; **preço da ação e valor de mercado** com **atualização diária automática**.
7. Correções de usabilidade: cotação nos popups, rolagem da barra, layout do cabeçalho e logos mais compactos.
8. Crítica de UX/design com recomendações.
9. (Camada "Novas Áreas – Felix" adicionada e depois removida.)
10. **Versão mobile** (mapa grande no topo, rolagem única) e **legenda recolhível**.

---

## 12. Ideias para o futuro (opcionais)

- **Agrupar marcadores** que se sobrepõem em regiões densas (Carajás, Tapajós, Vale do Lítio).
- **Ordenar a lista** por valor de mercado ou nome.
- **Variação % do dia** (verde/vermelho) nas cotações.
- **Filtros fixos** no topo enquanto só a lista rola.
- Melhorias de **acessibilidade** (navegação por teclado nos cards, contrastes).

---

## 13. Avisos

- Dados curados para fins ilustrativos; **não é aconselhamento de investimento**.
- Coordenadas aproximadas (nível de município/projeto).
- Cotações podem estar defasadas; verifique os anúncios oficiais na bolsa antes de qualquer decisão.
