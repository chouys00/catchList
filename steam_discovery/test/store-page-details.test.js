import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { UNKNOWN, parseStorePageDetails, STORE_PAGE_PARSER_VERSION } from "../store-page-details.js";

const fixture = (name) => fs.readFileSync(path.join("test", "fixtures", "store-pages", name), "utf8");

test("完整頁面保留正向訊號，未出現的排除訊號判定為否", () => {
  const normal = parseStorePageDetails(fixture("normal.html"), { appid: 275850 });
  assert.equal(normal.parserVersion, STORE_PAGE_PARSER_VERSION);
  assert.equal(normal.title, "No Man's Sky 無人深空");
  assert.deepEqual(normal.communityTags, ["開放世界", "太空", "探索"]);
  assert.equal(normal.supportTChinese, true);
  assert.equal(normal.supportSChinese, UNKNOWN);
  assert.equal(normal.isFree, false);
  assert.equal(normal.hasInAppPurchases, false);
  assert.equal(normal.hasMMO, false);
  assert.equal(normal.vrMode, "none");
  assert.equal(normal.isEarlyAccess, false);
  assert.equal(parseStorePageDetails(fixture("free.html"), { appid: 730 }).isFree, true);
  assert.equal(parseStorePageDetails(fixture("in-app-purchases.html"), { appid: 381210 }).hasInAppPurchases, true);
  assert.equal(parseStorePageDetails(fixture("mmo.html"), { appid: 306130 }).hasMMO, true);
  assert.equal(parseStorePageDetails(fixture("vr-only.html"), { appid: 546560 }).vrMode, "only");
  assert.equal(parseStorePageDetails(fixture("vr-supported.html"), { appid: 242760 }).vrMode, "supported");
  assert.equal(parseStorePageDetails(fixture("early-access.html"), { appid: 108600 }).isEarlyAccess, true);
  assert.equal(parseStorePageDetails(fixture("no-localized-name.html"), { appid: 620 }).title, "Portal 2");
});

test("繁中頁可分別辨識繁體與簡體中文支援", () => {
  const result = parseStorePageDetails('<div id="appHubAppName">測試</div><table><tr><td>繁體中文</td></tr><tr><td>簡體中文</td></tr></table>', { appid: 5 });
  assert.equal(result.supportTChinese, true);
  assert.equal(result.supportSChinese, true);
});

test("年齡驗證與不完整頁面可直接排除，HTTP 錯誤仍可重試", () => {
  const ageGate = parseStorePageDetails(fixture("age-gate.html"), { appid: 1 });
  const incomplete = parseStorePageDetails(fixture("incomplete-200.html"), { appid: 2 });
  assert.equal(ageGate.pageState, "age_gate");
  assert.equal(ageGate.retry, false);
  assert.equal(incomplete.pageState, "incomplete_200");
  assert.equal(incomplete.retry, false);
  const failure = parseStorePageDetails("", { appid: 3, status: 503 });
  assert.equal(failure.pageState, "http_error");
  assert.equal(failure.retry, true);
  assert.equal(failure.hasMMO, UNKNOWN);
});

test("標籤有 data-tagid 時優先保留穩定 ID", () => {
  const result = parseStorePageDetails('<div id="appHubAppName">測試</div><a class="app_tag" data-tagid="492">獨立製作</a>', { appid: 4 });
  assert.deepEqual(result.tagRecords, [{ id: "492", name: "獨立製作" }]);
});
