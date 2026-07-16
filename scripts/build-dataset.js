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

const igPosts = sortByDate(rowsToObjects(loadRaw("ig_posts.json"))).reverse();
const liPosts = sortByDate(rowsToObjects(loadRaw("li_posts.json"))).reverse();
const ytVideos = sortByDate(rowsToObjects(loadRaw("yt_videos.json"))).reverse();

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
  },
  topContent: {
    instagram: igPosts,
    linkedin: liPosts,
    youtube: ytVideos,
  },
};

fs.writeFileSync(OUT_PATH, JSON.stringify(dataset));
console.log(`Wrote ${OUT_PATH}`);
console.log(`  instagram evolution rows: ${igEvolution.length}`);
console.log(`  linkedin evolution rows: ${liEvolution.length}`);
console.log(`  youtube evolution rows: ${ytEvolution.length}`);
console.log(`  instagram posts: ${igPosts.length}, linkedin posts: ${liPosts.length}, youtube videos: ${ytVideos.length}`);
