// ============================================================
// check_flow_votes_correct.js — 查詢《貓貓的奇幻漂流》在 IMDb 的真實票數
// ============================================================

import zlib from "node:zlib";
import readline from "node:readline";
import axios from "axios";

const IMDB_RATINGS_URL = "https://datasets.imdbws.com/title.ratings.tsv.gz";
const TARGET_ID = "tt15112108"; // 貓貓的奇幻漂流 (Flow, 2024)

async function run() {
  console.log("正在下載並查詢《貓貓的奇幻漂流》真實票數...");
  const response = await axios.get(IMDB_RATINGS_URL, {
    responseType: "stream",
    headers: { "User-Agent": "Mozilla/5.0" },
  });

  const gunzip = zlib.createGunzip();
  const rl = readline.createInterface({
    input: response.data.pipe(gunzip),
    crlfDelay: Infinity,
  });

  let found = null;
  await new Promise((resolve, reject) => {
    rl.on("line", (line) => {
      if (line.startsWith(TARGET_ID)) {
        const vals = line.split("\t");
        found = {
          rating: vals[1],
          votes: parseInt(vals[2])
        };
        rl.close();
      }
    });
    rl.on("close", resolve);
    rl.on("error", reject);
  });

  console.log("\n📊 查詢結果：");
  if (found) {
    console.log(`《貓貓的奇幻漂流》(Flow) IMDb 評分: ${found.rating} 分，總票數: ${found.votes.toLocaleString()} 票`);
  } else {
    console.log("未能在數據集中找到此 ID。");
  }
}

run().catch(console.error);
