import axios from "axios";

async function inspectReviewsInSearch() {
  try {
    const url = "https://store.steampowered.com/search/results/";
    console.log("Fetching search results sorted by user reviews...");
    const response = await axios.get(url, {
      params: {
        sort_by: "Reviews_DESC",
        category1: "998",
        start: 0,
        count: 10,
        cc: "tw",
        l: "english"
      },
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
      }
    });

    const html = response.data;
    const rowRegex = /(<a[^>]+href="[^"]*\/app\/(\d+)\/[^"]*"[^>]+class="[^"]*search_result_row[^"]*"[^>]*>)([\s\S]*?)<\/a>/g;
    let match;
    let count = 0;
    while ((match = rowRegex.exec(html)) !== null && count < 3) {
      const appid = match[2];
      const innerHtml = match[3];
      console.log(`\n=== Game AppID: ${appid} ===`);
      const reviewDivMatch = /<div class="[^"]*search_reviewscore[^"]*">([\s\S]*?)<\/div>/.exec(innerHtml);
      if (reviewDivMatch) {
        console.log("Review Div:", reviewDivMatch[1].trim());
      }
      count++;
    }
  } catch (error) {
    console.error("Error:", error.message);
  }
}

inspectReviewsInSearch();
