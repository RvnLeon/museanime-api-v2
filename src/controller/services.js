/* * Filename: controller/services.js
 * Context: Refactored Controller for ZenRows Integration 🛠️
 * Description: Logic layer handling scraping data extraction using Cheerio.
 * Author: Leon (Refactored by Gemini)
 */

const services = require("../helper/service");
const cheerio = require("cheerio");
const baseUrl = require("../constant/url");
const episodeHelper = require("../helper/episodeHelper");

// ❌ HAPUS PUPPETEER (Sudah diganti ZenRows)
// const StealthPlugin = require("puppeteer-extra-plugin-stealth");
// const puppeteer = require("puppeteer-extra");
// const fs = require("fs");

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
  if (!genres || genres.length === 0) return true;
  const list = Array.isArray(genres) ? genres : [genres];
  const hasForbidden = list.some((g) =>
    BLACKLIST_GENRES.includes(g.toString().toLowerCase().trim())
  );
  return !hasForbidden;
};

const Services = {
  // 1. GET ONGOING
  getOngoing: async (req, res) => {
    const page = req.params.page;
    const url = `${baseUrl}/quick/ongoing?order_by=updated&page=${page}`;

    try {
      // ✅ Correct: Mengirim selector ".product__item"
      const response = await services.fetchService(url, ".product__item");
      const $ = response.data; // Helper return Cheerio object ($)

      let ongoing = [];
      $(".product__item").each((index, el) => {
        const title = $(el).find(".product__item__text h5 a").text().trim();
        const thumb = $(el).find(".product__item__pic").attr("data-setbg");
        const epText = $(el).find(".ep span").text().trim();
        let rawLink = $(el).find("a").attr("href") || "";
        let endpoint = rawLink
          .replace(baseUrl, "")
          .replace("/anime/", "")
          .split("/episode/")[0];

        ongoing.push({
          title,
          thumb,
          endpoint,
          total_episode: epText.replace("Ep", "").trim(),
          updated_on: "Hari ini",
        });
      });

      res
        .status(200)
        .json({ status: true, message: "success", ongoing, currentPage: page });
    } catch (error) {
      console.error("[Controller] Error Ongoing:", error.message);
      res
        .status(500)
        .json({ status: false, message: error.message, ongoing: [] });
    }
  },

  // 2. GET COMPLETED
  getCompleted: async (req, res) => {
    const page = req.params.page;
    const url = `${baseUrl}/quick/finished?order_by=updated&page=${page}`;

    try {
      const response = await services.fetchService(url, ".product__item");
      const $ = response.data;

      let completed = [];
      $(".product__item").each((index, el) => {
        const title = $(el).find(".product__item__text h5 a").text().trim();
        const thumb = $(el).find(".product__item__pic").attr("data-setbg");
        const score = $(el).find(".ep span").text().trim();
        let rawLink = $(el).find("a").attr("href") || "";
        let endpoint = rawLink
          .replace(baseUrl, "")
          .replace("/anime/", "")
          .split("/episode/")[0];

        completed.push({
          title,
          thumb,
          score,
          endpoint,
          total_episode: "Tamat",
        });
      });

      res
        .status(200)
        .json({
          status: true,
          message: "success",
          completed,
          currentPage: page,
        });
    } catch (error) {
      res
        .status(500)
        .json({ status: false, message: error.message, completed: [] });
    }
  },

  // 3. GET SEARCH (Caution: Parallel Requests)
  getSearch: async (req, res) => {
    const query = req.params.q;
    const url = `${baseUrl}/anime?search=${query}&order_by=latest`;

    try {
      const response = await services.fetchService(url, ".product__item");
      const $ = response.data;

      let candidates = [];
      $(".product__item").each((index, el) => {
        const title = $(el).find(".product__item__text h5 a").text().trim();
        const thumb = $(el).find(".product__item__pic").attr("data-setbg");
        let endpoint = $(el)
          .find("a")
          .attr("href")
          .replace(baseUrl, "")
          .replace("/anime/", "");
        if (endpoint) candidates.push({ title, thumb, endpoint });
      });

      // NOTE: ZenRows punya limit concurrency di free tier.
      // Kalau search lambat, kurangi MAX_PARALLEL jadi 2 atau 3.
      const safeSearch = [];
      const MAX_PARALLEL = 5;

      for (let i = 0; i < candidates.length; i += MAX_PARALLEL) {
        const chunk = candidates.slice(i, i + MAX_PARALLEL);
        const results = await Promise.all(
          chunk.map(async (anime) => {
            try {
              const detailUrl = `${baseUrl}/anime/${anime.endpoint}`;
              const detailResp = await services.fetchService(
                detailUrl,
                ".anime__details__widget"
              );
              const $$ = detailResp.data; // Helper mengembalikan $ local

              let genres = [];
              $$(".anime__details__widget ul li").each((j, el) => {
                if ($$(el).text().includes("Genre")) {
                  genres = $$(el)
                    .text()
                    .replace("Genre:", "")
                    .trim()
                    .split(",")
                    .map((g) => g.trim());
                }
              });
              return isSafeContent(genres)
                ? { ...anime, genres, status: "Safe" }
                : null;
            } catch (e) {
              return null;
            }
          })
        );

        results.forEach((r) => {
          if (r) safeSearch.push(r);
        });
      }

      res
        .status(200)
        .json({ status: true, message: "success", search: safeSearch, query });
    } catch (error) {
      res
        .status(500)
        .json({ status: false, message: error.message, search: [] });
    }
  },

  // 4. GET ANIME LIST
  getAnimeList: async (req, res) => {
    let url = `${baseUrl}/anime-list/`;
    try {
      // 🛠️ FIX: Ganti 'res' dengan selector string '#abtext'
      const response = await services.fetchService(url, "#abtext");

      const $ = response.data;
      const element = $("#abtext");
      let anime_list = [];

      element.find(".jdlbar").each((index, el) => {
        const title = $(el).find("a").text() || null;
        const endpoint = $(el)
          .find("a")
          .attr("href")
          .replace(`${baseUrl}/anime/`, "");

        anime_list.push({ title, endpoint });
      });

      // filter null title
      const datas = anime_list.filter((value) => value.title !== null);

      return res
        .status(200)
        .json({ status: true, message: "success", anime_list: datas });
    } catch (error) {
      console.log(error);
      res
        .status(500)
        .send({ status: false, message: error.message, anime_list: [] });
    }
  },

  // 5. GET ANIME DETAIL
  getAnimeDetail: async (req, res) => {
    const endpoint = req.params[0];
    const url = `${baseUrl}/anime/${endpoint}`;

    try {
      const response = await services.fetchService(
        url,
        ".anime__details__title"
      );
      const $ = response.data;

      let genres = [];
      $(".anime__details__widget ul li").each((i, el) => {
        if ($(el).text().includes("Genre")) {
          genres = $(el)
            .text()
            .replace("Genre:", "")
            .trim()
            .split(",")
            .map((g) => g.trim());
        }
      });

      if (!isSafeContent(genres)) {
        return res.status(403).json({
          status: false,
          message: "Content blocked by Safe Filter.",
          anime_detail: {},
          episode_list: [],
        });
      }

      const title = $(".anime__details__title h3").text().trim();
      const sinopsis = $(".anime__details__text p").text().trim();
      const thumb = $(".anime__details__pic").attr("data-setbg");
      let detail = [];
      $(".anime__details__widget ul li").each((i, el) =>
        detail.push($(el).text().replace(/\s+/g, " ").trim())
      );

      let episode_list = [];
      const popoverContent = $("#episodeLists").attr("data-content");
      if (popoverContent) {
        const htmlContent = popoverContent
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&amp;/g, "&");

        const $$ = cheerio.load(htmlContent);
        $$("a.btn-danger").each((i, el) => {
          const episode_title = $$(el).text().trim();
          let episode_endpoint = $$(el)
            .attr("href")
            .replace(`${baseUrl}/anime/`, "");
          episode_list.push({
            episode_title,
            episode_endpoint,
            episode_date: "Unknown",
          });
        });
      }

      res.status(200).json({
        status: true,
        message: "success",
        anime_detail: { title, thumb, sinopsis, detail, genres },
        episode_list,
        endpoint,
      });
    } catch (error) {
      res.status(500).json({ status: false, message: error.message });
    }
  },

  // 6. GET EMBED (Perlu Cek EpisodeHelper)
  getEmbedByContent: async (req, res) => {
    try {
      // NOTE: Pastikan episodeHelper juga aman dari Cloudflare.
      // Kalau dia pakai axios biasa, mungkin akan error.
      let nonce = await episodeHelper.getNonce();
      let content = req.params.content;

      const html_streaming = await episodeHelper.getUrlAjax(content, nonce);
      const parse = cheerio.load(html_streaming);
      const link = parse("iframe").attr("src");

      res.send({ streaming_url: link });
    } catch (err) {
      console.log(err);
      res.send(err);
    }
  },

  // 7. GET STREAMING (Mesin Pencari MP4)
  getAnimeEpisode: async (req, res) => {
    const endpoint = req.params[0];
    const url = `${baseUrl}/anime/${endpoint}`;

    try {
      // Tunggu #player muncul agar video terload
      const response = await services.fetchService(url, "#player");
      const $ = response.data;

      let title = $("title").text().replace(" - Kuramanime", "").trim();
      let streamLink = "",
        streamQuality = "Unknown",
        qualityList = {};

      // Cek Video Tag Langsung
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

      // Fallback ke Iframe
      if (!streamLink) {
        $("iframe").each((i, el) => {
          const src = $(el).attr("src");
          if (
            src &&
            (src.includes("stream") ||
              src.includes("kurama") ||
              src.includes("drive"))
          ) {
            streamLink = src;
            streamQuality = "Embed";
            qualityList["Embed"] = src;
          }
        });
      }

      const mirrorList = Object.keys(qualityList).map((k) => ({
        quality: k,
        link: qualityList[k],
      }));

      res.status(200).json({
        status: !!streamLink,
        message: streamLink ? "success" : "failed",
        data: {
          title,
          baseUrl: url,
          id: endpoint,
          streamLink,
          quality: streamQuality,
          mirror_embed1: { quality: "Multi-Source", streaming: mirrorList },
        },
      });
    } catch (error) {
      res.status(500).json({ status: false, message: error.message });
    }
  },

  // 8. GET BATCH
  getBatchLink: async (req, res) => {
    const endpoint = req.params[0];
    const fullUrl = `${baseUrl}/batch/${endpoint}`;

    try {
      // 🛠️ FIX: Ganti 'res' dengan selector '.batchlink'
      const response = await services.fetchService(fullUrl, ".batchlink");
      const $ = response.data;

      const batch = {};
      batch.title = $(".batchlink > h4").text();
      batch.status = "success";
      batch.baseUrl = fullUrl;

      // Pastikan batchQualityFunction menerima $ atau HTML string yang sesuai
      // Di kode lama kamu kirim response.data yang dulu mungkin HTML string.
      // Sekarang response.data adalah Cheerio object.
      // Kita convert balik ke HTML string agar helper tidak bingung
      const htmlString = $.html();

      let low_quality = episodeHelper.batchQualityFunction(0, htmlString);
      let medium_quality = episodeHelper.batchQualityFunction(1, htmlString);
      let high_quality = episodeHelper.batchQualityFunction(2, htmlString);

      batch.download_list = { low_quality, medium_quality, high_quality };

      res.send({ status: true, message: "succes", batch });
    } catch (error) {
      console.log(error);
      res.send({ status: false, message: error.message });
    }
  },

  // 9. GET GENRE LIST
  getGenreList: async (req, res) => {
    const url = `${baseUrl}/genre-list/`;
    try {
      // 🛠️ FIX: Ganti 'res' dengan selector '.genres'
      const response = await services.fetchService(url, ".genres");
      const $ = response.data;

      let genres = [];
      $(".genres")
        .find("a")
        .each((index, el) => {
          const genre = $(el).text().trim();
          const endpoint = $(el)
            .attr("href")
            .replace("/genres/", "")
            .replace("/", "");
          if (isSafeContent([genre])) {
            genres.push({ genre, endpoint });
          }
        });

      return res.status(200).json({ status: true, message: "success", genres });
    } catch (error) {
      console.log(error);
      res.send({ status: false, message: error.message, genres: [] });
    }
  },

  // 10. GET GENRE PAGE
  getGenrePage: async (req, res) => {
    const genre = req.params.genre;
    const page = req.params.page;
    const url =
      page === 1
        ? `${baseUrl}/genres/${genre}`
        : `${baseUrl}/genres/${genre}/page/${page}`;

    try {
      // 🛠️ FIX: Ganti 'res' dengan selector '.col-anime-con'
      const response = await services.fetchService(url, ".col-anime-con");
      const $ = response.data;

      let genreAnime = [];
      $(".col-anime-con").each((index, el) => {
        const title = $(el).find(".col-anime-title > a").text();
        const link = $(el)
          .find(".col-anime-title > a")
          .attr("href")
          .replace(`${baseUrl}/anime/`, "");
        const studio = $(el).find(".col-anime-studio").text();
        const episode = $(el).find(".col-anime-eps").text();
        const rating = $(el).find(".col-anime-rating").text() || null;
        const thumb = $(el).find(".col-anime-cover > img").attr("src");
        const sinopsis = $(el).find(".col-synopsis").text();
        const genreArr = $(el)
          .find(".col-anime-genre")
          .text()
          .trim()
          .split(",");

        genreAnime.push({
          title,
          link,
          studio,
          episode,
          rating,
          thumb,
          genre: genreArr,
          sinopsis,
        });
      });
      return res
        .status(200)
        .json({ status: true, message: "success", genreAnime });
    } catch (error) {
      console.log(error);
      res.send({ status: false, message: error.message, genreAnime: [] });
    }
  },
};

module.exports = Services;
