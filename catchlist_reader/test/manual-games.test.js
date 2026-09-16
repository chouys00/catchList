import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { readManualGames, addManualRecord, MANUAL_GAMES_FILE, atomicText, commitGameFiles, recoverGameTransaction, manualEntry } from "../src/manual-games.js";
import { loadLibrary, loadAllLibraries, setFavorite, hideEntry, loadHiddenEntries, restoreHiddenEntry, deleteEntry, hasReportFiles } from "../src/library.js";
import { ManualGameService } from "../src/manual-game-service.js";
import { parseSteamInput, parseGameDetails, parseReviewSummary, exactReleaseDate, lookupSteamGame } from "../src/steam-game-lookup.js";
import { filterAndSortGames } from "../src/renderer/game-browser.js";
import { renderItemTemplate } from "../src/renderer/item-template.js";
import { VisitHistory } from "../src/visit-history.js";
import { loadUpdateStatus } from "../src/update-status.js";

const game = (appid = "123") => ({ appid, title: "未達標遊戲", score: 30, reviews: 5, releaseDate: null, releaseLabel: "即將推出", genres: [], tags: [], chineseSupport: "unknown", fetchedAt: "2026-09-16T00:00:00.000Z", addedAt: "2026-09-16T00:00:00.000Z" });
const report = `2025  9月  (更新時間: 2026-03-01)\n\n- **自動收錄名稱** (Test) [AppID: 123 | 中文支援: 支援中文]\n  2025-09-02 | 97% (12,345) | 動作\n  社群標籤: 策略\n  https://store.steampowered.com/app/123\n\n------------------------------\n`;
function fixture(t) { const dir = fs.mkdtempSync(path.join(os.tmpdir(), "catchlist-manual-test-")); t.after(() => fs.rmSync(dir, { recursive: true, force: true })); return dir; }

test("手動遊戲可獨立讀取、收藏、隱藏、恢復及刪除，不建立月份", (t) => {
  const dir = fixture(t);
  addManualRecord(dir, game(), null);
  assert.ok(hasReportFiles(dir));
  const entry = loadLibrary(dir, "games").entries[0];
  assert.equal(entry.score, 30); assert.equal(entry.manualAdded, true);
  assert.equal(loadUpdateStatus(dir).media.games.coverage.latestKey, null);
  setFavorite(dir, "games", entry.id, true);
  hideEntry(dir, "games", entry.id);
  assert.equal(loadLibrary(dir, "games").entries.length, 0);
  assert.equal(loadHiddenEntries(dir)[0].available, true);
  restoreHiddenEntry(dir, entry.hideKey);
  assert.equal(loadLibrary(dir, "games").entries[0].favorite, true);
  deleteEntry(dir, "games", entry.id);
  assert.equal(readManualGames(dir).entries.length, 0);
  assert.equal(fs.existsSync(path.join(dir, "遊戲.md")), false);
});

test("自動收錄後只顯示一筆且收藏、來源與新收錄基準保留，刪除涵蓋兩來源", (t) => {
  const dir = fixture(t); addManualRecord(dir, game(), null);
  const visits = new VisitHistory(); visits.annotate(dir, loadAllLibraries(dir), "games");
  const first = loadLibrary(dir, "games").entries[0]; setFavorite(dir, "games", first.id, true);
  fs.writeFileSync(path.join(dir, "遊戲.md"), report);
  const merged = loadLibrary(dir, "games").entries;
  assert.equal(merged.length, 1); assert.equal(merged[0].score, 97); assert.equal(merged[0].manualAdded, true); assert.equal(merged[0].favorite, true);
  assert.equal(visits.annotate(dir, loadAllLibraries(dir), "games").libraries[0].entries[0].isNew, false);
  deleteEntry(dir, "games", merged[0].id);
  assert.equal(readManualGames(dir).entries.length, 0);
  assert.equal(loadLibrary(dir, "games").entries.length, 0);
  assert.ok(fs.readFileSync(path.join(dir, "遊戲.md"), "utf8").includes("2025  9月"));
  assert.equal(fs.existsSync(path.join(dir, ".catchlist-game-transaction.json")), false);
});

test("毀損手動清單保留原檔且報告仍可讀，禁止新增與刪除", async (t) => {
  const dir = fixture(t); fs.writeFileSync(path.join(dir, "遊戲.md"), report); fs.writeFileSync(path.join(dir, MANUAL_GAMES_FILE), "broken");
  const library = loadLibrary(dir, "games"); assert.equal(library.entries.length, 1); assert.match(library.warning, /格式不正確/);
  assert.throws(() => deleteEntry(dir, "games", library.entries[0].id), /格式不正確/);
  await assert.rejects(new ManualGameService().prepare(dir, "456"), /格式不正確/);
  assert.equal(fs.readFileSync(path.join(dir, MANUAL_GAMES_FILE), "utf8"), "broken");
});

test("兩檔交易第二次寫入失敗會復原，外部變更不覆蓋", (t) => {
  const dir = fixture(t); fs.writeFileSync(path.join(dir, "遊戲.md"), "original"); fs.writeFileSync(path.join(dir, MANUAL_GAMES_FILE), "manual");
  const changes = [{ name: "遊戲.md", before: "original", after: "next" }, { name: MANUAL_GAMES_FILE, before: "manual", after: "new" }];
  let count = 0;
  assert.throws(() => commitGameFiles(dir, changes, (file, text) => { if (++count === 2) throw new Error("模擬磁碟失敗"); atomicText(file, text); }), /磁碟失敗/);
  assert.equal(fs.readFileSync(path.join(dir, "遊戲.md"), "utf8"), "original");
  fs.writeFileSync(path.join(dir, ".catchlist-game-transaction.json"), JSON.stringify(changes));
  fs.writeFileSync(path.join(dir, "遊戲.md"), "next"); recoverGameTransaction(dir);
  assert.equal(fs.readFileSync(path.join(dir, "遊戲.md"), "utf8"), "original");
  fs.writeFileSync(path.join(dir, MANUAL_GAMES_FILE), "external");
  assert.throws(() => commitGameFiles(dir, changes), /資料已變更/);
  assert.equal(fs.readFileSync(path.join(dir, MANUAL_GAMES_FILE), "utf8"), "external");
});

test("預覽不寫檔，確認防重複、資料夾切換與外部修改，隱藏遊戲能辨識", async (t) => {
  const dir = fixture(t); const other = fixture(t);
  const service = new ManualGameService({ lookup: async (id) => game(id), now: () => Date.parse(game().addedAt) });
  const preview = await service.prepare(dir, "123"); assert.equal(readManualGames(dir).entries.length, 0);
  assert.throws(() => service.commit(other, preview.token), /失效/);
  service.commit(dir, preview.token); assert.throws(() => service.commit(dir, preview.token), /失效/);
  const entry = loadLibrary(dir, "games").entries[0]; hideEntry(dir, "games", entry.id);
  assert.equal((await service.prepare(dir, "123")).duplicate.hidden, true);
  const second = new ManualGameService({ lookup: async (id) => game(id) });
  const pending = await second.prepare(dir, "456");
  addManualRecord(dir, game("789"), readManualGames(dir).raw);
  assert.throws(() => second.commit(dir, pending.token), /已變更/);
});

test("取消遲到的預覽不能確認加入", async (t) => {
  const dir = fixture(t); let resolve;
  const service = new ManualGameService({ lookup: () => new Promise((done) => { resolve = done; }) });
  const request = service.prepare(dir, "123"); service.cancel(); resolve(game());
  await assert.rejects(request, /取消/); assert.equal(readManualGames(dir).entries.length, 0);
});

test("輸入僅接受 Steam AppID 與商店網址，不接受任意網域", () => {
  assert.equal(parseSteamInput(" 123 "), "123"); assert.equal(parseSteamInput("https://store.steampowered.com/app/123/Test/?x=1"), "123");
  for (const input of ["0", "-1", "https://evil.test/app/123", "https://store.steampowered.com.evil.test/app/123", "https://store.steampowered.com/sub/123", "file:///app/123"]) assert.throws(() => parseSteamInput(input));
});

test("免費、多人、搶先體驗與未發售遊戲保留；非遊戲排除；日期不猜測", () => {
  const data = { type: "game", name: "免費遊戲", is_free: true, categories: [{ id: 20 }], genres: [{ id: "70", description: "搶先體驗" }], release_date: { coming_soon: true, date: "2027 年" }, supported_languages: "繁體中文" };
  assert.equal(parseGameDetails("123", { 123: { success: true, data } }).releaseDate, null);
  for (const type of ["dlc", "demo", "software"]) assert.throws(() => parseGameDetails("123", { 123: { success: true, data: { ...data, type } } }), /只支援/);
  assert.equal(exactReleaseDate("2026 年 9 月 16 日"), "2026-09-16"); assert.equal(exactReleaseDate("16 Sep, 2026"), "2026-09-16"); assert.equal(exactReleaseDate("2026-02-30"), null);
  assert.deepEqual(parseReviewSummary({ success: 1, query_summary: { total_reviews: 0, total_positive: 0 } }), { score: null, reviews: 0 });
});

test("評論與標籤失敗可加入但明示缺漏；主資料失敗則拒絕", async () => {
  const urls = [];
  const fetcher = async (url) => { urls.push(url); return url.includes("appdetails") ? { ok: true, json: async () => ({ 123: { success: true, data: { type: "game", name: "測試" } } }) } : { ok: false, status: 429 }; };
  const result = await lookupSteamGame("123", { fetcher });
  assert.equal(result.reviews, null); assert.equal(result.warnings.length, 2); assert.ok(urls[1].includes("language=all"));
  await assert.rejects(lookupSteamGame("123", { fetcher: async () => ({ ok: false, status: 500 }) }), /讀取失敗/);
});

test("手動來源篩選與缺值排序、評價篩選及列顯示不虛構資料", () => {
  const entries = [{ ...game(), manualAdded: true, year: null, month: null, score: null, reviews: null }, { ...game("456"), releaseDate: "2025-09-01", score: 0, reviews: 0 }];
  assert.equal(filterAndSortGames(entries, { manualOnly: "manual" }).length, 1);
  for (const sort of ["score", "reviews", "date"]) assert.equal(filterAndSortGames(entries, { sort })[1].appid, "123");
  assert.equal(filterAndSortGames(entries, { min: 85 }).length, 0);
  assert.equal(filterAndSortGames(entries, { minReviews: 500 }).length, 0);
  const html = renderItemTemplate(manualEntry(entries[0]), "games"); assert.match(html, /手動加入/); assert.match(html, /評論讀取失敗/); assert.doesNotMatch(html, /null%|undefined|NaN/);
});
