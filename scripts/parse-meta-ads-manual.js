// Converts the CSV reports manually exported from Meta Ads Manager
// (dropped in data/manual-exports/) into data/raw/meta_ads_manual_*.json,
// using the same {fields, rows} shape as the rest of the pipeline.
//
// This is a manual/periodic snapshot, not a live feed — re-run this (and
// re-export fresh CSVs) whenever the numbers need updating. See
// data/manual-exports/README.md for exactly what to export and from where.
//
// Usage: node scripts/parse-meta-ads-manual.js
const fs = require("fs");
const path = require("path");

const SRC_DIR = path.join(__dirname, "..", "data", "manual-exports");
const RAW_DIR = path.join(__dirname, "..", "data", "raw");

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function num(s) {
  if (s === undefined || s === null) return null;
  const t = String(s).trim();
  if (t === "" || t === "--") return null;
  const cleaned = t.replace(/,/g, "").trim();
  const n = Number(cleaned);
  return Number.isNaN(n) ? null : n;
}

function str(s) {
  if (s === undefined || s === null) return null;
  const t = String(s).trim();
  return t === "" ? null : t;
}

function findFile(nameIncludes, excludes) {
  excludes = excludes || [];
  const match = fs.readdirSync(SRC_DIR).find((f) => f.includes(nameIncludes) && !excludes.some((x) => f.includes(x)));
  return match ? path.join(SRC_DIR, match) : null;
}

function loadReport(nameIncludes, excludes) {
  const filePath = findFile(nameIncludes, excludes);
  if (!filePath) {
    console.log(`  (no encontrado: *${nameIncludes}* — se omite)`);
    return null;
  }
  const text = fs.readFileSync(filePath, "utf8");
  const allRows = parseCsv(text).filter((r) => r.some((c) => c !== ""));
  return { file: path.basename(filePath), rows: allRows.slice(1) };
}

function writeRaw(name, fields, rows) {
  fs.writeFileSync(path.join(RAW_DIR, `${name}.json`), JSON.stringify({ fields, rows }));
  console.log(`  ${name}: ${rows.length} filas -> data/raw/${name}.json`);
}

console.log("Parseando exports manuales de Meta Ads...");

// Campaign-level export (nivel Campañas, sin desglose). "Presupuesto del
// conjunto de anuncios" (col 10) viene como texto ("Con el presupuesto del
// conjunto de anuncios") en vez de un número cuando la cuenta no usa
// Advantage Campaign Budget (presupuesto a nivel campaña) — que es el caso
// de esta cuenta hoy. Para un presupuesto numérico real hay que exportar a
// nivel Conjuntos de anuncios en su lugar.
const campaigns = loadReport("Campañas", ["PublicoAlcanzado"]);
if (campaigns) {
  writeRaw(
    "meta_ads_manual_campaigns",
    [
      "name", "delivery", "objective", "resultIndicator", "results", "reach", "frequency",
      "costPerResult", "budgetInfo", "amountSpent", "impressions", "cpm",
      "linkClicks", "ctrLinkClicks", "cpcLinkClicks", "allClicks", "ctrAll", "cpcAll",
      "landingPageViews", "costPerLandingPageView",
    ],
    campaigns.rows.map((r) => [
      str(r[2]), str(r[3]), str(r[25]), str(r[6]), num(r[5]), num(r[7]), num(r[8]),
      num(r[9]), str(r[10]), num(r[12]), num(r[14]), num(r[15]),
      num(r[16]), num(r[19]), num(r[18]), num(r[20]), num(r[21]), num(r[22]),
      num(r[23]), num(r[24]),
    ])
  );
}

// Audience reached: campaign export with an Age + Gender breakdown.
const audiences = loadReport("PublicoAlcanzado");
if (audiences) {
  writeRaw(
    "meta_ads_manual_audiences",
    ["campaign", "age", "gender", "delivery", "objective", "resultIndicator", "results", "reach", "frequency", "amountSpent", "impressions", "linkClicks", "allClicks"],
    audiences.rows.map((r) => [
      str(r[2]), str(r[3]), str(r[4]), str(r[5]), str(r[27]), str(r[8]), num(r[7]), num(r[9]), num(r[10]),
      num(r[14]), num(r[16]), num(r[18]), num(r[22]),
    ])
  );
}

// Video plays / watch time — ad-level export, no breakdown. Budget comes
// through as a real number here (unlike the campaign-level exports above)
// because at ad level Meta rolls up to its ad set's budget directly.
const video = loadReport("REPRODUCCIONVIDEO");
if (video) {
  writeRaw(
    "meta_ads_manual_video",
    ["adName", "delivery", "reach", "frequency", "budget", "budgetType", "amountSpent", "impressions", "linkClicks", "allClicks", "landingPageViews", "videoPlays", "thruPlays", "avgWatchTimeSec"],
    video.rows.map((r) => [
      str(r[2]), str(r[3]), num(r[5]), num(r[6]), num(r[7]), str(r[8]), null, num(r[13]),
      num(r[15]), num(r[19]), num(r[22]), num(r[24]), num(r[25]), num(r[26]),
    ])
  );
}

// Platforms + placements + device — ad set export with a "Ubicación"
// breakdown (Meta bundles platform/placement/device into this one
// breakdown). Budget is numeric here too (ad-set level).
const placements = loadReport("UBICACION");
if (placements) {
  writeRaw(
    "meta_ads_manual_placements",
    ["adSet", "platform", "placement", "devicePlatform", "delivery", "results", "resultIndicator", "reach", "frequency", "budget", "budgetType", "amountSpent", "impressions", "linkClicks", "allClicks", "landingPageViews"],
    placements.rows.map((r) => [
      str(r[2]), str(r[3]), str(r[4]), str(r[5]), str(r[6]), num(r[8]), str(r[9]), num(r[10]), num(r[11]),
      num(r[13]), str(r[14]), num(r[15]), num(r[18]), num(r[20]), num(r[24]), num(r[27]),
    ])
  );
}

console.log("Listo. (Nota: el export de 'destino de cada anuncio' no traía columna de destino/URL — revisar si Ads Manager la ofrece bajo otro nombre y volver a exportar.)");
