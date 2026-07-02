// Renders the app with a week of seeded history to preview the dashboard.
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
  await new Promise((r) => server.listen(4322, r));
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto("http://localhost:4322/index.html", { waitUntil: "networkidle" });

  // Seed the last 7 days with varied totals, then reload.
  await page.evaluate(() => {
    const key = (n) => { const d = new Date(); d.setHours(12,0,0,0); d.setDate(d.getDate()-n);
      return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); };
    const totals = { 6: 2100, 5: 1500, 4: 2000, 3: 900, 2: 2400, 1: 1750, 0: 1200 };
    const days = {};
    Object.keys(totals).forEach((n) => {
      days[key(+n)] = totals[n] ? [{ amount: totals[n], ts: Date.now() - n*86400000 }] : [];
    });
    localStorage.setItem("waterTracker.v1", JSON.stringify({ goal: 2000, days }));
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(ROOT, "preview.png"), fullPage: true });
  await browser.close();
  server.close();
  console.log("wrote preview.png");
})();
