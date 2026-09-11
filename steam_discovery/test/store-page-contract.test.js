import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { UNKNOWN, inspectStorePageContract } from "../store-page-contract.js";

const fixture = (name) => fs.readFileSync(path.join("test", "fixtures", "store-pages", name), "utf8");

test("正常繁中頁可取得名稱、日期、標籤與語言表，但不把中文終身評價當全球評價", () => {
  const result = inspectStorePageContract(fixture("normal.html"));

  assert.equal(result.pageState, "complete");
  assert.equal(result.title, "No Man's Sky 無人深空");
  assert.equal(result.releaseDate, "2016 年 8 月 13 日");
  assert.deepEqual(result.communityTags, ["開放世界", "太空", "探索"]);
  assert.equal(result.supportTChinese, true);
  assert.equal(result.supportSChinese, UNKNOWN);
  assert.equal(result.globalLifetimeReviews, UNKNOWN);
  assert.match(result.globalLifetimeReason, /目前語言/);
});

test("契約檢查器可辨識簡體中文語言列", () => {
  const result = inspectStorePageContract('<div id="appHubAppName">測試</div><table><tr><td>繁體中文</td></tr><tr><td>簡體中文</td></tr></table>');
  assert.equal(result.supportTChinese, true);
  assert.equal(result.supportSChinese, true);
});

test("正向的免費、內購、MMO、VR 與搶先體驗訊號可各自辨識", () => {
  assert.equal(inspectStorePageContract(fixture("free.html")).isFree, true);
  assert.equal(inspectStorePageContract(fixture("in-app-purchases.html")).hasInAppPurchases, true);
  assert.equal(inspectStorePageContract(fixture("mmo.html")).hasMMO, true);
  assert.equal(inspectStorePageContract(fixture("vr-only.html")).vrMode, "only");
  assert.equal(inspectStorePageContract(fixture("vr-supported.html")).vrMode, "supported");
  assert.equal(inspectStorePageContract(fixture("early-access.html")).isEarlyAccess, true);
});

test("缺少硬性欄位訊號時維持 unknown，不退回 false", () => {
  const result = inspectStorePageContract(fixture("normal.html"));
  assert.equal(result.isFree, UNKNOWN);
  assert.equal(result.hasInAppPurchases, UNKNOWN);
  assert.equal(result.hasMMO, UNKNOWN);
  assert.equal(result.vrMode, UNKNOWN);
  assert.equal(result.isEarlyAccess, UNKNOWN);
});

test("年齡驗證與 HTTP 200 的不完整頁面一律待重試", () => {
  for (const name of ["age-gate.html", "incomplete-200.html"]) {
    const result = inspectStorePageContract(fixture(name));
    assert.equal(result.retry, true, name);
    assert.equal(result.title, UNKNOWN, name);
    assert.equal(result.isFree, UNKNOWN, name);
    assert.equal(result.globalLifetimeReviews, UNKNOWN, name);
  }
  assert.equal(inspectStorePageContract(fixture("age-gate.html")).pageState, "age_gate");
  assert.equal(inspectStorePageContract(fixture("incomplete-200.html")).pageState, "incomplete_200");
});

test("無中文名稱時保留商店標題，不自造翻譯", () => {
  const result = inspectStorePageContract(fixture("no-localized-name.html"));
  assert.equal(result.title, "Portal 2");
  assert.equal(result.supportTChinese, true);
});

test("外部 Reviews API 樣本只作對照；A1 契約檢查器沒有使用替代 Steam 端點", () => {
  const apiSample = JSON.parse(fixture("review-api-all.json"));
  assert.equal(apiSample.verificationOnly, true);
  assert.equal(apiSample.samples[0].query_summary.total_reviews > 0, true);

  const source = fs.readFileSync("store-page-contract.js", "utf8");
  assert.doesNotMatch(source, /appreviews|appdetails|search\/results/i);
});
