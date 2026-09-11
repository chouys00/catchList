import assert from "node:assert/strict";
import test from "node:test";

import { gameDisplayTags, parseReport, removeEntry, shouldShowPeriodRail } from "../src/tauri-shell/library.js";
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

test("Tauri 刪除重複動畫時保留區段標題", () => {
  const duplicateAnime = anime.replace("------------------------------", "- 測試動畫  **8.20**  (12 · TV)\n------------------------------");
  const report = parseReport("anime", duplicateAnime);
  const next = removeEntry("anime", duplicateAnime, report.entries[1].id);
  assert.match(next, /^2025  春  >7\.70/m);
  assert.equal((next.match(/測試動畫/g) ?? []).length, 1);
});

test("Tauri 刪除四行遊戲紀錄時一併移除標籤", () => {
  const report = parseReport("games", games);
  const next = removeEntry("games", games, report.entries[0].id);
  assert.match(next, /^2025  9月/m);
  assert.doesNotMatch(next, /測試遊戲|牌組製作/);
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
  await bridge.deleteEntry("games", loaded.libraries[0].entries[0].id, loaded.libraries[0]);
  assert.deepEqual(calls.map((item) => item.command), ["library_load", "library_delete_entry"]);
  assert.doesNotMatch(calls[1].args.nextContent, /測試遊戲|牌組製作/);
});
