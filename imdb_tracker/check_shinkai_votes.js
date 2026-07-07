// ============================================================
// check_shinkai_votes.js — 查詢新海誠導演作品在 IMDb 的真實票數
// ============================================================

import zlib from "node:zlib";
import readline from "node:readline";
import axios from "axios";

const IMDB_RATINGS_URL = "https://datasets.imdbws.com/title.ratings.tsv.gz";

// 新海誠作品 (ID 對照表)
const SHINKAI_MOVIES = [
  { id: "tt5074352", name: "你的名字。 (Your Name., 2016)" },
  { id: "tt9426210", name: "天氣之子 (Weathering with You, 2019)" },
  { id: "tt16379204", name: "鈴芽之旅 (Suzume, 2022)" },
  { id: "tt0981682", name: "秒速 5 公分 (5 Centimeters per Second, 2007)" },
  { id: "tt2595214", name: "言葉之庭 (The Garden of Words, 2013)" },
  { id: "tt1839494", name: "追逐繁星的孩子 (Children Who Chase Lost Voices, 2011)" },
  { id: "tt0381348", name: "雲之彼端，約定的地方 (The Place Promised in Our Early Days, 2004)" },
  { id: "tt0370754", name: "星之聲 (Voices of a Distant Star, 2002)" },
];

async function run() {
  const ids = new Set(SHINKAI_MOVIES.map(s => s.id));
  const results = new Map();

  console.log("正在下載並查詢新海誠作品評分資料...");
  const response = await axios.get(IMDB_RATINGS_URL, {
    responseType: "stream",
    headers: { "User-Agent": "Mozilla/5.0" },
  });

  const gunzip = zlib.createGunzip();
  const rl = readline.createInterface({
    input: response.data.pipe(gunzip),
    crlfDelay: Infinity,
  });

  let headers = null;
  await new Promise((resolve, reject) => {
    rl.on("line", (line) => {
      if (!headers) {
        headers = line.split("\t");
        return;
      }
      const vals = line.split("\t");
      const tconst = vals[0];
      if (ids.has(tconst)) {
        results.set(tconst, {
          rating: vals[1],
          votes: parseInt(vals[2])
        });
      }
    });
    rl.on("close", resolve);
    rl.on("error", reject);
  });

  console.log("\n📊 新海誠作品 IMDb 真實數據列表：\n");
  const output = SHINKAI_MOVIES.map(s => {
    const data = results.get(s.id);
    return {
      name: s.name,
      rating: data ? data.rating : "N/A",
      votes: data ? data.votes : 0
    };
  }).sort((a, b) => b.votes - a.votes);

  console.table(output);
}

run().catch(console.error);
