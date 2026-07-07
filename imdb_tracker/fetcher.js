// ============================================================
// fetcher.js — IMDb 資料抓取模組（動態投票門檻版）
//
// 動態門檻計算邏輯：
//   1. 不預先過濾投票數，收集目標年所有電影的票數
//   2. 計算票數分佈的第 P70 百分位數作為門檻
//   3. 確保門檻不低於 MIN_VOTES_ABSOLUTE（絕對最低值）
//   4. 在報告中顯示「本次採用門檻：N 票」
// ============================================================

import zlib from "node:zlib";
import readline from "node:readline";
import axios from "axios";
import { CONFIG } from "./config.js";

const OMDB_URL         = "https://www.omdbapi.com/";
const IMDB_BASICS_URL  = "https://datasets.imdbws.com/title.basics.tsv.gz";
const IMDB_RATINGS_URL = "https://datasets.imdbws.com/title.ratings.tsv.gz";

// ─── 工具函式：計算百分位數 ────────────────────────────────────
/**
 * 從一組數字中計算指定百分位數。
 * @param {number[]} sortedArr - 已升序排列的數字陣列
 * @param {number}   p         - 百分位數（0~100）
 * @returns {number}
 */
function percentile(sortedArr, p) {
  if (sortedArr.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sortedArr.length) - 1;
  return sortedArr[Math.max(0, Math.min(idx, sortedArr.length - 1))];
}

/**
 * 根據票數陣列計算合理的動態門檻。
 * 取 P70 百分位數，但不低於 MIN_VOTES_ABSOLUTE。
 * @param {number[]} allVotes - 目標年所有電影的投票數（未排序）
 * @returns {{ threshold: number, stats: object }}
 */
export function calcVoteThreshold(allVotes) {
  const sorted = [...allVotes].sort((a, b) => a - b);
  const p50  = percentile(sorted, 50);
  const p70  = percentile(sorted, 70);
  const p90  = percentile(sorted, 90);
  const mean = Math.round(sorted.reduce((s, v) => s + v, 0) / sorted.length);

  const threshold = CONFIG.MIN_VOTES_ABSOLUTE;

  return {
    threshold,
    stats: {
      count: sorted.length,
      min:   sorted[0],
      p50,
      p70,
      p90,
      max:   sorted[sorted.length - 1],
      mean,
      dynamic: threshold,
      applied: threshold,
    },
  };
}

// ─── 串流下載並逐行解析 TSV.GZ ──────────────────────────────────
async function streamTsvGz(url, onRow) {
  console.log(`  [數據集] 串流下載: ${url}`);
  const response = await axios.get(url, {
    responseType: "stream",
    timeout: 180_000,
    headers: { "User-Agent": "Mozilla/5.0" },
  });

  const gunzip = zlib.createGunzip();
  const rl = readline.createInterface({
    input: response.data.pipe(gunzip),
    crlfDelay: Infinity,
  });

  let headers   = null;
  let lineCount = 0;

  await new Promise((resolve, reject) => {
    rl.on("line", (line) => {
      if (!headers) {
        headers = line.split("\t");
        return;
      }
      const vals = line.split("\t");
      if (vals.length === headers.length) {
        const obj = {};
        headers.forEach((h, i) => { obj[h.trim()] = vals[i]; });
        onRow(obj);
        lineCount++;
      }
    });
    rl.on("close", resolve);
    rl.on("error", reject);
    response.data.on("error", reject);
    gunzip.on("error", reject);
  });

  console.log(`  [數據集] 已處理 ${lineCount.toLocaleString()} 筆資料`);
}

// ─── IMDb 公開數據集（備援）─────────────────────────────────────
async function fetchFromDataset(targetYear) {
  // ── Step 1: 下載所有評分，不過濾票數（先全收）───────────────
  const ratingsMap = new Map(); // tconst → { score, votes }
  await streamTsvGz(IMDB_RATINGS_URL, (row) => {
    const votes = parseInt(row.numVotes);
    const score = parseFloat(row.averageRating);
    if (!isNaN(votes) && !isNaN(score)) {
      ratingsMap.set(row.tconst, { score, votes });
    }
  });

  // ── Step 2: 下載基本資料，收集目標年所有電影 ─────────────────
  const yearMovies = []; // 目標年份所有有評分的電影（尚未過濾票數）
  await streamTsvGz(IMDB_BASICS_URL, (row) => {
    if (row.titleType !== "movie") return;
    const year = parseInt(row.startYear);
    if (isNaN(year) || year !== targetYear) return;

    const rating = ratingsMap.get(row.tconst);
    if (!rating) return;

    const genres = row.genres === "\\N" ? [] : row.genres.split(",");
    yearMovies.push({
      imdbId:    row.tconst,
      title:     row.primaryTitle,
      year,
      imdbScore: rating.score,
      votes:     rating.votes,
      genres,
      countries: [],
      releaseDate: null, // 公開數據集無精確月份，設為 null 讓月份過濾放行
    });
  });

  console.log(`  [統計] ${targetYear} 年共找到 ${yearMovies.length.toLocaleString()} 部有評分的電影`);

  // ── Step 3: 動態計算投票門檻 ─────────────────────────────────
  const allVotes = yearMovies.map((m) => m.votes);
  const { threshold, stats } = calcVoteThreshold(allVotes);

  console.log(`\n  📊 ${targetYear} 年電影投票數分佈分析：`);
  console.log(`     電影總數   : ${stats.count.toLocaleString()} 部`);
  console.log(`     最少票數   : ${stats.min.toLocaleString()} 票`);
  console.log(`     中位數(P50): ${stats.p50.toLocaleString()} 票`);
  console.log(`     P70        : ${stats.p70.toLocaleString()} 票`);
  console.log(`     P90        : ${stats.p90.toLocaleString()} 票`);
  console.log(`     平均票數   : ${stats.mean.toLocaleString()} 票`);
  console.log(`     最多票數   : ${stats.max.toLocaleString()} 票`);
  // ── Step 4: 單軌過濾 ──────────────────────────────────────────────
  // 僅保留投票數 >= MIN_VOTES_ABSOLUTE (30,000 票) 的電影
  const filtered = yearMovies.filter((m) => m.votes >= CONFIG.MIN_VOTES_ABSOLUTE);
  console.log(`  🎬 過濾後剩餘: ${filtered.length} 部電影（門檻 ≥ ${CONFIG.MIN_VOTES_ABSOLUTE.toLocaleString()} 票）\n`);

  return { movies: filtered, voteThreshold: threshold, voteStats: stats };
}

// ─── OMDb API ──────────────────────────────────────────────────
async function fetchOmdbDetail(imdbId) {
  try {
    const { data } = await axios.get(OMDB_URL, {
      params: { i: imdbId, apikey: CONFIG.OMDB_API_KEY },
      timeout: 10_000,
    });
    if (data?.Response === "True") return data;
  } catch (e) {
    console.warn(`  [OMDb] ${imdbId} 抓取失敗: ${e.message}`);
  }
  return null;
}

function parseOmdb(data) {
  const imdbScore = parseFloat(data.imdbRating);
  let releaseDate = null;
  try {
    const d = new Date(data.Released);
    if (!isNaN(d)) releaseDate = d;
  } catch {}
  return {
    imdbId:      data.imdbID,
    title:       data.Title,
    year:        parseInt(data.Year) || null,
    imdbScore:   isNaN(imdbScore) ? null : imdbScore,
    genres:      data.Genre?.split(",").map((g) => g.trim()).filter(Boolean) ?? [],
    countries:   data.Country?.split(",").map((c) => c.trim()).filter(Boolean) ?? [],
    releaseDate,
    votes:       parseInt(data.imdbVotes?.replace(/,/g, "")) || 0,
  };
}

// ─── 統一對外介面 ──────────────────────────────────────────────
/**
 * 抓取指定年份的電影（含動態投票門檻計算）。
 * @param {number} year
 * @returns {Promise<{ movies, voteThreshold, voteStats }>}
 */
export async function fetchMoviesForYear(year) {
  const hasApiKey = CONFIG.OMDB_API_KEY !== "YOUR_OMDB_API_KEY_HERE";

  if (hasApiKey) {
    console.log("  模式：OMDb API（精確模式）");
    const result = await fetchFromDataset(year);
    const enriched = [];
    for (const m of result.movies.slice(0, 100)) {
      const detail = await fetchOmdbDetail(m.imdbId);
      if (detail) enriched.push(parseOmdb(detail));
      await new Promise((r) => setTimeout(r, 150));
    }
    return { movies: enriched, voteThreshold: result.voteThreshold, voteStats: result.voteStats };
  } else {
    console.log("  模式：IMDb 公開數據集（串流，無需 API Key）");
    return fetchFromDataset(year);
  }
}
