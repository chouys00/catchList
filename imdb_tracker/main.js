// ============================================================
// main.js — 主程式 (歷史月份回補鎖定版)
// ============================================================

import dayjs from "dayjs";
import path from "node:path";
import { CONFIG } from "./config.js";
import { fetchMoviesForYear } from "./fetcher.js";
import { convertToDouban } from "./converter.js";
import { buildInternationalIdSet, filterByRegion } from "./region_filter.js";
import { enrichAndTranslateMovies } from "./translator.js";
import { updateReport, getLatestRecordedMonth, loadExistingSections } from "./writer.js";

function applyConversion(movies) {
  return movies.map((m) => {
    if (m.imdbScore == null) return null;
    const { doubanEstimated, filmType, label } = convertToDouban(
      m.imdbScore, m.title, m.genres, m.countries
    );
    return { ...m, doubanEstimated, filmType, label };
  }).filter(Boolean);
}

/**
 * 計算兩個年月之間的所有月份 (含起點與終點)
 * 回傳格式：Map<year, Set<month>>
 */
function getMonthsBetween(startYear, startMonth, endYear, endMonth) {
  const groups = new Map();
  let current = dayjs(`${startYear}-${String(startMonth).padStart(2, "0")}-01`);
  const limit   = dayjs(`${endYear}-${String(endMonth).padStart(2, "0")}-01`);

  while (current.isBefore(limit) || current.isSame(limit, "month")) {
    const y = current.year();
    const m = current.month() + 1;
    if (!groups.has(y)) groups.set(y, new Set());
    groups.get(y).add(m);
    current = current.add(1, "month");
  }
  return groups;
}

async function main() {
  console.log("=".repeat(60));
  console.log("  🎬 IMDb ➔ 豆瓣估算評分轉換器 (增量回補版)");
  console.log(`  豆瓣評分門檻 ≥ ${CONFIG.DOUBAN_THRESHOLD}`);
  console.log(`  熱門票數門檻 ≥ ${CONFIG.MIN_VOTES_ABSOLUTE.toLocaleString()} 票`);
  console.log("=".repeat(60));

  // ── Step 1: 計算當下往前推 6 個月的「沉澱期目標終點」 ──────────────
  const today = dayjs();
  const targetEnd = today.subtract(6, "month");
  const endYear = targetEnd.year();
  const endMonth = targetEnd.month() + 1;

  console.log(`\n📅 執行當下時間：${today.format("YYYY-MM-DD")}`);
  console.log(`⏳ 沉澱期目標終點（往前推半年）：${endYear} 年 ${endMonth} 月`);

  // ── Step 2: 尋找上一次已記錄的所有月份，自動偵測 6 個月前（含）所有遺漏的月份 ──
  const filepath = path.resolve(CONFIG.OUTPUT_FILE);
  const sections = loadExistingSections(filepath);
  
  // 找出已記錄的最早月份作為起點，若無則預設起點為目標終點往前推 11 個月
  let oldestRecorded = null;
  const keys = [...sections.keys()].filter(k => !k.endsWith("-00")).sort();
  if (keys.length > 0) {
    const [y, m] = keys[0].split("-").map(Number);
    oldestRecorded = { year: y, month: m };
  }

  let startYear, startMonth;
  if (oldestRecorded) {
    startYear = oldestRecorded.year;
    startMonth = oldestRecorded.month;
    console.log(`⏮️  偵測到最早的歷史紀錄月份為：${startYear} 年 ${startMonth} 月`);
  } else {
    const defaultStart = targetEnd.subtract(11, "month");
    startYear = defaultStart.year();
    startMonth = defaultStart.month() + 1;
    console.log(`⚠️  未偵測到舊的按月歷史紀錄，將預設回補最近一年的資訊。`);
  }

  // ── Step 3: 判斷是否有遺漏月份需要回補 ──────────────────────────
  const allPossibleGroups = getMonthsBetween(startYear, startMonth, endYear, endMonth);
  const missingGroups = new Map();
  const missingList = [];

  for (const [y, ms] of allPossibleGroups) {
    for (const m of ms) {
      const key = `${y}-${String(m).padStart(2, "0")}`;
      if (!sections.has(key)) {
        if (!missingGroups.has(y)) missingGroups.set(y, new Set());
        missingGroups.get(y).add(m);
        missingList.push(`${y}年${m}月`);
      }
    }
  }

  if (missingList.length === 0) {
    console.log("\n✅ 所有至半年前的歷史月份都已回補完畢，目前無需更新！");
    return;
  }

  console.log(`\n🔎 本次偵測到 6 個月前遺漏且待回補的月份共 ${missingList.length} 個：\n   ${missingList.join(", ")}`);

  // ── Step 4: 預先下載地區數據 ────────────────────────────────────
  console.log("\n🌏 建立國際發行地區資格清單（IMDb akas 數據集）...");
  const internationalIds = await buildInternationalIdSet();

  const allMonthData = [];

  // ── Step 5: 逐年抓取並依月份篩選鎖定 ──────────────────────────────
  for (const [year, months] of missingGroups) {
    console.log(`\n📡 正在抓取 ${year} 年的 IMDb 電影資料...`);
    const { movies: rawMovies, voteThreshold, voteStats } = await fetchMoviesForYear(year);
    const converted = applyConversion(rawMovies);

    console.log(`\n  📍 套用國際發行地區過濾...`);
    const regionFiltered = filterByRegion(converted, internationalIds);

    // 進行片名翻譯與「上映月份 (Wikidata P577 / TMDb)」資訊填充
    console.log(`\n  🌐 正在翻譯並查詢電影精確上映月份（共 ${regionFiltered.length} 部）...`);
    const enrichedMovies = await enrichAndTranslateMovies(regionFiltered);

    // 逐月分組篩選
    for (const month of months) {
      const monthMovies = enrichedMovies.filter((m) => {
        if (!m.releaseDate) return false;
        const releaseMonth = new Date(m.releaseDate).getMonth() + 1;
        const releaseYear  = new Date(m.releaseDate).getFullYear();
        return releaseYear === year && releaseMonth === month;
      });

      console.log(`   └─ ${year} 年 ${month} 月：篩選出 ${monthMovies.length} 部符合熱門與評分標準的電影`);
      allMonthData.push({
        year,
        month,
        movies: monthMovies,
        voteThreshold: CONFIG.MIN_VOTES_ABSOLUTE,
        voteStats
      });
    }
  }

  // ── Step 6: 寫入/更新報告 ────────────────────────────────────────
  updateReport(allMonthData);
}

main().catch(console.error);
