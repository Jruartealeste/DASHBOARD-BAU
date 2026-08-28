// Loads dist/dashboard.html in jsdom, drives every tab + a couple of date
// presets, and asserts no NaN/undefined leaked into the rendered KPIs.
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const html = fs.readFileSync(path.join(__dirname, "..", "dist", "dashboard.html"), "utf8");

(async () => {
  const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true, url: "https://example.com/dashboard.html" });
  const { window } = dom;

  // getBoundingClientRect isn't implemented by jsdom's layout-less engine; stub it.
  window.SVGElement.prototype.getBoundingClientRect = () => ({ left: 0, top: 0, width: 640, height: 200 });

  await new Promise((resolve) => setTimeout(resolve, 100));
  const doc = window.document;

  function checkBadText(label) {
    const text = doc.getElementById("content").textContent;
    const bad = [];
    if (/\bNaN\b/.test(text)) bad.push("NaN");
    if (/\bundefined\b/.test(text)) bad.push("undefined");
    if (/\bnull\b/.test(text)) bad.push("null");
    if (bad.length) throw new Error(`[${label}] found ${bad.join(",")} in rendered content`);
    console.log(`[${label}] OK — content length ${text.length}, tiles: ${doc.querySelectorAll(".tile").length}`);
  }

  checkBadText("initial (overview, 30d)");

  const tabs = ["Instagram", "LinkedIn", "YouTube", "Sitio Web", "Resumen"];
  for (const label of tabs) {
    const btn = [...doc.querySelectorAll("#tabs button")].find((b) => b.textContent === label);
    if (!btn) throw new Error(`tab button not found: ${label}`);
    btn.click();
    checkBadText("tab:" + label);
  }

  const presets = ["7 días", "30 días", "90 días", "12 meses"];
  for (const label of presets) {
    const btn = [...doc.querySelectorAll("#filter-bar button")].find((b) => b.textContent === label);
    if (!btn) throw new Error(`preset button not found: ${label}`);
    btn.click();
    checkBadText("preset:" + label);
  }

  // exercise a chart hover + the table-view toggle on the currently rendered content
  const hit = doc.querySelector(".hit-rect");
  if (hit) {
    const ev = new window.Event("pointermove");
    ev.clientX = 300; ev.clientY = 200;
    hit.dispatchEvent(ev);
    const tip = doc.querySelector(".tooltip");
    if (!tip || tip.style.opacity !== "1") throw new Error("tooltip did not activate on hover");
    console.log("tooltip OK:", tip.textContent.replace(/\s+/g, " ").trim());
  } else {
    throw new Error("no chart hit-rect found to test hover");
  }

  const toggle = doc.querySelector(".card .toggle");
  if (toggle) {
    toggle.click();
    console.log("table toggle OK, label now:", toggle.textContent);
  } else {
    throw new Error("no chart table-view toggle found");
  }

  console.log("\nALL SMOKE CHECKS PASSED");
  process.exit(0);
})().catch((err) => {
  console.error("SMOKE TEST FAILED:", err.message);
  process.exit(1);
});
