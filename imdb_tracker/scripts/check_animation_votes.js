// ============================================================
// check_animation_votes.js — 查詢 15 部熱門動畫電影在 IMDb 的真實票數
// ============================================================

import zlib from "node:zlib";
import readline from "node:readline";
import axios from "axios";

const IMDB_RATINGS_URL = "https://datasets.imdbws.com/title.ratings.tsv.gz";

// 15 部中等熱門~大熱門的動畫電影 (ID 對照表)
const ANIMATED_MOVIES = [
  { id: "tt1355644", name: "超級瑪利歐兄弟電影版 (The Super Mario Bros. Movie, 2023)" },
  { id: "tt22022452", name: "腦筋急轉彎 2 (Inside Out 2, 2024)" },
  { id: "tt3915174", name: "鞋貓劍客 2 (Puss in Boots: The Last Wish, 2022)" },
  { id: "tt9362722", name: "蜘蛛人：穿越新宇宙 (Across the Spider-Verse, 2023)" },
  { id: "tt2948356", name: "靈魂急轉彎 (Soul, 2020)" },
  { id: "tt2953050", name: "魔法滿屋 (Encanto, 2021)" },
  { id: "tt12786116", name: "路卡的夏天 (Luca, 2021)" },
  { id: "tt13556558", name: "青春養成記 (Turning Red, 2022)" },
  { id: "tt16578710", name: "蒼鷺與少年 (The Boy and the Heron, 2023)" },
  { id: "tt5113044", name: "小小兵 2：格魯的崛起 (Minions: The Rise of Gru, 2022)" },
  { id: "tt21692408", name: "功夫熊貓 4 (Kung Fu Panda 4, 2024)" },
  { id: "tt16379204", name: "鈴芽之旅 (Suzume, 2022)" },
  { id: "tt8115900", name: "壞蛋聯盟 (The Bad Guys, 2022)" },
  { id: "tt4520988", name: "冰雪奇緣 2 (Frozen II, 2019)" },
  { id: "tt1979376", name: "玩具總動員 4 (Toy Story 4, 2019)" },
];

async function run() {
  const ids = new Set(ANIMATED_MOVIES.map(s => s.id));
  const results = new Map();

  console.log("正在下載並比對動畫電影評分資料...");
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

  console.log("\n📊 15 部動畫電影 IMDb 真實數據列表：\n");
  const output = ANIMATED_MOVIES.map(s => {
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
