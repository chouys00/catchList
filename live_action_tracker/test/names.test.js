import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createWikidataNameResolver, fetchWikidataLabels, selectTraditionalChineseName, selectWikidataName } from "../names.js";

function candidate(translations, originalName = "原始名") { return { tmdbId: 1, originalName, translations }; }

test("名稱優先序為 TMDb zh-TW、zh-HK、Wikidata、原名", () => {
  const translations = [{ iso_639_1: "zh", iso_3166_1: "HK", data: { name: "港名" } }, { iso_639_1: "zh", iso_3166_1: "TW", data: { name: "台名" } }];
  assert.deepEqual(selectTraditionalChineseName(candidate(translations), "維基名"), { displayName: "台名", nameSource: "tmdb-zh-tw" });
  assert.deepEqual(selectTraditionalChineseName(candidate([]), "維基名"), { displayName: "維基名", nameSource: "wikidata" });
  assert.deepEqual(selectTraditionalChineseName(candidate([]), null), { displayName: "原始名", nameSource: "original" });
});

test("Wikidata 失敗保留原名，成功結果會快取", async () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "catchlist-wiki-")), "names.json");
  let calls = 0;
  const resolve = createWikidataNameResolver({ cacheFile: file, fetchName: async () => { calls += 1; return { "zh-tw": { value: "維基名" } }; } });
  assert.equal(await resolve("Q1"), "維基名");
  assert.equal(await resolve("Q1"), "維基名");
  assert.equal(calls, 1);
  const fail = createWikidataNameResolver({ cacheFile: path.join(path.dirname(file), "fail.json"), fetchName: async () => { throw new Error("限流"); } });
  assert.equal(await fail("Q2"), null);
  assert.deepEqual(selectTraditionalChineseName(candidate([]), null).displayName, "原始名");
});

test("Wikidata 名稱嚴格依 zh-tw、zh-hant、zh-hk 選擇", () => {
  assert.equal(selectWikidataName({
    "zh-hk": { value: "香港名" },
    "zh-hant": { value: "繁中名" },
    "zh-tw": { value: "台灣名" },
    zh: { value: "簡體名" }
  }), "台灣名");
  assert.equal(selectWikidataName({ "zh-hk": "香港名", "zh-hant": "繁中名" }), "繁中名");
  assert.equal(selectWikidataName({ zh: "非允許備援" }), null);
});

test("Wikidata 查詢只要求規格允許的繁中語系", async () => {
  let options;
  const labels = await fetchWikidataLabels("Q42", { transport: async (_url, requestOptions) => {
    options = requestOptions;
    return { data: { entities: { Q42: { labels: { "zh-tw": { value: "測試名" } } } } } };
  } });
  assert.equal(options.params.languages, "zh-tw|zh-hant|zh-hk");
  assert.equal(labels["zh-tw"].value, "測試名");
});

test("Wikidata 遇到 429 與 5xx 依指數間隔重試", async () => {
  let calls = 0;
  const waits = [];
  const labels = await fetchWikidataLabels("Q42", {
    baseDelayMs: 10,
    sleep: async (ms) => waits.push(ms),
    transport: async () => {
      calls += 1;
      if (calls < 3) {
        const error = new Error("temporary");
        error.response = { status: calls === 1 ? 429 : 503 };
        throw error;
      }
      return { data: { entities: { Q42: { labels: { "zh-tw": { value: "成功名" } } } } } };
    }
  });
  assert.equal(labels["zh-tw"].value, "成功名");
  assert.equal(calls, 3);
  assert.deepEqual(waits, [10, 20]);
});

test("Wikidata 非暫時性錯誤不重試", async () => {
  let calls = 0;
  await assert.rejects(fetchWikidataLabels("Q42", { transport: async () => {
    calls += 1;
    const error = new Error("not found");
    error.response = { status: 404 };
    throw error;
  } }), /not found/);
  assert.equal(calls, 1);
});
