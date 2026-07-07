// ============================================================
// debug.js — 用於在本地 IMDb 數據集中查找特定電影的狀態
// ============================================================

import zlib from "node:zlib";
import readline from "node:readline";
import axios from "axios";

const IMDB_BASICS_URL  = "https://datasets.imdbws.com/title.basics.tsv.gz";
const IMDB_RATINGS_URL = "https://datasets.imdbws.com/title.ratings.tsv.gz";
const TARGET_ID = "tt28650488"; // 瑪利歐銀河電影版

async function streamFind(url, targetId) {
  console.log(`正在檢索: ${url}...`);
  const response = await axios.get(url, {
    responseType: "stream",
    headers: { "User-Agent": "Mozilla/5.0" },
  });

  const gunzip = zlib.createGunzip();
  const rl = readline.createInterface({
    input: response.data.pipe(gunzip),
    crlfDelay: Infinity,
  });

  let found = null;
  let headers = null;

  await new Promise((resolve, reject) => {
    rl.on("line", (line) => {
      if (!headers) {
        headers = line.split("\t");
        return;
      }
      if (line.startsWith(targetId)) {
        const vals = line.split("\t");
        found = {};
        headers.forEach((h, i) => { found[h] = vals[i]; });
        rl.close();
      }
    });
    rl.on("close", resolve);
    rl.on("error", reject);
  });

  if (found) {
    console.log(`✅ 找到結果:`, found);
  } else {
    console.log(`❌ 未能在該數據集中找到 ID: ${targetId}`);
  }
  return found;
}

async function debug() {
  console.log(`=== 搜尋瑪利歐電影 ID: ${TARGET_ID} ===`);
  await streamFind(IMDB_RATINGS_URL, TARGET_ID);
  await streamFind(IMDB_BASICS_URL, TARGET_ID);
}

debug().catch(console.error);
