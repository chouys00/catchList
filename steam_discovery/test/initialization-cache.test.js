import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createInitializationCache } from "../initialization-cache.js";
import { getStorePageDetails } from "../store-page-fetcher.js";

const tempCache = () => fs.mkdtempSync(path.join(os.tmpdir(), "steam-initialization-cache-"));
const normalHtml = '<div id="appHubAppName">快取測試</div><div class="release_date"><div class="date">2020 年 1 月 1 日</div></div>';

test("成功頁面只請求一次，第二次執行重用結構化快取", async () => {
  const cache = createInitializationCache(tempCache());
  let requests = 0;
  const requester = async () => {
    requests += 1;
    return { status: 200, headers: {}, data: normalHtml };
  };
  const first = await getStorePageDetails(101, { cache, requester, wait: async () => {}, now: () => "2026-09-08T00:00:00.000Z" });
  const second = await getStorePageDetails(101, { cache, requester: async () => { throw new Error("不應請求"); }, wait: async () => {} });
  assert.equal(first.source, "network");
  assert.equal(second.source, "structured_cache");
  assert.equal(requests, 1);
  assert.equal(cache.loadProgress().entries["101"].state, "success");
});

test("商店頁請求包含非個人化的成人確認 Cookie", async () => {
  const cache = createInitializationCache(tempCache());
  let requestOptions;
  await getStorePageDetails(109, {
    cache,
    requester: async (_url, options) => {
      requestOptions = options;
      return { status: 200, headers: {}, data: normalHtml };
    },
    wait: async () => {}
  });
  assert.match(requestOptions.headers.Cookie, /birthtime=315532801/);
  assert.match(requestOptions.headers.Cookie, /lastagecheckage=1-January-1980/);
  assert.match(requestOptions.headers.Cookie, /wants_mature_content=1/);
});

test("解析器版本變更時可離線重解析原始快取", async () => {
  const cache = createInitializationCache(tempCache());
  cache.saveRaw(102, { html: normalHtml, fetchedAt: "2026-09-08T00:00:00.000Z" });
  const result = await getStorePageDetails(102, { cache, parserVersion: 999, requester: async () => { throw new Error("不應請求"); }, wait: async () => {} });
  assert.equal(result.source, "raw_cache");
  assert.equal(cache.loadStructured(102, 999)?.details.title, "快取測試");
});

test("網路與 HTTP 類錯誤各記錄可續跑狀態", async () => {
  const cache = createInitializationCache(tempCache());
  const rateLimited = Object.assign(new Error("too many"), { response: { status: 429 } });
  await assert.rejects(() => getStorePageDetails(103, { cache, requester: async () => { throw rateLimited; }, wait: async () => {} }));
  assert.equal(cache.loadProgress().entries["103"].state, "retry");
  assert.equal(cache.loadProgress().entries["103"].reason, "http_429");
  assert.deepEqual(cache.pendingAppids([103, 104]), ["103", "104"]);
});

test("5xx 與逾時分別記錄可續跑原因", async () => {
  const cache = createInitializationCache(tempCache());
  const serverError = Object.assign(new Error("server"), { response: { status: 503 } });
  await assert.rejects(() => getStorePageDetails(106, { cache, requester: async () => { throw serverError; }, wait: async () => {} }));
  assert.equal(cache.loadProgress().entries["106"].reason, "http_503");
  await assert.rejects(() => getStorePageDetails(107, { cache, requester: async () => { throw new Error("timeout"); }, wait: async () => {} }));
  assert.equal(cache.loadProgress().entries["107"].reason, "network_error");
});

test("成人確認後仍出現年齡頁時會快取並標記為終止狀態", async () => {
  const cache = createInitializationCache(tempCache());
  const result = await getStorePageDetails(105, {
    cache,
    requester: async () => ({ status: 200, headers: {}, data: '<div id="agegate_box">請輸入您的出生日期</div>' }),
    wait: async () => {}
  });
  assert.equal(result.details.pageState, "age_gate");
  assert.equal(cache.loadProgress().entries["105"].state, "success");
  assert.equal(cache.loadRaw(105).html.includes("agegate_box"), true);
});

test("待重試的原始快取不會阻止下一次商店頁請求", async () => {
  const cache = createInitializationCache(tempCache());
  cache.saveRaw(108, { html: '<div id="agegate_box">請輸入您的出生日期</div>', fetchedAt: "2026-09-08T00:00:00.000Z" });
  cache.recordProgress(108, { state: "retry", reason: "age_gate", attempts: 1 });
  let requests = 0;
  const result = await getStorePageDetails(108, {
    cache,
    requester: async () => {
      requests += 1;
      return { status: 200, headers: {}, data: normalHtml };
    },
    wait: async () => {}
  });
  assert.equal(requests, 1);
  assert.equal(result.source, "network");
  assert.equal(result.details.title, "快取測試");
});

test("成人確認後仍出現年齡頁時不會重複請求", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "store-retry-structured-"));
  const cache = createInitializationCache(root);
  let requests = 0;
  const requester = async () => {
    requests += 1;
    return { status: 200, headers: {}, data: '<div id="agegate_box">請輸入您的出生日期</div>' };
  };
  await getStorePageDetails(1196590, { cache, requester, wait: async () => {} });
  await getStorePageDetails(1196590, { cache, requester, wait: async () => {} });
  assert.equal(requests, 1);
  assert.equal(cache.loadProgress().entries["1196590"].state, "success");
});

test("進度沿用舊格式，未合併日誌重啟後可恢復成功與重試狀態", () => {
  const root = tempCache();
  fs.writeFileSync(path.join(root, "progress.json"), JSON.stringify({ version: 1, entries: { 1: { state: "success" } } }));
  const first = createInitializationCache(root);
  first.recordProgress(2, { state: "retry", attempts: 1 });
  first.recordProgress(3, { state: "success", attempts: 1 });
  assert.equal(Object.keys(JSON.parse(fs.readFileSync(path.join(root, "progress.json"))).entries).length, 1);
  const resumed = createInitializationCache(root);
  assert.deepEqual(resumed.pendingAppids([1, 2, 3, 4]), ["2", "4"]);
  resumed.flush();
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, "progress.json"))).entries[3].state, "success");
  assert.equal(fs.existsSync(path.join(root, "progress.json.journal")), false);
});
