const axios = require("axios");

const Service = {
  fetchService: async (url, res) => {
    try {
      const response = await axios.get(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5",
          Referer: "https://google.com",
          "Upgrade-Insecure-Requests": "1",
        },
        timeout: 15000,
      });

      return new Promise((resolve, reject) => {
        if (response.status === 200) resolve(response);
        reject(response);
      });
    } catch (error) {
      console.log(`[Fetch Error] URL: ${url} | Msg: ${error.message}`);

      if (error.response) {
        console.log(`[Status Code] ${error.response.status}`);
      }

      if (res) {
        res.status(error.response ? error.response.status : 500).send({
          status: false,
          code: error.response ? error.response.status : 500,
          message: "Source Blocked or Error",
        });
      }
      throw error;
    }
  },
};

module.exports = Service;
