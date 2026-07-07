// ============================================================
// check_superhero_votes.js — 查詢 20 部超級英雄續集在 IMDb 的真實票數
// ============================================================

import zlib from "node:zlib";
import readline from "node:readline";
import axios from "axios";

const IMDB_RATINGS_URL = "https://datasets.imdbws.com/title.ratings.tsv.gz";

// 精選 20 部超級英雄續集電影 (ID 對照表)
const SUPERHERO_SEQUELS = [
  { id: "tt0468569", name: "黑暗騎士 (The Dark Knight, 2008)" },
  { id: "tt1345836", name: "黑暗騎士：黎明昇起 (The Dark Knight Rises, 2012)" },
  { id: "tt10877274", name: "蜘蛛人：無家日 (Spider-Man: No Way Home, 2021)" },
  { id: "tt4154796", name: "復仇者聯盟：終局之戰 (Avengers: Endgame, 2019)" },
  { id: "tt12530246", name: "星際異攻隊 3 (Guardians of the Galaxy Vol. 3, 2023)" },
  { id: "tt6263850", name: "死侍與鋼鐵人 (Deadpool & Wolverine, 2024)" },
  { id: "tt9489806", name: "蜘蛛人：穿越新宇宙 (Across the Spider-Verse, 2023)" },
  { id: "tt10954600", name: "蟻人與黃蜂女：量子狂熱 (Quantumania, 2023)" },
  { id: "tt9663764", name: "水行俠 失落王國 (Aquaman 2, 2023)" },
  { id: "tt10676048", name: "驚奇隊長 2 (The Marvels, 2023)" },
  { id: "tt6511306", name: "神力女超人 1984 (Wonder Woman 1984, 2020)" },
  { id: "tt11315808", name: "小丑：雙重瘋狂 (Joker: Folie à Deux, 2024)" },
  { id: "tt16366830", name: "猛毒最終章：最後一舞 (Venom: The Last Dance, 2024)" },
  { id: "tt10155832", name: "沙贊！眾神之怒 (Shazam! 2, 2023)" },
  { id: "tt1825683", name: "黑豹 2：瓦干達萬歲 (Black Panther 2, 2022)" },
  { id: "tt7097896", name: "奇異博士 2：失控多重宇宙 (Doctor Strange 2, 2022)" },
  { id: "tt3501632", name: "雷神索爾：愛與雷霆 (Thor 4, 2022)" },
  { id: "tt12637874", name: "蜘蛛人：新宇宙 (Into the Spider-Verse, 2018)" },
  { id: "tt2384811", name: "高譚騎士 / 其它超級英雄續作 (以極速追殺 4 作對比, 2023)" }, // 替換為極速追殺 4 作為對照組
  { id: "tt6334354", name: "自殺突擊隊：集結 (The Suicide Squad, 2021)" },
];

async function run() {
  const ids = new Set(SUPERHERO_SEQUELS.map(s => s.id));
  const results = new Map();

  console.log("正在下載並比對評分資料...");
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

  console.log("\n📊 20 部超級英雄電影 IMDb 真實數據列表：\n");
  const output = SUPERHERO_SEQUELS.map(s => {
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
