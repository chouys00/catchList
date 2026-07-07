// ============================================================
// main.js — 主程式(歷史月份回補・逐月即時寫入版)
//
// 專為排程執行設計:
//   - 冪等:已回補的月份不會重抓,無缺漏時直接結束
//   - 逐月寫入:每完成一個月立即寫入報告,中途失敗不會全部白費
//   - 失敗時以非零 exit code 結束,排程器可正確判斷成敗
// ============================================================

import dayjs from "dayjs";
import path from "node:path";
import { getMonthsBetween, monthKey } from "@catchlist/core";
import { CONFIG } from "./config.js";
import { fetchMoviesForYears } from "./fetcher.js";
import { convertToDouban } from "./converter.js";
import { buildInternationalIdSet, filterByRegion } from "./region_filter.js";
import { enrichAndTranslateMovies } from "./translator.js";
import { updateReport, loadExistingSections } from "./writer.js";

function applyConversion(movies) {
  return movies.map((m) => {
    if (m.imdbScore == null) return null;
    const { doubanEstimated, filmType, label } = convertToDouban(
      m.imdbScore, m.title, m.genres, m.countries
    );
    return { ...m, doubanEstimated, filmType, label };
  }).filter(Boolean);
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

  console.log(`\n📅 執行當下時間:${today.format("YYYY-MM-DD")}`);
  console.log(`⏳ 沉澱期目標終點(往前推半年):${endYear} 年 ${endMonth} 月`);

  // ── Step 2: 從既有報告偵測缺漏月份 ──────────────────────────────
  const filepath = path.resolve(CONFIG.OUTPUT_FILE);
  const sections = loadExistingSections(filepath);

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
    console.log(`⏮️  偵測到最早的歷史紀錄月份為:${startYear} 年 ${startMonth} 月`);
  } else {
    const defaultStart = targetEnd.subtract(11, "month");
    startYear = defaultStart.year();
    startMonth = defaultStart.month() + 1;
    console.log(`⚠️  未偵測到舊的按月歷史紀錄,將預設回補最近一年的資訊。`);
  }

  // ── Step 3: 判斷是否有遺漏月份需要回補 ──────────────────────────
  const allPossibleGroups = getMonthsBetween(startYear, startMonth, endYear, endMonth);
  const missingGroups = new Map();
  const missingList = [];

  for (const [y, ms] of allPossibleGroups) {
    for (const m of ms) {
      if (!sections.has(monthKey(y, m))) {
        if (!missingGroups.has(y)) missingGroups.set(y, new Set());
        missingGroups.get(y).add(m);
        missingList.push(`${y}年${m}月`);
      }
    }
  }

  if (missingList.length === 0) {
    console.log("\n✅ 所有至半年前的歷史月份都已回補完畢,目前無需更新!");
    return;
  }

  console.log(`\n🔎 本次偵測到 6 個月前遺漏且待回補的月份共 ${missingList.length} 個:\n   ${missingList.join(", ")}`);

  // ── Step 4: 預先下載地區數據 ────────────────────────────────────
  console.log("\n🌏 建立國際發行地區資格清單(IMDb akas 數據集)...");
  const internationalIds = await buildInternationalIdSet();

  // ── Step 5: 單趟串流抓取所有目標年份 ─────────────────────────────
  const targetYears = new Set(missingGroups.keys());
  console.log(`\n📡 正在抓取 ${[...targetYears].join(", ")} 年的 IMDb 電影資料(數據集僅串流一次)...`);
  const moviesByYear = await fetchMoviesForYears(targetYears);

  // ── Step 6: 逐年處理,逐月立即寫入 ────────────────────────────────
  for (const [year, months] of missingGroups) {
    const rawMovies = moviesByYear.get(year) ?? [];
    const converted = applyConversion(rawMovies);

    console.log(`\n  📍 ${year} 年:套用國際發行地區過濾...`);
    const regionFiltered = filterByRegion(converted, internationalIds);

    console.log(`\n  🌐 正在翻譯並查詢電影精確上映月份(共 ${regionFiltered.length} 部)...`);
    const enrichedMovies = await enrichAndTranslateMovies(regionFiltered);

    for (const month of months) {
      const monthMovies = enrichedMovies.filter((m) => {
        if (!m.releaseDate) return false;
        const d = new Date(m.releaseDate);
        return d.getFullYear() === year && d.getMonth() + 1 === month;
      });

      console.log(`   └─ ${year} 年 ${month} 月:篩選出 ${monthMovies.length} 部符合熱門與評分標準的電影`);

      // 逐月立即寫入,中途失敗時已完成的月份不會遺失
      updateReport([{
        year,
        month,
        movies: monthMovies,
        voteThreshold: CONFIG.MIN_VOTES_ABSOLUTE,
      }]);
    }
  }

  console.log("\n✅ 本次回補全部完成!");
}

main().catch((err) => {
  console.error("\n❌ 執行失敗:", err);
  process.exitCode = 1;
});
