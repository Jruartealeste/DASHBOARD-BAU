// Pulls data from the Google Analytics 4 Data API (property "Aluar - GA4")
// into data/raw/ga4_*.json, using the same {fields, rows} shape as the
// Metricool raw files so build-dataset.js can consume them the same way.
//
// Every report includes "date" as a dimension so the dashboard can filter by
// the selected date range and re-aggregate client-side (same pattern as the
// other evolution-based tabs). Rates (engagement rate, bounce rate) are NOT
// requested directly, since GA4 rates aren't additive across rows — instead
// we pull the underlying counts (sessions, engagedSessions) and recompute
// rates after summing. A bounced session is defined by GA4 as a
// non-engaged session, so bounceRate = 1 - engagedSessions/sessions.
//
// Requires a service account JSON key with Viewer access on the GA4 property.
// Usage: node scripts/fetch-ga4.js [days]   (default 400 days back from today,
// matching the range of the other network evolution data so every date-range
// preset in the dashboard, including "12 meses", has real GA4 data behind it)
const fs = require("fs");
const path = require("path");
const { BetaAnalyticsDataClient } = require("@google-analytics/data");

const PROPERTY_ID = process.env.GA4_PROPERTY_ID || "361348048";
const CREDENTIALS_PATH =
  process.env.GA4_CREDENTIALS_PATH ||
  path.join(__dirname, "..", "redesaluar-a42953ff726f.json");
const DAYS_BACK = Number(process.argv[2] || process.env.GA4_DAYS || 400);
const RAW_DIR = path.join(__dirname, "..", "data", "raw");

const client = new BetaAnalyticsDataClient({ keyFilename: CREDENTIALS_PATH });

const dateRange = [{ startDate: `${DAYS_BACK}daysAgo`, endDate: "today" }];

// Over a full year, landingPage has a long tail of one-off URLs — a per-day
// breakdown across every distinct value would balloon the raw JSON for no
// real benefit. Reports with a `topFilter` first rank values by a metric
// (no date dimension) and then re-query with a date breakdown restricted to
// just that top set.
const TOP_PAGES = 25;
const TOP_SOURCES = 30;
const TOP_CAMPAIGNS = 30;

const reports = [
  {
    name: "ga4_channels",
    label: "Sesiones por canal y día",
    dimensions: ["date", "sessionDefaultChannelGroup"],
    metrics: ["sessions", "totalUsers", "newUsers", "engagedSessions", "conversions"],
  },
  {
    name: "ga4_source_comparison",
    label: "Google / Meta / otros medios por día (source + medium)",
    dimensions: ["date", "sessionSourceMedium", "sessionSource", "sessionMedium"],
    metrics: ["sessions", "totalUsers", "engagedSessions", "conversions"],
    topFilter: { dimension: "sessionSourceMedium", metric: "sessions", n: TOP_SOURCES },
  },
  {
    name: "ga4_campaigns",
    label: "Sesiones por campaña y día",
    dimensions: ["date", "sessionCampaignName", "sessionSource", "sessionMedium"],
    metrics: ["sessions", "totalUsers", "conversions"],
    topFilter: { dimension: "sessionCampaignName", metric: "sessions", n: TOP_CAMPAIGNS },
  },
  {
    name: "ga4_landing_pages",
    label: "Rendimiento de páginas de entrada por día",
    dimensions: ["date", "landingPage"],
    metrics: ["sessions", "totalUsers", "engagedSessions", "userEngagementDuration", "conversions"],
    topFilter: { dimension: "landingPage", metric: "sessions", n: TOP_PAGES },
  },
  {
    name: "ga4_engagement_daily",
    label: "Tiempo e interacción por día (cuenta completa)",
    dimensions: ["date"],
    metrics: ["sessions", "engagedSessions", "engagementRate", "averageSessionDuration", "userEngagementDuration"],
  },
  {
    name: "ga4_events",
    label: "Acciones y conversiones (eventos) por día",
    dimensions: ["date", "eventName"],
    metrics: ["eventCount", "totalUsers", "conversions"],
  },
  {
    name: "ga4_bounce_by_page_device",
    label: "Proxy de abandono por página, dispositivo y día",
    dimensions: ["date", "landingPage", "deviceCategory"],
    metrics: ["sessions", "engagedSessions"],
    topFilter: { dimension: "landingPage", metric: "sessions", n: TOP_PAGES },
  },
];

function extractValue(cell) {
  return cell.value;
}

function toFieldsRows(response, dimensions, metrics) {
  const fields = [...dimensions, ...metrics];
  const rows = (response.rows || []).map((row) => [
    ...row.dimensionValues.map(extractValue),
    ...row.metricValues.map(extractValue),
  ]);
  return { fields, rows };
}

async function getTopValues(dimension, metric, n) {
  const [response] = await client.runReport({
    property: `properties/${PROPERTY_ID}`,
    dateRanges: dateRange,
    dimensions: [{ name: dimension }],
    metrics: [{ name: metric }],
    orderBys: [{ metric: { metricName: metric }, desc: true }],
    limit: n,
  });
  return (response.rows || []).map((row) => row.dimensionValues[0].value);
}

async function runReport({ name, label, dimensions, metrics, topFilter }) {
  let dimensionFilter;
  if (topFilter) {
    const values = await getTopValues(topFilter.dimension, topFilter.metric, topFilter.n);
    dimensionFilter = {
      filter: { fieldName: topFilter.dimension, inListFilter: { values } },
    };
  }

  const [response] = await client.runReport({
    property: `properties/${PROPERTY_ID}`,
    dateRanges: dateRange,
    dimensions: dimensions.map((name) => ({ name })),
    metrics: metrics.map((name) => ({ name })),
    dimensionFilter,
    orderBys: [{ dimension: { dimensionName: "date" }, desc: false }],
    limit: 100000,
  });

  const data = toFieldsRows(response, dimensions, metrics);
  const outPath = path.join(RAW_DIR, `${name}.json`);
  fs.writeFileSync(outPath, JSON.stringify(data));
  console.log(`  ${label}: ${data.rows.length} filas -> data/raw/${name}.json`);
}

async function main() {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    console.error(`No se encontró el archivo de credenciales: ${CREDENTIALS_PATH}`);
    process.exit(1);
  }
  console.log(`Consultando GA4 property ${PROPERTY_ID} (últimos ${DAYS_BACK} días)...`);
  for (const report of reports) {
    await runReport(report);
  }
  console.log("Listo.");
}

main().catch((err) => {
  console.error("Error consultando la GA4 Data API:", err.message || err);
  process.exit(1);
});
