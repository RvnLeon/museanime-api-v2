/* Tes Scraper Sederhana (Node.js + Axios)
   Tujuannya: Cek apakah link MP4 ini bisa ditembak langsung
*/

const axios = require("axios");
const fs = require("fs");

// URL dari temuan kamu
const videoUrl =
  "https://kanao.my.id/kdrive/t1CxxPIJbSrmC8w/Kuramanime-DTTCN_OVA_BD-01_03-720p.mp4?lud=1768115417&pid=43751&sid=228432&cce=";

async function checkVideoAccess() {
  try {
    console.log("🔍 Mencoba akses video...");

    const response = await axios({
      method: "GET",
      url: videoUrl,
      responseType: "stream", // Kita cuma mau cek stream, ga download full
      headers: {
        // PENTING: Menipu server agar mengira kita adalah browser yang buka Kuramanime
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer: "https://kuramanime.net/", // Sesuaikan dengan domain asli Kurama
      },
    });

    console.log(`✅ SUKSES! Status Code: ${response.status}`);
    console.log(`📦 Content-Type: ${response.headers["content-type"]}`);
    console.log("Link ini BISA dipakai di MuseAnime asal Headers-nya benar!");

    // Matikan stream biar ga download full file
    response.data.destroy();
  } catch (error) {
    console.error("❌ GAGAL AKSES!");
    if (error.response) {
      console.error(`Status: ${error.response.status}`); // Kalau 403, berarti butuh headers yang lebih canggih
      console.error("Kemungkinan link expired atau butuh Referer yang tepat.");
    } else {
      console.error(error.message);
    }
  }
}

checkVideoAccess();
