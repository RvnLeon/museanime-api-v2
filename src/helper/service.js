const cheerio = require("cheerio");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");

puppeteer.use(StealthPlugin());

const Service = {
  fetchService: async (url, selector = "body") => {
    let browser = null;
    try {
      console.log(`[HELPER] 🚀 Launching Ultimate Stealth Browser for: ${url}`);

      browser = await puppeteer.launch({
        headless: "new",
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-blink-features=AutomationControlled",
          "--window-size=1920,1080",
          "--disable-infobars",
        ],
      });

      const page = await browser.newPage();

      await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      );
      await page.setViewport({ width: 1920, height: 1080 });

      console.log("[HELPER] Navigating...");
      await page.goto(url, { waitUntil: "networkidle2", timeout: 90000 });

      await page.mouse.move(100, 100);
      await page.mouse.move(200, 200);
      await page.mouse.move(Math.random() * 500, Math.random() * 500);

      try {
        const cloudflareFrame = await page.$("iframe[src*='cloudflare']");
        if (cloudflareFrame) {
          console.log(
            "[HELPER] ⚠️ Cloudflare Challenge Detected! Attempting to click..."
          );
          const frame = await cloudflareFrame.contentFrame();
          const checkbox = await frame.$("input[type='checkbox']");
          if (checkbox) {
            await checkbox.click();
            console.log("[HELPER] ✅ Clicked Cloudflare Checkbox!");
            await new Promise((r) => setTimeout(r, 5000));
          }
        }
      } catch (err) {}

      try {
        console.log(`[HELPER] Waiting for selector: ${selector}`);
        await page.waitForSelector(selector, { timeout: 60000 });
        console.log("[HELPER] 🎉 Success! Selector found. Page loaded.");
      } catch (e) {
        console.warn(
          "[HELPER WARN] Selector timeout. Mengambil screenshot untuk debug (internal)..."
        );
      }

      const content = await page.content();
      const $ = cheerio.load(content);

      if ($("title").text().includes("Just a moment")) {
        throw new Error("Gagal menembus Cloudflare (Stuck di Challenge).");
      }

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
