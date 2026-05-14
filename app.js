const state = {
  data: null,
  map: null,
  layers: [],
  selected: null,
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
  sourceNote: document.querySelector("#sourceNote"),
  metricSites: document.querySelector("#metricSites"),
  metricMapped: document.querySelector("#metricMapped"),
  metricExceed: document.querySelector("#metricExceed"),
  typeFilter: document.querySelector("#typeFilter"),
  parameterFilter: document.querySelector("#parameterFilter"),
  roundFilter: document.querySelector("#roundFilter"),
  searchInput: document.querySelector("#searchInput"),
  selectedTitle: document.querySelector("#selectedTitle"),
  selectedBody: document.querySelector("#selectedBody"),
  siteList: document.querySelector("#siteList"),
  listCount: document.querySelector("#listCount"),
};

const statusText = {
  pass: "\u0e1c\u0e48\u0e32\u0e19",
  reported: "\u0e15\u0e32\u0e21\u0e23\u0e32\u0e22\u0e07\u0e32\u0e19\u0e1c\u0e25",
  fail: "\u0e44\u0e21\u0e48\u0e1c\u0e48\u0e32\u0e19",
  exceed: "\u0e40\u0e01\u0e34\u0e19\u0e21\u0e32\u0e15\u0e23\u0e10\u0e32\u0e19",
  no_standard: "\u0e44\u0e21\u0e48\u0e21\u0e35\u0e04\u0e48\u0e32\u0e21\u0e32\u0e15\u0e23\u0e10\u0e32\u0e19",
  no_data: "\u0e44\u0e21\u0e48\u0e21\u0e35\u0e02\u0e49\u0e2d\u0e21\u0e39\u0e25",
  standard_not_available: "\u0e44\u0e21\u0e48\u0e21\u0e35\u0e04\u0e48\u0e32\u0e21\u0e32\u0e15\u0e23\u0e10\u0e32\u0e19",
};

const markerColors = {
  pass: "#1f7a5a",
  reported: "#697386",
  fail: "#b83232",
  exceed: "#b83232",
  no_standard: "#697386",
  no_data: "#697386",
};

const riverColors = {
  "Kok River": "#1478a8",
  "Mae Lao River": "#2196a8",
};

async function init() {
  const [data, rivers] = await Promise.all([
    fetch("data.json").then((res) => res.json()),
    fetch("rivers.geojson?v=3").then((res) => res.json()).catch(() => null),
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

  // Layer 4 — red animated flow downstream from each exceed-standard site
  addExceedFlows(geojson);
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

function addExceedFlows(geojson) {
  const exceedSites = getExceedSites();
  if (!exceedSites.length) return;
  const lines = collectRiverLines(geojson);
  if (!lines.length) return;

  for (const site of exceedSites) {
    const start = findNearestOnLines(lines, site.latitude, site.longitude);
    if (!start || start.distM > 1500) continue; // skip sites > 1.5km from any river
    const downstream = traceDownstream(lines, start, 6000); // 6 km
    if (downstream.length < 2) continue;
    L.polyline(downstream, {
      pane: "rivers",
      color: "#b83232",
      weight: 6,
      opacity: 1,
      dashArray: "20 36",
      lineCap: "round",
      className: "river-flow-line river-flow-exceed",
    }).addTo(state.map);
  }
}

function getExceedSites() {
  const sites = [];
  // Water points that exceed in their latest round
  const latestByPoint = {};
  for (const r of state.data.waterResults) {
    if (r.status !== "exceed") continue;
    if (!latestByPoint[r.siteId] || r.round > latestByPoint[r.siteId]) {
      latestByPoint[r.siteId] = r.round;
    }
  }
  for (const point of state.data.waterPoints) {
    if (latestByPoint[point.id] && point.latitude && point.longitude) {
      sites.push({ latitude: point.latitude, longitude: point.longitude });
    }
  }
  // Factory sites flagged as fail
  for (const site of state.data.factorySites) {
    if (site.overallStatus === "fail" && site.latitude && site.longitude) {
      sites.push({ latitude: site.latitude, longitude: site.longitude });
    }
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

function findNearestOnLines(lines, lat, lng) {
  let best = null;
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    for (let pi = 1; pi < line.length; pi++) {
      const a = line[pi - 1];
      const b = line[pi];
      const proj = projectOnSegment(lat, lng, a, b);
      const d = haversineM(lat, lng, proj.lat, proj.lng);
      if (!best || d < best.distM) {
        best = { distM: d, lineIndex: li, segmentEnd: pi, point: [proj.lat, proj.lng] };
      }
    }
  }
  return best;
}

function traceDownstream(lines, start, distanceM) {
  const line = lines[start.lineIndex];
  const out = [start.point];
  let remaining = distanceM;
  let idx = start.segmentEnd;
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
  const waterParams = new Set(state.data.waterResults.map((r) => r.parameter));
  const factoryParams = new Set(state.data.factoryResults.map((r) => r.parameter));
  const params = [text.all, ...Array.from(new Set([...waterParams, ...factoryParams])).sort()];
  els.parameterFilter.innerHTML = params.map((param) => optionHtml(param)).join("");

  const rounds = [text.latest, ...state.data.samplingRounds.map((r) => String(r.round))];
  els.roundFilter.innerHTML = rounds.map((round) => optionHtml(round)).join("");
  els.sourceNote.textContent = state.data.meta.note;
}

function bindEvents() {
  [els.typeFilter, els.parameterFilter, els.roundFilter].forEach((el) => {
    el.addEventListener("change", render);
  });
  els.searchInput.addEventListener("input", render);
}

function render() {
  clearMarkers();
  const sites = getFilteredSites();
  renderMetrics();
  renderMarkers(sites);
  renderList(sites);
  const selectedStillVisible =
    state.selected && sites.some((site) => site.type === state.selected.type && site.id === state.selected.id);
  if ((!state.selected || !selectedStillVisible) && sites.length) {
    selectSite(sites[0], false);
  }
}

function getFilteredSites() {
  const type = els.typeFilter.value;
  const query = els.searchInput.value.trim().toLowerCase();
  const sites = [];

  if (type === "all" || type === "factory") {
    for (const site of state.data.factorySites) {
      const record = { type: "factory", ...site };
      if (matchesQuery(record, query)) sites.push(record);
    }
  }

  if (type === "all" || type === "water") {
    for (const site of state.data.waterPoints) {
      const record = { type: "water", ...site };
      if (matchesQuery(record, query)) sites.push(record);
    }
  }

  return sites;
}

function matchesQuery(site, query) {
  if (!query) return true;
  const haystack = [site.id, site.company, site.river, site.location, site.province, site.samplePoint]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

function renderMetrics() {
  const totalSites = state.data.waterPoints.length + state.data.factorySites.length;
  const mappedSites = state.data.factorySites.length + state.data.waterPoints.filter((p) => p.latitude).length;
  const exceed = getCurrentWaterRows().filter((r) => r.exceedsStandard).length;
  els.metricSites.textContent = totalSites.toLocaleString("th-TH");
  els.metricMapped.textContent = mappedSites.toLocaleString("th-TH");
  els.metricExceed.textContent = exceed.toLocaleString("th-TH");
}

function renderMarkers(sites) {
  const bounds = [];
  for (const site of sites) {
    if (!site.latitude || !site.longitude) continue;
    const status = getSiteMarkerStatus(site);
    const marker = L.circleMarker([site.latitude, site.longitude], {
      radius: site.type === "water" ? 8 : 9,
      color: "#ffffff",
      weight: 2,
      fillColor: markerColors[status] || markerColors.reported,
      fillOpacity: 0.92,
    });
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

function clearMarkers() {
  for (const layer of state.layers) layer.remove();
  state.layers = [];
}

function renderList(sites) {
  els.listCount.textContent = `${sites.length.toLocaleString("th-TH")} ${text.point}`;
  els.siteList.innerHTML = sites
    .map((site, index) => {
      const title = site.type === "factory" ? site.company : `${site.id} ${site.river}`;
      const detail =
        site.type === "factory"
          ? `${site.samplePoint} · ${statusText[getSiteMarkerStatus(site)] || statusText.reported}`
          : `${site.location} · ${statusText[getSiteMarkerStatus(site)] || statusText.reported}`;
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
      return `<span>${escapeHtml(r.parameter)}</span><strong>${escapeHtml(r.resultText || "-")} <em class="status-pill status-${escapeHtml(status)}">${escapeHtml(statusText[status] || statusText.reported)}</em></strong>`;
    })
    .join("");
  els.selectedTitle.textContent = site.company;
  els.selectedBody.innerHTML = `
    <p>${escapeHtml(site.samplePoint)}</p>
    <p>${text.coordinate} ${site.latitude.toFixed(6)}, ${site.longitude.toFixed(6)}</p>
    <div class="result-grid">${rows}</div>
  `;
}

function renderWaterSelection(site) {
  const param = els.parameterFilter.value;
  const round = getSelectedRoundForSite(site.id);
  let rows = state.data.waterResults.filter((r) => r.siteId === site.id && r.round === round);
  if (param !== text.all) rows = rows.filter((r) => r.parameter === param);
  els.selectedTitle.textContent = `${site.id} ${site.river}`;
  els.selectedBody.innerHTML = `
    <p>${escapeHtml(site.location)}</p>
    <p>${text.coordinate} ${Number(site.latitude).toFixed(6)}, ${Number(site.longitude).toFixed(6)}</p>
    <p>${text.round} ${round}</p>
    <div class="result-grid">
      ${rows
        .map((r) => `<span>${escapeHtml(r.parameter)}</span><strong>${escapeHtml(r.raw || "-")} ${escapeHtml(r.unit || "")} <em class="status-pill status-${escapeHtml(r.status)}">${escapeHtml(statusText[r.status] || r.status)}</em></strong>`)
        .join("")}
    </div>
  `;
}

function buildPopup(site) {
  if (site.type === "factory") {
    return `<p class="popup-title">${escapeHtml(site.company)}</p>
      <p>${escapeHtml(site.samplePoint)}</p>
      <p>${escapeHtml(statusText[getSiteMarkerStatus(site)] || statusText.reported)}</p>`;
  }
  return `<p class="popup-title">${escapeHtml(site.id)} ${escapeHtml(site.river)}</p>
    <p>${escapeHtml(site.location)}</p>
    <p>${escapeHtml(statusText[getSiteMarkerStatus(site)] || statusText.reported)}</p>`;
}

function getCurrentWaterRows() {
  const param = els.parameterFilter.value;
  return state.data.waterResults.filter((r) => {
    if (param !== text.all && r.parameter !== param) return false;
    return r.round === getSelectedRoundForSite(r.siteId);
  });
}

function getSelectedRoundForSite(siteId) {
  const selectedRound = els.roundFilter.value;
  if (selectedRound !== text.latest) return Number(selectedRound);
  const rounds = state.data.waterResults.filter((r) => r.siteId === siteId).map((r) => r.round);
  return Math.max(...rounds);
}

function getSiteMarkerStatus(site) {
  if (site.type === "factory") {
    return site.overallStatus === "fail" ? "fail" : "reported";
  }

  const param = els.parameterFilter.value;
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
