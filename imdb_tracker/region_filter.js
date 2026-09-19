// ============================================================
// region_filter.js — 國際發行地區過濾器（市場群組版）
//
// 策略：
//   一部電影必須符合以下任一條件才能通過：
//   A. 在「強制資格區域」有發行紀錄（TW/JP/KR/HK）→ 自動通過
//   B. 在至少「2個不同市場群組」有發行紀錄
//      → 群組一：英語市場（US/GB/AU/CA，且語言須為英語）
//      → 群組二：歐洲主要市場（FR/DE/IT/ES/NL/SE 等）
//      → 群組三：其他主要市場（MX/BR/SG/TH 等）
//
//   ✗ 排除：只有「美國+英國」(同一英語群組) 僑民發行的印度地方片
//   ✅ 保留：有日本、台灣、歐洲等多市場發行的真正國際片
// ============================================================

import zlib from "node:zlib";
import readline from "node:readline";
import axios from "axios";

const IMDB_AKAS_URL = "https://datasets.imdbws.com/title.akas.tsv.gz";

// 只保留 TW 作為強制自動資格（直接確認對台灣市場發行）
const STRONG_REGIONS = new Set(["TW"]);

// 市場群組（需要在≥ 2 個不同群組有發行，才能達到國際發行資格）
const MARKET_GROUPS = {
  english:  new Set(["US", "GB", "AU", "CA", "NZ", "IE"]),
  japanese: new Set(["JP"]),
  korean:   new Set(["KR"]),
  chinese:  new Set(["HK", "MO", "CN"]),
  european: new Set(["FR", "DE", "IT", "ES", "NL", "SE", "NO", "DK", "FI", "PT", "BE", "AT", "CH", "PL"]),
  other:    new Set(["MX", "BR", "SG", "MY", "TH", "TR", "AR", "ZA"]),
};

const MARKET_GROUP_ENTRIES = Object.entries(MARKET_GROUPS);

// 印度地區語言（英語市場的這些語言版本屬僑民發行，不計入英語群組）
const DIASPORA_LANGUAGES = new Set([
  "ta", "te", "kn", "ml", "bn", "mr", "pa", "gu", "or", "ur", "si",
]);

/**
 * 下載並串流解析 title.akas.tsv，建立「具國際發行資格」的 IMDb ID Set。
 * @returns {Promise<Set<string>>}
 */
export async function buildInternationalIdSet(candidateIds = null, { requester = axios.get } = {}) {
  if (candidateIds?.size === 0) return new Set();
  console.log("  [地區過濾] 下載 IMDb 地區發行數據 (title.akas.tsv.gz)...");

  const autoQualified = new Set();   // 在強制資格區域有發行
  const movieGroups   = new Map();   // imdbId → Set<groupName>

  const response = await requester(IMDB_AKAS_URL, {
    responseType: "stream",
    timeout: 180_000,
    headers: { "User-Agent": "Mozilla/5.0" },
  });

  const gunzip = zlib.createGunzip();
  const rl = readline.createInterface({
    input: response.data.pipe(gunzip),
    crlfDelay: Infinity,
  });

  let headers   = null;
  let lineCount = 0;

  await new Promise((resolve, reject) => {
    rl.on("line", (line) => {
      if (!headers) {
        headers = line.split("\t");
        return;
      }
      const firstTab = line.indexOf("\t");
      const id = line.slice(0, firstTab);
      if (candidateIds && !candidateIds.has(id)) return;
      const vals = line.split("\t");
      if (vals.length < 5) return;

      const titleId  = vals[0];
      const region   = vals[3];
      const language = vals[4];

      // 條件 A：強制資格區域，直接收錄
      if (STRONG_REGIONS.has(region)) {
        autoQualified.add(titleId);
        lineCount++;
        return;
      }

      // 條件 B：計算市場群組
      for (const [groupName, regions] of MARKET_GROUP_ENTRIES) {
        if (!regions.has(region)) continue;

        // 英語市場需確認不是僑民語言版本
        if (groupName === "english" && DIASPORA_LANGUAGES.has(language)) break;

        if (!movieGroups.has(titleId)) movieGroups.set(titleId, new Set());
        movieGroups.get(titleId).add(groupName);
        break;
      }

      lineCount++;
    });
    rl.on("close", resolve);
    rl.on("error", reject);
    response.data.on("error", reject);
    gunzip.on("error", reject);
  });

  // 合併：自動資格 + 跨群組發行（≥2 個不同群組）
  const qualifiedIds = new Set(autoQualified);
  for (const [titleId, groups] of movieGroups) {
    if (groups.size >= 2) qualifiedIds.add(titleId);
  }

  console.log(`  [地區過濾] 已處理 ${lineCount.toLocaleString()} 筆地區紀錄`);
  console.log(`  [地區過濾] 自動資格（TW/JP/KR/HK）: ${autoQualified.size.toLocaleString()} 部`);
  console.log(`  [地區過濾] 跨市場群組（≥2群組）符合: ${qualifiedIds.size - autoQualified.size} 部`);
  console.log(`  [地區過濾] 合計具國際發行資格的電影: ${qualifiedIds.size.toLocaleString()} 部`);

  return qualifiedIds;
}

/**
 * 從電影清單中過濾出台灣觀眾能看到的電影。
 */
export function filterByRegion(movies, internationalIds) {
  const before   = movies.length;
  const filtered = movies.filter((m) => internationalIds.has(m.imdbId));
  const removed  = before - filtered.length;
  console.log(
    `  [地區過濾] ${before} 部 → ${filtered.length} 部（移除 ${removed} 部僅限本地/僑民發行的電影）`
  );
  return filtered;
}
