// Pulls data from the Google Analytics 4 Data API (property "Aluar - GA4")
// into data/raw/ga4_*.json, using the same {fields, rows} shape as the
// Metricool raw files so build-dataset.js can consume them the same way.
// Requires a service account JSON key with Viewer access on the GA4 property.
// Usage: node scripts/fetch-ga4.js [days]   (default 90 days back from today)
const fs = require("fs");
const path = require("path");
const { BetaAnalyticsDataClient } = require("@google-analytics/data");

const PROPERTY_ID = process.env.GA4_PROPERTY_ID || "361348048";
const CREDENTIALS_PATH =
  process.env.GA4_CREDENTIALS_PATH ||
  path.join(__dirname, "..", "redesaluar-a42953ff726f.json");
const DAYS_BACK = Number(process.argv[2] || process.env.GA4_DAYS || 90);
const RAW_DIR = path.join(__dirname, "..", "data", "raw");

const client = new BetaAnalyticsDataClient({ keyFilename: CREDENTIALS_PATH });

const dateRange = [{ startDate: `${DAYS_BACK}daysAgo`, endDate: "today" }];

const reports = [
  {
    name: "ga4_channels",
    label: "Sesiones por canal",
    dimensions: ["sessionDefaultChannelGroup"],
    metrics: ["sessions", "totalUsers", "newUsers", "engagementRate", "conversions"],
    orderBy: "sessions",
  },
  {
    name: "ga4_source_comparison",
    label: "Comparativa Google / Meta / otros medios (source + medium)",
    dimensions: ["sessionSource", "sessionMedium"],
    metrics: ["sessions", "totalUsers", "conversions", "engagementRate"],
    orderBy: "sessions",
    limit: 30,
  },
  {
    name: "ga4_campaigns",
    label: "Sesiones por campaña",
    dimensions: ["sessionCampaignName", "sessionSource", "sessionMedium"],
    metrics: ["sessions", "totalUsers", "conversions"],
    orderBy: "sessions",
    limit: 30,
  },
  {
    name: "ga4_landing_pages",
    label: "Rendimiento de páginas de entrada",
    dimensions: ["landingPage"],
    metrics: ["sessions", "totalUsers", "engagementRate", "bounceRate", "averageSessionDuration", "conversions"],
    orderBy: "sessions",
    limit: 25,
  },
  {
    name: "ga4_engagement_daily",
    label: "Tiempo e interacción por día",
    dimensions: ["date"],
    metrics: ["sessions", "engagedSessions", "engagementRate", "averageSessionDuration", "userEngagementDuration"],
    orderBy: "date",
  },
  {
    name: "ga4_events",
    label: "Acciones y conversiones (eventos)",
    dimensions: ["eventName"],
    metrics: ["eventCount", "totalUsers", "conversions"],
    orderBy: "eventCount",
    limit: 30,
  },
  {
    name: "ga4_bounce_by_page_device",
    label: "Proxy de abandono: bounce rate por página de entrada y dispositivo",
    dimensions: ["landingPage", "deviceCategory"],
    metrics: ["sessions", "bounceRate"],
    orderBy: "sessions",
    limit: 50,
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

async function runReport({ name, label, dimensions, metrics, orderBy, limit }) {
  const [response] = await client.runReport({
    property: `properties/${PROPERTY_ID}`,
    dateRanges: dateRange,
    dimensions: dimensions.map((name) => ({ name })),
    metrics: metrics.map((name) => ({ name })),
    orderBys: orderBy
      ? dimensions.includes(orderBy)
        ? [{ dimension: { dimensionName: orderBy }, desc: false }]
        : [{ metric: { metricName: orderBy }, desc: true }]
      : undefined,
    limit: limit || 100000,
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
