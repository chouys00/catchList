import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { hideEntry, loadLibrary, parseReport, readHiddenEntries, undoHide } from "../src/library.js";

const anime = `2025  春  >7.70    (更新時間: 2025-07-01)\n\n- 測試動畫  **8.20**  (12 · TV)\n- 測試動畫  **8.20**  (12 · TV)\n------------------------------\n`;
const movies = `2025  9月  >7.00    (更新時間: 2026-07-01  最低投票門檻: 30,000 票)\n\n- 測試電影  **8.15**  \`(IMDb: 8.3 | 一般外國片 (-0.15) | 144k票)\`\n------------------------------\n`;
const games = `2025  9月  (更新時間: 2026-03-01)\n\n- **測試遊戲** (Test Game) [AppID: 123456 | 中文支援: 支援中文 | 🎮]\n  2025-09-02 | 97% (12,345) | 動作, 獨立製作\n  社群標籤: 牌組製作, 策略, 輕度 Rogue\n  https://store.steampowered.com/app/123456\n\n------------------------------\n`;
const missingTags = games.replace("牌組製作, 策略, 輕度 Rogue", "尚未補齊社群標籤");
const steamTagsFixtureDir = fileURLToPath(new URL("../test-data/steam-tags-2026-02/", import.meta.url));

test("解析三種報告與外部連結", () => {
  const animeEntries = parseReport("anime", anime).entries;
  assert.equal(animeEntries.length, 2);
  assert.notEqual(animeEntries[0].id, animeEntries[1].id);
  assert.equal(new URL(animeEntries[0].searchUrl).searchParams.get("q"), "測試動畫 動畫");
  const movie = parseReport("movies", movies).entries[0];
  assert.equal(movie.score, 8.15);
  assert.equal(movie.votes, 144000);
  const game = parseReport("games", games).entries[0];
  assert.equal(game.title, "測試遊戲");
  assert.deepEqual(game.genres, ["動作", "獨立製作"]);
  assert.deepEqual(game.tags, ["牌組製作", "策略", "輕度 Rogue"]);
  assert.equal(game.chineseSupport, "supported");
});

test("中文支援徽章解析支援、不支援與待確認三種狀態", () => {
  const unsupported = games.replace("中文支援: 支援中文", "中文支援: 不支援中文");
  const unknown = games.replace("中文支援: 支援中文 | ", "");
  assert.equal(parseReport("games", unsupported).entries[0].chineseSupport, "unsupported");
  assert.equal(parseReport("games", unknown).entries[0].chineseSupport, "unknown");
});

test("Markdown 缺漏狀態保留官方類型並回傳空社群標籤", () => {
  const game = parseReport("games", missingTags).entries[0];
  assert.deepEqual(game.genres, ["動作", "獨立製作"]);
  assert.deepEqual(game.tags, []);
});

test("一般舊版三行報告相容載入並標示為缺少社群標籤", () => {
  const legacy = games.replace("  社群標籤: 牌組製作, 策略, 輕度 Rogue\n", "");
  const game = parseReport("games", legacy).entries[0];
  assert.deepEqual(game.genres, ["動作", "獨立製作"]);
  assert.deepEqual(game.tags, []);
});

test("舊版完整初始化報告直接把既有分類欄視為社群標籤", () => {
  const legacy = `# Steam 歷史初始化預覽\n\n2025  9月  (更新時間: 2026-03-01)\n\n- **測試遊戲** (Test Game)\n  2025-09-02 | 97% (12,345) | 視覺小說, 恐怖\n  https://store.steampowered.com/app/123456\n`;
  const game = parseReport("games", legacy).entries[0];
  assert.deepEqual(game.genres, []);
  assert.deepEqual(game.tags, ["視覺小說", "恐怖"]);
});

test("完整 Markdown fixture 可直接提供 17 至 20 個社群標籤", () => {
  const result = loadLibrary(steamTagsFixtureDir, "games");
  const game = result.entries.find((entry) => entry.appid === "3205380");
  assert.equal(result.entries.length, 7);
  assert.equal(game.tags.length, 20);
  assert.deepEqual(game.tags.slice(0, 3), ["類 Rogue 牌組製作", "烹飪", "物理"]);
  assert.ok(result.entries.every((entry) => entry.tags.length >= 17 && entry.tags.length <= 20));
});

test("2026-02 fixture 保留正式報告的七筆遊戲欄位", () => {
  const result = loadLibrary(steamTagsFixtureDir, "games");
  assert.deepEqual(result.entries.map(({ appid, title, releaseDate, score, reviews }) => ({
    appid, title, releaseDate, score, reviews,
  })), [
    { appid: "4225940", title: "不好啦!師父被女妖精抓走了!", releaseDate: "2026-02-04", score: 96, reviews: 2721 },
    { appid: "3300800", title: "HER TREES : PUZZLE DREAM", releaseDate: "2026-02-10", score: 97, reviews: 1768 },
    { appid: "3205380", title: "你有餅嗎？", releaseDate: "2026-02-08", score: 97, reviews: 1500 },
    { appid: "4270390", title: "D1AL-ogue", releaseDate: "2026-02-04", score: 95, reviews: 1347 },
    { appid: "4261980", title: "女神的贴身男仆", releaseDate: "2026-02-06", score: 99, reviews: 666 },
    { appid: "4314560", title: "Cartapli : Fold Quest", releaseDate: "2026-02-04", score: 98, reviews: 660 },
    { appid: "3129930", title: "銀河灰暗角落", releaseDate: "2026-02-03", score: 95, reviews: 562 },
  ]);
});

test("隱藏指定重複動畫時保留 Markdown 並可復原", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "catchlist-reader-"));
  const filepath = path.join(directory, "動畫.md");
  fs.writeFileSync(filepath, anime, "utf8");
  const entries = loadLibrary(directory, "anime").entries;
  const operation = hideEntry(directory, "anime", entries[1].id);
  assert.equal(fs.readFileSync(filepath, "utf8"), anime);
  assert.equal(loadLibrary(directory, "anime").entries.length, 1);
  undoHide(directory, operation);
  assert.equal(fs.readFileSync(filepath, "utf8"), anime);
  assert.equal(readHiddenEntries(directory).length, 0);
});

test("隱藏遊戲只寫入隱藏紀錄，不修改四行遊戲資料", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "catchlist-reader-"));
  const filepath = path.join(directory, "遊戲.md");
  fs.writeFileSync(filepath, games, "utf8");
  const entry = loadLibrary(directory, "games").entries[0];
  const operation = hideEntry(directory, "games", entry.id);
  assert.equal(fs.readFileSync(filepath, "utf8"), games);
  const records = readHiddenEntries(directory);
  assert.deepEqual(records.map(({ media, title }) => ({ media, title })), [{ media: "games", title: "測試遊戲" }]);
  assert.equal(loadLibrary(directory, "games").entries.length, 0);
  undoHide(directory, operation);
  assert.equal(loadLibrary(directory, "games").entries.length, 1);
});

test("隱藏紀錄會套用到三種清單的整體載入", async () => {
  const { loadAllLibraries } = await import("../src/library.js");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "catchlist-reader-"));
  fs.writeFileSync(path.join(directory, "動畫.md"), anime, "utf8");
  fs.writeFileSync(path.join(directory, "電影.md"), movies, "utf8");
  fs.writeFileSync(path.join(directory, "遊戲.md"), games, "utf8");
  for (const media of ["anime", "movies", "games"]) {
    const entry = loadLibrary(directory, media).entries[0];
    hideEntry(directory, media, entry.id);
  }
  assert.deepEqual(loadAllLibraries(directory).map((library) => [library.media, library.entries.length]), [
    ["games", 0],
    ["anime", 1],
    ["movies", 0],
  ]);
});

test("動畫與電影載入結果不混入 tags", () => {
  assert.equal("tags" in parseReport("anime", anime).entries[0], false);
  assert.equal("tags" in parseReport("movies", movies).entries[0], false);
});
