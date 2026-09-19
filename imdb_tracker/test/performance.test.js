import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { gzipSync } from "node:zlib";
import { fetchFromDataset } from "../fetcher.js";
import { applyConversion, prepareMovieCandidates, runMovieUpdate } from "../main.js";
import { buildInternationalIdSet } from "../region_filter.js";

test("票數提前篩選保留邊界、多年份、類型與原順序", async () => {
  const ratings = Array.from({ length: 1000 }, (_, i) => ({ tconst: `tt${i}`, numVotes: String(i % 3 === 0 ? 30000 : 29999), averageRating: "7.8" }));
  ratings.push({ tconst: "invalid", numVotes: "bad", averageRating: "8" });
  const basics = ratings.map((r, i) => ({ tconst: r.tconst, titleType: i % 7 === 0 ? "tvSeries" : "movie", startYear: String(2023 + i % 3), primaryTitle: r.tconst, genres: "Drama" }));
  const calls = [];
  const actual = await fetchFromDataset(new Set([2023, 2024]), { stream: async (url, onRow) => { calls.push(url); (url.includes("ratings") ? ratings : basics).forEach(onRow); } });
  const oldRatings = new Map(ratings.filter(r => !isNaN(parseInt(r.numVotes)) && !isNaN(parseFloat(r.averageRating))).map(r => [r.tconst, r]));
  for (const year of [2023, 2024]) {
    const expected = basics.filter(b => b.titleType === "movie" && Number(b.startYear) === year && Number(oldRatings.get(b.tconst)?.numVotes) >= 30000).map(b => b.tconst);
    assert.deepEqual(actual.get(year).map(m => m.imdbId), expected);
  }
  assert.equal(calls.length, 2);
});

test("提前評分篩選與原寫入門檻相同，保留國別與類型加分", async () => {
  const movies = [
    { imdbId: "tt1", title: "Drama", imdbScore: 6.9, genres: ["Drama"], countries: [] },
    { imdbId: "tt2", title: "China", imdbScore: 6.3, genres: [], countries: ["Taiwan"] },
    { imdbId: "tt3", title: "Animation", imdbScore: 6.7, genres: ["Animation"], countries: [] },
    { imdbId: "tt4", title: "Low", imdbScore: 6.7, genres: [], countries: [] },
    { imdbId: "tt5", title: "Missing", imdbScore: null, genres: [], countries: [] },
  ];
  const expected = applyConversion(movies).filter(m => m.doubanEstimated >= 7);
  const actual = await prepareMovieCandidates(new Set([2024]), { fetchMovies: async () => new Map([[2024, movies]]) });
  assert.deepEqual(actual.get(2024), expected);
  assert.deepEqual(actual.get(2024).map(m => m.imdbId), ["tt1", "tt2", "tt3"]);
});

test("候選地區索引與完整舊索引交集相同，涵蓋僑民語言和群組", async () => {
  const rows = ["titleId\tordering\ttitle\tregion\tlanguage", "tt1\t1\ta\tTW\tzh", "tt2\t1\ta\tUS\ten", "tt2\t2\ta\tGB\ten", "tt3\t1\ta\tUS\tta", "tt3\t2\ta\tJP\tja", "tt4\t1\ta\tHK\tzh", "tt4\t2\ta\tKR\tko", "tt5\t1\ta\tUS\ten", "tt5\t2\ta\tFR\tfr", "other\t1\ta\tTW\tzh"];
  const requester = async () => ({ data: Readable.from([gzipSync(rows.join("\n"))]) });
  const candidates = new Set(["tt1", "tt2", "tt3", "tt4", "tt5"]);
  const full = await buildInternationalIdSet(null, { requester });
  const targeted = await buildInternationalIdSet(candidates, { requester });
  assert.deepEqual([...targeted].sort(), [...full].filter(id => candidates.has(id)).sort());
  assert.deepEqual([...targeted].sort(), ["tt1", "tt4", "tt5"]);
  assert.deepEqual(await buildInternationalIdSet(new Set(), { requester: () => { throw Error("不應下載"); } }), new Set());
});

test("完整月份流程僅翻譯合格候選、逐月寫入且已有月份完全不請求", async () => {
  const source = [
    { imdbId: "tt1", title: "入選", imdbScore: 8, genres: [], countries: [], releaseDate: "2026-02-05" },
    { imdbId: "tt2", title: "低分", imdbScore: 5, genres: [], countries: [], releaseDate: "2026-02-05" },
    { imdbId: "tt3", title: "無地區", imdbScore: 9, genres: [], countries: [], releaseDate: "2026-03-05" },
    { imdbId: "tt4", title: "三月", imdbScore: 8, genres: [], countries: [], releaseDate: "2026-03-06" },
  ];
  const written = [], requested = [];
  const options = {
    now: () => new Date(2026, 8, 16), log() {}, loadSections: () => new Map([["2026-01", "existing"]]),
    fetchMovies: async years => { assert.deepEqual([...years], [2026]); requested.push("dataset"); return new Map([[2026, source]]); },
    buildRegions: async ids => { assert.deepEqual([...ids], ["tt1", "tt3", "tt4"]); return new Set(["tt1", "tt4"]); },
    enrich: async movies => { requested.push(...movies.map(m => m.imdbId)); return movies; },
    writeReport: months => written.push(...months),
  };
  await runMovieUpdate(options);
  assert.deepEqual(requested, ["dataset", "tt1", "tt4"]);
  assert.deepEqual(written.map(m => [m.month, m.movies.map(x => x.imdbId)]), [[2, ["tt1"]], [3, ["tt4"]]]);
  for (const month of written) {
    const original = applyConversion(source).filter(m => ["tt1", "tt4"].includes(m.imdbId) && new Date(m.releaseDate).getMonth()+1 === month.month && m.doubanEstimated >= 7);
    assert.deepEqual(month.movies, original);
  }
  await runMovieUpdate({ ...options, loadSections: () => new Map([["2026-01", ""], ["2026-02", ""], ["2026-03", ""]]), fetchMovies: () => { throw Error("不應請求"); }, writeReport: () => { throw Error("不應寫入"); } });
  let count = 0;
  await assert.rejects(() => runMovieUpdate({ ...options, writeReport() { if (++count === 2) throw Error("disk full"); } }), /disk full/);
  assert.equal(count, 2);
});
