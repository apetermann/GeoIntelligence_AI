/* GeoIntelligence AI — visualizador: empresas listadas + piloto geológico Caladão/GME.
   Dados: data/companies.json, data/quotes.json, data/geo/*.geojson. Mapa: Leaflet + OSM. */

// Cores dos marcadores de empresas por commodity (a 1ª chave contida vence).
const COMMODITY_COLORS = {
  "Terras Raras": "#e0b341", "Platina": "#cbd5e1", "Lítio": "#4ade80", "Níquel": "#22d3ee",
  "Zinco": "#60a5fa", "Cobre": "#c084fc", "Ouro": "#facc15", "Vanádio": "#f472b6",
  "Grafita": "#64748b", "Diamantes": "#f0abfc", "Nióbio": "#fca5a5", "Urânio": "#2dd4bf",
  "Minério de Ferro": "#f97316", "Fosfato": "#a3e635", "Potássio": "#fb923c", "Titânio": "#94a3b8",
  "default": "#9ca3af",
};
const STATUS_COLORS = { "Produção": "#2ea043", "Desenvolvimento": "#3b82f6", "Exploração": "#a855f7", "Adquirida": "#6b7280" };
function colorFor(commodity) {
  for (const key of Object.keys(COMMODITY_COLORS)) {
    if (key !== "default" && commodity.includes(key)) return COMMODITY_COLORS[key];
  }
  return COMMODITY_COLORS.default;
}
const STATE_NAMES = {
  MG: "Minas Gerais", BA: "Bahia", PA: "Pará", SP: "São Paulo", RS: "Rio Grande do Sul", AM: "Amazonas",
  GO: "Goiás", MT: "Mato Grosso", TO: "Tocantins", AP: "Amapá", CE: "Ceará", MA: "Maranhão", PR: "Paraná",
  RN: "Rio Grande do Norte", PB: "Paraíba", RO: "Rondônia", RR: "Roraima",
};

let DATA = null, MAP = null, activeTicker = null, COMPANIES_LAYER = null, QUOTES = null;
const MARKERS = {};
let LEGEND_COMMODITY_HTML = "", LEGEND_PILOT_HTML = "";
let PILOT = null;              // { area, buffers, vizinhos, geologia, falhas, fraturas, articulacao, unidades_area }
const PILOT_LAYERS = {};       // nome -> L.Layer

const CURRENCY_SYMBOL = { AUD: "A$", CAD: "C$", USD: "US$", BRL: "R$", GBP: "£", EUR: "€" };
function moneyPrefix(cur) { return CURRENCY_SYMBOL[cur] || (cur ? cur + " " : ""); }
function fmtPrice(v, cur) {
  if (v == null) return null;
  const opts = v < 1 ? { minimumFractionDigits: 2, maximumFractionDigits: 4 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 };
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
function quoteFor(c) { return (QUOTES && QUOTES.quotes) ? QUOTES.quotes[`${c.exchange}:${c.ticker}`] : null; }

async function init() {
  try {
    const res = await fetch("data/companies.json", { cache: "no-cache" });
    DATA = await res.json();
  } catch (e) {
    document.getElementById("companyList").innerHTML =
      `<li style="padding:16px;color:#f87171">Erro ao carregar dados: ${e.message}. Rode via servidor local.</li>`;
    return;
  }
  setupMap();
  populateFilters();
  renderFooter();
  render();
  loadQuotes();
  loadPilot();

  document.getElementById("search").addEventListener("input", render);
  document.getElementById("exchangeFilter").addEventListener("change", render);
  document.getElementById("commodityFilter").addEventListener("change", render);
  document.getElementById("stateFilter").addEventListener("change", render);
  document.getElementById("companiesToggle").addEventListener("change", e => {
    if (e.target.checked) COMPANIES_LAYER.addTo(MAP); else MAP.removeLayer(COMPANIES_LAYER);
  });

  // Relatório (modal com PDF)
  document.getElementById("reportBtn").addEventListener("click", () => openReport("analise"));
  document.getElementById("reportClose").addEventListener("click", closeReport);
  document.getElementById("reportBackdrop").addEventListener("click", closeReport);
  document.querySelectorAll(".report-tab").forEach(t => t.addEventListener("click", () => openReport(t.dataset.doc)));

  // Legenda recolhível (começa recolhida no celular)
  const legend = document.getElementById("legend");
  document.getElementById("legendToggle").addEventListener("click", () => legend.classList.toggle("collapsed"));
  if (window.matchMedia && window.matchMedia("(max-width: 760px)").matches) legend.classList.add("collapsed");
}

function setupMap() {
  MAP = L.map("map", { zoomControl: true, attributionControl: true }).setView([-15.5, -49], 4);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "&copy; OpenStreetMap", maxZoom: 19 }).addTo(MAP);
  // Panes: geologia (base) < estruturas < polígonos do piloto < marcadores de empresa
  MAP.createPane("geol"); MAP.getPane("geol").style.zIndex = 250;
  MAP.createPane("estr"); MAP.getPane("estr").style.zIndex = 350;
  MAP.createPane("pilot"); MAP.getPane("pilot").style.zIndex = 360;

  COMPANIES_LAYER = L.layerGroup().addTo(MAP);
  for (const company of DATA.companies) {
    for (const p of company.projects) {
      const marker = L.circleMarker([p.lat, p.lng], {
        radius: 8, fillColor: colorFor(p.commodity), color: "#fff", weight: 2, opacity: 1, fillOpacity: 0.9,
      }).bindPopup(() => popupHtml(company, p));
      MARKERS[`${company.ticker}::${p.name}`] = marker;
    }
  }
  buildLegend();
}

function popupHtml(company, p) {
  const statusColor = STATUS_COLORS[p.status] || "#6b7280";
  const site = company.website ? `<a class="popup-link" href="${company.website}" target="_blank" rel="noopener">Site da empresa ↗</a>` : "";
  const q = quoteFor(company), price = q && fmtPrice(q.price, q.currency), cap = q && fmtCap(q.marketCap, q.currency);
  return `
    <div class="popup-title">${p.name}</div>
    <div class="popup-sub">${company.name} · <b>${company.exchange}:${company.ticker}</b></div>
    <div class="popup-row"><b>Commodity:</b> ${p.commodity}</div>
    <div class="popup-row"><b>Tipo:</b> ${p.type || "—"}</div>
    <div class="popup-row"><b>Local:</b> ${p.municipality || "—"} — ${STATE_NAMES[p.state] || p.state}</div>
    <div class="popup-row"><b>Status:</b> <span class="status-badge" style="background:${statusColor}33;color:${statusColor}">${p.status}</span></div>
    ${price ? `<div class="popup-row"><b>Cotação:</b> ${price}</div>` : ""}
    ${cap ? `<div class="popup-row"><b>Valor de mercado:</b> ${cap}</div>` : ""}
    ${p.note ? `<div class="popup-note">${p.note}</div>` : ""}
    ${site}`;
}

/* ---------- Piloto geológico Caladão / GME ---------- */
const GEO_PAL = ["#b08968","#c084fc","#60a5fa","#4ade80","#f59e0b","#22d3ee","#f472b6","#a3e635","#e0b341","#94a3b8","#2dd4bf","#fca5a5","#d6b370","#fb923c","#a78bfa","#5eead4","#fcd34d","#86efac","#93c5fd","#f0abfc","#fda4af","#bef264","#9c7a5b","#cbd5e1"];
const unitColor = {}; let _ci = 0;
function colorUnit(u) { if (!(u in unitColor)) unitColor[u] = GEO_PAL[_ci++ % GEO_PAL.length]; return unitColor[u]; }
const isAxel = pr => String(pr.NOME || "").toUpperCase().includes("AXEL");

async function loadPilot() {
  const files = ["area_832781_2023", "buffers", "vizinhos", "geologia", "falhas", "fraturas", "articulacao_100k"];
  let d = {};
  try {
    const got = await Promise.all(files.map(f => fetch(`data/geo/${f}.geojson`, { cache: "no-cache" }).then(r => r.json())));
    files.forEach((f, i) => d[f] = got[i]);
    d.unidades_area = await fetch("data/geo/_unidades_na_area.json", { cache: "no-cache" }).then(r => r.json()).catch(() => []);
  } catch (e) { return; } // sem piloto; o resto segue
  PILOT = d;
  (d.unidades_area || []).forEach(u => colorUnit(u.nm_unidade));

  const row = (l, v) => v ? `<div class="popup-row"><b>${l}:</b> ${v}</div>` : "";

  // Geologia (IBGE 1:250k)
  PILOT_LAYERS.geologia = L.geoJSON(d.geologia, { pane: "geol",
    style: f => ({ color: "#0b0e12", weight: .4, fillColor: colorUnit(f.properties.nm_unidade), fillOpacity: .5 }),
    onEachFeature: (f, l) => { const p = f.properties; const lit = [p.nm_lito1, p.nm_lito2, p.nm_lito3].filter(x => x && x !== "nan").join(", ");
      l.bindPopup(`<div class="popup-title">${p.nm_unidade || "—"}</div>${row("Sigla", p.letra_simb)}${row("Litologia", lit)}${row("Idade", p.nm_tempo_g)}${row("Província", p.nm_provinc)}<div class="popup-note">IBGE 1:250.000 (2026) — escala regional</div>`); } });
  PILOT_LAYERS.falhas = L.geoJSON(d.falhas, { pane: "estr", style: () => ({ color: "#ef4444", weight: 1.4, opacity: .85 }) });
  PILOT_LAYERS.fraturas = L.geoJSON(d.fraturas, { pane: "estr", style: () => ({ color: "#f59e0b", weight: 1, dashArray: "3 3", opacity: .8 }) });

  // Vizinhos (Axel x demais)
  const popViz = (f, l) => { const p = f.properties;
    l.bindPopup(`<div class="popup-title">Processo ${p.DSProcesso || p.PROCESSO}</div>${row("Titular", p.NOME)}${row("Substância", p.SUBS)}${row("Fase", p.FASE)}${row("Área", (p.AREA_HA ? p.AREA_HA + " ha" : ""))}${row("Distância da área GME", p.dist_km + " km")}`); };
  const axel = { type: "FeatureCollection", features: d.vizinhos.features.filter(f => isAxel(f.properties)) };
  const outros = { type: "FeatureCollection", features: d.vizinhos.features.filter(f => !isAxel(f.properties)) };
  PILOT_LAYERS.outros = L.geoJSON(outros, { pane: "pilot", style: () => ({ color: "#6b7280", weight: .6, fillColor: "#9ca3af", fillOpacity: .07 }), onEachFeature: popViz });
  PILOT_LAYERS.axel = L.geoJSON(axel, { pane: "pilot", style: () => ({ color: "#22d3ee", weight: 1.6, fillColor: "#22d3ee", fillOpacity: .22 }), onEachFeature: popViz });

  // Buffers
  PILOT_LAYERS.buffers = L.geoJSON(d.buffers, { pane: "pilot", style: () => ({ color: "#cbd5e1", weight: 1.2, dashArray: "5 5", fill: false, opacity: .7 }),
    onEachFeature: (f, l) => l.bindTooltip(f.properties.km + " km") });

  // Folhas 1:100k (SGB)
  PILOT_LAYERS.folhas = L.geoJSON(d.articulacao_100k, {
    pane: "pilot",
    style: f => f.properties.cobre_area ? { color: "#34d399", weight: 2, fill: false, opacity: .95 } : { color: "#64748b", weight: 1, dashArray: "4 6", fill: false, opacity: .5 },
    onEachFeature: (f, l) => { const p = f.properties; l.bindPopup(`<div class="popup-title">Folha ${p.codigo}</div>${p.nome ? `<div class="popup-row"><b>${p.nome}</b></div>` : ""}<div class="popup-row">1:100.000 (SGB) · ${p.cobre_area ? "cobre a área" : "no entorno"}</div>`); } });

  // Área GME (sempre visível)
  const M = (d.unidades_area || []);
  PILOT_LAYERS.area = L.geoJSON(d.area_832781_2023, { pane: "pilot",
    style: () => ({ color: "#facc15", weight: 3, fillColor: "#facc15", fillOpacity: .3 }),
    onEachFeature: (f, l) => l.bindPopup(`<div class="popup-title">Processo 832.781/2023</div><div class="popup-sub">Área GME · ANM/SIGMINE</div>
      <div class="popup-row"><b>Titular:</b> Geo Minérios Engenharia Ltda</div>
      <div class="popup-row"><b>Substância (ANM):</b> Minério de lítio</div>
      <div class="popup-row"><b>Área oficial:</b> 1.980,61 ha</div>
      <div class="popup-row"><b>Geologia (1:250k):</b> ${M.map(u => u.nm_unidade).join(", ") || "—"}</div>`) }).addTo(MAP);

  wirePilotToggle("tglGeologia", ["geologia"]);
  wirePilotToggle("tglEstruturas", ["falhas", "fraturas"]);
  wirePilotToggle("tglVizinhos", ["outros", "axel"]);
  wirePilotToggle("tglBuffers", ["buffers"]);
  wirePilotToggle("tglFolhas", ["folhas"]);
  document.getElementById("pilotFocus").addEventListener("click", focusPilot);

  buildPilotLegend();
}

function wirePilotToggle(id, names) {
  const el = document.getElementById(id);
  const apply = () => names.forEach(n => {
    const L0 = PILOT_LAYERS[n]; if (!L0) return;
    if (el.checked) { if (!MAP.hasLayer(L0)) L0.addTo(MAP); } else if (MAP.hasLayer(L0)) MAP.removeLayer(L0);
  });
  el.addEventListener("change", apply);
  apply(); // estado inicial = o do checkbox no HTML
}

function focusPilot() {
  // liga as camadas do piloto e voa até a área
  ["tglGeologia", "tglEstruturas", "tglVizinhos", "tglBuffers"].forEach(id => {
    const el = document.getElementById(id); if (el && !el.checked) { el.checked = true; el.dispatchEvent(new Event("change")); }
  });
  if (PILOT_LAYERS.buffers) MAP.flyToBounds(PILOT_LAYERS.buffers.getBounds().pad(0.05), { duration: 0.9 });
  else if (PILOT_LAYERS.area) MAP.flyToBounds(PILOT_LAYERS.area.getBounds().pad(0.5), { duration: 0.9 });
}

function buildPilotLegend() {
  const M = (PILOT.unidades_area || []);
  const units = M.map(u => `<div class="legend-item"><span class="dot" style="background:${unitColor[u.nm_unidade]}"></span>${u.nm_unidade}</div>`).join("");
  LEGEND_PILOT_HTML = `<h4 class="legend-h4-2">Piloto Caladão / GME</h4>
    <div class="legend-item"><span class="dot" style="background:#facc15"></span>Área GME (oficial)</div>
    <div class="legend-item"><span class="dot" style="background:#22d3ee"></span>Processos Axel REE</div>
    <div class="legend-item"><span class="dot" style="background:#9ca3af"></span>Outros processos (50 km)</div>
    <div class="legend-item"><span class="dot" style="background:#34d399"></span>Folha 1:100k que cobre a área</div>
    <div class="legend-item"><span class="dot" style="background:#ef4444"></span>Falhas · <span class="dot" style="background:#f59e0b"></span>Fraturas</div>
    ${units}`;
  renderLegend();
}

/* ---------- Relatório (modal PDF) ---------- */
function openReport(which) {
  const map = { analise: "relatorios/analise-geologica-gme.pdf", dossie: "relatorios/dossie-832781-2023.pdf" };
  const url = map[which] || map.analise;
  document.getElementById("reportFrame").src = url;
  document.getElementById("reportOpen").href = url;
  document.querySelectorAll(".report-tab").forEach(t => t.classList.toggle("active", t.dataset.doc === which));
  document.getElementById("reportModal").classList.add("open");
}
function closeReport() {
  document.getElementById("reportModal").classList.remove("open");
  document.getElementById("reportFrame").src = "about:blank";
}

/* ---------- Empresas ---------- */
function buildLegend() {
  const used = new Set();
  DATA.companies.forEach(c => c.projects.forEach(p => used.add(colorFor(p.commodity))));
  const seen = new Set();
  const html = Object.keys(COMMODITY_COLORS).filter(k => k !== "default").filter(k => used.has(COMMODITY_COLORS[k]))
    .filter(k => { const c = COMMODITY_COLORS[k]; if (seen.has(c)) return false; seen.add(c); return true; })
    .map(k => `<div class="legend-item"><span class="dot" style="background:${COMMODITY_COLORS[k]}"></span>${k}</div>`).join("");
  LEGEND_COMMODITY_HTML = `<h4>Empresas · commodity</h4>${html}`;
  renderLegend();
}
function renderLegend() { document.getElementById("legendBody").innerHTML = LEGEND_COMMODITY_HTML + LEGEND_PILOT_HTML; }

function populateFilters() {
  const cc = document.getElementById("companiesCount"); if (cc) cc.textContent = DATA.companies.length;
  const commodities = new Set(), states = new Set(), exchanges = new Set();
  DATA.companies.forEach(c => { exchanges.add(c.exchange); c.projects.forEach(p => { p.commodity.split("/").forEach(x => commodities.add(x.trim())); states.add(p.state); }); });
  const ef = document.getElementById("exchangeFilter");
  [...exchanges].sort().forEach(e => ef.insertAdjacentHTML("beforeend", `<option value="${e}">${e}</option>`));
  const cf = document.getElementById("commodityFilter");
  [...commodities].sort().forEach(c => cf.insertAdjacentHTML("beforeend", `<option value="${c}">${c}</option>`));
  const sf = document.getElementById("stateFilter");
  [...states].sort().forEach(s => sf.insertAdjacentHTML("beforeend", `<option value="${s}">${STATE_NAMES[s] || s} (${s})</option>`));
}
function matches(c, q, exchange, commodity, state) {
  const hay = (c.name + " " + c.ticker + " " + c.exchange + " " + c.projects.map(p => p.name + " " + p.commodity + " " + (p.municipality || "")).join(" ")).toLowerCase();
  if (q && !hay.includes(q)) return false;
  if (exchange && c.exchange !== exchange) return false;
  if (commodity && !c.projects.some(p => p.commodity.includes(commodity))) return false;
  if (state && !c.projects.some(p => p.state === state)) return false;
  return true;
}
function render() {
  const q = document.getElementById("search").value.trim().toLowerCase();
  const exchange = document.getElementById("exchangeFilter").value;
  const commodity = document.getElementById("commodityFilter").value;
  const state = document.getElementById("stateFilter").value;
  const visible = DATA.companies.filter(c => matches(c, q, exchange, commodity, state));
  const visibleTickers = new Set(visible.map(c => c.ticker));
  DATA.companies.forEach(c => c.projects.forEach(p => {
    const m = MARKERS[`${c.ticker}::${p.name}`]; if (!m) return;
    const show = visibleTickers.has(c.ticker);
    if (show && !COMPANIES_LAYER.hasLayer(m)) COMPANIES_LAYER.addLayer(m);
    if (!show && COMPANIES_LAYER.hasLayer(m)) COMPANIES_LAYER.removeLayer(m);
  }));
  const list = document.getElementById("companyList");
  const projCount = visible.reduce((n, c) => n + c.projects.length, 0);
  document.getElementById("stats").innerHTML = `<b>${visible.length}</b> empresas · <b>${projCount}</b> projetos`;
  if (visible.length === 0) { list.innerHTML = `<li style="padding:16px;color:#8b98a5">Nenhum resultado para os filtros atuais.</li>`; return; }
  list.innerHTML = visible.map(c => {
    const chips = c.projects.map(p => `<span class="chip"><span class="dot" style="background:${colorFor(p.commodity)}"></span>${p.name} · ${p.state}</span>`).join("");
    return `<li class="company-card ${c.ticker === activeTicker ? "active" : ""}" data-ticker="${c.ticker}">
      <div class="card-top"><span class="card-name">${c.name}</span><span class="ticker">${c.exchange}:${c.ticker}</span></div>
      <div class="card-commodity">${c.primaryCommodity}</div>${quoteLine(c)}
      <div class="card-projects">${chips}</div></li>`;
  }).join("");
  list.querySelectorAll(".company-card").forEach(card => card.addEventListener("click", () => focusCompany(card.dataset.ticker)));
}
function focusCompany(ticker) {
  activeTicker = ticker;
  const company = DATA.companies.find(c => c.ticker === ticker); if (!company) return;
  const toggle = document.getElementById("companiesToggle");
  if (toggle && !toggle.checked) { toggle.checked = true; COMPANIES_LAYER.addTo(MAP); }
  document.querySelectorAll(".company-card").forEach(el => el.classList.toggle("active", el.dataset.ticker === ticker));
  const pts = company.projects.map(p => [p.lat, p.lng]);
  if (pts.length === 1) { MAP.flyTo(pts[0], 7, { duration: 0.8 }); MARKERS[`${ticker}::${company.projects[0].name}`].openPopup(); }
  else MAP.flyToBounds(L.latLngBounds(pts).pad(0.4), { duration: 0.8 });
}
async function loadQuotes() {
  try { const res = await fetch("data/quotes.json", { cache: "no-cache" }); QUOTES = await res.json(); } catch (e) { return; }
  render();
  const el = document.getElementById("quotesAsOf");
  if (el && QUOTES.asOf) el.textContent = "Cotações atualizadas em " + new Date(QUOTES.asOf).toLocaleDateString("pt-BR") + " (Yahoo Finance).";
}
function quoteLine(c) {
  const q = quoteFor(c); if (!q) return "";
  const price = fmtPrice(q.price, q.currency), cap = fmtCap(q.marketCap, q.currency);
  if (!price && !cap) return "";
  return `<div class="card-quote">${price ? `<span class="q-price">${price}</span>` : ""}${cap ? `<span class="q-cap">Cap. ${cap}</span>` : ""}</div>`;
}
function renderFooter() {
  const m = DATA.meta || {};
  document.getElementById("metaSource").textContent = m.source || "";
  document.getElementById("metaDisclaimer").textContent = m.disclaimer || "";
}

init();
