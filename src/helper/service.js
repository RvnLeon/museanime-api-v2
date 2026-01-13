/* * Filename: helper/service.js
 * Context: ZenRows API Integration 🚀
 * Description: Generic Scraping Service via ZenRows Proxy.
 * Author: Leon (Refactored by Gemini)
 */

const axios = require("axios");
const cheerio = require("cheerio");

// URL endpoint ZenRows (Ini JALAN/JEMBATAN-nya)
const ZENROWS_BASE_URL = "https://api.zenrows.com/v1/";
const ZENROWS_API_KEY = process.env.ZENROWS_API_KEY;

const Service = {
  /**
   * Mengambil data HTML via ZenRows.
   * @param {string} fullUrl - URL lengkap target (misal: https://v10.kuramanime.tel/anime/...)
   * @param {string} selector - (Opsional) Wait for selector
   */
  fetchService: async (fullUrl, selector = "body") => {
    try {
      if (!ZENROWS_API_KEY) {
        throw new Error("ZENROWS_API_KEY belum disetting di .env!");
      }

      // console.log(`[HELPER] 🚀 Fetching: ${fullUrl}`);

      const params = {
        url: fullUrl,
        apikey: ZENROWS_API_KEY,
        js_render: "true",
        antibot: "true",
        wait_for: selector,
      };

      // Kita nembak ke ZenRows, bukan ke url target langsung
      const response = await axios({
        method: "GET",
        url: ZENROWS_BASE_URL,
        params: params,
        timeout: 60000,
      });

      // console.log(`[HELPER] 🎉 Status: ${response.status}`);

      // Return Cheerio Object ($)
      return { status: 200, data: cheerio.load(response.data) };
    } catch (error) {
      if (error.response) {
        console.error(
          `[HELPER ERROR] ${error.response.status} - ${JSON.stringify(
            error.response.data
          )}`
        );
      } else {
        console.error(`[HELPER ERROR] ${error.message}`);
      }
      throw error;
    }
  },
};

module.exports = Service;
