const puppeteer = require("puppeteer-core");
const path = require("path");

(async () => {
  const browser = await puppeteer.launch({
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: "new",
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1300, height: 1000 });
  const fileUrl = "file:///" + path.join(__dirname, "..", "dist", "dashboard.html").replace(/\\/g, "/");
  await page.goto(fileUrl, { waitUntil: "load" });

  // Instagram tab, light mode
  await page.evaluate(() => {
    [...document.querySelectorAll("#tabs button")].find((b) => b.textContent === "Instagram").click();
  });
  await new Promise((r) => setTimeout(r, 150));
  await page.screenshot({ path: path.join(__dirname, "..", "scratch_instagram.png") });

  // hover a chart to capture tooltip
  const box = await page.evaluate(() => {
    const el = document.querySelector(".hit-rect");
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width * 0.6, y: r.top + r.height / 2 };
  });
  await page.mouse.move(box.x, box.y);
  await new Promise((r) => setTimeout(r, 150));
  await page.screenshot({ path: path.join(__dirname, "..", "scratch_instagram_hover.png") });

  // dark mode
  await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "dark" }]);
  await new Promise((r) => setTimeout(r, 150));
  await page.screenshot({ path: path.join(__dirname, "..", "scratch_instagram_dark.png") });

  // YouTube tab dark mode
  await page.evaluate(() => {
    [...document.querySelectorAll("#tabs button")].find((b) => b.textContent === "YouTube").click();
  });
  await new Promise((r) => setTimeout(r, 150));
  await page.screenshot({ path: path.join(__dirname, "..", "scratch_youtube_dark.png") });

  await browser.close();
  console.log("done");
})().catch((e) => { console.error(e); process.exit(1); });
