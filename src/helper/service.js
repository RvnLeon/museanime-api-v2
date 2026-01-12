const cheerio = require("cheerio");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const path = require("path");

puppeteer.use(StealthPlugin());

const Service = {
  fetchService: async (url, selector = "body") => {
    let browser = null;
    try {
      console.log(`[HELPER] 🍪 Launching Browser with Session: ${url}`);

      const userDataDir = path.join("/tmp", "puppeteer_session");

      browser = await puppeteer.launch({
        headless: "new",
        userDataDir: userDataDir,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-accelerated-2d-canvas",
          "--no-first-run",
          "--no-zygote",
          "--disable-gpu",
          "--window-size=1280,720",
        ],
      });

      const page = await browser.newPage();

      await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      );

      await page.setViewport({ width: 1280, height: 720 });

      console.log("[HELPER] Navigating...");
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

      // Cek Title
      const title = await page.title();
      if (title.includes("Just a moment") || title.includes("Cloudflare")) {
        console.log(
          "[HELPER] ⚠️ Cloudflare Detected! Trying Checkbox Click..."
        );

        await new Promise((r) => setTimeout(r, 3000));

        try {
          const frames = page.frames();
          let clicked = false;
          for (const frame of frames) {
            const checkbox = await frame.$("input[type='checkbox']");
            if (checkbox) {
              await checkbox.click();
              console.log("[HELPER] ✅ Clicked Checkbox inside iframe!");
              clicked = true;
              break;
            }
          }

          if (!clicked) {
            const shadowHost = await page.$("#turnstile-wrapper");
            if (shadowHost) {
            }

            console.log("[HELPER] Trying coordinate click (640, 290)...");
            await page.mouse.click(640, 290);
          }
        } catch (e) {
          console.log("[HELPER] Click error: " + e.message);
        }
      }

      try {
        console.log(`[HELPER] Waiting for content: ${selector}`);
        await page.waitForSelector(selector, { timeout: 40000 });
        console.log("[HELPER] 🎉 Success! Content Loaded.");
      } catch (e) {
        const content = await page.content();
        if (!content.includes(selector.replace(".", ""))) {
          // Hapus titik utk cek string
          // await page.screenshot({ path: '/tmp/debug.png' });
          throw new Error("Gagal tembus Cloudflare (Timeout).");
        }
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
