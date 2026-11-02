/* ASX no Brasil — mapa interativo de empresas ASX com projetos no Brasil.
   Dados: data/companies.json. Mapa: Leaflet + OpenStreetMap. */

// A ordem importa: colorFor() pega a PRIMEIRA chave contida na string da commodity.
const COMMODITY_COLORS = {
  "Terras Raras": "#e0b341",
  "Platina": "#cbd5e1",
  "Lítio": "#4ade80",
  "Níquel": "#22d3ee",
  "Zinco": "#60a5fa",
  "Cobre": "#c084fc",
  "Ouro": "#facc15",
  "Vanádio": "#f472b6",
  "Grafita": "#64748b",
  "Diamantes": "#f0abfc",
  "Nióbio": "#fca5a5",
  "Urânio": "#2dd4bf",
  "Minério de Ferro": "#f97316",
  "Fosfato": "#a3e635",
  "Potássio": "#fb923c",
  "Titânio": "#94a3b8",
  "default": "#9ca3af",
};

const STATUS_COLORS = {
  "Produção": "#2ea043",
  "Desenvolvimento": "#3b82f6",
  "Exploração": "#a855f7",
  "Adquirida": "#6b7280",
};

function colorFor(commodity) {
  // Pega a primeira palavra-chave conhecida da string de commodity.
  for (const key of Object.keys(COMMODITY_COLORS)) {
    if (key !== "default" && commodity.includes(key)) return COMMODITY_COLORS[key];
  }
  return COMMODITY_COLORS.default;
}

// Cores das áreas Atlântica por substância (alinhadas às commodities das empresas).
const SUBSTANCE_COLORS = {
  "MINÉRIO DE FERRO": "#f97316",
  "FERRO": "#f97316",
  "MINÉRIO DE OURO": "#facc15",
  "MINÉRIO DE MANGANÊS": "#ec4899",
  "FOSFATO": "#a3e635",
  "GRAFITA": "#64748b",
  "TERRAS RARAS": "#e0b341",
  "MINÉRIO DE LÍTIO": "#4ade80",
  "MINÉRIO DE TITÂNIO": "#94a3b8",
  "COBRE": "#c084fc",
  "MINÉRIO DE BERÍLIO": "#2dd4bf",
  "AREIA": "#d6b370",
  "CALCÁRIO": "#e7c9a9",
  "QUARTZO": "#a5f3fc",
  "GNAISSE": "#9c7a5b",
  "GRANITO": "#b08968",
  "default": "#e11d48",
};

function substanceColor(sub) {
  return SUBSTANCE_COLORS[sub] || SUBSTANCE_COLORS.default;
}

// "MINÉRIO DE FERRO" -> "Minério de Ferro"
function prettifySub(s) {
  const small = new Set(["de", "da", "do", "das", "dos", "e"]);
  return s.toLowerCase().split(" ")
    .map((w, i) => (i > 0 && small.has(w)) ? w : w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

const STATE_NAMES = {
  MG: "Minas Gerais", BA: "Bahia", PA: "Pará", SP: "São Paulo",
  RS: "Rio Grande do Sul", AM: "Amazonas", GO: "Goiás", MT: "Mato Grosso",
  TO: "Tocantins", AP: "Amapá", CE: "Ceará", MA: "Maranhão", PR: "Paraná",
  RN: "Rio Grande do Norte", PB: "Paraíba", RO: "Rondônia", RR: "Roraima",
};

let DATA = null;
let MAP = null;
const MARKERS = {}; // key: `${ticker}::${projectName}` -> marker
let activeTicker = null;
let COMPANIES_LAYER = null;          // grupo com os marcadores de empresas
let TENEMENTS_LAYER = null;          // grupo (geoJSON) com os polígonos das áreas
let TENEMENT_ITEMS = [];             // [{ layer, sub }] para filtrar por substância
let TENEMENT_TOTAL = 0;
let LEGEND_COMMODITY_HTML = "";
let LEGEND_AREA_HTML = "";
let QUOTES = null;                   // { asOf, quotes: { "BOLSA:TICKER": {price, marketCap, currency} } }

const CURRENCY_SYMBOL = { AUD: "A$", CAD: "C$", USD: "US$", BRL: "R$", GBP: "£", EUR: "€" };
function moneyPrefix(cur) { return CURRENCY_SYMBOL[cur] || (cur ? cur + " " : ""); }
function fmtPrice(v, cur) {
  if (v == null) return null;
  // Ações de centavos (juniores) precisam de mais casas para não virar 0,00.
  const opts = v < 1
    ? { minimumFractionDigits: 2, maximumFractionDigits: 4 }
    : { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  return moneyPrefix(cur) + v.toLocaleString("pt-BR", opts);
}
function fmtCap(v, cur) {
  if (v == null) return null;
  const p = moneyPrefix(cur);
  if (v >= 1e9) return p + (v / 1e9).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + " B";
  if (v >= 1e6) return p + (v / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " M";
  if (v >= 1e3) return p + (v / 1e3).toLocaleString("pt-BR", { maximumFractionDigits: 0 }) + " mil";
  return p + v.toLocaleString("pt-BR");
}
function quoteFor(c) {
  return (QUOTES && QUOTES.quotes) ? QUOTES.quotes[`${c.exchange}:${c.ticker}`] : null;
}

async function init() {
  try {
    const res = await fetch("data/companies.json", { cache: "no-cache" });
    DATA = await res.json();
  } catch (e) {
    document.getElementById("companyList").innerHTML =
      `<li style="padding:16px;color:#f87171">Erro ao carregar dados: ${e.message}.<br>
       Rode via servidor local (ex.: <code>python3 -m http.server</code>) — abrir o arquivo direto pode bloquear o fetch.</li>`;
    return;
  }

  setupMap();
  populateFilters();
  renderFooter();
  render();
  loadTenements();
  loadQuotes();

  // Camada de empresas
  document.getElementById("search").addEventListener("input", render);
  document.getElementById("exchangeFilter").addEventListener("change", render);
  document.getElementById("commodityFilter").addEventListener("change", render);
  document.getElementById("stateFilter").addEventListener("change", render);
  document.getElementById("companiesToggle").addEventListener("change", e => {
    if (e.target.checked) COMPANIES_LAYER.addTo(MAP);
    else MAP.removeLayer(COMPANIES_LAYER);
  });

  // Camada de áreas Atlântica
  document.getElementById("tenementsToggle").addEventListener("change", renderTenements);
  document.getElementById("substanceFilter").addEventListener("change", renderTenements);
  document.getElementById("tenementsFocus").addEventListener("click", () => {
    if (TENEMENTS_LAYER && MAP.hasLayer(TENEMENTS_LAYER)) {
      MAP.flyToBounds(TENEMENTS_LAYER.getBounds().pad(0.2), { duration: 0.8 });
    }
  });

  // Legenda recolhível (começa recolhida no celular para dar mais espaço ao mapa).
  const legend = document.getElementById("legend");
  document.getElementById("legendToggle").addEventListener("click", () => {
    legend.classList.toggle("collapsed");
  });
  if (window.matchMedia && window.matchMedia("(max-width: 760px)").matches) {
    legend.classList.add("collapsed");
  }
}

function setupMap() {
  MAP = L.map("map", { zoomControl: true, attributionControl: true })
    .setView([-15.5, -49], 4);

  // Mapa base: OpenStreetMap (gratuito, sem chave). O tema escuro é feito por
  // um filtro CSS em .leaflet-tile-pane (styles.css).
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; OpenStreetMap',
    maxZoom: 19,
  }).addTo(MAP);

  // Pane dedicado às áreas (polígonos), abaixo dos marcadores de empresas.
  MAP.createPane("tenements");
  MAP.getPane("tenements").style.zIndex = 350;

  // Grupo (camada) das empresas; a participação dos marcadores é controlada por render().
  COMPANIES_LAYER = L.layerGroup().addTo(MAP);

  // Cria os marcadores uma vez só.
  for (const company of DATA.companies) {
    for (const p of company.projects) {
      const color = colorFor(p.commodity);
      const marker = L.circleMarker([p.lat, p.lng], {
        radius: 8,
        fillColor: color,
        color: "#fff",
        weight: 2,
        opacity: 1,
        fillOpacity: 0.9,
      }).bindPopup(() => popupHtml(company, p)); // função: reavalia ao abrir (já com cotações)
      marker._company = company;
      MARKERS[`${company.ticker}::${p.name}`] = marker;
    }
  }

  buildLegend();
}

function popupHtml(company, p) {
  const statusColor = STATUS_COLORS[p.status] || "#6b7280";
  const site = company.website
    ? `<a class="popup-link" href="${company.website}" target="_blank" rel="noopener">Site da empresa ↗</a>`
    : "";
  const q = quoteFor(company);
  const price = q && fmtPrice(q.price, q.currency);
  const cap = q && fmtCap(q.marketCap, q.currency);
  return `
    <div class="popup-title">${p.name}</div>
    <div class="popup-sub">${company.name} · <b>${company.exchange}:${company.ticker}</b></div>
    <div class="popup-row"><b>Commodity:</b> ${p.commodity}</div>
    <div class="popup-row"><b>Tipo:</b> ${p.type || "—"}</div>
    <div class="popup-row"><b>Local:</b> ${p.municipality || "—"} — ${STATE_NAMES[p.state] || p.state}</div>
    <div class="popup-row"><b>Status:</b>
      <span class="status-badge" style="background:${statusColor}33;color:${statusColor}">${p.status}</span></div>
    ${price ? `<div class="popup-row"><b>Cotação:</b> ${price}</div>` : ""}
    ${cap ? `<div class="popup-row"><b>Valor de mercado:</b> ${cap}</div>` : ""}
    ${p.note ? `<div class="popup-note">${p.note}</div>` : ""}
    ${site}
  `;
}

async function loadTenements() {
  let data;
  try {
    const res = await fetch("data/tenements.geojson", { cache: "no-cache" });
    data = await res.json();
  } catch (e) {
    return; // sem áreas; o resto do app segue normal
  }

  TENEMENT_TOTAL = (data.features || []).length;
  TENEMENT_ITEMS = [];

  TENEMENTS_LAYER = L.geoJSON(data, {
    pane: "tenements",
    style: f => {
      const c = substanceColor(f.properties.substancia);
      return { color: c, weight: 1, opacity: 0.9, fillColor: c, fillOpacity: 0.22 };
    },
    onEachFeature: (f, layer) => {
      layer.bindPopup(tenementPopup(f.properties), { maxWidth: 280 });
      layer.on("mouseover", () => layer.setStyle({ weight: 2.5, fillOpacity: 0.42 }));
      layer.on("mouseout", () => TENEMENTS_LAYER.resetStyle(layer));
      TENEMENT_ITEMS.push({ layer, sub: f.properties.substancia || "" });
    },
  }).addTo(MAP);

  populateSubstanceFilter(data);
  buildAreaLegend(data);
  renderTenements();
}

// Mostra/oculta a camada de áreas e aplica o filtro de substância.
function renderTenements() {
  if (!TENEMENTS_LAYER) return;
  const visible = document.getElementById("tenementsToggle").checked;
  const sub = document.getElementById("substanceFilter").value;
  const countEl = document.getElementById("tenementsCount");

  if (!visible) {
    if (MAP.hasLayer(TENEMENTS_LAYER)) MAP.removeLayer(TENEMENTS_LAYER);
    if (countEl) countEl.textContent = TENEMENT_TOTAL;
    return;
  }
  if (!MAP.hasLayer(TENEMENTS_LAYER)) TENEMENTS_LAYER.addTo(MAP);

  let shown = 0;
  TENEMENT_ITEMS.forEach(({ layer, sub: s }) => {
    const ok = !sub || s === sub;
    if (ok) {
      if (!TENEMENTS_LAYER.hasLayer(layer)) TENEMENTS_LAYER.addLayer(layer);
      shown++;
    } else if (TENEMENTS_LAYER.hasLayer(layer)) {
      TENEMENTS_LAYER.removeLayer(layer);
    }
  });
  if (countEl) countEl.textContent = sub ? `${shown} / ${TENEMENT_TOTAL}` : TENEMENT_TOTAL;
}

function populateSubstanceFilter(data) {
  const counts = {};
  data.features.forEach(f => {
    const s = f.properties.substancia;
    if (s) counts[s] = (counts[s] || 0) + 1;
  });
  const subs = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
  const sf = document.getElementById("substanceFilter");
  subs.forEach(s => {
    sf.insertAdjacentHTML("beforeend",
      `<option value="${s}">${prettifySub(s)} (${counts[s]})</option>`);
  });
}

function tenementPopup(p) {
  const row = (label, val) => val ? `<div class="popup-row"><b>${label}:</b> ${val}</div>` : "";
  const area = p.area_ha ? `${p.area_ha} ha` : "";
  return `
    <div class="popup-title">Processo ${p.processo || "—"}</div>
    <div class="popup-sub">Área de mineração · Atlântica Minas</div>
    ${row("Substância", p.substancia)}
    ${row("Uso", p.uso)}
    ${row("Fase", p.fase)}
    ${row("Área", area)}
    ${row("Titular", p.titular)}
    ${row("UF", STATE_NAMES[p.uf] || p.uf)}
  `;
}

function buildLegend() {
  const used = new Set();
  DATA.companies.forEach(c => c.projects.forEach(p => used.add(colorFor(p.commodity))));

  const seenColors = new Set();
  const html = Object.keys(COMMODITY_COLORS)
    .filter(k => k !== "default")
    .filter(k => used.has(COMMODITY_COLORS[k]))
    .filter(k => {
      const c = COMMODITY_COLORS[k];
      if (seenColors.has(c)) return false;
      seenColors.add(c); return true;
    })
    .map(k => `<div class="legend-item"><span class="dot" style="background:${COMMODITY_COLORS[k]}"></span>${k}</div>`)
    .join("");

  LEGEND_COMMODITY_HTML = `<h4>Empresas · commodity</h4>${html}`;
  renderLegend();
}

function buildAreaLegend(data) {
  const counts = {};
  data.features.forEach(f => {
    const s = f.properties.substancia;
    if (s) counts[s] = (counts[s] || 0) + 1;
  });
  const subs = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
  const items = subs.map(s =>
    `<div class="legend-item"><span class="dot" style="background:${substanceColor(s)}"></span>${prettifySub(s)}<span class="legend-count">${counts[s]}</span></div>`
  ).join("");
  LEGEND_AREA_HTML = `<h4 class="legend-h4-2">Áreas · substância</h4>${items}`;
  renderLegend();
}

function renderLegend() {
  document.getElementById("legendBody").innerHTML = LEGEND_COMMODITY_HTML + LEGEND_AREA_HTML;
}

function populateFilters() {
  const cc = document.getElementById("companiesCount");
  if (cc) cc.textContent = DATA.companies.length;

  const commodities = new Set();
  const states = new Set();
  const exchanges = new Set();
  DATA.companies.forEach(c => {
    exchanges.add(c.exchange);
    c.projects.forEach(p => {
      p.commodity.split("/").forEach(part => commodities.add(part.trim()));
      states.add(p.state);
    });
  });

  const ef = document.getElementById("exchangeFilter");
  [...exchanges].sort().forEach(e => {
    ef.insertAdjacentHTML("beforeend", `<option value="${e}">${e}</option>`);
  });

  const cf = document.getElementById("commodityFilter");
  [...commodities].sort().forEach(c => {
    cf.insertAdjacentHTML("beforeend", `<option value="${c}">${c}</option>`);
  });

  const sf = document.getElementById("stateFilter");
  [...states].sort().forEach(s => {
    sf.insertAdjacentHTML("beforeend", `<option value="${s}">${STATE_NAMES[s] || s} (${s})</option>`);
  });
}

function matches(company, q, exchange, commodity, state) {
  const hay = (company.name + " " + company.ticker + " " + company.exchange + " " +
    company.projects.map(p => p.name + " " + p.commodity + " " + (p.municipality || "")).join(" ")).toLowerCase();
  if (q && !hay.includes(q)) return false;
  if (exchange && company.exchange !== exchange) return false;
  if (commodity && !company.projects.some(p => p.commodity.includes(commodity))) return false;
  if (state && !company.projects.some(p => p.state === state)) return false;
  return true;
}

function render() {
  const q = document.getElementById("search").value.trim().toLowerCase();
  const exchange = document.getElementById("exchangeFilter").value;
  const commodity = document.getElementById("commodityFilter").value;
  const state = document.getElementById("stateFilter").value;

  const visible = DATA.companies.filter(c => matches(c, q, exchange, commodity, state));
  const visibleTickers = new Set(visible.map(c => c.ticker));

  // Atualiza a participação dos marcadores no grupo de empresas (mostra/esconde).
  DATA.companies.forEach(c => {
    c.projects.forEach(p => {
      const m = MARKERS[`${c.ticker}::${p.name}`];
      if (!m) return;
      const show = visibleTickers.has(c.ticker);
      if (show && !COMPANIES_LAYER.hasLayer(m)) COMPANIES_LAYER.addLayer(m);
      if (!show && COMPANIES_LAYER.hasLayer(m)) COMPANIES_LAYER.removeLayer(m);
    });
  });

  // Lista lateral.
  const list = document.getElementById("companyList");
  const projCount = visible.reduce((n, c) => n + c.projects.length, 0);
  document.getElementById("stats").innerHTML =
    `<b>${visible.length}</b> empresas · <b>${projCount}</b> projetos`;

  if (visible.length === 0) {
    list.innerHTML = `<li style="padding:16px;color:#8b98a5">Nenhum resultado para os filtros atuais.</li>`;
    return;
  }

  list.innerHTML = visible.map(c => {
    const chips = c.projects.map(p =>
      `<span class="chip"><span class="dot" style="background:${colorFor(p.commodity)}"></span>${p.name} · ${p.state}</span>`
    ).join("");
    return `
      <li class="company-card ${c.ticker === activeTicker ? "active" : ""}" data-ticker="${c.ticker}">
        <div class="card-top">
          <span class="card-name">${c.name}</span>
          <span class="ticker">${c.exchange}:${c.ticker}</span>
        </div>
        <div class="card-commodity">${c.primaryCommodity}</div>
        ${quoteLine(c)}
        <div class="card-projects">${chips}</div>
      </li>`;
  }).join("");

  list.querySelectorAll(".company-card").forEach(card => {
    card.addEventListener("click", () => focusCompany(card.dataset.ticker));
  });
}

function focusCompany(ticker) {
  activeTicker = ticker;
  const company = DATA.companies.find(c => c.ticker === ticker);
  if (!company) return;

  // Se a camada de empresas estiver oculta, reativa para mostrar o marcador.
  const toggle = document.getElementById("companiesToggle");
  if (toggle && !toggle.checked) {
    toggle.checked = true;
    COMPANIES_LAYER.addTo(MAP);
  }

  document.querySelectorAll(".company-card").forEach(el =>
    el.classList.toggle("active", el.dataset.ticker === ticker));

  const pts = company.projects.map(p => [p.lat, p.lng]);
  if (pts.length === 1) {
    MAP.flyTo(pts[0], 7, { duration: 0.8 });
    MARKERS[`${ticker}::${company.projects[0].name}`].openPopup();
  } else {
    MAP.flyToBounds(L.latLngBounds(pts).pad(0.4), { duration: 0.8 });
  }
}

async function loadQuotes() {
  try {
    const res = await fetch("data/quotes.json", { cache: "no-cache" });
    QUOTES = await res.json();
  } catch (e) {
    return; // sem cotações; o app segue normal
  }
  render(); // re-renderiza os cards já com preço/valor de mercado
  const el = document.getElementById("quotesAsOf");
  if (el && QUOTES.asOf) {
    const d = new Date(QUOTES.asOf);
    el.textContent = "Cotações atualizadas em " + d.toLocaleDateString("pt-BR") +
      " (fontes públicas via Yahoo Finance).";
  }
}

function quoteLine(c) {
  const q = quoteFor(c);
  if (!q) return "";
  const price = fmtPrice(q.price, q.currency);
  const cap = fmtCap(q.marketCap, q.currency);
  if (!price && !cap) return "";
  return `<div class="card-quote">${price ? `<span class="q-price">${price}</span>` : ""}` +
    `${cap ? `<span class="q-cap">Cap. ${cap}</span>` : ""}</div>`;
}

function renderFooter() {
  const m = DATA.meta || {};
  document.getElementById("metaSource").textContent = m.source || "";
  document.getElementById("metaDisclaimer").textContent = m.disclaimer || "";
}

init();
