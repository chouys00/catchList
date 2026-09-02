import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { deleteEntry, loadLibrary, parseReport, undoDelete } from "../src/library.js";

const anime = `2025  春  >7.70    (更新時間: 2025-07-01)\n\n- 測試動畫  **8.20**  (12 · TV)\n- 測試動畫  **8.20**  (12 · TV)\n------------------------------\n`;
const movies = `2025  9月  >7.00    (更新時間: 2026-07-01  最低投票門檻: 30,000 票)\n\n- 測試電影  **8.15**  \`(IMDb: 8.3 | 一般外國片 (-0.15) | 144k票)\`\n------------------------------\n`;
const games = `2025  9月  (更新時間: 2026-03-01)\n\n- **測試遊戲** (Test Game) [🎮]\n  2025-09-02 | 97% (12,345) | 動作, 獨立製作\n  https://store.steampowered.com/app/123456\n\n------------------------------\n`;
const liveAction = `# 真人劇年度必看\n\n2022  全年度  (整理時間: 2026-08-19)\n\n## 韓國\n- [我的出走日記](https://www.imdb.com/title/tt15146130/)：8.2／10（7,526 票）\n- 資料不足作品：IMDb：資料不足\n\n## 歐美\n- [絕命律師](https://www.imdb.com/title/tt3032476/)：IMDb：9.0／10（855,945 票）\n\n------------------------------\n`;
const steamTagsFixtureDir = fileURLToPath(new URL("../test-data/steam-tags-2026-02/", import.meta.url));

test("解析三種報告與外部連結", () => {
  const animeEntries = parseReport("anime", anime).entries;
  assert.equal(animeEntries.length, 2);
  assert.notEqual(animeEntries[0].id, animeEntries[1].id);
  assert.equal(new URL(animeEntries[0].searchUrl).searchParams.get("q"), "測試動畫 動畫");

  const movie = parseReport("movies", movies).entries[0];
  assert.equal(movie.score, 8.15);
  assert.equal(movie.category, "一般外國片");
  assert.equal(movie.votes, 144000);
  assert.equal(new URL(movie.searchUrl).searchParams.get("q"), "測試電影 電影");

  const game = parseReport("games", games).entries[0];
  assert.equal(game.title, "測試遊戲");
  assert.equal(game.score, 97);
  assert.deepEqual(game.genres, ["動作", "獨立製作"]);
});

test("解析真人劇年度報告，保留地區與 IMDb 資訊", () => {
  const entries = parseReport("liveAction", liveAction).entries;
  assert.equal(entries.length, 3);
  assert.equal(entries[0].title, "我的出走日記");
  assert.equal(entries[0].year, 2022);
  assert.equal(entries[0].region, "韓國");
  assert.equal(entries[0].imdbScore, 8.2);
  assert.equal(entries[0].imdbVotes, 7526);
  assert.equal(entries[1].imdbScore, null);
  assert.equal(entries[2].region, "歐美");
});

test("刪除指定重複作品、保留標題並可完整復原", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "catchlist-reader-"));
  const filepath = path.join(directory, "動畫.md");
  fs.writeFileSync(filepath, anime, "utf8");
  const entries = loadLibrary(directory, "anime").entries;

  const operation = deleteEntry(directory, "anime", entries[1].id);
  const afterDelete = fs.readFileSync(filepath, "utf8");
  assert.match(afterDelete, /^2025  春  >7\.70/m);
  assert.equal((afterDelete.match(/測試動畫/g) ?? []).length, 1);
  assert.equal(fs.existsSync(operation.backupPath), true);

  const restored = undoDelete(operation);
  assert.equal(fs.readFileSync(filepath, "utf8"), anime);
  assert.deepEqual(restored, { media: "anime", entryId: entries[1].id, title: "測試動畫" });
});

test("依 AppID 合併完整社群標籤", () => {
  const result = loadLibrary(steamTagsFixtureDir, "games");
  const game = result.entries.find((entry) => entry.appid === "3205380");

  assert.equal(result.tagWarning, null);
  assert.equal(result.entries.length, 7);
  assert.equal(game.tags.length, 20);
  assert.ok(game.tags.includes("烹飪"));
  assert.ok(game.tags.includes("牌組製作"));
  assert.ok(!game.tags.includes("模擬"));
  assert.deepEqual(game.tags.slice(0, 3), ["類 Rogue 牌組製作", "烹飪", "物理"]);
  assert.ok(result.entries.every((entry) => entry.tags.length >= 17 && entry.tags.length <= 20));
});

test("2026-02 fixture 使用正式報告的七筆遊戲欄位", () => {
  const result = loadLibrary(steamTagsFixtureDir, "games");

  assert.deepEqual(result.entries.map(({ appid, title, releaseDate, score, reviews }) => ({
    appid,
    title,
    releaseDate,
    score,
    reviews,
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

test("合法 sidecar 含超過 20 個標籤時只保留清洗去重後前 20 個", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "catchlist-reader-"));
  fs.copyFileSync(path.join(steamTagsFixtureDir, "遊戲.md"), path.join(directory, "遊戲.md"));
  fs.writeFileSync(path.join(directory, "遊戲標籤.json"), JSON.stringify({
    version: 1,
    locale: "tchinese",
    games: {
      3205380: {
        tags: [
          "  類   Rogue 牌組製作  ", "類 Rogue 牌組製作", "烹飪", "物理", "值得重玩", "輕度 Rogue",
          "愜意", "動物", "動作類 Rogue", "放鬆", "即時",
          "回合制", "競分", "街機", "類 Rogue", "策略",
          "牌組製作", "像素風格", "動作", "闔家", "休閒",
          " 烹飪 ", "", "模擬", "生存",
        ],
        fetchedAt: "2026-08-24T00:00:00.000Z",
      },
    },
  }), "utf8");

  const result = loadLibrary(directory, "games");
  const game = result.entries.find((entry) => entry.appid === "3205380");

  assert.equal(result.tagWarning, null);
  assert.deepEqual(game.tags, [
    "類 Rogue 牌組製作", "烹飪", "物理", "值得重玩", "輕度 Rogue",
    "愜意", "動物", "動作類 Rogue", "放鬆", "即時",
    "回合制", "競分", "街機", "類 Rogue", "策略",
    "牌組製作", "像素風格", "動作", "闔家", "休閒",
  ]);
  assert.equal(game.tags.length, 20);
  assert.ok(!game.tags.includes("模擬"));
  assert.deepEqual(game.genres, ["動作", "休閒", "獨立製作", "策略"]);
});

test("sidecar 不存在時仍可載入遊戲且 tags 為空", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "catchlist-reader-"));
  fs.copyFileSync(path.join(steamTagsFixtureDir, "遊戲.md"), path.join(directory, "遊戲.md"));

  const result = loadLibrary(directory, "games");

  assert.equal(result.entries.length, 7);
  assert.equal(result.tagWarning, null);
  assert.ok(result.entries.every((entry) => Array.isArray(entry.tags) && entry.tags.length === 0));
});

test("sidecar 損壞時保留遊戲並提供非阻斷警告", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "catchlist-reader-"));
  fs.copyFileSync(path.join(steamTagsFixtureDir, "遊戲.md"), path.join(directory, "遊戲.md"));
  fs.writeFileSync(path.join(directory, "遊戲標籤.json"), "{broken", "utf8");

  const result = loadLibrary(directory, "games");

  assert.equal(result.entries.length, 7);
  assert.ok(result.entries.every((entry) => Array.isArray(entry.tags) && entry.tags.length === 0));
  assert.match(result.tagWarning, /無法讀取/);
});

test("sidecar 版本不支援時保留遊戲並提供警告", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "catchlist-reader-"));
  fs.copyFileSync(path.join(steamTagsFixtureDir, "遊戲.md"), path.join(directory, "遊戲.md"));
  fs.writeFileSync(path.join(directory, "遊戲標籤.json"), JSON.stringify({
    version: 2,
    locale: "tchinese",
    games: {},
  }), "utf8");

  const result = loadLibrary(directory, "games");

  assert.equal(result.entries.length, 7);
  assert.ok(result.entries.every((entry) => Array.isArray(entry.tags) && entry.tags.length === 0));
  assert.match(result.tagWarning, /版本/);
});

test("sidecar 語系錯誤時保留遊戲並提供警告", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "catchlist-reader-"));
  fs.copyFileSync(path.join(steamTagsFixtureDir, "遊戲.md"), path.join(directory, "遊戲.md"));
  fs.writeFileSync(path.join(directory, "遊戲標籤.json"), JSON.stringify({
    version: 1,
    locale: "english",
    games: {
      3205380: { tags: ["策略"], fetchedAt: "2026-08-24T00:00:00.000Z" },
    },
  }), "utf8");

  const result = loadLibrary(directory, "games");

  assert.equal(result.entries.length, 7);
  assert.ok(result.entries.every((entry) => entry.tags.length === 0));
  assert.match(result.tagWarning, /語系/);
});

test("sidecar 略過單筆壞資料並保留其他合法標籤", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "catchlist-reader-"));
  fs.copyFileSync(path.join(steamTagsFixtureDir, "遊戲.md"), path.join(directory, "遊戲.md"));
  fs.writeFileSync(path.join(directory, "遊戲標籤.json"), JSON.stringify({
    version: 1,
    locale: "tchinese",
    games: {
      3205380: { tags: ["策略", "牌組製作"], fetchedAt: "2026-08-24T00:00:00.000Z" },
      3300800: { tags: "解謎", fetchedAt: "2026-08-24T00:00:00.000Z" },
    },
  }), "utf8");

  const result = loadLibrary(directory, "games");
  const valid = result.entries.find((entry) => entry.appid === "3205380");
  const invalid = result.entries.find((entry) => entry.appid === "3300800");

  assert.deepEqual(valid.tags, ["策略", "牌組製作"]);
  assert.deepEqual(invalid.tags, []);
  assert.match(result.tagWarning, /3300800/);
});

test("sidecar 略過空 fetchedAt 並保留其他合法標籤", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "catchlist-reader-"));
  fs.copyFileSync(path.join(steamTagsFixtureDir, "遊戲.md"), path.join(directory, "遊戲.md"));
  fs.writeFileSync(path.join(directory, "遊戲標籤.json"), JSON.stringify({
    version: 1,
    locale: "tchinese",
    games: {
      3205380: { tags: ["策略"], fetchedAt: "2026-08-24T00:00:00.000Z" },
      3300800: { tags: ["解謎"], fetchedAt: "   " },
    },
  }), "utf8");

  const result = loadLibrary(directory, "games");
  const valid = result.entries.find((entry) => entry.appid === "3205380");
  const invalid = result.entries.find((entry) => entry.appid === "3300800");

  assert.deepEqual(valid.tags, ["策略"]);
  assert.deepEqual(invalid.tags, []);
  assert.match(result.tagWarning, /3300800.*fetchedAt/);
});

test("canonical sidecar 路徑必須留在所選資料夾內", async () => {
  const { isCanonicalPathInsideDirectory } = await import("../src/library.js");
  const directory = path.resolve("D:/CatchList/data");

  assert.equal(isCanonicalPathInsideDirectory?.(directory, path.join(directory, "遊戲標籤.json")), true);
  assert.equal(isCanonicalPathInsideDirectory?.(directory, path.resolve(directory, "../outside/遊戲標籤.json")), false);
  assert.equal(isCanonicalPathInsideDirectory?.(directory, `${directory}-outside/遊戲標籤.json`), false);
});

test("Electron 拒絕指向資料夾外的 sidecar symlink 並改用 genres", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "catchlist-reader-sidecar-"));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "catchlist-reader-outside-"));
  const sidecarTarget = path.join(outside, "遊戲標籤.json");
  const sidecarLink = path.join(directory, "遊戲標籤.json");
  fs.copyFileSync(path.join(steamTagsFixtureDir, "遊戲.md"), path.join(directory, "遊戲.md"));
  fs.writeFileSync(sidecarTarget, JSON.stringify({
    version: 1,
    locale: "tchinese",
    games: {
      3205380: { tags: ["不應載入"], fetchedAt: "2026-08-24T00:00:00.000Z" },
    },
  }), "utf8");

  try {
    fs.symlinkSync(sidecarTarget, sidecarLink, "file");
  } catch (error) {
    if (process.platform === "win32" && error?.code === "EPERM") {
      t.skip("Windows 未授權建立檔案 symlink");
      return;
    }
    throw error;
  }

  const result = loadLibrary(directory, "games");
  const game = result.entries.find((entry) => entry.appid === "3205380");

  assert.deepEqual(game.tags, []);
  assert.deepEqual(game.genres, ["動作", "休閒", "獨立製作", "策略"]);
  assert.match(result.tagWarning, /連結|路徑/);
});

test("動畫與電影載入結果不混入 tags", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "catchlist-reader-"));
  fs.writeFileSync(path.join(directory, "動畫.md"), anime, "utf8");
  fs.writeFileSync(path.join(directory, "電影.md"), movies, "utf8");

  const animeResult = loadLibrary(directory, "anime");
  const movieResult = loadLibrary(directory, "movies");

  assert.equal("tags" in animeResult.entries[0], false);
  assert.equal("tags" in movieResult.entries[0], false);
});
