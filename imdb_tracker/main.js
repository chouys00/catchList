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
import { pathToFileURL } from "node:url";
import { getMonthsBetween, monthKey } from "@catchlist/core";
import { CONFIG } from "./config.js";
import { fetchMoviesForYears } from "./fetcher.js";
import { convertToDouban } from "./converter.js";
import { buildInternationalIdSet, filterByRegion } from "./region_filter.js";
import { enrichAndTranslateMovies } from "./translator.js";
import { updateReport, loadExistingSections } from "./writer.js";

export function applyConversion(movies) {
  return movies.map((m) => {
    if (m.imdbScore == null) return null;
    const { doubanEstimated, filmType, label } = convertToDouban(
      m.imdbScore, m.title, m.genres, m.countries
    );
    return { ...m, doubanEstimated, filmType, label };
  }).filter(Boolean);
}

export async function runMovieUpdate({
  config = CONFIG, now = () => new Date(), loadSections = loadExistingSections,
  fetchMovies = fetchMoviesForYears, buildRegions = buildInternationalIdSet,
  enrich = enrichAndTranslateMovies, writeReport = updateReport, log = console.log,
} = {}) {
  log("=".repeat(60));
  log("  🎬 IMDb ➔ 豆瓣估算評分轉換器 (增量回補版)");
  log(`  豆瓣評分門檻 ≥ ${config.DOUBAN_THRESHOLD}`);
  log(`  熱門票數門檻 ≥ ${config.MIN_VOTES_ABSOLUTE.toLocaleString()} 票`);
  log("=".repeat(60));

  // ── Step 1: 計算當下往前推 6 個月的「沉澱期目標終點」 ──────────────
  const today = dayjs(now());
  const targetEnd = today.subtract(6, "month");
  const endYear = targetEnd.year();
  const endMonth = targetEnd.month() + 1;

  log(`\n📅 執行當下時間:${today.format("YYYY-MM-DD")}`);
  log(`⏳ 沉澱期目標終點(往前推半年):${endYear} 年 ${endMonth} 月`);

  // ── Step 2: 從既有報告偵測缺漏月份 ──────────────────────────────
  const filepath = path.resolve(config.OUTPUT_FILE);
  const sections = loadSections(filepath);

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
    log(`⏮️  偵測到最早的歷史紀錄月份為:${startYear} 年 ${startMonth} 月`);
  } else {
    const defaultStart = targetEnd.subtract(11, "month");
    startYear = defaultStart.year();
    startMonth = defaultStart.month() + 1;
    log(`⚠️  未偵測到舊的按月歷史紀錄,將預設回補最近一年的資訊。`);
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
    log("\n✅ 所有至半年前的歷史月份都已回補完畢,目前無需更新!");
    return;
  }

  log(`\n🔎 本次偵測到 6 個月前遺漏且待回補的月份共 ${missingList.length} 個:\n   ${missingList.join(", ")}`);

  const targetYears = new Set(missingGroups.keys());
  const moviesByYear = await prepareMovieCandidates(targetYears, { fetchMovies, threshold: config.DOUBAN_THRESHOLD });
  const candidateIds = new Set([...moviesByYear.values()].flat().map((movie) => movie.imdbId));
  const internationalIds = await buildRegions(candidateIds);

  // ── Step 6: 逐年處理,逐月立即寫入 ────────────────────────────────
  for (const [year, months] of missingGroups) {
    const converted = moviesByYear.get(year) ?? [];

    log(`\n  📍 ${year} 年:套用國際發行地區過濾...`);
    const regionFiltered = filterByRegion(converted, internationalIds);

    log(`\n  🌐 正在翻譯並查詢電影精確上映月份(共 ${regionFiltered.length} 部)...`);
    const enrichedMovies = await enrich(regionFiltered);

    for (const month of months) {
      const monthMovies = enrichedMovies.filter((m) => {
        if (!m.releaseDate) return false;
        const d = new Date(m.releaseDate);
        return d.getFullYear() === year && d.getMonth() + 1 === month;
      });

      log(`   └─ ${year} 年 ${month} 月:篩選出 ${monthMovies.length} 部符合熱門與評分標準的電影`);

      // 逐月立即寫入,中途失敗時已完成的月份不會遺失
      writeReport([{
        year,
        month,
        movies: monthMovies,
        voteThreshold: config.MIN_VOTES_ABSOLUTE,
      }]);
    }
  }

  log("\n✅ 本次回補全部完成!");
}

/** 評分與 OMDb 補充完成後才篩選，保留原有國別修正與前 100 筆規則。 */
export async function prepareMovieCandidates(years, { fetchMovies = fetchMoviesForYears, threshold = CONFIG.DOUBAN_THRESHOLD } = {}) {
  const byYear = await fetchMovies(years);
  return new Map([...byYear].map(([year, movies]) => [year, applyConversion(movies).filter((movie) => movie.doubanEstimated >= threshold)]));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runMovieUpdate().catch((err) => {
    console.error("\n❌ 執行失敗:", err);
    process.exitCode = 1;
  });
}
