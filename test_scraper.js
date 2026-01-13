/* * Filename: test_scraper.js
 * Context: Local Testing Unit 🧪
 * Description: Validates the ZenRows integration before deployment.
 * Author: Leon & Gemini
 */

require("dotenv").config(); // Load .env file
const Service = require("./src/helper/service"); // Import service yang baru direfactor

(async () => {
  console.log("==========================================");
  console.log("   🚀 STARTING CLOUDFLARE BYPASS TEST     ");
  console.log("==========================================");

  // Ganti URL ini dengan URL target "Fav Girl" kamu
  // Contoh: Website anime atau profil sosial media yang ada Cloudflare-nya
  //   const targetUrl = "https://nowsecure.nl"; // URL test resmi untuk cek bypass security
  const targetUrl = "https://v10.kuramanime.tel"; // URL test resmi untuk cek bypass security

  try {
    console.log(`[TEST] Target: ${targetUrl}`);
    console.log(`[TEST] Sending request via ZenRows API...`);

    // Panggil fungsi fetchService
    // Kita tidak perlu selector spesifik untuk test awal, jadi biarkan default atau isi 'body'
    const response = await Service.fetchService(targetUrl, "body");

    if (response.status === 200) {
      console.log("\n[TEST] ✅ STATUS: 200 OK");

      // Cek apakah Cheerio berhasil load HTML
      const $ = response.data;
      const pageTitle = $("title").text().trim();

      console.log(`[TEST] 📄 Page Title: "${pageTitle}"`);

      // Validasi sederhana: Jika title mengandung "Just a moment", berarti gagal bypass
      if (
        pageTitle.includes("Just a moment") ||
        pageTitle.includes("Access denied")
      ) {
        console.error("[TEST] ❌ GAGAL! Masih kena Cloudflare Challenge.");
      } else {
        console.log("[TEST] 🎉 BERHASIL! Cloudflare ditembus.");
        console.log("[TEST] HTML Preview (First 500 chars):");
        console.log($("body").html().substring(0, 500));
      }
    }
  } catch (error) {
    console.error("\n[TEST] 💥 ERROR OCCURRED:");
    console.error(error.message);
    if (error.response) {
      console.error("API Response:", error.response.data);
    }
  } finally {
    console.log("\n==========================================");
    console.log("   🏁 TEST FINISHED                       ");
    console.log("==========================================");
  }
})();
