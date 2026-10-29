import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { GameRefreshService } from "../src/game-refresh-service.js";
import { GAME_REFRESH_FILE } from "../src/game-refresh-store.js";
import { loadLibrary, setFavorite, hideEntry, loadHiddenEntries } from "../src/library.js";
import { addManualRecord } from "../src/manual-games.js";
import { lookupSteamStats, lookupSteamGame, parseReviewSummary } from "../src/steam-game-lookup.js";

const report = `2025  9月  (更新時間: 2026-03-01)\n\n- **原有名稱** (Test)\n  2025-09-02 | 97% (12,345) | 動作\n  社群標籤: 策略\n  https://store.steampowered.com/app/123\n\n------------------------------\n`;
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "catchlist-refresh-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, "遊戲.md"), report);
  return dir;
}
const stats = { score: 81, reviews: 45678, tags: ["探索", "冒險"] };

test("單款更新持久保存三欄，保留報告、識別碼、名稱、分類與收藏", async t => {
  const dir = fixture(t); const before = loadLibrary(dir, "games").entries[0];
  setFavorite(dir, "games", before.id, true, "shared");
  const service = new GameRefreshService({ lookup: async () => stats });
  await service.refresh(dir, "123");
  const after = loadLibrary(dir, "games").entries[0];
  assert.deepEqual([after.score, after.reviews, after.tags], [81, 45678, stats.tags]);
  assert.equal(after.id, before.id); assert.equal(after.title, before.title);
  assert.equal(after.favoriteKind, "shared"); assert.ok(after.statsUpdatedAt);
  assert.equal(fs.readFileSync(path.join(dir, "遊戲.md"), "utf8"), report);
  hideEntry(dir, "games", after.id, "backlog");
  assert.equal(loadHiddenEntries(dir)[0].entry.score, 81);
  assert.equal(loadHiddenEntries(dir)[0].reason, "backlog");
});

test("手動收錄也能更新；失敗、空標籤及毀損檔不覆蓋原資料", async t => {
  const dir = fixture(t);
  addManualRecord(dir, { appid: "456", title: "手動", addedAt: new Date().toISOString(), fetchedAt: new Date().toISOString(), score: null, reviews: 0, tags: [], genres: [], chineseSupport: "unknown", releaseDate: null, releaseLabel: "尚未發售" }, null);
  await new GameRefreshService({ lookup: async () => stats }).refresh(dir, "456");
  assert.equal(loadLibrary(dir, "games").entries.find(e => e.appid === "456").reviews, stats.reviews);
  const file = path.join(dir, GAME_REFRESH_FILE); const raw = fs.readFileSync(file, "utf8");
  await assert.rejects(new GameRefreshService({ lookup: async () => { throw new Error("逾時"); } }).refresh(dir, "456"), /逾時/);
  await assert.rejects(new GameRefreshService({ lookup: async () => ({ ...stats, tags: [] }) }).refresh(dir, "456"), /不完整/);
  assert.equal(fs.readFileSync(file, "utf8"), raw);
  fs.writeFileSync(file, "broken");
  await assert.rejects(new GameRefreshService({ lookup: async () => stats }).refresh(dir, "456"), /格式不正確/);
  assert.equal(fs.readFileSync(file, "utf8"), "broken");
});

test("更新防重複、限流退避與不存在遊戲保護", async t => {
  const dir = fixture(t); let finish; let now = 10000;
  const service = new GameRefreshService({ now: () => now, lookup: () => new Promise(resolve => { finish = resolve; }) });
  const pending = service.refresh(dir, "123");
  await assert.rejects(service.refresh(dir, "123"), /稍候/);
  finish(stats); await pending;
  await assert.rejects(service.refresh(dir, "123"), /稍候/);
  await assert.rejects(service.refresh(dir, "999"), /不在/);
  now += 2000; service.lookup = async () => { throw new Error("Steam 暫時限制請求"); };
  await assert.rejects(service.refresh(dir, "123"), /限制請求/);
  now += 59999; await assert.rejects(service.refresh(dir, "123"), /稍候/);
  now += 1; service.lookup = async () => ({ score: null, reviews: 0, tags: ["冒險"] });
  await service.refresh(dir, "123"); assert.equal(loadLibrary(dir, "games").entries[0].reviews, 0);
});

test("確認後重新讀取期間取消或資料夾失效，不保存過期結果", async t => {
  const dir = fixture(t);
  for (const cancelled of [false, true]) {
    let finish;
    const controller = new AbortController(); let valid = true;
    const service = new GameRefreshService({ lookup: () => new Promise(resolve => { finish = resolve; }) });
    const pending = service.refresh(dir, "123", { signal: controller.signal, valid: () => valid });
    if (cancelled) controller.abort(); else valid = false;
    finish(stats);
    await assert.rejects(pending, /已取消/);
    assert.equal(fs.existsSync(path.join(dir, GAME_REFRESH_FILE)), false);
    assert.equal(fs.readFileSync(path.join(dir, "遊戲.md"), "utf8"), report);
  }
});

test("即時來源使用全語系 Steam 購買評論與繁中商店標籤，不讀 appdetails；任一失敗整筆不套用", async () => {
  const urls = [];
  const fetcher = async url => { urls.push(url); return { ok: true, json: async () => ({ response: { query_summary: { total_reviews: 4, total_positive: 3 } } }), text: async () => '<a class="app_tag">冒險</a>' }; };
  assert.deepEqual(await lookupSteamStats("123", { fetcher }), { score: 75, reviews: 4, tags: ["冒險"] });
  assert.equal(urls.length, 2);
  const reviewUrl = new URL(urls[0]);
  assert.equal(reviewUrl.origin + reviewUrl.pathname, "https://api.steampowered.com/IUserReviewsService/GetAppReviews/v1/");
  assert.deepEqual(JSON.parse(reviewUrl.searchParams.get("input_json")), { appid: 123, filter: 0, languages: ["all"], review_type: 0, purchase_type: 0, cursor: "*", day_range: 365, num_per_page: 1 });
  assert.equal(reviewUrl.searchParams.has("key"), false);
  assert.ok(urls[1].includes("l=tchinese")); assert.ok(urls.every(url => !url.includes("appdetails")));
  await assert.rejects(lookupSteamStats("123", { fetcher: async () => ({ ok: false, status: 429 }) }), /限制請求/);
});

test("新評論格式保留零評論與零好評，缺漏、負值及錯誤總數拒絕套用", () => {
  const summary = data => ({ response: { query_summary: data } });
  assert.deepEqual(parseReviewSummary(summary({ total_reviews: 0, total_positive: 0 })), { score: null, reviews: 0 });
  assert.deepEqual(parseReviewSummary(summary({ total_reviews: 5, total_positive: 0 })), { score: 0, reviews: 5 });
  for (const data of [{}, { total_reviews: -1, total_positive: 0 }, { total_reviews: 1, total_positive: 2 }, { total_reviews: "5", total_positive: 3 }]) {
    assert.throws(() => parseReviewSummary(summary(data)), /評論資料不完整/);
  }
});

test("評論連線、逾時、轉址及格式錯誤提供可理解原因，失敗不改寫現有資訊", async t => {
  const dir = fixture(t);
  await new GameRefreshService({ lookup: async () => stats }).refresh(dir, "123");
  const file = path.join(dir, GAME_REFRESH_FILE); const original = fs.readFileSync(file, "utf8");
  const cases = [
    [async () => { throw new TypeError("fetch failed"); }, /Steam 評論連線失敗/],
    [async () => { throw new DOMException("timeout", "TimeoutError"); }, /Steam 評論回應逾時/],
    [async () => ({ ok: false, status: 302 }), /Steam 評論回傳轉址/],
    [async () => ({ ok: true, json: async () => { throw new SyntaxError("HTML"); } }), /Steam 評論資料讀取不完整/],
    [async () => ({ ok: true, json: async () => ({ response: {} }) }), /評論資料不完整/],
  ];
  for (const [fetcher, message] of cases) {
    await assert.rejects(new GameRefreshService({ lookup: id => lookupSteamStats(id, { fetcher }) }).refresh(dir, "123"), message);
    assert.equal(fs.readFileSync(file, "utf8"), original);
  }
  const controller = new AbortController(); controller.abort();
  await assert.rejects(lookupSteamStats("123", { signal: controller.signal, fetcher: async (_url, options) => { throw options.signal.reason; } }), /已取消讀取/);
});

test("手動新增共用新評論來源；商店 Cookie 不傳送到評論 API", async () => {
  const calls = [];
  const game = await lookupSteamGame("123", { fetcher: async (url, options) => {
    calls.push({ url, options });
    if (url.includes("appdetails")) return { ok: true, json: async () => ({ 123: { success: true, data: { type: "game", name: "測試" } } }) };
    if (url.includes("GetAppReviews")) return { ok: true, json: async () => ({ response: { query_summary: { total_reviews: 70, total_positive: 66 } } }) };
    return { ok: true, text: async () => '<a class="app_tag">探索</a>' };
  } });
  assert.deepEqual([game.score, game.reviews, game.tags, game.warnings], [94, 70, ["探索"], []]);
  assert.equal(calls[0].options.headers.Cookie, undefined);
  assert.equal(calls[1].options.headers.Cookie, undefined);
  assert.ok(calls.every(call => call.options.redirect === "manual"));
});
