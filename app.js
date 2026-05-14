const state = {
  data: null,
  map: null,
  layers: [],
  selected: null,
  parameter: "สารหนู",
  round: null,
  riversGeojson: null,
  exceedFlows: [],
};

const text = {
  all: "\u0e17\u0e31\u0e49\u0e07\u0e2b\u0e21\u0e14",
  latest: "\u0e25\u0e48\u0e32\u0e2a\u0e38\u0e14",
  point: "\u0e08\u0e38\u0e14",
  coordinate: "\u0e1e\u0e34\u0e01\u0e31\u0e14",
  round: "\u0e23\u0e2d\u0e1a\u0e15\u0e23\u0e27\u0e08",
  loadFailed: "\u0e42\u0e2b\u0e25\u0e14\u0e02\u0e49\u0e2d\u0e21\u0e39\u0e25\u0e44\u0e21\u0e48\u0e2a\u0e33\u0e40\u0e23\u0e47\u0e08",
  loadHint: "\u0e15\u0e23\u0e27\u0e08\u0e2a\u0e2d\u0e1a\u0e27\u0e48\u0e32\u0e40\u0e1b\u0e34\u0e14\u0e1c\u0e48\u0e32\u0e19 local server \u0e2b\u0e23\u0e37\u0e2d\u0e42\u0e2e\u0e2a\u0e15\u0e4c static web \u0e41\u0e25\u0e49\u0e27",
};

const els = {
  parameterPicker: document.querySelector("#parameterPicker"),
  roundSlider: document.querySelector("#roundSlider"),
  roundNumber: document.querySelector("#roundNumber"),
  roundDate: document.querySelector("#roundDate"),
  roundMaxTick: document.querySelector("#roundMaxTick"),
  selectedTitle: document.querySelector("#selectedTitle"),
  selectedBody: document.querySelector("#selectedBody"),
  siteList: document.querySelector("#siteList"),
  listCount: document.querySelector("#listCount"),
};

const statusText = {
  pass: "\u0e1c\u0e48\u0e32\u0e19",
  reported: "",
  fail: "\u0e44\u0e21\u0e48\u0e1c\u0e48\u0e32\u0e19",
  exceed: "\u0e40\u0e01\u0e34\u0e19\u0e21\u0e32\u0e15\u0e23\u0e10\u0e32\u0e19",
  no_standard: "\u0e44\u0e21\u0e48\u0e21\u0e35\u0e04\u0e48\u0e32\u0e21\u0e32\u0e15\u0e23\u0e10\u0e32\u0e19",
  no_data: "\u0e44\u0e21\u0e48\u0e21\u0e35\u0e02\u0e49\u0e2d\u0e21\u0e39\u0e25",
  standard_not_available: "\u0e44\u0e21\u0e48\u0e21\u0e35\u0e04\u0e48\u0e32\u0e21\u0e32\u0e15\u0e23\u0e10\u0e32\u0e19",
};

const thaiMonths = ["\u0e21.\u0e04.","\u0e01.\u0e1e.","\u0e21\u0e35.\u0e04.","\u0e40\u0e21.\u0e22.","\u0e1e.\u0e04.","\u0e21\u0e34.\u0e22.","\u0e01.\u0e04.","\u0e2a.\u0e04.","\u0e01.\u0e22.","\u0e15.\u0e04.","\u0e1e.\u0e22.","\u0e18.\u0e04."];

function parseFactoryDate(siteId) {
  const m = String(siteId || "").match(/^\d+-(\d{4})(\d{2})(\d{2})-/);
  if (!m) return "";
  const [, y, mo, d] = m;
  return `${parseInt(d, 10)} ${thaiMonths[parseInt(mo, 10) - 1]} ${y.slice(-2)}`;
}

function statusPillHtml(status) {
  const label = statusText[status];
  if (!label) return "";
  return `<em class="status-pill status-${escapeHtml(status)}">${escapeHtml(label)}</em>`;
}

const markerColors = {
  pass: "#1f7a5a",
  reported: "#697386",
  fail: "#b83232",
  exceed: "#b83232",
  no_standard: "#697386",
  no_data: "#697386",
};

const riverColors = {
  "Kok River": "#2563eb",      // blue
  "Mae Lao River": "#0d9488",  // teal
  "Mekong River": "#1e3a8a",   // navy (largest river)
  "Ruak River": "#7c3aed",     // violet
  "Sai River": "#0891b2",      // cyan
};

async function init() {
  const [data, rivers] = await Promise.all([
    fetch("data.json").then((res) => res.json()),
    fetch("rivers.geojson?v=7").then((res) => res.json()).catch(() => null),
  ]);
  state.data = data;
  setupMap();
  setupFilters();
  bindEvents();
  render();
  if (rivers) {
    setTimeout(() => {
      try { addRivers(rivers); } catch (e) { console.error("addRivers failed:", e); }
    }, 100);
  }
}

function setupMap() {
  state.map = L.map("map", { zoomControl: false, fadeAnimation: false, zoomAnimation: false }).setView([20.05, 99.85], 9);
  L.control.zoom({ position: "bottomright" }).addTo(state.map);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(state.map);
}

function addRivers(geojson) {
  setupRiverPane();
  state.riversGeojson = geojson;
  const paneOpt = { pane: "rivers" };

  // Layer 1 — wide halo for soft glow around the river
  L.geoJSON(geojson, {
    ...paneOpt,
    style: (feature) => ({
      color: getRiverColor(feature),
      weight: 16,
      opacity: 0.12,
      lineCap: "round",
      lineJoin: "round",
    }),
  }).addTo(state.map);

  // Layer 2 — main river body (semi-transparent solid line)
  L.geoJSON(geojson, {
    ...paneOpt,
    style: (feature) => ({
      color: getRiverColor(feature),
      weight: 7,
      opacity: 0.4,
      lineCap: "round",
      lineJoin: "round",
    }),
  }).addTo(state.map);

  // Layer 3 — animated blue flow dashes on top of body
  L.geoJSON(geojson, {
    ...paneOpt,
    style: (feature) => ({
      color: getRiverColor(feature),
      weight: 5,
      opacity: 1,
      dashArray: "20 36",
      lineCap: "round",
      className: "river-flow-line",
    }),
  }).addTo(state.map);

  // Layer 4 — red animated flow segments
  updateExceedFlows();
}

function setupRiverPane() {
  if (!state.map.getPane("rivers")) {
    state.map.createPane("rivers");
    state.map.getPane("rivers").style.zIndex = 350;
  }
}

function getRiverColor(feature) {
  return riverColors[feature.properties.name_en] || "#1478a8";
}

// ----- Red exceed flows -----

function updateExceedFlows() {
  // Remove old flows
  for (const layer of state.exceedFlows) layer.remove();
  state.exceedFlows = [];
  if (!state.riversGeojson) return;

  const lines = collectRiverLines(state.riversGeojson);
  if (!lines.length) return;
  const sites = getSitesForFlow();
  const maxSnapDist = 1500;
  const fallbackDownstreamM = 6000;

  for (const line of lines) {
    // Snap each site onto this line and keep only those within range
    const snapped = sites
      .map((site) => {
        const proj = snapPointToLine(line, site.latitude, site.longitude);
        return proj && proj.distM <= maxSnapDist ? { site, proj } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.proj.alongDist - b.proj.alongDist);

    for (let i = 0; i < snapped.length; i++) {
      if (snapped[i].site.status !== "exceed") continue;
      const startProj = snapped[i].proj;
      const next = snapped[i + 1];
      let segment;
      if (next) {
        segment = traceLineSection(line, startProj, next.proj);
      } else {
        segment = traceDownstreamDist(line, startProj, fallbackDownstreamM);
      }
      if (segment.length < 2) continue;
      const layer = L.polyline(segment, {
        pane: "rivers",
        color: "#b83232",
        weight: 6,
        opacity: 1,
        dashArray: "20 36",
        lineCap: "round",
        className: "river-flow-line river-flow-exceed",
      }).addTo(state.map);
      state.exceedFlows.push(layer);
    }
  }
}

// Status of a water point for currently selected parameter + round
function getWaterStatusForParam(siteId) {
  const param = state.parameter;
  const round = getSelectedRoundForSite(siteId);
  let rows = state.data.waterResults.filter((r) => r.siteId === siteId && r.round === round);
  if (param !== text.all) rows = rows.filter((r) => r.parameter === param);
  if (!rows.length) return "no_data";
  if (rows.some((r) => r.status === "exceed")) return "exceed";
  if (rows.some((r) => r.status === "pass")) return "pass";
  return "no_data";
}

// Returns list of sites (water + factory) with status for current parameter
function getSitesForFlow() {
  const sites = [];
  for (const p of state.data.waterPoints) {
    if (!p.latitude || !p.longitude) continue;
    const status = getWaterStatusForParam(p.id);
    if (status === "exceed" || status === "pass") {
      sites.push({ id: p.id, latitude: p.latitude, longitude: p.longitude, status });
    }
  }
  for (const s of state.data.factorySites) {
    if (!s.latitude || !s.longitude) continue;
    const status = s.overallStatus === "fail" ? "exceed" : "pass";
    sites.push({ id: s.id, latitude: s.latitude, longitude: s.longitude, status });
  }
  return sites;
}

function collectRiverLines(geojson) {
  const lines = [];
  for (const feature of geojson.features) {
    const geom = feature.geometry;
    const segments = geom.type === "MultiLineString" ? geom.coordinates : [geom.coordinates];
    for (const segment of segments) {
      lines.push(segment.map(([lng, lat]) => [lat, lng]));
    }
  }
  return lines;
}

// Haversine distance in meters
function haversineM(aLat, aLng, bLat, bLng) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

function projectOnSegment(lat, lng, a, b) {
  // Approximate using local equirectangular projection
  const toRad = (d) => (d * Math.PI) / 180;
  const cosLat = Math.cos(toRad((a[0] + b[0]) / 2));
  const ax = a[1] * cosLat, ay = a[0];
  const bx = b[1] * cosLat, by = b[0];
  const px = lng * cosLat, py = lat;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const projLat = a[0] + (b[0] - a[0]) * t;
  const projLng = a[1] + (b[1] - a[1]) * t;
  return { t, lat: projLat, lng: projLng };
}

// Snap a point onto a single line and return projection info + cumulative along-line distance
function snapPointToLine(line, lat, lng) {
  let best = null;
  let cumBefore = 0;
  for (let pi = 1; pi < line.length; pi++) {
    const a = line[pi - 1];
    const b = line[pi];
    const segLen = haversineM(a[0], a[1], b[0], b[1]);
    const proj = projectOnSegment(lat, lng, a, b);
    const d = haversineM(lat, lng, proj.lat, proj.lng);
    if (!best || d < best.distM) {
      best = {
        distM: d,
        segmentEnd: pi,
        t: proj.t,
        point: [proj.lat, proj.lng],
        alongDist: cumBefore + segLen * proj.t,
      };
    }
    cumBefore += segLen;
  }
  return best;
}

// Build a polyline along `line` from startProj to endProj
function traceLineSection(line, startProj, endProj) {
  const out = [startProj.point];
  for (let pi = startProj.segmentEnd; pi < endProj.segmentEnd; pi++) {
    out.push(line[pi]);
  }
  out.push(endProj.point);
  return out;
}

// Trace downstream from startProj for `distanceM` meters along `line`
function traceDownstreamDist(line, startProj, distanceM) {
  const out = [startProj.point];
  let remaining = distanceM;
  let idx = startProj.segmentEnd;
  while (idx < line.length && remaining > 0) {
    const last = out[out.length - 1];
    const next = line[idx];
    const d = haversineM(last[0], last[1], next[0], next[1]);
    if (d <= remaining) {
      out.push(next);
      remaining -= d;
      idx++;
    } else {
      const t = remaining / d;
      out.push([last[0] + (next[0] - last[0]) * t, last[1] + (next[1] - last[1]) * t]);
      remaining = 0;
    }
  }
  return out;
}

function setupFilters() {
  // Only show parameters that have at least one exceed result in the river data
  const exceededInWater = new Set(
    state.data.waterResults.filter((r) => r.status === "exceed").map((r) => r.parameter)
  );
  const sorted = Array.from(exceededInWater).sort();
  const preferred = "สารหนู";
  const others = sorted.filter((p) => p !== preferred);
  const params = [preferred, ...others, text.all];
  if (!params.includes(state.parameter)) state.parameter = preferred;
  renderParameterPicker(params);

  setupRoundSlider();
}

function setupRoundSlider() {
  const rounds = state.data.samplingRounds.map((r) => r.round);
  const minR = Math.min(...rounds);
  const maxR = Math.max(...rounds);
  els.roundSlider.min = String(minR);
  els.roundSlider.max = String(maxR);
  els.roundMaxTick.textContent = String(maxR);
  if (!state.round) state.round = maxR;
  els.roundSlider.value = String(state.round);
  updateRoundLabel();
}

function updateRoundLabel() {
  els.roundNumber.textContent = String(state.round);
  const info = state.data.samplingRounds.find((r) => r.round === state.round);
  els.roundDate.textContent = info?.dateLabel || "—";
  const min = Number(els.roundSlider.min);
  const max = Number(els.roundSlider.max);
  const pct = ((state.round - min) / Math.max(1, max - min)) * 100;
  els.roundSlider.style.setProperty("--slider-pct", `${pct}%`);
}

function renderParameterPicker(params) {
  els.parameterPicker.innerHTML = params
    .map(
      (p) =>
        `<button type="button" role="radio" aria-checked="${
          p === state.parameter ? "true" : "false"
        }" class="param-chip${p === state.parameter ? " is-active" : ""}" data-param="${escapeHtml(p)}">${escapeHtml(p)}</button>`
    )
    .join("");
  els.parameterPicker.querySelectorAll(".param-chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.parameter = btn.dataset.param;
      els.parameterPicker.querySelectorAll(".param-chip").forEach((b) => {
        const active = b.dataset.param === state.parameter;
        b.classList.toggle("is-active", active);
        b.setAttribute("aria-checked", active ? "true" : "false");
      });
      render();
    });
  });
}

function bindEvents() {
  els.roundSlider.addEventListener("input", () => {
    state.round = Number(els.roundSlider.value);
    updateRoundLabel();
    render();
  });
}

function render() {
  clearMarkers();
  const sites = getFilteredSites();
  renderMarkers(sites);
  renderList(sites);
  updateExceedFlows();
  const stillVisible =
    state.selected && sites.find((s) => s.type === state.selected.type && s.id === state.selected.id);
  if (stillVisible) {
    selectSite(stillVisible, false);
  } else if (sites.length) {
    selectSite(sites[0], false);
  }
}

function getFilteredSites() {
  const sites = [];
  for (const site of state.data.factorySites) {
    sites.push({ type: "factory", ...site });
  }
  for (const site of state.data.waterPoints) {
    sites.push({ type: "water", ...site });
  }
  return sites;
}

function renderMarkers(sites) {
  const bounds = [];
  for (const site of sites) {
    if (!site.latitude || !site.longitude) continue;
    const status = getSiteMarkerStatus(site);
    const color = markerColors[status] || markerColors.reported;
    let marker;
    if (site.type === "factory") {
      marker = L.marker([site.latitude, site.longitude], { icon: factoryIcon(color) });
    } else {
      marker = L.circleMarker([site.latitude, site.longitude], {
        radius: 8,
        color: "#ffffff",
        weight: 2,
        fillColor: color,
        fillOpacity: 0.92,
      });
    }
    marker.bindPopup(buildPopup(site));
    marker.on("click", () => selectSite(site, false));
    marker.addTo(state.map);
    state.layers.push(marker);
    bounds.push([site.latitude, site.longitude]);
  }
  if (bounds.length) {
    state.map.invalidateSize();
    state.map.fitBounds(bounds, { padding: [44, 44], maxZoom: 11, animate: false });
  }
}

function factoryIcon(color) {
  // Factory silhouette with 2 buildings + chimney
  return L.divIcon({
    className: "factory-icon",
    html: `<span class="factory-marker" style="--c:${color}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 21V11l5 3V11l5 3V8l5 3V5h2v16H3z"/><rect x="5" y="16" width="2" height="3"/><rect x="10" y="16" width="2" height="3"/><rect x="15" y="16" width="2" height="3"/></svg></span>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -12],
  });
}

function clearMarkers() {
  for (const layer of state.layers) layer.remove();
  state.layers = [];
}

function renderList(sites) {
  els.listCount.textContent = `${sites.length.toLocaleString("th-TH")} ${text.point}`;
  els.siteList.innerHTML = sites
    .map((site, index) => {
      const title = site.type === "factory" ? site.company : `${site.id} ${site.river}`;
      const status = statusText[getSiteMarkerStatus(site)] || "";
      const base = site.type === "factory" ? site.samplePoint : site.location;
      const detail = status ? `${base} · ${status}` : base;
      return `<button class="site-item" type="button" data-index="${index}">
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(detail)}</span>
      </button>`;
    })
    .join("");

  els.siteList.querySelectorAll(".site-item").forEach((button) => {
    button.addEventListener("click", () => {
      const site = sites[Number(button.dataset.index)];
      selectSite(site, true);
    });
  });
}

function selectSite(site, panMap) {
  state.selected = site;
  if (site.type === "factory") {
    renderFactorySelection(site);
  } else {
    renderWaterSelection(site);
  }
  if (panMap && site.latitude && site.longitude) {
    state.map.setView([site.latitude, site.longitude], 13);
  }
}

function renderFactorySelection(site) {
  const rows = state.data.factoryResults
    .filter((r) => r.siteId === site.id)
    .map((r) => {
      const status = normalizeFactoryStatus(r.complianceStatus);
      return `<span>${escapeHtml(r.parameter)}</span><strong>${escapeHtml(r.resultText || "-")} ${statusPillHtml(status)}</strong>`;
    })
    .join("");
  const sampleDate = parseFactoryDate(site.id);
  els.selectedTitle.textContent = site.company;
  els.selectedBody.innerHTML = `
    <p>${escapeHtml(site.samplePoint)}</p>
    ${sampleDate ? `<p>วันรับตัวอย่าง ${escapeHtml(sampleDate)}</p>` : ""}
    <p>${text.coordinate} ${site.latitude.toFixed(6)}, ${site.longitude.toFixed(6)}</p>
    <div class="result-grid">${rows}</div>
  `;
}

function renderWaterSelection(site) {
  const round = getSelectedRoundForSite(site.id);
  const roundInfo = state.data.samplingRounds.find((r) => r.round === round);
  const dateLabel = roundInfo?.dateLabel || "";
  // Show ALL parameters for this site in this round (not just the selected filter)
  const rows = state.data.waterResults.filter(
    (r) => r.siteId === site.id && r.round === round
  );
  els.selectedTitle.textContent = `${site.id} ${site.river}`;
  els.selectedBody.innerHTML = `
    <p>${escapeHtml(site.location)}</p>
    <p>${text.coordinate} ${Number(site.latitude).toFixed(6)}, ${Number(site.longitude).toFixed(6)}</p>
    <p>${text.round} ${round}${dateLabel ? ` · วันเก็บตัวอย่าง ${escapeHtml(dateLabel)}` : ""}</p>
    <div class="result-grid">
      ${rows.length
        ? rows
            .map((r) => `<span>${escapeHtml(r.parameter)}</span><strong>${escapeHtml(r.raw || "-")} ${escapeHtml(r.unit || "")} ${statusPillHtml(r.status)}</strong>`)
            .join("")
        : `<span>ไม่มีข้อมูลในรอบนี้</span><strong>-</strong>`}
    </div>
  `;
}

function buildPopup(site) {
  const status = statusText[getSiteMarkerStatus(site)] || "";
  const statusLine = status ? `<p>${escapeHtml(status)}</p>` : "";
  if (site.type === "factory") {
    const sampleDate = parseFactoryDate(site.id);
    const dateLine = sampleDate ? `<p>วันรับตัวอย่าง ${escapeHtml(sampleDate)}</p>` : "";
    return `<p class="popup-title">${escapeHtml(site.company)}</p>
      <p>${escapeHtml(site.samplePoint)}</p>
      ${dateLine}
      ${statusLine}`;
  }
  const round = getSelectedRoundForSite(site.id);
  const roundInfo = state.data.samplingRounds.find((r) => r.round === round);
  const dateLine = roundInfo?.dateLabel ? `<p>วันเก็บตัวอย่าง ${escapeHtml(roundInfo.dateLabel)}</p>` : "";
  return `<p class="popup-title">${escapeHtml(site.id)} ${escapeHtml(site.river)}</p>
    <p>${escapeHtml(site.location)}</p>
    ${dateLine}
    ${statusLine}`;
}

function getCurrentWaterRows() {
  const param = state.parameter;
  return state.data.waterResults.filter((r) => {
    if (param !== text.all && r.parameter !== param) return false;
    return r.round === getSelectedRoundForSite(r.siteId);
  });
}

function getSelectedRoundForSite(_siteId) {
  return state.round;
}

function getSiteMarkerStatus(site) {
  if (site.type === "factory") {
    return site.overallStatus === "fail" ? "fail" : "reported";
  }

  const param = state.parameter;
  const round = getSelectedRoundForSite(site.id);
  let rows = state.data.waterResults.filter((r) => r.siteId === site.id && r.round === round);
  if (param !== text.all) rows = rows.filter((r) => r.parameter === param);
  if (!rows.length) return "no_data";
  if (rows.some((r) => r.status === "exceed")) return "exceed";
  if (rows.some((r) => r.status === "pass")) return "pass";
  if (rows.some((r) => r.status === "no_standard")) return "no_standard";
  return "reported";
}

function normalizeFactoryStatus(status) {
  if (status === "pass") return "pass";
  if (status === "fail") return "fail";
  if (status === "standard_not_available") return "standard_not_available";
  return "reported";
}

function optionHtml(value) {
  return `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

init().catch((error) => {
  console.error(error);
  els.selectedTitle.textContent = text.loadFailed;
  els.selectedBody.textContent = text.loadHint;
});
