// ============================================================
// fetcher.js — Steam API 呼叫與 HTML 爬取模組
// 429/5xx 自動指數退避重試;appdetails 結果以 JSON 檔快取。
// ============================================================

import path from "node:path";
import { getWithRetry, loadJson, saveJson } from "@catchlist/core";
import { parseCommunityTags } from "./community-tags.js";
import { CONFIG, EXCLUDED_COMPETITIVE_TAGS, EXCLUDED_SOFTWARE_GENRES } from "./config.js";

const DETAILS_CACHE_FILE = path.resolve(".appdetails_cache.json");
const detailsCache = loadJson(DETAILS_CACHE_FILE, {});
const DETAILS_CACHE_VERSION = 2;
const STEAM_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
};

/**
 * 爬取 Steam 搜尋結果頁面,回傳候選遊戲清單
 * @param {number} start - 起始索引 (分頁用,每頁 50)
 * @returns {Promise<{games: Array, success: boolean}>}
 */
export async function fetchSearchPage(start = 0, {
  requester = getWithRetry,
  config = CONFIG,
  logger = console
} = {}) {
  const url = "https://store.steampowered.com/search/results/";
  try {
    const params = {
      sort_by: "Released_DESC",
      category1: "998", // 僅限遊戲
      start: start,
      count: 50,
      cc: "us",        // 使用美商地區
      l: "english"     // 強制英文,便於直接抓取英文名稱與英文發行日期
    };

    // 💡 啟用語言過濾 (加速關鍵)
    if (config.SUPPORTED_LANG) {
      params.supportedlang = config.SUPPORTED_LANG;
    }

    const response = await requester(url, {
      params,
      headers: STEAM_HEADERS,
      timeout: 15000
    }, {
      label: `search start=${start}`,
      retries: config.SEARCH_MAX_RETRIES,
      rateLimitBaseDelay: config.SEARCH_RATE_LIMIT_DELAY_MS
    });

    const html = response.data;
    const games = [];

    // 正則匹配每一列遊戲區塊:
    const rowRegex = /(<a[^>]+href="[^"]*\/app\/(\d+)\/[^"]*"[^>]+class="[^"]*search_result_row[^"]*"[^>]*>)([\s\S]*?)<\/a>/g;
    let match;

    while ((match = rowRegex.exec(html)) !== null) {
      const openTag = match[1];
      const appid = match[2];
      const innerHtml = match[3];

      // 1. 抓取英文遊戲名稱
      const titleMatch = /<span class="title">([^<]*)<\/span>/.exec(innerHtml);
      const englishName = titleMatch ? titleMatch[1].trim() : "Unknown";

      // 2. 抓取上市時間
      const dateMatch = /class="[^"]*search_released[^"]*">([\s\S]*?)<\/div>/.exec(innerHtml);
      const releaseDateStr = dateMatch ? dateMatch[1].trim() : "";

      // 3. 抓取 TagIDs
      const tagMatch = /data-ds-tagids="\[([^\]]*)]"/.exec(openTag);
      const tagIds = tagMatch && tagMatch[1]
        ? tagMatch[1].split(",").map(Number).filter(Boolean)
        : [];

      // 檢查是否含有排除的競技類 tag
      const hasExcludedTag = tagIds.some(id => EXCLUDED_COMPETITIVE_TAGS.includes(id));
      if (hasExcludedTag) {
        continue;
      }

      // 4. 抓取評價標籤與評論數
      const reviewDivMatch = /<div class="[^"]*search_reviewscore[^"]*">([\s\S]*?)<\/div>/.exec(innerHtml);
      let reviewLabel = "No user reviews";
      let totalReviews = 0;
      let reviewScore = 0;
      let positivePct = 0; // 好評率 %

      if (reviewDivMatch) {
        const tooltipMatch = /data-tooltip-html="([^"]+)"/.exec(reviewDivMatch[1]);
        if (tooltipMatch) {
          const decoded = tooltipMatch[1]
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            .replace(/&amp;/g, "&");

          // tooltip 格式: "Overwhelmingly Positive<br>99% of the 26,320 user reviews..."
          const parts = decoded.split("<br>");
          if (parts.length > 0) {
            reviewLabel = parts[0].trim();
          }

          const countMatch = /(\d{1,3}(?:,\d{3})*)\s+user reviews/.exec(decoded);
          if (countMatch) {
            totalReviews = parseInt(countMatch[1].replace(/,/g, ""), 10);
          }

          const pctMatch = /(\d+)%\s+of\s+the/.exec(decoded);
          if (pctMatch) {
            positivePct = parseInt(pctMatch[1], 10);
          }

          // 映射英文 label 到 reviewScore 數字,以利後續排序
          if (reviewLabel === "Overwhelmingly Positive") reviewScore = 9;
          else if (reviewLabel === "Very Positive") reviewScore = 8;
          else if (reviewLabel === "Positive") reviewScore = 6;
          else if (reviewLabel === "Mostly Positive") reviewScore = 5;
          else if (reviewLabel === "Mixed") reviewScore = 4;
          else if (reviewLabel === "Mostly Negative") reviewScore = 3;
          else if (reviewLabel === "Very Negative") reviewScore = 2;
          else if (reviewLabel === "Overwhelmingly Negative") reviewScore = 1;
        }
      }

      games.push({
        appid,
        englishName,
        releaseDateStr,
        reviewLabel,
        totalReviews,
        reviewScore,
        positivePct
      });
    }

    // 防呆:HTML 有內容卻解析不出任何遊戲列,多半是 Steam 改版導致 regex 失效
    if (games.length === 0 && typeof html === "string" && html.length > 20000) {
      logger.warn(`  [Fetcher] ⚠️ start=${start} 回應長度 ${html.length} 但解析出 0 筆,Steam 頁面結構可能已改版!`);
    }

    return { games, success: true };
  } catch (error) {
    logger.error(`  [Fetcher] 搜尋分頁抓取失敗 (start: ${start}): ${error.message}`);
    return { games: [], success: false };
  }
}

/**
 * 取得特定遊戲的詳細資料 (Trad. Chinese)。結果會快取,重跑不重抓。
 * @param {string} appid
 * @returns {Promise<object|null>}
 */
export async function fetchAppDetails(appid) {
  const cached = detailsCache[appid];
  if (cached?._cacheVersion === DETAILS_CACHE_VERSION) {
    const { _cacheVersion, ...details } = cached;
    return details;
  }

  const url = "https://store.steampowered.com/api/appdetails";
  try {
    const response = await getWithRetry(url, {
      params: {
        appids: appid,
        cc: "tw",
        l: "tchinese"
      },
      timeout: 10000
    }, { label: `appdetails ${appid}` });

    const result = parseAppDetails(appid, response.data);
    if (result) {
      detailsCache[appid] = {
        _cacheVersion: DETAILS_CACHE_VERSION,
        ...result
      };
      saveJson(DETAILS_CACHE_FILE, detailsCache);
    }
    return result;
  } catch (error) {
    console.error(`  [Fetcher] AppDetails (${appid}) 獲取失敗: ${error.message}`);
    return null; // 網路失敗不寫入快取,下次重試
  }
}

export async function fetchCommunityTags(appid, {
  requester = getWithRetry,
  logger = console
} = {}) {
  try {
    const response = await requester(`https://store.steampowered.com/app/${appid}`, {
      params: {
        cc: "tw",
        l: "tchinese"
      },
      headers: STEAM_HEADERS,
      timeout: 15000
    }, { label: `community tags ${appid}` });

    const tags = parseCommunityTags(response.data);
    return tags.length > 0 ? tags : null;
  } catch (error) {
    logger.error(`  [Fetcher] 社群標籤 (${appid}) 取得失敗：${error.message}`);
    return null;
  }
}

export function parseAppDetails(appid, data_, config = CONFIG) {
  const root = data_[appid];
  if (!root || !root.success) return null;

  const data = root.data;

  // 1. 確保是遊戲類型
  if (data.type !== "game") return null;

  // 排除免費遊戲
  if (config.EXCLUDE_FREE_TO_PLAY && data.is_free) return null;

  // 2. 檢查是否為 Early Access
  const isEarlyAccess = data.categories?.some(c => c.id === 70) ||
                        data.genres?.some(g => g.id === "70") || false;
  if (isEarlyAccess) return null;

  // 2.5 檢查是否包含內購 (In-App Purchases, category id 35)
  const hasInAppPurchases = data.categories?.some(c => c.id === 35) || false;
  if (hasInAppPurchases) return null;

  // 3. 檢查是否為純 PvP (非單人且非合作)
  const hasSingleplayer = data.categories?.some(c => c.id === 2) || false;
  const hasCoop = data.categories?.some(c => [9, 38, 39, 47].includes(c.id)) || false;
  const hasMMO = data.categories?.some(c => c.id === 20) || false;

  // 如果既不是單人,也不是合作,或者標記為 MMO,排除
  if (hasMMO) return null;
  if (!hasSingleplayer && !hasCoop) return null;

  // 4. 檢查 MMO 分類與實用軟體 genres
  const genres = data.genres || [];
  const genreNames = genres.map(g => g.description);
  const genreIds = genres.map(g => g.id);

  // 排除大型多人線上 (Massively Multiplayer id 29)
  if (genreIds.includes("29")) return null;

  // 排除軟體類
  if (config.EXCLUDE_SOFTWARE) {
    const isSoftware = genres.some(g => EXCLUDED_SOFTWARE_GENRES.includes(g.description));
    if (isSoftware) return null;
  }

  // 5. VR 支援/專用判斷
  const isVROnly = data.categories?.some(c => c.id === 54) || false;
  if (config.EXCLUDE_VR_ONLY && isVROnly) return null;

  // 6. 18+ 內容標記
  const isAdult = genres.some(g => ["Nudity", "Sexual Content"].includes(g.description)) ||
                  data.required_age >= 18;

  // 6.5 檢查手把支援 (全支援 full, 或含有 category 18/28)
  const supportsController = data.controller_support === "full" ||
                             data.categories?.some(c => [18, 28].includes(c.id)) || false;

  // 7. 價格整理(含內購的遊戲已在前面排除)
  let priceText = "免費遊玩";
  if (!data.is_free && data.price_overview) {
    priceText = data.price_overview.final_formatted || data.price_overview.initial_formatted;
  }

  // 8. 語言支持
  const supportedLangs = data.supported_languages || "";
  const supportsChinese = [
    "Traditional Chinese",
    "繁體中文",
    "Simplified Chinese",
    "簡體中文"
  ].some((language) => supportedLangs.includes(language));

  return {
    chineseName: data.name,
    shortDescription: data.short_description ? data.short_description.replace(/<[^>]*>/g, "").trim() : "",
    genres: genreNames,
    priceText,
    supportsChinese,
    isVROnly,
    isAdult,
    supportsController,
    headerImage: data.header_image,
    categories: data.categories?.map(c => c.description) || []
  };
}
