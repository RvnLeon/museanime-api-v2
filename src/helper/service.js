const cheerio = require("cheerio");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");

puppeteer.use(StealthPlugin());

const Service = {
  fetchService: async (url, selector = "body") => {
    let browser = null;
    try {
      console.log(`[HELPER] Launching Puppeteer for: ${url}`);

      browser = await puppeteer.launch({
        headless: "new",
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-accelerated-2d-canvas",
          "--no-first-run",
          "--no-zygote",
          "--disable-gpu",
          "--mute-audio",
        ],
      });

      const page = await browser.newPage();

      await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      );
      await page.setViewport({ width: 1280, height: 720 });

      await page.setRequestInterception(true);
      page.on("request", (req) => {
        if (
          ["image", "stylesheet", "font", "media"].includes(req.resourceType())
        ) {
          req.abort();
        } else {
          req.continue();
        }
      });

      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

      try {
        console.log(`[HELPER] Waiting for selector: ${selector}`);
        await page.waitForSelector(selector, { timeout: 30000 });
        console.log("[HELPER] Selector found! Cloudflare passed.");
      } catch (e) {
        console.warn(
          "[HELPER WARN] Selector timeout. Cloudflare mungkin stuck atau konten kosong."
        );
      }

      // Ambil HTML
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
