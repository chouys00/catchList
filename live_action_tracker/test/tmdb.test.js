import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { DEFAULT_CACHE_FILE, TmdbClient } from "../sources/tmdb.js";

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function cachePath() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "catchlist-tmdb-")), "cache.json");
}

test("缺少權杖時在 transport 呼叫前失敗", () => {
  let calls = 0;
  assert.throws(() => new TmdbClient({
    env: {},
    transport: async () => { calls += 1; }
  }), /缺少 TMDB_API_TOKEN/);
  assert.equal(calls, 0);
});

test("預設快取位置不受 npm workspace 工作目錄影響", () => {
  const client = new TmdbClient({ env: { TMDB_API_TOKEN: "fixture" } });
  assert.equal(client.cacheFile, DEFAULT_CACHE_FILE);
  assert.equal(DEFAULT_CACHE_FILE, path.join(PACKAGE_ROOT, ".cache", "tmdb.json"));
});

test("discover 完整翻頁並在最後一頁停止", async () => {
  const pages = [];
  const client = new TmdbClient({
    env: { TMDB_API_TOKEN: "fixture" },
    cacheFile: cachePath(),
    transport: async (_url, options) => {
      pages.push(options.params.page);
      const page = Number(options.params.page);
      return { data: { results: [{ id: page }], page, total_pages: 3 } };
    }
  });
  const results = await client.discoverMonth({
    startDate: "2025-01-01", endDate: "2025-01-31", originCountries: ["KR"]
  });
  assert.deepEqual(pages, ["1", "2", "3"]);
  assert.deepEqual(results.map((item) => item.id), [1, 2, 3]);
});

test("429 與 5xx 依指數間隔重試，成功後才寫快取", async () => {
  let calls = 0;
  const waits = [];
  const file = cachePath();
  const client = new TmdbClient({
    env: { TMDB_API_TOKEN: "fixture" }, cacheFile: file, cacheFlushEvery: 1, baseDelayMs: 10,
    sleep: async (ms) => waits.push(ms),
    transport: async () => {
      calls += 1;
      if (calls < 3) {
        const error = new Error("temporary");
        error.response = { status: calls === 1 ? 429 : 503 };
        throw error;
      }
      return { data: { ok: true } };
    }
  });
  assert.deepEqual(await client.request("/test"), { ok: true });
  assert.equal(calls, 3);
  assert.deepEqual(waits, [10, 20]);
  assert.doesNotMatch(fs.readFileSync(file, "utf8"), /test-token/);
});

test("非暫時性錯誤不重試也不寫入快取", async () => {
  let calls = 0;
  const file = cachePath();
  const client = new TmdbClient({
    env: { TMDB_API_TOKEN: "fixture" }, cacheFile: file,
    transport: async () => {
      calls += 1;
      const error = new Error("not found");
      error.response = { status: 404 };
      throw error;
    }
  });
  await assert.rejects(client.request("/missing"), /not found/);
  assert.equal(calls, 1);
  assert.equal(fs.existsSync(file), false);
});

test("有效快取直接命中，過期後重新查詢", async () => {
  let clock = 1_000;
  let calls = 0;
  const file = cachePath();
  const options = {
    env: { TMDB_API_TOKEN: "fixture" }, cacheFile: file, cacheTtlMs: 100, cacheFlushEvery: 1,
    now: () => clock,
    transport: async () => ({ data: { sequence: ++calls } })
  };
  const client = new TmdbClient(options);
  assert.equal((await client.request("/cached")).sequence, 1);
  assert.equal((await client.request("/cached")).sequence, 1);
  clock = 1_101;
  assert.equal((await client.request("/cached")).sequence, 2);
});

test("快取採批次原子寫入並在明確 flush 後落盤", async () => {
  const file = cachePath();
  const client = new TmdbClient({
    env: { TMDB_API_TOKEN: "fixture" }, cacheFile: file, cacheFlushEvery: 2,
    transport: async (url) => ({ data: { endpoint: new URL(url).pathname } })
  });
  await client.request("/first");
  assert.equal(fs.existsSync(file), false);
  await client.request("/second");
  assert.equal(Object.keys(JSON.parse(fs.readFileSync(file, "utf8"))).length, 2);
  assert.equal(fs.existsSync(`${file}.${process.pid}.tmp`), false);
  await client.request("/third");
  client.flushCache();
  assert.equal(Object.keys(JSON.parse(fs.readFileSync(file, "utf8"))).length, 3);
});

test("discover 缺必要欄位時明確失敗", async () => {
  const file = cachePath();
  const client = new TmdbClient({
    env: { TMDB_API_TOKEN: "fixture" }, cacheFile: file,
    transport: async () => ({ data: { page: 1 } })
  });
  await assert.rejects(client.discoverMonth({
    startDate: "2025-01-01", endDate: "2025-01-31", originCountries: ["JP"]
  }), /缺少 results 或 total_pages/);
  assert.equal(fs.existsSync(file), false);
});

test("details、translations 與 external IDs 正規化成固定契約", async () => {
  const responses = new Map([
    ["/tv/42", { id: 42, original_name: "Original", first_air_date: "2025-01-02", origin_country: ["TW"], genres: [{ id: 18, name: "Drama" }], type: "Scripted", number_of_episodes: 10, vote_average: 8.2, vote_count: 88 }],
    ["/tv/42/translations", { translations: [{ iso_3166_1: "TW", data: { name: "中文名" } }] }],
    ["/tv/42/external_ids", { imdb_id: "tt42", wikidata_id: "Q42" }]
  ]);
  const client = new TmdbClient({
    env: { TMDB_API_TOKEN: "fixture" }, cacheFile: cachePath(),
    transport: async (url) => ({ data: responses.get(new URL(url).pathname.replace("/3", "")) })
  });
  const candidate = await client.getCandidate({ id: 42, genre_ids: [18] });
  assert.equal(candidate.tmdbId, 42);
  assert.deepEqual(candidate.originCountries, ["TW"]);
  assert.deepEqual(candidate.genreNames, ["Drama"]);
  assert.equal(candidate.externalIds.imdbId, "tt42");
  assert.equal(candidate.translations[0].data.name, "中文名");
});

test("劇集串流供應商查詢保留各國資料，無效回應明確失敗", async () => {
  const client = new TmdbClient({
    env: { TMDB_API_TOKEN: "fixture" }, cacheFile: cachePath(),
    transport: async () => ({ data: { id: 42, results: { TW: { flatrate: [{ provider_name: "Netflix" }] } } } })
  });
  assert.deepEqual(await client.getWatchProviders(42), { id: 42, results: { TW: { flatrate: [{ provider_name: "Netflix" }] } } });
  await assert.rejects(client.getWatchProviders(0), /缺少正整數 id/);
});
