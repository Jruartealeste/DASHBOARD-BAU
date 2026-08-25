// Pulls the data NOT available through the Metricool MCP connectors into
// data/raw/google_ads_*.json, using the same {fields, rows} shape as the other
// raw files so build-dataset.js can consume them the same way.
//
// Requires a credentials file (see google-ads-credentials.example.json) with:
//   { "developer_token": "...", "client_id": "...", "client_secret": "...",
//     "refresh_token": "...", "customer_id": "3206431695",
//     "login_customer_id": "<MCC id, only if the account sits under a manager>" }
//
// First run will likely need small query tweaks once we see real errors from
// the live account (field/resource availability varies by campaign type and
// API version) — same as fetch-ga4.js needed the API enabled before it worked.
//
// Usage: node scripts/fetch-google-ads.js [days]   (default 90 days back)
const fs = require("fs");
const path = require("path");
const { GoogleAdsApi } = require("google-ads-api");

const CREDENTIALS_PATH =
  process.env.GOOGLE_ADS_CREDENTIALS_PATH ||
  path.join(__dirname, "..", "google-ads-credentials.json");
const DAYS_BACK = Number(process.argv[2] || process.env.GOOGLE_ADS_DAYS || 90);
const RAW_DIR = path.join(__dirname, "..", "data", "raw");

function loadCredentials() {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    console.error(`No se encontró el archivo de credenciales: ${CREDENTIALS_PATH}`);
    console.error("Copiá google-ads-credentials.example.json a google-ads-credentials.json y completá los datos.");
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(CREDENTIALS_PATH, "utf8"));
}

function writeRaw(name, fields, rows) {
  fs.writeFileSync(path.join(RAW_DIR, `${name}.json`), JSON.stringify({ fields, rows }));
  console.log(`  ${name}: ${rows.length} filas -> data/raw/${name}.json`);
}

async function main() {
  const creds = loadCredentials();
  const client = new GoogleAdsApi({
    client_id: creds.client_id,
    client_secret: creds.client_secret,
    developer_token: creds.developer_token,
  });
  const customer = client.Customer({
    customer_id: creds.customer_id,
    login_customer_id: creds.login_customer_id || undefined,
    refresh_token: creds.refresh_token,
  });

  console.log(`Consultando Google Ads API, cuenta ${creds.customer_id} (últimos ${DAYS_BACK} días)...`);

  // 1. Keywords with match type (extends the Metricool keyword table, which has
  // no match-type field at all).
  const keywordRows = await customer.query(`
    SELECT campaign.name, ad_group.name, ad_group_criterion.keyword.text,
      ad_group_criterion.keyword.match_type, metrics.impressions, metrics.clicks,
      metrics.cost_micros, metrics.conversions
    FROM keyword_view
    WHERE segments.date DURING LAST_${DAYS_BACK}_DAYS
      AND ad_group_criterion.status != 'REMOVED'
    ORDER BY metrics.impressions DESC
  `);
  writeRaw(
    "google_ads_keywords_matchtype",
    ["campaign", "adGroup", "keyword", "matchType", "impressions", "clicks", "costMicros", "conversions"],
    keywordRows.map((r) => [
      r.campaign.name, r.ad_group.name, r.ad_group_criterion.keyword.text,
      r.ad_group_criterion.keyword.match_type, r.metrics.impressions, r.metrics.clicks,
      r.metrics.cost_micros, r.metrics.conversions,
    ])
  );

  // 2. Negative keywords, campaign-level and ad-group-level.
  const campaignNegatives = await customer.query(`
    SELECT campaign.name, campaign_criterion.keyword.text, campaign_criterion.keyword.match_type
    FROM campaign_criterion
    WHERE campaign_criterion.negative = true AND campaign_criterion.type = 'KEYWORD'
  `);
  const adGroupNegatives = await customer.query(`
    SELECT campaign.name, ad_group.name, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type
    FROM ad_group_criterion
    WHERE ad_group_criterion.negative = true AND ad_group_criterion.type = 'KEYWORD'
  `);
  writeRaw(
    "google_ads_negative_keywords",
    ["level", "campaign", "adGroup", "keyword", "matchType"],
    [
      ...campaignNegatives.map((r) => ["Campaña", r.campaign.name, "", r.campaign_criterion.keyword.text, r.campaign_criterion.keyword.match_type]),
      ...adGroupNegatives.map((r) => ["Grupo de anuncios", r.campaign.name, r.ad_group.name, r.ad_group_criterion.keyword.text, r.ad_group_criterion.keyword.match_type]),
    ]
  );

  // 3. Real search terms that triggered the ads.
  const searchTerms = await customer.query(`
    SELECT campaign.name, ad_group.name, search_term_view.search_term,
      metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions
    FROM search_term_view
    WHERE segments.date DURING LAST_${DAYS_BACK}_DAYS
    ORDER BY metrics.impressions DESC
  `);
  writeRaw(
    "google_ads_search_terms",
    ["campaign", "adGroup", "searchTerm", "impressions", "clicks", "costMicros", "conversions"],
    searchTerms.map((r) => [
      r.campaign.name, r.ad_group.name, r.search_term_view.search_term,
      r.metrics.impressions, r.metrics.clicks, r.metrics.cost_micros, r.metrics.conversions,
    ])
  );

  // 4. Search impression share + lost IS (budget/rank) — Search campaigns only,
  // these metrics don't exist for Demand Gen / Display campaign types.
  const impressionShare = await customer.query(`
    SELECT campaign.name, metrics.search_impression_share,
      metrics.search_budget_lost_impression_share, metrics.search_rank_lost_impression_share,
      metrics.impressions, metrics.clicks
    FROM campaign
    WHERE segments.date DURING LAST_${DAYS_BACK}_DAYS
      AND campaign.advertising_channel_type = 'SEARCH'
  `);
  writeRaw(
    "google_ads_impression_share",
    ["campaign", "searchImpressionShare", "lostISBudget", "lostISRank", "impressions", "clicks"],
    impressionShare.map((r) => [
      r.campaign.name, r.metrics.search_impression_share, r.metrics.search_budget_lost_impression_share,
      r.metrics.search_rank_lost_impression_share, r.metrics.impressions, r.metrics.clicks,
    ])
  );

  // 5. Devices.
  const devices = await customer.query(`
    SELECT campaign.name, segments.device, metrics.impressions, metrics.clicks,
      metrics.cost_micros, metrics.conversions
    FROM campaign
    WHERE segments.date DURING LAST_${DAYS_BACK}_DAYS
  `);
  writeRaw(
    "google_ads_devices",
    ["campaign", "device", "impressions", "clicks", "costMicros", "conversions"],
    devices.map((r) => [r.campaign.name, r.segments.device, r.metrics.impressions, r.metrics.clicks, r.metrics.cost_micros, r.metrics.conversions])
  );

  // 6. Geographic performance. Note: country_criterion_id is a numeric geo
  // target id, not a human-readable name yet — needs a follow-up lookup
  // against Google's geo target constants to translate to country/region names.
  const geo = await customer.query(`
    SELECT campaign.name, geographic_view.country_criterion_id, geographic_view.location_type,
      metrics.impressions, metrics.clicks, metrics.cost_micros
    FROM geographic_view
    WHERE segments.date DURING LAST_${DAYS_BACK}_DAYS
  `);
  writeRaw(
    "google_ads_locations",
    ["campaign", "countryCriterionId", "locationType", "impressions", "clicks", "costMicros"],
    geo.map((r) => [r.campaign.name, r.geographic_view.country_criterion_id, r.geographic_view.location_type, r.metrics.impressions, r.metrics.clicks, r.metrics.cost_micros])
  );

  // 7. Audiences — age range + gender breakdowns (closest GAQL equivalent of
  // "públicos alcanzados" for Search/Display campaigns).
  const ageRows = await customer.query(`
    SELECT campaign.name, ad_group_criterion.age_range.type, metrics.impressions, metrics.clicks, metrics.cost_micros
    FROM age_range_view
    WHERE segments.date DURING LAST_${DAYS_BACK}_DAYS
  `);
  const genderRows = await customer.query(`
    SELECT campaign.name, ad_group_criterion.gender.type, metrics.impressions, metrics.clicks, metrics.cost_micros
    FROM gender_view
    WHERE segments.date DURING LAST_${DAYS_BACK}_DAYS
  `);
  writeRaw(
    "google_ads_audiences",
    ["campaign", "dimension", "value", "impressions", "clicks", "costMicros"],
    [
      ...ageRows.map((r) => [r.campaign.name, "Edad", r.ad_group_criterion.age_range.type, r.metrics.impressions, r.metrics.clicks, r.metrics.cost_micros]),
      ...genderRows.map((r) => [r.campaign.name, "Género", r.ad_group_criterion.gender.type, r.metrics.impressions, r.metrics.clicks, r.metrics.cost_micros]),
    ]
  );

  // 8. Landing pages.
  const landingPages = await customer.query(`
    SELECT campaign.name, landing_page_view.unexpanded_final_url, metrics.impressions,
      metrics.clicks, metrics.cost_micros, metrics.conversions
    FROM landing_page_view
    WHERE segments.date DURING LAST_${DAYS_BACK}_DAYS
    ORDER BY metrics.impressions DESC
  `);
  writeRaw(
    "google_ads_landing_pages",
    ["campaign", "landingPage", "impressions", "clicks", "costMicros", "conversions"],
    landingPages.map((r) => [r.campaign.name, r.landing_page_view.unexpanded_final_url, r.metrics.impressions, r.metrics.clicks, r.metrics.cost_micros, r.metrics.conversions])
  );

  console.log("Listo.");
}

main().catch((err) => {
  console.error("Error consultando la Google Ads API:", err.message || err);
  process.exit(1);
});
