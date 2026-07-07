// ============================================================
// converter.js — 核心轉換引擎
// 將 IMDb 評分轉換為豆瓣估算評分
// ============================================================

import {
  ADJUSTMENTS,
  ADJUSTMENT_LABELS,
  BLOCKBUSTER_KEYWORDS,
  CHINESE_COUNTRIES,
} from "./config.js";

/**
 * 根據電影標題、類型標籤、製作國，自動判斷修正類型。
 * 優先級：華語 > 動畫 > 紀錄片 > 特效大片 > 恐怖 > 喜劇 > 文藝劇情 > 基準
 *
 * @param {string}   title     - 電影英文標題
 * @param {string[]} genres    - IMDb 類型標籤陣列（e.g. ["Action", "Drama"]）
 * @param {string[]} countries - 製作國陣列（e.g. ["China", "USA"]）
 * @returns {string} filmType  - 對應 ADJUSTMENTS 的 key
 */
export function detectFilmType(title, genres, countries) {
  const titleLower  = title.toLowerCase();
  const genresLower = genres.map((g) => g.toLowerCase());

  // 1. 華語電影
  if (countries.some((c) => CHINESE_COUNTRIES.includes(c))) return "chinese";

  // 2. 動畫
  if (genresLower.includes("animation")) return "animation";

  // 3. 紀錄片
  if (genresLower.includes("documentary")) return "documentary";

  // 4. 特效商業爆米花（關鍵字優先）
  if (BLOCKBUSTER_KEYWORDS.some((kw) => titleLower.includes(kw.toLowerCase()))) {
    return "action_blockbuster";
  }

  // 5. 恐怖驚悚
  if (genresLower.includes("horror")) return "horror";

  // 6. 喜劇
  if (genresLower.includes("comedy")) return "comedy";

  // 7. 文藝/劇情/得獎片
  const artGenres = new Set(["drama", "biography", "history", "war", "music", "musical"]);
  if (genresLower.some((g) => artGenres.has(g))) return "drama_arthouse";

  // 預設：基準
  return "base";
}

/**
 * 將 IMDb 評分轉換為豆瓣估算評分。
 *
 * @param {number}   imdbScore
 * @param {string}   title
 * @param {string[]} genres
 * @param {string[]} countries
 * @returns {{ doubanEstimated: number, filmType: string, label: string }}
 */
export function convertToDouban(imdbScore, title, genres = [], countries = []) {
  const filmType  = detectFilmType(title, genres, countries);
  const adj       = ADJUSTMENTS[filmType] ?? ADJUSTMENTS.base;
  const estimated = Math.min(10, Math.max(0, Math.round((imdbScore + adj) * 100) / 100));

  return {
    doubanEstimated: estimated,
    filmType,
    label: ADJUSTMENT_LABELS[filmType],
  };
}
