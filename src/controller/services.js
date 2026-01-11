const services = require("../helper/service");
const cheerio = require("cheerio");
const baseUrl = require("../constant/url");
const episodeHelper = require("../helper/episodeHelper");
const puppeteer = require("puppeteer");
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

const Services = {
  getOngoing: async (req, res) => {
    const page = req.params.page;
    let url = `${baseUrl}/quick/ongoing?order_by=updated&page=${page}`;

    try {
      const response = await services.fetchService(url, res);
      if (response.status === 200) {
        const $ = cheerio.load(response.data);
        let ongoing = [];

        $(".product__item").each((index, el) => {
          const title = $(el).find(".product__item__text h5 a").text().trim();
          const thumb = $(el).find(".product__item__pic").attr("data-setbg");
          const epText = $(el).find(".ep span").text().trim();

          // --- [FIX] URL CLEANING LOGIC ---
          // Ambil href asli: https://v10.../anime/4205/digimon.../episode/14
          let rawLink = $(el).find("a").attr("href");

          // Kita ambil ID dan Slug-nya saja
          // Hapus BaseURL dan '/anime/'
          let endpoint = rawLink.replace(baseUrl, "").replace("/anime/", "");

          // JIKA ada kata '/episode/', kita buang ekornya
          if (endpoint.includes("/episode/")) {
            endpoint = endpoint.split("/episode/")[0];
          }
          // Hasil: 4205/digimon-beatbreak (Bersih!)
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

        return res.status(200).json({
          status: true,
          message: "success",
          ongoing,
          currentPage: page,
        });
      }
      return res.send({ message: response.status, ongoing: [] });
    } catch (error) {
      console.log(error);
      res.send({ status: false, message: error.message, ongoing: [] });
    }
  },

  // 2. GET COMPLETED
  getCompleted: async (req, res) => {
    const page = req.params.page;
    let url = `${baseUrl}/quick/finished?order_by=updated&page=${page}`;

    try {
      const response = await services.fetchService(url, res);
      if (response.status === 200) {
        const $ = cheerio.load(response.data);
        let completed = [];

        $(".product__item").each((index, el) => {
          const title = $(el).find(".product__item__text h5 a").text().trim();
          const thumb = $(el).find(".product__item__pic").attr("data-setbg");
          const score = $(el).find(".ep span").text().trim();

          let rawLink = $(el).find("a").attr("href");
          // Completed biasanya sudah bersih linknya, tapi kita jaga-jaga
          let endpoint = rawLink ? rawLink.split("/anime/")[1] : "";

          completed.push({
            title,
            thumb,
            total_episode: "Tamat",
            updated_on: "Full Batch",
            score,
            endpoint,
          });
        });

        return res.status(200).json({
          status: true,
          message: "success",
          completed,
          currentPage: page,
        });
      }
      return res.send({ status: response.status, completed: [] });
    } catch (error) {
      console.log(error);
      res.send({ status: false, message: error.message, completed: [] });
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
    console.log(`[START] Fetching via Puppeteer (Balanced Mode): ${url}`);

    let browser = null;

    try {
      // --- LOGIC 1: BROWSER PATH (STANDARD) ---
      let executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || null;
      if (!executablePath) {
        const paths = [
          "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
          "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
          "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
        ];
        for (const path of paths) {
          if (fs.existsSync(path)) {
            executablePath = path;
            break;
          }
        }
      }
      if (!executablePath) throw new Error("Browser tidak ditemukan!");

      // --- LOGIC 2: LAUNCH ---
      browser = await puppeteer.launch({
        headless: "new",
        executablePath: executablePath,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-accelerated-2d-canvas",
          "--no-first-run",
          "--no-zygote",
          "--disable-gpu",
          "--mute-audio", // Mute audio tetap oke buat performa
        ],
      });

      const page = await browser.newPage();

      // User Agent tetap penting
      await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      );

      // --- LOGIC 3: NAVIGASI & WAIT (THE FIX) ---

      // 1. Masuk ke halaman, tapi jangan tunggu sampai 'networkidle' (kelamaan).
      // Cukup tunggu sampai struktur HTML selesai dimuat ('domcontentloaded').
      // Ini biasanya cuma butuh 1-2 detik.
      console.log("[DEBUG] Navigating...");
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

      // 2. TUNGGU SELECTOR (Pengganti Sleep)
      // Kita tunggu sampai tag <video> ATAU <iframe> muncul.
      // Begitu muncul, kode langsung lanjut (ga perlu nunggu timeout habis).
      try {
        console.log("[DEBUG] Waiting for player element...");
        await page.waitForSelector(
          'video#player, iframe[src*="stream"], iframe[src*="drive"]',
          {
            timeout: 15000, // Tunggu maksimal 15 detik
            visible: true, // Pastikan elemennya terlihat (bukan hidden)
          }
        );
        console.log("[DEBUG] Element found! Proceeding immediately.");
      } catch (e) {
        console.log(
          "[WARN] Element not detected via wait, trying to parse anyway..."
        );
      }

      // --- AMBIL DATA ---
      const content = await page.content();
      const $ = cheerio.load(content);

      let title = $("title").text().replace(" - Kuramanime", "").trim();
      console.log(`[DEBUG] Title: ${title}`);

      let streamLink = "";
      let streamQuality = "Unknown";
      let qualityList = {};

      // SCANNING (Video Tag)
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

      // SCANNING (Iframe Fallback)
      if (!streamLink) {
        $("iframe").each((i, el) => {
          const src = $(el).attr("src");
          // Cek keyword umum streaming
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

      console.log(`[RESULT] Final Link: ${streamLink || "ZONK"}`);

      const mirrorList = Object.keys(qualityList).map((key) => ({
        quality: key,
        link: qualityList[key],
      }));

      return res.status(200).json({
        status: !!streamLink,
        message: streamLink ? "success" : "failed to get video",
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
      res.status(500).send({ status: false, message: "Error: " + err.message });
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
