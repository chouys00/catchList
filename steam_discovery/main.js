// ============================================================
// main.js — 主程式入口 (二分定位與大步前進掃描・逐月即時寫入版)
//
// 專為排程執行設計:
//   - 冪等:已回補的月份不會重抓,無缺漏時直接結束
//   - 逐月寫入:每完成一個月立即寫入報告,中途失敗不會全部白費
//   - 失敗時以非零 exit code 結束,排程器可正確判斷成敗
// ============================================================

import dayjs from "dayjs";
import path from "node:path";
import { program } from "commander";
import { delay, getMonthsBetween, monthKey } from "@catchlist/core";
import { CONFIG } from "./config.js";
import { fetchSearchPage, fetchAppDetails } from "./fetcher.js";
import { loadExistingSections, updateReport } from "./writer.js";

/**
 * 解析 Steam 搜尋頁面的日期字串為 dayjs 物件
 */
function parseSteamSearchDate(dateStr) {
  if (!dateStr) return null;
  const cleaned = dateStr.trim();
  const d = new Date(cleaned);
  if (isNaN(d.getTime())) {
    const fallback = dayjs(cleaned, "MMM YYYY");
    if (fallback.isValid()) return fallback;
    return null;
  }
  return dayjs(d);
}

/**
 * 使用二分搜尋法,快速定位目標年月份的搜尋頁 start 索引
 */
async function locateMonthBinarySearch(year, month) {
  const targetKey = monthKey(year, month);
  const targetDate = dayjs(`${targetKey}-15`);

  // 💡 如果啟用了語言過濾,因為總遊戲量大幅下降 90%,二分的上限高點可以從 25000 降到 3000!
  let low = 0;
  let high = CONFIG.SUPPORTED_LANG ? 3000 : 25000;
  let bestStart = -1;
  let attempts = 0;
  const maxAttempts = 12;

  console.log(`   [定位] 開始二分搜尋 ${year} 年 ${month} 月 (${targetKey}) 的起始點...`);

  while (low <= high && attempts < maxAttempts) {
    let mid = Math.floor((low + high) / 2);
    mid = Math.floor(mid / 50) * 50;

    await delay(1500);
    const { games, success } = await fetchSearchPage(mid);
    attempts++;

    if (!success || games.length === 0) {
      high = mid - 50;
      continue;
    }

    let midDate = null;
    for (const g of games) {
      midDate = parseSteamSearchDate(g.releaseDateStr);
      if (midDate) break;
    }

    if (!midDate) {
      low = mid + 50;
      continue;
    }

    const midKey = monthKey(midDate.year(), midDate.month() + 1);
    console.log(`      [二分] 嘗試 start=${mid}: 遊戲日期為 ${midDate.format("YYYY-MM")} (目標: ${targetKey})`);

    if (midKey === targetKey) {
      bestStart = mid;
      high = mid - 50;
    } else if (midDate.isAfter(targetDate, "month")) {
      low = mid + 50;
    } else {
      high = mid - 50;
    }
  }

  if (bestStart !== -1) {
    // 💡 啟用語言過濾時,每個分頁的時間間隔較大,往前挪 100 就足夠安全
    const offset = CONFIG.SUPPORTED_LANG ? 100 : 150;
    const scanStart = Math.max(0, bestStart - offset);
    console.log(`      [二分] 成功定位!從 start=${scanStart} 開始掃描`);
    return scanStart;
  }

  const defaultStart = CONFIG.SUPPORTED_LANG ? 1000 : 8000;
  console.log(`      [二分] 未能精確找到,將採用預設估算 start=${defaultStart}`);
  return defaultStart;
}

/**
 * 從指定起點掃描收集該月份所有符合評價門檻的遊戲
 */
async function collectGamesForMonth(year, month, scanStart) {
  const targetKey = monthKey(year, month);
  const candidates = [];
  let start = scanStart;
  let keepScanning = true;
  let targetMonthFound = false;

  console.log(`   [掃描] 從 start=${start} 開始線性掃描...`);

  while (keepScanning) {
    await delay(1500);
    const { games, success } = await fetchSearchPage(start);
    if (!success || games.length === 0) break;

    let targetMonthCount = 0;
    let olderMonthCount = 0;
    let newerMonthCount = 0;

    for (const game of games) {
      const releaseDate = parseSteamSearchDate(game.releaseDateStr);
      if (!releaseDate) continue;

      const gameKey = monthKey(releaseDate.year(), releaseDate.month() + 1);

      if (gameKey === targetKey) {
        targetMonthCount++;
        targetMonthFound = true;

        // 評價過濾門檻：好評率至少 85%，且總評論數必須大於 500 則。
        const meetsReviewThreshold =
          game.positivePct >= CONFIG.MIN_POSITIVE_PCT &&
          game.totalReviews > CONFIG.MIN_TOTAL_REVIEWS_EXCLUSIVE;

        if (meetsReviewThreshold) {
          candidates.push({
            ...game,
            releaseDate: releaseDate.format("YYYY-MM-DD")
          });
        }
      } else if (releaseDate.isBefore(dayjs(`${targetKey}-01`), "month")) {
        olderMonthCount++;
      } else {
        newerMonthCount++;
      }
    }

    console.log(`      start=${start}: 本月遊戲 ${targetMonthCount} 款,舊月遊戲 ${olderMonthCount} 款,新月遊戲 ${newerMonthCount} 款`);

    // 停止掃描條件:
    // 如果我們已經在這一頁看到了「舊於目標月份」的遊戲,且數量大於 15 則
    if (olderMonthCount > 15) {
      console.log(`      偵測到足夠的舊月份遊戲 (${olderMonthCount} 款),停止本月掃描。`);
      keepScanning = false;
    }

    if (targetMonthFound && targetMonthCount === 0 && olderMonthCount > 30) {
      console.log(`      已經完全度過目標月份,停止本月掃描。`);
      keepScanning = false;
    }

    if (keepScanning) {
      // 若尚未進入目標月份,且此頁全部都是較新的遊戲,大步前進!
      if (!targetMonthFound && olderMonthCount === 0) {
        // 💡 啟用語言過濾時,大步跨越改為 +150 (約 3 頁) 較為溫和,避免直接跳過整個月份
        const step = CONFIG.SUPPORTED_LANG ? 150 : 300;
        start += step;
        console.log(`      [大步前進] 尚未進入目標月份,跳躍 start += ${step} -> ${start}`);
      } else {
        start += 50;
      }
    }
  }

  return { candidates, endStart: start };
}

async function main() {
  // 設定命令列參數
  program
    .option("-y, --year <year>", "指定要抓取的年份")
    .option("-m, --month <month>", "指定要抓取的月份")
    .parse(process.argv);

  const options = program.opts();

  console.log("=".repeat(60));
  console.log("  🎮 Steam 每月優質遊戲發掘工具 (增量鎖定版)");
  console.log(
    `  評價門檻:好評率 ≥ ${CONFIG.MIN_POSITIVE_PCT}% 且評論數 > ${CONFIG.MIN_TOTAL_REVIEWS_EXCLUSIVE}`
  );
  console.log(`  過濾排除:MMO/多人競技、搶先體驗 (EA)、軟體`);
  if (CONFIG.SUPPORTED_LANG) {
    console.log(`  語言過濾:僅限支援「繁體中文」的遊戲 (極速撈取模式)`);
  }
  console.log("=".repeat(60));

  let missingList = [];
  const filepath = path.resolve(CONFIG.OUTPUT_FILE);

  // 判斷是否為使用者手動指定的單月測試模式
  if (options.year && options.month) {
    const y = parseInt(options.year, 10);
    const m = parseInt(options.month, 10);
    console.log(`🎯 模式:使用者手動指定抓取單一月份 ${y} 年 ${m} 月`);
    missingList.push({ year: y, month: m, key: monthKey(y, m) });
  } else {
    // 增量回補模式
    const today = dayjs();
    const targetEnd = today.subtract(CONFIG.SETTLE_MONTHS, "month");
    const endYear = targetEnd.year();
    const endMonth = targetEnd.month() + 1;

    console.log(`\n📅 執行當下時間:${today.format("YYYY-MM-DD")}`);
    console.log(`⏳ 沉澱期目標終點(往前推 ${CONFIG.SETTLE_MONTHS} 個月):${endYear} 年 ${endMonth} 月`);

    const sections = loadExistingSections(filepath);
    let oldestRecorded = null;
    const keys = [...sections.keys()].sort();
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
      const defaultStart = targetEnd.subtract(5, "month");
      startYear = defaultStart.year();
      startMonth = defaultStart.month() + 1;
      console.log(`⚠️  未偵測到舊的歷史紀錄,預設將回補最近半年的資訊。`);
    }

    const allPossibleGroups = getMonthsBetween(startYear, startMonth, endYear, endMonth);

    for (const [y, ms] of allPossibleGroups) {
      for (const m of ms) {
        const key = monthKey(y, m);
        if (!sections.has(key)) {
          missingList.push({ year: y, month: m, key });
        }
      }
    }

    if (missingList.length === 0) {
      console.log("\n✅ 所有至沉澱終點的歷史月份都已回補完畢,目前無需更新!");
      return;
    }

    // 排序由新到舊
    missingList.sort((a, b) => b.key.localeCompare(a.key));
    console.log(`\n🔎 待回補月份共 ${missingList.length} 個:\n   ${missingList.map(x => x.key).join(", ")}`);
  }

  // ── Step 4: 逐個月份進行定位、掃描、詳細資訊獲取,並「立即寫入」 ──────
  let currentStart = -1;

  for (const { year, month, key } of missingList) {
    console.log(`\n============================================================`);
    console.log(`📅 正在處理:${year} 年 ${month} 月 (${key})`);
    console.log(`============================================================`);

    let scanStart = 0;

    if (currentStart === -1 || (options.year && options.month)) {
      // 手動模式或首個月份,需要做二分搜尋定位
      scanStart = await locateMonthBinarySearch(year, month);
    } else {
      // 繼承掃描點,往回移 100 以免漏掉邊界
      scanStart = Math.max(0, currentStart - 100);
      console.log(`      [繼承] 繼承上一次掃描結束點,從 start=${scanStart} 開始`);
    }

    // 掃描該月份符合評價門檻的遊戲
    const { candidates, endStart } = await collectGamesForMonth(year, month, scanStart);
    currentStart = endStart;

    console.log(`\n   [結果] 找到 ${candidates.length} 款符合評價門檻的候選遊戲,開始獲取詳細資訊...`);

    const qualifiedGames = [];

    // 逐一獲取詳細資訊並過濾內容 (PvP, EA, MMO, 軟體等)
    for (const item of candidates) {
      const { appid, englishName, releaseDate, reviewScore, reviewLabel, totalReviews, positivePct } = item;

      await delay(1500);
      const details = await fetchAppDetails(appid);
      if (!details) {
        continue;
      }

      console.log(`   🌟 [符合條件] ${details.chineseName || englishName} (${englishName})`);
      qualifiedGames.push({
        appid,
        englishName,
        releaseDate,
        reviewScore,
        ratingLabel: reviewLabel,
        totalReviews,
        positivePct,
        ...details
      });
    }

    // 逐月立即寫入,中途失敗時已完成的月份不會遺失
    updateReport([{ year, month, games: qualifiedGames }]);
  }

  console.log("\n✅ 本次回補全部完成!");
}

main().catch((err) => {
  console.error("\n❌ 執行失敗:", err);
  process.exitCode = 1;
});
