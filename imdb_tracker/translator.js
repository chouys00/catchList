// ============================================================
// translator.js — 電影片名翻譯與上映日期查詢模組（免 Key 版）
// ============================================================

import fs from "node:fs";
import path from "node:path";
import axios from "axios";
import { CONFIG } from "./config.js";

const TMDB_BASE   = "https://api.themoviedb.org/3";
const CACHE_FILE  = path.resolve(".title_cache.json");

// ─── 快取管理 ──────────────────────────────────────────────
function loadCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      return JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8"));
    }
  } catch {}
  return {};
}

function saveCache(cache) {
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), "utf-8");
}

// ─── 方法一：TMDb API 查詢（需要 Key） ────────────────────────
// 獲取中文標題與上映日期
async function fetchTMDbInfo(imdbId) {
  try {
    const findRes = await axios.get(`${TMDB_BASE}/find/${imdbId}`, {
      params: {
        api_key: CONFIG.TMDB_API_KEY,
        external_source: "imdb_id",
        language: "zh-TW",
      },
      timeout: 5000,
    });

    const movieResults = findRes.data?.movie_results ?? [];
    if (movieResults.length > 0) {
      const movie = movieResults[0];
      return {
        zhTitle: movie.title && movie.title !== movie.original_title ? movie.title : null,
        releaseDate: movie.release_date || null
      };
    }
  } catch {}
  return null;
}

// ─── 方法二：維基數據 Wikidata 查詢（免 Key，查詢官方譯名與上映時間） ─────────
async function fetchWikidataInfo(imdbId) {
  // P577: publication date (上映日期)
  const sparql = `
    SELECT ?label ?date WHERE {
      ?item wdt:P345 "${imdbId}" .
      OPTIONAL { ?item wdt:P577 ?date . }
      OPTIONAL {
        ?item rdfs:label ?label .
        FILTER (lang(?label) = "zh-tw" || lang(?label) = "zh-hant" || lang(?label) = "zh-hk" || lang(?label) = "zh")
      }
    }
    LIMIT 20
  `;
  const url = `https://query.wikidata.org/sparql?query=${encodeURIComponent(sparql)}&format=json`;

  try {
    const res = await axios.get(url, {
      headers: {
        "User-Agent": "IMDbDoubanTracker/2.0 (mailto:patrick.zyx@example.com) Axios/1.7.2",
        "Accept": "application/sparql-results+json"
      },
      timeout: 8000
    });

    const bindings = res.data?.results?.bindings ?? [];
    if (bindings.length === 0) return null;

    // 1. 篩選出中文片名（優先序：zh-tw/zh-hant -> zh-hk -> zh）
    let zhTitle = null;
    const findLabel = (langs) => {
      for (const lang of langs) {
        const match = bindings.find(b => b.label?.["xml:lang"] === lang);
        if (match?.label?.value) return match.label.value;
      }
      return null;
    };
    zhTitle = findLabel(["zh-tw", "zh-hant", "zh-hk", "zh"]);

    // 2. 篩選出最早的發行日期
    let releaseDate = null;
    const dateBindings = bindings.filter(b => b.date?.value);
    if (dateBindings.length > 0) {
      // 排序選最早的日期，並只保留 YYYY-MM-DD
      const dates = dateBindings.map(b => b.date.value).sort();
      releaseDate = dates[0].split("T")[0]; // "2026-01-15T00:00:00Z" -> "2026-01-15"
    }

    return { zhTitle, releaseDate };
  } catch (e) {
    return null;
  }
}

// ─── 方法三：Google 翻譯直譯（免 Key，片名翻譯最後防線） ─────────────
async function fetchGoogleTranslate(title) {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-TW&dt=t&q=${encodeURIComponent(title)}`;
  try {
    const res = await axios.get(url, { timeout: 5000 });
    return res.data?.[0]?.[0]?.[0] || null;
  } catch {
    return null;
  }
}

// ─── 批次資訊填充主函式 ──────────────────────────────────────
export async function enrichAndTranslateMovies(movies) {
  const hasTmdbKey = CONFIG.TMDB_API_KEY !== "YOUR_TMDB_API_KEY_HERE" && CONFIG.TMDB_API_KEY !== "";
  const cache = loadCache();
  
  let cacheHits = 0;
  let apiCalls = 0;
  const result = [];

  for (const movie of movies) {
    const { imdbId, title } = movie;
    let cached = cache[imdbId];

    // 相容舊格式 (如果是單純字串片名，就升級為新物件格式)
    if (cached && typeof cached === "string") {
      cached = { zhTitle: cached, releaseDate: null };
    }

    let info = cached || null;

    if (info && info.zhTitle && info.releaseDate) {
      cacheHits++;
    } else {
      apiCalls++;
      // 初始化或合併資料
      const currentZh = info?.zhTitle || null;
      const currentDate = info?.releaseDate || null;

      let fetched = null;

      // 1. 嘗試 TMDb
      if (hasTmdbKey) {
        fetched = await fetchTMDbInfo(imdbId);
      }
      
      // 2. 嘗試 Wikidata (一次帶回官方譯名與上映時間)
      if (!fetched || !fetched.zhTitle || !fetched.releaseDate) {
        const wikiInfo = await fetchWikidataInfo(imdbId);
        if (wikiInfo) {
          fetched = {
            zhTitle: fetched?.zhTitle || wikiInfo.zhTitle,
            releaseDate: fetched?.releaseDate || wikiInfo.releaseDate
          };
        }
      }

      // 3. 嘗試 Google 翻譯 (僅片名)
      let finalZh = fetched?.zhTitle || currentZh;
      if (!finalZh) {
        finalZh = await fetchGoogleTranslate(title);
      }

      info = {
        zhTitle: finalZh,
        releaseDate: fetched?.releaseDate || currentDate
      };

      // 存回快取
      cache[imdbId] = info;
      
      // 限制連線頻率
      await new Promise((r) => setTimeout(r, 200));
    }

    result.push({
      ...movie,
      displayTitle: info.zhTitle || title,
      releaseDate: info.releaseDate || movie.releaseDate
    });
  }

  saveCache(cache);
  console.log(`  [資訊填充] 快取命中: ${cacheHits} 筆，新查詢: ${apiCalls} 筆`);
  return result;
}
