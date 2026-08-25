// Converts the CSV reports manually exported from the Google Ads UI
// (dropped in data/manual-exports/) into data/raw/google_ads_manual_*.json,
// using the same {fields, rows} shape as the rest of the pipeline.
//
// This is a manual/periodic snapshot, not a live feed — re-run this (and
// re-export fresh CSVs) whenever the numbers need updating. See
// data/manual-exports/README.md for exactly what to export and from where.
//
// Usage: node scripts/parse-google-ads-manual.js
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
  if (t === "" || t === "--" || t === "Ninguno" || t === "Ninguna") return null;
  const cleaned = t.replace(/^ARS/, "").replace(/%$/, "").replace(/,/g, "").trim();
  const n = Number(cleaned);
  return Number.isNaN(n) ? t : n;
}

function str(s) {
  if (s === undefined || s === null) return null;
  const t = String(s).trim();
  return t === "" || t === "--" || t === "Ninguno" || t === "Ninguna" ? null : t;
}

// Google Ads puts the "Total: ..." footer in whichever column happens to be
// first non-blank for that report (sometimes col 0, sometimes col 4) — scan
// the whole row rather than assuming a fixed position.
function isTotalRow(row) {
  return row.some((cell) => typeof cell === "string" && cell.startsWith("Total"));
}

function findFile(nameIncludes) {
  const match = fs.readdirSync(SRC_DIR).find((f) => f.includes(nameIncludes));
  return match ? path.join(SRC_DIR, match) : null;
}

// `headerLine` = 1-based line number of the real CSV header (Google Ads
// prefixes some exports with 2 metadata lines: report title + date range).
function loadReport(nameIncludes, headerLine) {
  const filePath = findFile(nameIncludes);
  if (!filePath) {
    console.log(`  (no encontrado: *${nameIncludes}* — se omite)`);
    return null;
  }
  const text = fs.readFileSync(filePath, "utf8");
  const allRows = parseCsv(text).filter((r) => r.some((c) => c !== ""));
  const dataRows = allRows.slice(headerLine).filter((r) => !isTotalRow(r));
  return { file: path.basename(filePath), rows: dataRows };
}

function writeRaw(name, fields, rows) {
  fs.writeFileSync(path.join(RAW_DIR, `${name}.json`), JSON.stringify({ fields, rows }));
  console.log(`  ${name}: ${rows.length} filas -> data/raw/${name}.json`);
}

console.log("Parseando exports manuales de Google Ads...");

// Keywords with match type — no metadata header lines on this export.
const kw = loadReport("Palabras_clave", 1);
if (kw) {
  writeRaw(
    "google_ads_manual_keywords",
    ["keyword", "matchType", "criterionStatus", "campaignStatus", "adGroupStatus", "cost", "clicks", "ctr"],
    kw.rows.map((r) => [str(r[0]), str(r[1]), str(r[2]), str(r[3]), str(r[4]), num(r[5]), num(r[6]), num(r[7])])
  );
}

// Real search terms, account-wide aggregate — no metadata header lines.
const searchTerms = loadReport("Búsquedas(Buscar", 1);
if (searchTerms) {
  const rows = searchTerms.rows
    .map((r) => [str(r[0]), num(r[1]), num(r[2]), num(r[3]), num(r[4])])
    .sort((a, b) => (b[3] || 0) - (a[3] || 0));
  writeRaw("google_ads_manual_search_terms", ["searchTerm", "cost", "clicks", "impressions", "conversions"], rows);
}

// Devices — 2 metadata lines before the header.
const devices = loadReport("Informe de dispositivos", 3);
if (devices) {
  writeRaw(
    "google_ads_manual_devices",
    ["device", "campaign", "adGroup", "impressions", "interactions", "interactionRate", "avgCost", "cost", "conversions", "costPerConv"],
    devices.rows.map((r) => [str(r[0]), str(r[2]), str(r[3]), num(r[8]), num(r[9]), num(r[10]), num(r[11]), num(r[12]), num(r[14]), num(r[15])])
  );
}

// Landing pages — 2 metadata lines before the header.
const landing = loadReport("páginas de destino", 3);
if (landing) {
  writeRaw(
    "google_ads_manual_landing_pages",
    ["landingPage", "clicks", "impressions", "ctr", "avgCpc", "cost"],
    landing.rows.map((r) => [str(r[0]), num(r[5]), num(r[6]), num(r[7]), num(r[9]), num(r[10])])
  );
}

// Locations — merge every "Informe de ubicaciones*" export found. Google Ads
// export naming can duplicate the same report under "(1)" etc., so dedupe by
// location+campaign (keep first, values are near-identical either way).
const locationFiles = fs.readdirSync(SRC_DIR).filter((f) => f.includes("ubicaciones"));
const locationByKey = new Map();
locationFiles.forEach((f) => {
  const text = fs.readFileSync(path.join(SRC_DIR, f), "utf8");
  const allRows = parseCsv(text).filter((r) => r.some((c) => c !== ""));
  const rows = allRows.slice(3).filter((r) => !isTotalRow(r));
  rows.forEach((r) => {
    const key = `${r[0]}|${r[1]}`;
    if (!locationByKey.has(key)) {
      locationByKey.set(key, [str(r[0]), str(r[1]), num(r[4]), num(r[5]), num(r[6]), num(r[8]), num(r[9]), num(r[11])]);
    }
  });
});
if (locationByKey.size) {
  writeRaw("google_ads_manual_locations", ["location", "campaign", "clicks", "impressions", "ctr", "avgCpc", "cost", "conversions"], [...locationByKey.values()]);
} else {
  console.log("  (no se encontraron archivos de Informe de ubicaciones)");
}

console.log("Listo. (Nota: el informe detallado de términos de búsqueda por campaña, 9MB+/56k filas, y el desglose por palabra suelta no se procesan — el archivo de búsquedas agregadas por cuenta ya cubre lo pedido sin inflar el dashboard.)");
