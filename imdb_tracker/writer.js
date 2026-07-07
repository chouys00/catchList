// ============================================================
// writer.js — Markdown 報告生成器 (按月回補歷史鎖定版)
// ============================================================

import fs from "node:fs";
import path from "node:path";
import dayjs from "dayjs";
import { CONFIG, MONTH_ZH } from "./config.js";

// ─── 解析現有 電影.md 的既有區塊 ─────────────────────────────
export function loadExistingSections(filepath) {
  const sections = new Map(); // key: "YYYY-MM"

  if (!fs.existsSync(filepath)) return sections;

  const content = fs.readFileSync(filepath, "utf-8");
  const blocks  = content.split("------------------------------");

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    const firstLine = trimmed.split("\n")[0].trim();
    // 支援「YYYY  MM月」標題，例：「2026  6月  >7.00 ...」
    const yearMatch  = firstLine.match(/^(\d{4})/);
    if (yearMatch) {
      const year = parseInt(yearMatch[1]);
      let month = 0;
      if (firstLine.includes("全年度")) {
        month = 0;
      } else {
        const monthMatch = firstLine.match(/\s+(\d+)月/);
        if (monthMatch) month = parseInt(monthMatch[1]);
      }
      sections.set(`${year}-${String(month).padStart(2, "0")}`, trimmed);
    }
  }

  return sections;
}

/**
 * 讀取電影.md 中已記錄的最新年月。
 * @returns {{ year: number, month: number }|null}
 */
export function getLatestRecordedMonth() {
  const filepath = path.resolve(CONFIG.OUTPUT_FILE);
  const sections = loadExistingSections(filepath);
  
  if (sections.size === 0) return null;

  // 取得最新的一筆（鍵值最大的，例如 "2026-06" 比 "2026-01" 新）
  const keys = [...sections.keys()].filter(k => !k.endsWith("-00")).sort();
  if (keys.length === 0) return null;

  const latestKey = keys[keys.length - 1]; // 例如 "2026-01"
  const [y, m] = latestKey.split("-").map(Number);
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

  // 依豆瓣估算分由高到低排序
  const sorted = [...movies].sort((a, b) => b.doubanEstimated - a.doubanEstimated);

  for (const m of sorted) {
    const displayTitle = m.displayTitle || m.title;
    const doubanEst    = m.doubanEstimated;
    const imdbScore    = m.imdbScore;
    const label        = m.label;
    const votesStr     = m.votes >= 10000
      ? `${Math.round(m.votes / 1000)}k票`
      : `${m.votes.toLocaleString()}票`;
    lines.push(
      `- ${displayTitle}  **${doubanEst.toFixed(2)}**` +
      `  \`(IMDb: ${imdbScore.toFixed(1)} | ${label} | ${votesStr})\``
    );
  }

  lines.push("");
  return lines.join("\n");
}

// ─── 主要輸出函式 ─────────────────────────────────────────────
/**
 * 更新電影.md 報告（補上新月份，不變更舊月份）。
 * @param {Array<{ year, month, movies }>} allMonthData
 */
export function updateReport(allMonthData) {
  const filepath  = path.resolve(CONFIG.OUTPUT_FILE);
  const threshold = CONFIG.DOUBAN_THRESHOLD;
  const existing  = loadExistingSections(filepath);
  const today     = dayjs().format("YYYY-MM-DD");

  let totalWritten = 0;
  for (const { year, month, movies, voteThreshold } of allMonthData) {
    // 單軌篩選：豆瓣估算分數 >= 7.00
    const qualified = movies.filter((m) => m.doubanEstimated >= threshold);
    if (qualified.length === 0) continue;

    const section = formatSection(year, month, qualified, threshold, today, voteThreshold);
    existing.set(`${year}-${String(month).padStart(2, "0")}`, section);
    totalWritten += qualified.length;
  }

  // 依年月由新到舊排序
  const sortedKeys = [...existing.keys()].sort((a, b) => b.localeCompare(a));

  const parts = [];
  for (const key of sortedKeys) {
    parts.push(existing.get(key));
    parts.push("------------------------------");
    parts.push("");
  }

  fs.writeFileSync(filepath, parts.join("\n").trimEnd() + "\n", "utf-8");
  console.log(`\n✅ 報告已更新：${filepath}\n   共追加/覆蓋寫入 ${totalWritten} 部符合單軌門檻的電影。`);
}
