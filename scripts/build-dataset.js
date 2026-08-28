// Transforms the raw Metricool MCP responses in data/raw/*.json into a single
// consolidated dataset (data/aluar-metrics.json) consumed by the dashboard.
// Re-run this after pulling fresh raw data from the MCP to refresh the dashboard.
const fs = require("fs");
const path = require("path");

const RAW_DIR = path.join(__dirname, "..", "data", "raw");
const OUT_PATH = path.join(__dirname, "..", "data", "aluar-metrics.json");

function loadRaw(name) {
  return JSON.parse(fs.readFileSync(path.join(RAW_DIR, name), "utf8"));
}

function toISODate(yyyymmdd) {
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

function num(v) {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

function rowsToObjects(raw) {
  const { fields, rows } = raw;
  return rows.map((row) => {
    const obj = {};
    fields.forEach((field, i) => {
      const value = row[i];
      obj[field] = field === "date" ? toISODate(value) : field === "content" || field === "title" || field === "url" || field === "watchUrl" || field === "type" ? value : num(value);
    });
    return obj;
  });
}

function sortByDate(list) {
  return list.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

const igEvolution = sortByDate(rowsToObjects(loadRaw("ig_evolution.json")));
const liEvolution = sortByDate(rowsToObjects(loadRaw("li_evolution.json")));
const ytEvolution = sortByDate(rowsToObjects(loadRaw("yt_evolution.json")));
const wtEvolution = sortByDate(rowsToObjects(loadRaw("wt_evolution.json")));

const igPosts = sortByDate(rowsToObjects(loadRaw("ig_posts.json"))).reverse();
const liPosts = sortByDate(rowsToObjects(loadRaw("li_posts.json"))).reverse();
const ytVideos = sortByDate(rowsToObjects(loadRaw("yt_videos.json"))).reverse();

function topSourcesWithOther(raw, topN = 5) {
  const rows = raw.rows.map(([source, traffic]) => ({ label: source, value: Number(traffic) }));
  const total = rows.reduce((s, r) => s + r.value, 0);
  const top = rows.slice(0, topN);
  const restSum = total - top.reduce((s, r) => s + r.value, 0);
  const sources = top.map((r) => ({ label: r.label, pct: Number(((100 * r.value) / total).toFixed(2)) }));
  sources.push({ label: "Otros", pct: Number(((100 * restSum) / total).toFixed(2)) });
  return sources;
}

function topPages(raw, topN = 8) {
  return raw.rows.slice(0, topN).map(([page, views]) => ({ page, views: Number(views) }));
}

const web = {
  sources: topSourcesWithOther(loadRaw("wt_sources.json")),
  topPages: topPages(loadRaw("wt_pages.json")),
};

// Google Ads, Meta Ads, and Google Analytics 4 were removed from the shipped
// dashboard on request (2026-08-27) — the loaders that used to assemble
// `ads` and `analytics` (Metricool campaign/keyword snapshots, the manual
// CSV exports, and the GA4 Data API pull) lived here. The underlying raw
// files, fetch scripts, and dashboard.template.html render functions are
// still in the repo/history untouched, so this is easy to bring back — just
// not wired into the dataset the page ships with for now.

const dataset = {
  meta: {
    brand: "Aluar",
    brandId: "2472406",
    networks: {
      instagram: "aluar.ar",
      linkedin: "urn:li:organization:39975",
      youtube: "UCkJO4ENRBI_nr2vSH3QqkQA",
    },
    generatedAt: new Date().toISOString(),
    evolutionRange: { from: igEvolution[0]?.date, to: igEvolution[igEvolution.length - 1]?.date },
    postsRange: { from: igPosts[igPosts.length - 1]?.date, to: igPosts[0]?.date },
  },
  evolution: {
    instagram: igEvolution,
    linkedin: liEvolution,
    youtube: ytEvolution,
    website: wtEvolution,
  },
  topContent: {
    instagram: igPosts,
    linkedin: liPosts,
    youtube: ytVideos,
  },
  web,
};

fs.writeFileSync(OUT_PATH, JSON.stringify(dataset));
console.log(`Wrote ${OUT_PATH}`);
console.log(`  instagram evolution rows: ${igEvolution.length}`);
console.log(`  linkedin evolution rows: ${liEvolution.length}`);
console.log(`  youtube evolution rows: ${ytEvolution.length}`);
console.log(`  website evolution rows: ${wtEvolution.length}`);
console.log(`  instagram posts: ${igPosts.length}, linkedin posts: ${liPosts.length}, youtube videos: ${ytVideos.length}`);
