import assert from "node:assert/strict";
import test from "node:test";

import { gameDisplayTags, parseReport, shouldShowPeriodRail } from "../src/tauri-shell/library.js";
import { createBridge } from "../src/tauri-shell/tauri-bridge.js";

const anime = `2025  春  >7.70    (更新時間: 2025-07-01)\n\n- 測試動畫  **8.20**  (12 · TV)\n------------------------------\n`;
const movies = `2025  9月  >7.00    (更新時間: 2026-07-01  最低投票門檻: 30,000 票)\n\n- 測試電影  **8.15**  \`(IMDb: 8.3 | 一般外國片 (-0.15) | 144k票)\`\n------------------------------\n`;
const games = `2025  9月  (更新時間: 2026-03-01)\n\n- **測試遊戲** (Test Game) [AppID: 123456 | 中文支援: 支援中文]\n  2025-09-02 | 97% (12,345) | 動作, 獨立製作\n  社群標籤: 牌組製作, 策略\n  https://store.steampowered.com/app/123456\n\n------------------------------\n`;

test("Tauri 解析器直接從 Markdown 讀取類型與社群標籤", () => {
  assert.equal(parseReport("anime", anime).entries.length, 1);
  assert.equal(parseReport("movies", movies).entries[0].category, "一般外國片");
  const game = parseReport("games", games).entries[0];
  assert.deepEqual(game.genres, ["動作", "獨立製作"]);
  assert.deepEqual(game.tags, ["牌組製作", "策略"]);
  assert.equal(game.chineseSupport, "supported");
});

test("Tauri 解析中文支援的三種狀態", () => {
  assert.equal(parseReport("games", games.replace("中文支援: 支援中文", "中文支援: 不支援中文")).entries[0].chineseSupport, "unsupported");
  assert.equal(parseReport("games", games.replace(" | 中文支援: 支援中文", "")).entries[0].chineseSupport, "unknown");
});

test("Tauri 解析缺漏社群標籤時使用官方類型備援", () => {
  const missing = games.replace("牌組製作, 策略", "尚未補齊社群標籤");
  const game = parseReport("games", missing).entries[0];
  assert.deepEqual(game.tags, []);
  assert.deepEqual(gameDisplayTags(game), ["動作", "獨立製作"]);
});

test("Tauri 相容舊版完整初始化報告的內嵌標籤", () => {
  const legacy = `# Steam 歷史初始化預覽\n\n2025  9月  (更新時間: 2026-03-01)\n\n- **測試遊戲** (Test Game)\n  2025-09-02 | 97% (12,345) | 視覺小說, 恐怖\n  https://store.steampowered.com/app/123456\n`;
  assert.deepEqual(parseReport("games", legacy).entries[0].tags, ["視覺小說", "恐怖"]);
});

test("Tauri 遊戲畫面維持跨月份及社群標籤優先", () => {
  assert.equal(shouldShowPeriodRail("games"), false);
  assert.equal(shouldShowPeriodRail("anime"), true);
  assert.deepEqual(gameDisplayTags({ tags: ["牌組製作"], genres: ["冒險"] }), ["牌組製作"]);
});

test("Tauri 遊戲同日期同分數時依評論數再依標題排序", async () => {
  const { sortEntriesForMedia } = await import("../src/tauri-shell/library.js");
  const entries = [
    { id: "beta", releaseDate: "2026-02-08", score: 97, reviews: 100, title: "Beta" },
    { id: "popular", releaseDate: "2026-02-08", score: 97, reviews: 200, title: "Zeta" },
    { id: "alpha", releaseDate: "2026-02-08", score: 97, reviews: 100, title: "Alpha" },
  ];
  assert.deepEqual(sortEntriesForMedia("games", entries).map((entry) => entry.id), ["popular", "alpha", "beta"]);
});

test("Tauri 重複動畫具有各自的跨後端隱藏識別碼", () => {
  const duplicateAnime = anime.replace("------------------------------", "- 測試動畫  **8.20**  (12 · TV)\n------------------------------");
  const report = parseReport("anime", duplicateAnime);
  assert.notEqual(report.entries[0].hideKey, report.entries[1].hideKey);
  assert.equal(report.entries[1].hideKey, '["anime","2025-春","測試動畫",1]');
});

test("Tauri 遊戲使用 AppID 作為跨後端隱藏識別碼", () => {
  const report = parseReport("games", games);
  assert.equal(report.entries[0].hideKey, '["games","123456","",0]');
});

test("橋接層只需報告內容，不再接收獨立遊戲標籤檔", async () => {
  const calls = [];
  const snapshot = { dataDir: "C:\\CatchList", canUndo: false, reports: [
    { media: "games", filename: "遊戲.md", exists: true, content: games },
    { media: "anime", filename: "動畫.md", exists: true, content: anime },
    { media: "movies", filename: "電影.md", exists: true, content: movies },
  ] };
  const bridge = createBridge(async (command, args) => { calls.push({ command, args }); return snapshot; });
  const loaded = await bridge.load();
  assert.deepEqual(loaded.libraries[0].entries[0].tags, ["牌組製作", "策略"]);
  const entry = loaded.libraries[0].entries[0];
  await bridge.hideEntry("games", entry);
  assert.deepEqual(calls.map((item) => item.command), ["library_load", "library_hide_entry"]);
  assert.deepEqual(calls[1].args, { media: "games", entryId: entry.id, hideKey: entry.hideKey, title: "測試遊戲" });
  assert.match(snapshot.reports[0].content, /測試遊戲|牌組製作/);
});

test("橋接層依隱藏紀錄排除作品且保留 Markdown 內容", async () => {
  const parsed = parseReport("games", games).entries[0];
  const snapshot = { dataDir: "C:\\CatchList", canUndo: true, hiddenEntries: [{ hideKey: parsed.hideKey }], reports: [
    { media: "games", filename: "遊戲.md", exists: true, content: games },
  ] };
  const bridge = createBridge(async () => snapshot);
  const loaded = await bridge.load();
  assert.equal(loaded.libraries[0].entries.length, 0);
  assert.equal(loaded.libraries[0].content, games);
});
