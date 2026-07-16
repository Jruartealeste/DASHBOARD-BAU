// Injects data/aluar-metrics.json into dashboard.template.html and writes
// dist/dashboard.html — a single self-contained file (no external requests).
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const template = fs.readFileSync(path.join(ROOT, "dashboard.template.html"), "utf8");
const dataset = fs.readFileSync(path.join(ROOT, "data", "aluar-metrics.json"), "utf8");

const safeDataset = dataset.replace(/<\/script/gi, "<\\/script");
const out = template.replace("%%DATASET_JSON%%", () => safeDataset);

fs.mkdirSync(path.join(ROOT, "dist"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "dist", "dashboard.html"), out);
console.log("Wrote dist/dashboard.html (" + (out.length / 1024).toFixed(0) + " KB)");
