// Headless smoke test: serve the app, click quick-add, verify state persists,
// test the ?add= URL param, and screenshot.
const http = require("http");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".png": "image/png" };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p === "/") p = "/index.html";
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file)) { res.writeHead(404); return res.end("nf"); }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});

(async () => {
  await new Promise((r) => server.listen(4321, r));
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

  await page.goto("http://localhost:4321/index.html", { waitUntil: "networkidle" });

  // Quick-add 250 + 500
  await page.click('.quick-btn[data-amt="250"]');
  await page.click('.quick-btn[data-amt="500"]');
  await page.fill("#customInput", "120");
  await page.click("#customAdd");
  await page.waitForTimeout(300);
  const total = await page.textContent("#total");
  console.log("Total after 250+500+120:", total, "(expect 870)");

  // Persistence across reload
  await page.reload({ waitUntil: "networkidle" });
  const totalAfterReload = await page.textContent("#total");
  console.log("Total after reload:", totalAfterReload, "(expect 870)");

  // URL quick-add param
  await page.goto("http://localhost:4321/index.html?add=330", { waitUntil: "networkidle" });
  await page.waitForTimeout(200);
  const totalAfterUrl = await page.textContent("#total");
  console.log("Total after ?add=330:", totalAfterUrl, "(expect 1200)");
  console.log("URL after add:", page.url(), "(expect no ?add)");

  await page.screenshot({ path: path.join(__dirname, "..", "preview.png") });

  console.log("JS errors:", errors.length ? errors : "none");
  const pass = total.trim() === "870" && totalAfterReload.trim() === "870" &&
    totalAfterUrl.trim() === "1200" && !page.url().includes("add=") && errors.length === 0;
  console.log(pass ? "SMOKE PASS ✅" : "SMOKE FAIL ❌");

  await browser.close();
  server.close();
  process.exit(pass ? 0 : 1);
})();
