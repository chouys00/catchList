// ============================================================
// writer.js — Markdown 報告生成器 (增量寫入與鎖定版)
// 區段解析與寫檔邏輯共用 @catchlist/core 的 mdstore。
// ============================================================

import fs from "node:fs";
import path from "node:path";
import dayjs from "dayjs";
import { atomicWriteFile, loadSections, writeSectionsFile, monthKey, sanitizeDisplayText } from "@catchlist/core";
import { CONFIG } from "./config.js";
import { MISSING_COMMUNITY_TAGS, normalizeCommunityTags } from "./community-tags.js";

/**
 * 解析現有 遊戲.md 的既有區塊
 * @param {string} filepath
 * @returns {Map<string, string>} - key: "YYYY-MM", value: markdown block
 */
export function loadExistingSections(filepath) {
  return loadSections(filepath, {
    // 💡 移除頂部一鍵開啟連結與等號分隔線,避免干擾第一個月的標題解析
    preprocess: (content) =>
      content.replace(/^👉\s+\[點此打開[\s\S]*?={10,}\s*/, "").trim(),
  });
}

/**
 * 格式化單一月份區塊
 */
function formatSection(year, month, games, updatedAt, linksFilepath) {
  const dateStr = updatedAt || dayjs().format("YYYY-MM-DD");
  const monthZh = CONFIG.MONTH_ZH[month];
  const lines = [];

  const htmlPath = path.resolve(linksFilepath).replace(/\\/g, "/");
  lines.push(`${year}  ${monthZh}  (更新時間: ${dateStr})`);
  lines.push(`[🚀 一鍵開啟本月所有 Steam 商店分頁](file:///${htmlPath}#${year}-${String(month).padStart(2, "0")})`);
  lines.push("");

  // 先依 Steam 評價等級，再依評論數由多到少排序。
  const sorted = [...games].sort((a, b) => {
    if (b.reviewScore !== a.reviewScore) {
      return b.reviewScore - a.reviewScore;
    }
    return b.totalReviews - a.totalReviews;
  });

  for (const g of sorted) {
    const chName = sanitizeDisplayText(g.chineseName || g.englishName);
    const egName = sanitizeDisplayText(g.englishName);
    const reviews = g.totalReviews.toLocaleString();
    const release = g.releaseDate; // YYYY-MM-DD
    const genres = (Array.isArray(g.genres) ? g.genres : [])
      .map((genre) => sanitizeDisplayText(genre, { maxLength: 80 }))
      .filter(Boolean)
      .join(", ") || "未分類";
    const communityTags = normalizeCommunityTags(g.communityTags)
      .map((tag) => sanitizeDisplayText(tag, { maxLength: 80 }));
    const chineseSupport = g.supportsChinese === true ? "支援中文" : "不支援中文";

    // 將資料欄位放在既有標題行，社群標籤另列以避免和官方類型混用。
    const badges = [`AppID: ${g.appid}`, `中文支援: ${chineseSupport}`];
    if (g.supportsController) badges.push("🎮");
    if (g.isAdult) badges.push("18+");

    const badgeStr = badges.length > 0 ? ` [${badges.join(" | ")}]` : "";

    // 格式: 四行 (名稱、評價與官方類型、社群標籤、連結)
    lines.push(`- **${chName}** (${egName})${badgeStr}`);
    lines.push(`  ${release} | ${g.positivePct}% (${reviews}) | ${genres}`);
    lines.push(`  社群標籤: ${communityTags.length ? communityTags.join(", ") : MISSING_COMMUNITY_TAGS}`);
    lines.push(`  https://store.steampowered.com/app/${g.appid}`);
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * 產生 Chrome 一鍵開啟 Steam 頁面的 HTML 工具檔
 * @param {Map<string, string>} existingSections
 */
function generateOpenLinksPage(existingSections, linksFilepath) {
  const htmlPath = path.resolve(linksFilepath);
  const allUrlsByMonth = [];
  const sortedKeys = [...existingSections.keys()].sort((a, b) => b.localeCompare(a));

  for (const key of sortedKeys) {
    const content = existingSections.get(key);
    const urls = [];
    const regex = /https:\/\/store\.steampowered\.com\/app\/(\d+)/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
      urls.push(`https://store.steampowered.com/app/${match[1]}`);
    }

    if (urls.length > 0) {
      allUrlsByMonth.push({
        monthKey: key,
        count: urls.length,
        urls: urls
      });
    }
  }

  const htmlContent = `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <title>Steam 遊戲一鍵開啟工具</title>
  <style>
    :root {
      --bg-color: #0b0e14;
      --card-bg: #151922;
      --text-color: #abb2bf;
      --primary-color: #3b82f6;
      --primary-hover: #2563eb;
      --tip-bg: rgba(245, 158, 11, 0.1);
      --tip-border: #f59e0b;
    }
    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background-color: var(--bg-color);
      color: var(--text-color);
      max-width: 800px;
      margin: 40px auto;
      padding: 0 24px;
      line-height: 1.6;
    }
    h1 {
      text-align: center;
      color: #ffffff;
      margin-bottom: 8px;
      font-size: 2.2rem;
    }
    p.subtitle {
      text-align: center;
      color: #7d8590;
      margin-bottom: 32px;
      font-size: 1.1rem;
    }
    .tip-box {
      background-color: var(--tip-bg);
      border-left: 4px solid var(--tip-border);
      padding: 16px;
      margin-bottom: 32px;
      border-radius: 8px;
    }
    .tip-box h3 {
      margin-top: 0;
      color: #fbbf24;
      margin-bottom: 8px;
    }
    .tip-box p {
      margin: 4px 0;
      font-size: 0.95rem;
    }
    .card {
      background-color: var(--card-bg);
      border: 1px solid #2d3139;
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      transition: transform 0.2s, border-color 0.2s;
    }
    .card:hover {
      transform: translateY(-2px);
      border-color: var(--primary-color);
      box-shadow: 0 8px 24px rgba(0,0,0,0.4);
    }
    .card:target {
      border-color: var(--primary-color);
      background-color: #1e2638;
      box-shadow: 0 0 15px rgba(59, 130, 246, 0.4);
      transform: translateY(-2px);
    }
    .card-info h2 {
      margin: 0 0 6px 0;
      color: #ffffff;
      font-size: 1.3rem;
    }
    .card-info p {
      margin: 0;
      color: #7d8590;
      font-size: 0.95rem;
    }
    .btn {
      background-color: var(--primary-color);
      color: #ffffff;
      border: none;
      padding: 12px 24px;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 600;
      font-size: 1rem;
      transition: background-color 0.2s;
    }
    .btn:hover {
      background-color: var(--primary-hover);
    }
  </style>
  <script>
    function openAll(urls) {
      if (urls.length === 0) return;
      urls.forEach(url => {
        window.open(url, '_blank');
      });
    }
  </script>
</head>
<body>
  <h1>🎮 Steam 遊戲一鍵開啟工具</h1>
  <p class="subtitle">在 Chrome 瀏覽器中一鍵打開各月份所有優質 Steam 遊戲的商店分頁</p>

  <div class="tip-box">
    <h3>💡 首次點擊須知</h3>
    <p>第一次點擊按鈕時,Chrome 瀏覽器可能會在右上角網址列顯示<b>「已封鎖彈出式視窗」</b>。</p>
    <p>請點擊該圖示並選擇<b>「一律允許從此檔案開啟彈出式視窗」</b>,然後再次點擊按鈕即可一鍵打開所有分頁!</p>
  </div>

  <div id="cards-container">
    ${allUrlsByMonth.map(m => {
      const formattedKey = m.monthKey.replace("-", " 年 ") + " 月";
      return `
      <div class="card" id="${m.monthKey}">
        <div class="card-info">
          <h2>📅 ${formattedKey}</h2>
          <p>符合條件遊戲共 <b>${m.count}</b> 款</p>
        </div>
        <button class="btn" onclick='openAll(${JSON.stringify(m.urls)})'>
          🚀 一鍵開啟 (${m.count} 款)
        </button>
      </div>
      `;
    }).join("\n")}
  </div>
</body>
</html>`;

  atomicWriteFile(htmlPath, htmlContent, "utf-8");
  console.log(`✅ 連結網頁已更新:${htmlPath}`);
}

/**
 * 更新 遊戲.md 報告(補上新月份,不變更已鎖定的舊月份)。
 * 每次呼叫都重新讀檔合併,可安全地逐月呼叫。
 * @param {Array<{ year, month, games }>} allMonthData
 * @param {string} reportFilepath
 */
export function updateReport(allMonthData, reportFilepath = CONFIG.OUTPUT_FILE) {
  const filepath = path.resolve(reportFilepath);
  const linksFilepath = path.join(path.dirname(filepath), "open_links.html");
  const existing = loadExistingSections(filepath);
  const today = dayjs().format("YYYY-MM-DD");

  let totalWritten = 0;
  for (const { year, month, games } of allMonthData) {
    if (games.length === 0) {
      // 即使該月沒有符合的遊戲,也寫入一個空白區塊以標記該月份已被處理鎖定
      const monthZh = CONFIG.MONTH_ZH[month];
      const emptySection = `${year}  ${monthZh}  (更新時間: ${today})\n\n(本月無符合條件的優質單人/合作遊戲)\n`;
      existing.set(monthKey(year, month), emptySection);
      continue;
    }

    const section = formatSection(year, month, games, today, linksFilepath);
    existing.set(monthKey(year, month), section);
    totalWritten += games.length;
  }

  // 1. 產生一鍵開啟的 HTML 輔助頁面
  generateOpenLinksPage(existing, linksFilepath);

  // 2. 寫入 遊戲.md(頂部加入直達網頁的一鍵開啟超連結)
  const htmlPath = path.resolve(linksFilepath).replace(/\\/g, "/");
  const header = `👉 [點此打開「一鍵開啟工具」頁面](file:///${htmlPath}) (可在 Chrome 一鍵打開各月份所有 Steam 商店分頁)\n\n============================================================\n\n`;

  writeSectionsFile(filepath, existing, { header });
  console.log(`✅ 報告已更新:${filepath}\n   本次寫入 ${totalWritten} 款符合條件的遊戲。`);
}
