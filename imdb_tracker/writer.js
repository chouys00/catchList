// ============================================================
// writer.js — Markdown 報告生成器(按月回補歷史鎖定版)
// 區段解析與寫檔邏輯共用 @catchlist/core 的 mdstore。
// ============================================================

import path from "node:path";
import dayjs from "dayjs";
import { loadSections, writeSectionsFile, monthKey, sanitizeDisplayText } from "@catchlist/core";
import { CONFIG, MONTH_ZH } from "./config.js";

// ─── 解析現有 電影.md 的既有區塊 ─────────────────────────────
export function loadExistingSections(filepath) {
  return loadSections(filepath);
}

/**
 * 讀取電影.md 中已記錄的最新年月。
 * @returns {{ year: number, month: number }|null}
 */
export function getLatestRecordedMonth() {
  const filepath = path.resolve(CONFIG.OUTPUT_FILE);
  const sections = loadExistingSections(filepath);

  if (sections.size === 0) return null;

  const keys = [...sections.keys()].filter(k => !k.endsWith("-00")).sort();
  if (keys.length === 0) return null;

  const [y, m] = keys[keys.length - 1].split("-").map(Number);
  return { year: y, month: m };
}

// ─── 格式化單一月份區塊 ───────────────────────────────────────
function formatSection(year, month, movies, threshold, updatedAt, voteThreshold) {
  const dateStr  = updatedAt || dayjs().format("YYYY-MM-DD");
  const monthZh  = MONTH_ZH[month];
  const lines    = [];

  const voteNote = voteThreshold
    ? `  最低投票門檻: ${voteThreshold.toLocaleString()} 票`
    : "";
  lines.push(`${year}  ${monthZh}  >${threshold.toFixed(2)}    (更新時間: ${dateStr}${voteNote})`);
  lines.push("");

  if (movies.length === 0) {
    // 空月份也寫入標記區塊,將該月鎖定,避免每次排程執行都重抓
    lines.push("(本月無符合門檻的電影)");
    lines.push("");
    return lines.join("\n");
  }

  // 依豆瓣估算分由高到低排序
  const sorted = [...movies].sort((a, b) => b.doubanEstimated - a.doubanEstimated);

  for (const m of sorted) {
    const displayTitle = sanitizeDisplayText(m.displayTitle || m.title);
    const votesStr     = m.votes >= 10000
      ? `${Math.round(m.votes / 1000)}k票`
      : `${m.votes.toLocaleString()}票`;
    lines.push(
      `- ${displayTitle}  **${m.doubanEstimated.toFixed(2)}**` +
      `  \`(IMDb: ${m.imdbScore.toFixed(1)} | ${m.label} | ${votesStr})\``
    );
  }

  lines.push("");
  return lines.join("\n");
}

// ─── 主要輸出函式 ─────────────────────────────────────────────
/**
 * 更新電影.md 報告(補上新月份,不變更舊月份)。
 * 每次呼叫都重新讀檔合併,可安全地逐月呼叫。
 * @param {Array<{ year, month, movies, voteThreshold }>} allMonthData
 */
export function updateReport(allMonthData) {
  const filepath  = path.resolve(CONFIG.OUTPUT_FILE);
  const threshold = CONFIG.DOUBAN_THRESHOLD;
  const existing  = loadExistingSections(filepath);
  const today     = dayjs().format("YYYY-MM-DD");

  let totalWritten = 0;
  for (const { year, month, movies, voteThreshold } of allMonthData) {
    const qualified = movies.filter((m) => m.doubanEstimated >= threshold);
    const section = formatSection(year, month, qualified, threshold, today, voteThreshold);
    existing.set(monthKey(year, month), section);
    totalWritten += qualified.length;
  }

  writeSectionsFile(filepath, existing);
  console.log(`   ✅ 報告已更新:${filepath}(本次寫入 ${totalWritten} 部符合門檻的電影)`);
}
