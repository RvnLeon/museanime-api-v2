const cheerio = require("cheerio");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");

puppeteer.use(StealthPlugin());

const Service = {
  fetchService: async (url, selector = "body") => {
    let browser = null;
    try {
      console.log(`[HELPER] ⚡ Launching Speed Browser: ${url}`);

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
          "--window-size=1280,720",
        ],
      });

      const page = await browser.newPage();

      const userAgents = [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      ];
      const randomUA =
        userAgents[Math.floor(Math.random() * userAgents.length)];
      await page.setUserAgent(randomUA);

      await page.setViewport({ width: 1280, height: 720 });

      console.log("[HELPER] Navigating...");
      const response = await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });

      const title = await page.title();
      if (title.includes("Just a moment") || title.includes("Cloudflare")) {
        console.log(
          "[HELPER] ⚠️ Cloudflare Detected! Initiating Bypass Protocol..."
        );

        await new Promise((r) => setTimeout(r, 2000));

        const frames = page.frames();
        let clicked = false;

        for (const frame of frames) {
          const url = frame.url();
          if (url.includes("cloudflare") || url.includes("turnstile")) {
            try {
              const checkbox = await frame.$(
                "input[type='checkbox'], .ctp-checkbox-label"
              );
              if (checkbox) {
                await checkbox.click();
                console.log("[HELPER] ✅ Challenge Clicked!");
                clicked = true;
                break;
              }
            } catch (e) {}
          }
        }

        if (!clicked) {
          await page.mouse.click(100, 100);
        }
      }

      try {
        console.log(`[HELPER] Waiting for content: ${selector}`);
        await page.waitForSelector(selector, { timeout: 25000 });
        console.log("[HELPER] 🎉 Success! Content Loaded.");
      } catch (e) {
        const content = await page.content();
        if (content.includes("product__item")) {
          console.log("[HELPER] Selector timeout but content found manually!");
        } else {
          throw new Error("Gagal: Timeout menunggu Cloudflare.");
        }
      }

      const finalContent = await page.content();
      const $ = cheerio.load(finalContent);

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
