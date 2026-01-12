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

    try {
      // Panggil Helper, suruh tunggu element '.product__item'
      const response = await services.fetchService(url, ".product__item");
      const $ = response.data; // Helper sekarang mengembalikan object Cheerio ($)

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

      res.status(200).json({
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
  // 3. GET SEARCH
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

      // DEEP CHECK (Parallel Limit 5 biar server ga meledak)
      const safeSearch = [];
      const MAX_PARALLEL = 5;

      // Kita potong array jadi potongan-potongan kecil (chunk)
      for (let i = 0; i < candidates.length; i += MAX_PARALLEL) {
        const chunk = candidates.slice(i, i + MAX_PARALLEL);
        const results = await Promise.all(
          chunk.map(async (anime) => {
            try {
              const detailUrl = `${baseUrl}/anime/${anime.endpoint}`;
              // Helper disuruh tunggu widget genre muncul
              const detailResp = await services.fetchService(
                detailUrl,
                ".anime__details__widget"
              );
              const $$ = detailResp.data;

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

    try {
      const response = await services.fetchService(url, "#player"); // Tunggu player muncul
      const $ = response.data;

      let title = $("title").text().replace(" - Kuramanime", "").trim();
      let streamLink = "",
        streamQuality = "Unknown",
        qualityList = {};

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
