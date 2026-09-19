// ============================================================
// fetcher.js — IMDb 資料抓取模組(單趟串流多年份版)
//
// 無論本次要回補幾個年份,IMDb 兩個公開數據集都只下載一次,
// 在同一趟串流中收集所有目標年份的電影。
// ============================================================

import zlib from "node:zlib";
import readline from "node:readline";
import axios from "axios";
import { delay } from "@catchlist/core";
import { CONFIG } from "./config.js";

const OMDB_URL         = "https://www.omdbapi.com/";
const IMDB_BASICS_URL  = "https://datasets.imdbws.com/title.basics.tsv.gz";
const IMDB_RATINGS_URL = "https://datasets.imdbws.com/title.ratings.tsv.gz";

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

// ─── IMDb 公開數據集:一趟收集所有目標年份 ──────────────────────
/**
 * @param {Set<number>} targetYears
 * @returns {Promise<Map<number, Array>>} year → 過濾後的電影清單
 */
export async function fetchFromDataset(targetYears, { stream = streamTsvGz, minVotes = CONFIG.MIN_VOTES_ABSOLUTE } = {}) {
  // ── Step 1: 下載所有評分 ─────────────────────────────────────
  const ratingsMap = new Map(); // tconst → { score, votes }
  await stream(IMDB_RATINGS_URL, (row) => {
    const votes = parseInt(row.numVotes);
    const score = parseFloat(row.averageRating);
    if (!isNaN(votes) && !isNaN(score) && votes >= minVotes) {
      ratingsMap.set(row.tconst, { score, votes });
    }
  });

  // ── Step 2: 下載基本資料,同一趟收集所有目標年份的電影 ─────────
  const byYear = new Map(); // year → movies[]
  for (const y of targetYears) byYear.set(y, []);

  await stream(IMDB_BASICS_URL, (row) => {
    if (row.titleType !== "movie") return;
    const year = parseInt(row.startYear);
    if (isNaN(year) || !byYear.has(year)) return;

    const rating = ratingsMap.get(row.tconst);
    if (!rating) return;

    const genres = row.genres === "\\N" ? [] : row.genres.split(",");
    byYear.get(year).push({
      imdbId:    row.tconst,
      title:     row.primaryTitle,
      year,
      imdbScore: rating.score,
      votes:     rating.votes,
      genres,
      countries: [],
      releaseDate: null, // 公開數據集無精確月份,由 translator 補上
    });
  });

  // ── Step 3: 逐年過濾投票門檻 ─────────────────────────────────
  for (const [year, movies] of byYear) {
    const filtered = movies;
    console.log(
      `  🎬 ${year} 年:共 ${movies.length.toLocaleString()} 部達投票門檻電影,` +
      `過濾後剩餘 ${filtered.length} 部(門檻 ≥ ${CONFIG.MIN_VOTES_ABSOLUTE.toLocaleString()} 票)`
    );
    byYear.set(year, filtered);
  }

  return byYear;
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
 * 一次抓取多個年份的電影(數據集只串流一趟)。
 * @param {Set<number>} years
 * @returns {Promise<Map<number, Array>>} year → movies
 */
export async function fetchMoviesForYears(years) {
  const hasApiKey = CONFIG.OMDB_API_KEY !== "YOUR_OMDB_API_KEY_HERE";
  const byYear = await fetchFromDataset(years);

  if (hasApiKey) {
    console.log("  模式:OMDb API(精確模式)");
    for (const [year, movies] of byYear) {
      const enriched = [];
      for (const m of movies.slice(0, 100)) {
        const detail = await fetchOmdbDetail(m.imdbId);
        if (detail) enriched.push(parseOmdb(detail));
        await delay(150);
      }
      byYear.set(year, enriched);
    }
  } else {
    console.log("  模式:IMDb 公開數據集(串流,無需 API Key)");
  }

  return byYear;
}
