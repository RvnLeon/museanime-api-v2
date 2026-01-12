const services = require("../helper/service");
const cheerio = require("cheerio");
const baseUrl = require("../constant/url");
const episodeHelper = require("../helper/episodeHelper");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const puppeteer = require("puppeteer-extra");
const fs = require("fs");

const BLACKLIST_GENRES = [
  "ecchi",
  "hentai",
  "erotica",
  "sex",
  "adult cast",
  "magical sex shift",
  "boys love",
  "girls love",
  "yuri",
  "yaoi",
];

const isSafeContent = (genres) => {
  if (!genres || genres.length === 0) return true; // Kalau genre tidak terdeteksi, loloskan sementara

  // Pastikan input berupa Array
  const list = Array.isArray(genres) ? genres : [genres];

  // Cek apakah ada genre terlarang
  const hasForbidden = list.some((g) =>
    BLACKLIST_GENRES.includes(g.toString().toLowerCase().trim())
  );

  return !hasForbidden;
};

puppeteer.use(StealthPlugin());

const Services = {
  getOngoing: async (req, res) => {
    const page = req.params.page;
    const url = `${baseUrl}/quick/ongoing?order_by=updated&page=${page}`;

    // Initialize browser as null for proper scoping in try/catch
    let browser = null;

    try {
      // Launching the engine
      browser = await puppeteer.launch({
        headless: "new",
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });

      const p = await browser.newPage();

      // Stealth and Identification
      await p.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      );

      // Navigate and wait for the DOM to be ready
      await p.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });

      // Extracting HTML content to parse with Cheerio (Faster than p.$$eval)
      const content = await p.content();
      const $ = cheerio.load(content);
      const ongoing = [];

      $(".product__item").each((index, el) => {
        const $el = $(el);
        const title = $el.find(".product__item__text h5 a").text().trim();
        const thumb = $el.find(".product__item__pic").attr("data-setbg");
        const epText = $el.find(".ep span").text().trim();

        // --- [FIX] URL CLEANING LOGIC ---
        let rawLink = $el.find("a").attr("href") || "";
        let endpoint = rawLink.replace(baseUrl, "").replace("/anime/", "");

        if (endpoint.includes("/episode/")) {
          endpoint = endpoint.split("/episode/")[0];
        }
        // --------------------------------

        const total_episode = epText.replace("Ep", "").trim();

        ongoing.push({
          title,
          thumb,
          total_episode,
          updated_on: "Hari ini",
          updated_day: "Unknown",
          endpoint,
        });
      });

      // Always close the browser to prevent memory leaks on your Ryzen 2500U
      await browser.close();

      return res.status(200).json({
        status: true,
        message: "success",
        ongoing,
        currentPage: page,
      });
    } catch (error) {
      // Critical: Ensure browser is killed if an error occurs
      if (browser) await browser.close();

      console.error(`[Puppeteer Error]: ${error.message}`);
      return res.status(500).json({
        status: false,
        message: error.message,
        ongoing: [],
      });
    } finally {
      if (browser) await browser.close();
    }
  },

  // 2. GET COMPLETED
  getCompleted: async (req, res) => {
    const { page } = req.params;
    const url = `${baseUrl}/quick/ongoing?order_by=updated&page=${page}`;

    let browser = null;

    try {
      browser = await puppeteer.launch({
        headless: "new",
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-blink-features=AutomationControlled", // Essential for stealth
        ],
      });

      const p = await browser.newPage();

      // High-level evasion: Emulate a high-resolution display
      await p.setViewport({ width: 1366, height: 768 });

      await p.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      );

      // We use 'networkidle2' to ensure scripts (like Turnstile) have space to execute
      await p.goto(url, {
        waitUntil: "networkidle2",
        timeout: 60000,
      });

      // --- BYPASS LOGIC ---
      // We wait for the specific list container. If it's not found, it likely means
      // we are stuck at the "Verify you are human" screen.
      try {
        await p.waitForSelector(".product__item", { timeout: 20000 });
      } catch (e) {
        console.error("Cloudflare challenge screen detected or site timeout.");
        // If the selector fails, we attempt to grab whatever content is there for debugging
      }

      const content = await p.content();
      const $ = cheerio.load(content);
      const ongoing = [];

      $(".product__item").each((_, el) => {
        const $el = $(el);
        const title = $el.find(".product__item__text h5 a").text().trim();
        const thumb = $el.find(".product__item__pic").attr("data-setbg");
        const epText = $el.find(".ep span").text().trim();

        let rawLink = $el.find("a").attr("href") || "";
        let endpoint = rawLink.replace(baseUrl, "").replace("/anime/", "");

        if (endpoint.includes("/episode/")) {
          endpoint = endpoint.split("/episode/")[0];
        }

        const total_episode = epText.replace("Ep", "").trim();

        if (title) {
          ongoing.push({
            title,
            thumb,
            total_episode,
            updated_on: "Hari ini",
            updated_day: "Unknown",
            endpoint,
          });
        }
      });

      return res.status(200).json({
        status: true,
        message: "success",
        ongoing,
        currentPage: page,
      });
    } catch (error) {
      console.error(`[Scraper Error]: ${error.message}`);
      return res.status(500).json({
        status: false,
        message: error.message,
        ongoing: [],
      });
    } finally {
      // Critical: Ensure no zombie processes remain on your Ryzen 2500U
      if (browser) await browser.close();
    }
  },
  // 3. GET SEARCH
  getSearch: async (req, res) => {
    const query = req.params.q;
    let url = `${baseUrl}/anime?search=${query}&order_by=latest`;

    try {
      // 1. Fetch Halaman Search Utama
      const response = await services.fetchService(url, res);
      if (response.status === 200) {
        const $ = cheerio.load(response.data);
        let candidates = [];

        // 2. Kumpulkan Kandidat Awal (Belum difilter)
        $(".product__item").each((index, el) => {
          const title = $(el).find(".product__item__text h5 a").text().trim();
          const thumb = $(el).find(".product__item__pic").attr("data-setbg");
          let rawLink = $(el).find("a").attr("href");
          let endpoint = rawLink ? rawLink.split("/anime/")[1] : "";

          if (endpoint) {
            candidates.push({ title, thumb, endpoint });
          }
        });

        // 3. DEEP CHECK: Buka Detail Semua Kandidat Secara Bersamaan (Parallel)
        // Kita pakai Promise.all biar prosesnya super cepat (tidak antri)
        const detailedChecks = await Promise.all(
          candidates.map(async (anime) => {
            try {
              // Fetch Halaman Detail
              const detailUrl = `${baseUrl}/anime/${anime.endpoint}`;

              // Gunakan fetchService (pastikan return datanya, jangan res.send dulu)
              // Kita passing 'null' sebagai res karena kita cuma butuh datanya, gak mau fetchService nge-respond langsung
              const detailResp = await services.fetchService(detailUrl, null);

              // Kalau gagal fetch detail, anggap tidak aman (fail-safe)
              if (!detailResp || detailResp.status !== 200) return null;

              const $$ = cheerio.load(detailResp.data);

              // Ambil Genre dari halaman detail
              let genres = [];
              $$(".anime__details__widget ul li").each((i, el) => {
                const text = $$(el).text();
                if (text.includes("Genre")) {
                  genres = text
                    .replace("Genre:", "")
                    .trim()
                    .split(",")
                    .map((g) => g.trim());
                }
              });

              // --- THE MOMENT OF TRUTH ---
              // Cek apakah genre aman menggunakan fungsi isSafeContent yang sudah ada
              if (isSafeContent(genres)) {
                // AMAN: Kembalikan data anime (bisa sekalian bawa genre-nya)
                return {
                  ...anime,
                  genres: genres, // Bonus: Sekarang hasil search ada genrenya!
                  status: "Safe",
                };
              } else {
                // BAHAYA: Kembalikan null (akan dibuang nanti)
                return null;
              }
            } catch (err) {
              // Kalau error saat cek detail, skip aja biar aman
              return null;
            }
          })
        );

        // 4. Bersihkan hasil dari yang null (yang kena filter atau error)
        const safeSearch = detailedChecks.filter((item) => item !== null);

        return res.status(200).json({
          status: true,
          message: "success",
          search: safeSearch,
          query,
        });
      }
      return res.send({ message: response.status, search: [] });
    } catch (error) {
      console.log(error);
      res.send({ status: false, message: error.message, search: [] });
    } finally {
      if (browser) await browser.close();
    }
  },
  getAnimeList: async (req, res) => {
    let url = `${baseUrl}/anime-list/`;
    try {
      const response = await services.fetchService(url, res);
      if (response.status === 200) {
        const $ = cheerio.load(response.data);
        const element = $("#abtext");
        let anime_list = [];
        let title, endpoint;

        element.find(".jdlbar").each((index, el) => {
          title = $(el).find("a").text() || null;
          endpoint = $(el)
            .find("a")
            .attr("href")
            .replace(`${baseUrl}/anime/`, "");

          anime_list.push({
            title,
            endpoint,
          });
        });

        // filter null title
        const datas = anime_list.filter((value) => value.title !== null);

        return res.status(200).json({
          status: true,
          message: "success",
          anime_list: datas,
        });
      }
      return res.send({
        message: response.status,
        anime_list: [],
      });
    } catch (error) {
      console.log(error);
      res.send({
        status: false,
        message: error,
        anime_list: [],
      });
    }
  },
  // 4. GET ANIME DETAIL (Cleaned Version ✨)
  getAnimeDetail: async (req, res) => {
    const endpoint = req.params[0];
    let url = `${baseUrl}/anime/${endpoint}`;

    try {
      const response = await services.fetchService(url, res);
      if (response.status === 200) {
        const $ = cheerio.load(response.data);

        // --- 1. Ambil Genre & Filter Halal ---
        let genres = [];
        $(".anime__details__widget ul li").each((i, el) => {
          const text = $(el).text();
          if (text.includes("Genre")) {
            genres = text
              .replace("Genre:", "")
              .trim()
              .split(",")
              .map((g) => g.trim());
          }
        });

        if (!isSafeContent(genres)) {
          return res.status(403).json({
            status: false,
            message: "Content blocked (Safe Filter Active).",
            anime_detail: {},
            episode_list: [],
          });
        }

        // --- 2. Ambil Detail Utama (Clean Text) ---
        const title = $(".anime__details__title h3").text().trim();
        const sinopsis = $(".anime__details__text p").text().trim();
        const thumb = $(".anime__details__pic").attr("data-setbg");

        let detail = [];
        $(".anime__details__widget ul li").each((i, el) => {
          detail.push($(el).text().replace(/\s+/g, " ").trim());
        });

        // --- 3. AMBIL LIST EPISODE (LOGIC BARU) ---
        let episode_list = [];

        // Target: Tombol dengan ID #episodeLists
        // Datanya sembunyi di atribut 'data-content'
        const popoverContent = $("#episodeLists").attr("data-content");

        if (popoverContent) {
          // Helper: Decode HTML Entities (&lt; jadi <, dst)
          const unescapeHTML = (str) => {
            return str
              .replace(/&lt;/g, "<")
              .replace(/&gt;/g, ">")
              .replace(/&quot;/g, '"')
              .replace(/&#39;/g, "'")
              .replace(/&amp;/g, "&");
          };

          // Decode string menjadi HTML valid
          const htmlContent = unescapeHTML(popoverContent);

          // Load string HTML tadi ke instance Cheerio baru ($$)
          const $$ = cheerio.load(htmlContent);

          // Cari semua tag <a> dengan class 'btn-danger' (Ciri khas tombol episode normal)
          $$("a.btn-danger").each((i, el) => {
            const episode_title = $$(el).text().trim(); // Contoh: "Ep 1"
            const fullHref = $$(el).attr("href");

            // Bersihkan URL endpoint
            let episode_endpoint = fullHref.replace(`${baseUrl}/anime/`, "");

            episode_list.push({
              episode_title,
              episode_endpoint,
              episode_date: "Unknown",
            });
          });
        }

        // Balik urutan: Episode 1 paling bawah (opsional, matikan kalau mau Ep 1 di atas)
        // episode_list.reverse();

        return res.status(200).json({
          status: true,
          message: "success",
          anime_detail: {
            title,
            thumb,
            sinopsis,
            detail,
            genres,
          },
          episode_list, // Sekarang harusnya isi 128 episode! 🔥
          endpoint,
        });
      }
      res.send({ message: "Failed to fetch detail", anime_detail: [] });
    } catch (error) {
      console.log(error);
      res.send({ status: false, message: error.message });
    }
  },
  getEmbedByContent: async (req, res) => {
    try {
      let nonce = await episodeHelper.getNonce();
      let content = req.params.content;

      const html_streaming = await episodeHelper.getUrlAjax(content, nonce);
      const parse = cheerio.load(html_streaming);
      const link = parse("iframe").attr("src");
      const obj = {};
      obj.streaming_url = link;

      res.send(obj);
    } catch (err) {
      console.log(err);
      res.send(err);
    }
  },
  // 5. GET STREAMING LINK (Mesin Pencari MP4)
  getAnimeEpisode: async (req, res) => {
    const endpoint = req.params[0];
    const url = `${baseUrl}/anime/${endpoint}`;

    console.log(`\n========================================`);
    console.log(`[START] Fetching via Puppeteer Stealth: ${url}`);

    let browser = null;

    try {
      // --- LOGIC: DYNAMIC LAUNCH ---
      browser = await puppeteer.launch({
        headless: "new",
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-blink-features=AutomationControlled", // Masking automated control
        ],
      });

      const page = await browser.newPage();

      // Emulating a high-resolution human session
      await page.setViewport({ width: 1280, height: 720 });
      await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      );

      // --- NAVIGASI ---
      console.log("[DEBUG] Navigating to Episode Page...");
      await page.goto(url, {
        waitUntil: "networkidle2", // Ensure scripts load fully for the player
        timeout: 60000,
      });

      // --- BYPASS & WAIT LOGIC ---
      // We look for the player specifically. If Cloudflare appears, this wait will fail.
      try {
        console.log("[DEBUG] Waiting for video player elements...");
        await page.waitForSelector(
          'video#player, iframe[src*="stream"], iframe[src*="drive"], iframe[src*="kurama"]',
          { timeout: 25000, visible: true }
        );
        console.log("[DEBUG] Player element detected.");
      } catch (e) {
        console.warn(
          "[WARN] Selector timeout. Cloudflare might be active or player is slow."
        );
      }

      const content = await page.content();
      const $ = cheerio.load(content);

      let title = $("title").text().replace(" - Kuramanime", "").trim();
      let streamLink = "";
      let streamQuality = "Unknown";
      let qualityList = {};

      // --- DATA EXTRACTION: VIDEO TAG ---
      const videoTag = $("video#player");
      if (videoTag.length > 0) {
        const mainSrc = videoTag.attr("src");
        if (mainSrc) {
          streamLink = mainSrc;
          qualityList["Default"] = mainSrc;
        }
        videoTag.find("source").each((i, el) => {
          const src = $(el).attr("src");
          const size = $(el).attr("size");
          if (src) {
            const label = size ? `${size}p` : `Source-${i}`;
            qualityList[label] = src;
            if (size === "720" || !streamLink) {
              streamLink = src;
              streamQuality = label;
            }
          }
        });
      }

      // --- DATA EXTRACTION: IFRAME FALLBACK ---
      if (!streamLink) {
        $("iframe").each((i, el) => {
          const src = $(el).attr("src");
          if (
            src &&
            (src.includes("komari") ||
              src.includes("drive") ||
              src.includes("stream") ||
              src.includes("kurama"))
          ) {
            streamLink = src;
            streamQuality = "Embed";
            qualityList["Embed"] = src;
          }
        });
      }

      const mirrorList = Object.keys(qualityList).map((key) => ({
        quality: key,
        link: qualityList[key],
      }));

      console.log(
        `[RESULT] Extraction complete: ${streamLink ? "SUCCESS" : "ZONK"}`
      );

      return res.status(200).json({
        status: !!streamLink,
        message: streamLink ? "success" : "failed to get video content",
        data: {
          title,
          baseUrl: url,
          id: endpoint,
          streamLink,
          quality: streamQuality,
          mirror_embed1: { quality: "Multi-Source", streaming: mirrorList },
        },
      });
    } catch (err) {
      console.error("[ERROR]", err.message);
      return res
        .status(500)
        .json({ status: false, message: `Server Error: ${err.message}` });
    } finally {
      if (browser) await browser.close();
    }
  },
  getBatchLink: async (req, res) => {
    const endpoint = req.params[0];
    const fullUrl = `${baseUrl}/batch/${endpoint}`;
    console.log(fullUrl);
    try {
      const response = await services.fetchService(fullUrl, res);
      const $ = cheerio.load(response.data);
      const batch = {};
      batch.title = $(".batchlink > h4").text();
      batch.status = "success";
      batch.baseUrl = fullUrl;
      let low_quality = episodeHelper.batchQualityFunction(0, response.data);
      let medium_quality = episodeHelper.batchQualityFunction(1, response.data);
      let high_quality = episodeHelper.batchQualityFunction(2, response.data);
      batch.download_list = { low_quality, medium_quality, high_quality };
      res.send({
        status: true,
        message: "succes",
        batch,
      });
    } catch (error) {
      console.log(error);
    }
  },
  getGenreList: async (req, res) => {
    const url = `${baseUrl}/genre-list/`;
    try {
      const response = await services.fetchService(url, res);
      if (response.status === 200) {
        const $ = cheerio.load(response.data);
        let genres = [];

        $(".genres")
          .find("a")
          .each((index, el) => {
            const genre = $(el).text().trim();
            const endpoint = $(el)
              .attr("href")
              .replace("/genres/", "")
              .replace("/", "");

            // --- FILTER GENRE HARAM DI MENU ---
            // Cek apakah nama genre ini ada di BLACKLIST
            if (isSafeContent([genre])) {
              genres.push({
                genre,
                endpoint,
              });
            }
          });

        return res.status(200).json({
          status: true,
          message: "success",
          genres,
        });
      }
      res.send({ message: response.status, genres: [] });
    } catch (error) {
      console.log(error);
      res.send({ status: false, message: error, genres: [] });
    }
  },
  getGenrePage: async (req, res) => {
    const genre = req.params.genre;
    const page = req.params.page;
    const url =
      page === 1
        ? `${baseUrl}/genres/${genre}`
        : `${baseUrl}/genres/${genre}/page/${page}`;

    try {
      const response = await services.fetchService(url, res);

      if (response.status === 200) {
        const $ = cheerio.load(response.data);
        let genreAnime = [],
          title,
          link,
          studio,
          episode,
          rating,
          thumb,
          season,
          sinopsis,
          genre;
        $(".col-anime-con").each((index, el) => {
          title = $(el).find(".col-anime-title > a").text();
          link = $(el)
            .find(".col-anime-title > a")
            .attr("href")
            .replace(`${baseUrl}/anime/`, "");
          studio = $(el).find(".col-anime-studio").text();
          episode = $(el).find(".col-anime-eps").text();
          rating = $(el).find(".col-anime-rating").text() || null;
          thumb = $(el).find(".col-anime-cover > img").attr("src");
          season = $(el).find(".col-anime-date").text();
          sinopsis = $(el).find(".col-synopsis").text();
          genre = $(el).find(".col-anime-genre").text().trim().split(",");

          genreAnime.push({
            title,
            link,
            studio,
            episode,
            rating,
            thumb,
            genre,
            sinopsis,
          });
        });
        return res.status(200).json({
          status: true,
          message: "success",
          genreAnime,
        });
      }
      return res.send({
        message: response.status,
        genreAnime: [],
      });
    } catch (error) {
      console.log(error);
      res.send({
        status: false,
        message: error,
        genreAnime: [],
      });
    }
  },
};

module.exports = Services;
