/* * Filename: helper/service.js
 * Context: Browserless.io Integration ☁️
 * Description: Scraping via Remote Browser (Anti-Headache Edition).
 */
const cheerio = require("cheerio");
const puppeteer = require("puppeteer-core"); // Pakai core aja, gak usah download chromium

// --- CONFIG ---
// Masukkan Token Browserless kamu disini (atau lebih aman taruh di .env)
const BROWSERLESS_TOKEN =
  process.env.BROWSERLESS_TOKEN || "MASUKKAN_TOKEN_BROWSERLESS_DISINI";

const Service = {
  fetchService: async (url, selector = "body") => {
    let browser = null;
    try {
      console.log(`[HELPER] ☁️ Connecting to Browserless.io: ${url}`);

      // Connect ke Browser Remote
      browser = await puppeteer.connect({
        browserWSEndpoint: `wss://chrome.browserless.io?token=${BROWSERLESS_TOKEN}&stealth=true&--window-size=1920,1080`,
      });

      const page = await browser.newPage();

      // Setting Viewport Standard
      await page.setViewport({ width: 1920, height: 1080 });

      // Navigasi
      console.log("[HELPER] Navigating...");
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

      // Cek Cloudflare (Browserless biasanya otomatis lolos, tapi jaga-jaga)
      const title = await page.title();
      if (title.includes("Just a moment")) {
        console.log("[HELPER] ⚠️ Cloudflare found, waiting for auto-bypass...");
        await new Promise((r) => setTimeout(r, 5000)); // Browserless stealth usually handles this
      }

      // Tunggu Konten
      try {
        console.log(`[HELPER] Waiting for content: ${selector}`);
        await page.waitForSelector(selector, { timeout: 30000 });
        console.log("[HELPER] 🎉 Success!");
      } catch (e) {
        throw new Error("Timeout waiting for content on Browserless.");
      }

      const content = await page.content();
      const $ = cheerio.load(content);

      return { status: 200, data: $ };
    } catch (error) {
      console.error(`[HELPER ERROR] ${error.message}`);
      throw error;
    } finally {
      if (browser) await browser.close();
    }
  },
};

module.exports = Service;
