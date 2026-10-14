import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { deleteEntry, hideEntry, loadLibrary, parseReport, readHiddenEntries, undoHide, setFavorite, readFavorites, loadHiddenEntries, restoreHiddenEntry, setHiddenReason } from "../src/library.js";

const anime = `2025  春  >7.70    (更新時間: 2025-07-01)\n\n- 測試動畫  **8.20**  (12 · TV)\n- 測試動畫  **8.20**  (12 · TV)\n------------------------------\n`;
const mixedAnime = `2024  春  >7.70    (更新時間: 2025-07-01)\n\n- 完整動畫  **8.20**  (12 · TV)\n- 舊格式動畫  **8.10**\n\n------------------------------\n\n劇場版  (更新時間: 2025-07-01)\n\n- 無評分劇場版  **--**  (1 · Movie)\n- 有評分劇場版  **7.44**  (1 · Movie)\n`;
const movies = `2025  9月  >7.00    (更新時間: 2026-07-01  最低投票門檻: 30,000 票)\n\n- 測試電影  **8.15**  \`(IMDb: 8.3 | 一般外國片 (-0.15) | 144k票)\`\n------------------------------\n`;
const games = `2025  9月  (更新時間: 2026-03-01)\n\n- **測試遊戲** (Test Game) [AppID: 123456 | 中文支援: 支援中文 | 🎮]\n  2025-09-02 | 97% (12,345) | 動作, 獨立製作\n  社群標籤: 牌組製作, 策略, 輕度 Rogue\n  https://store.steampowered.com/app/123456\n\n------------------------------\n`;
const liveAction = `# 真人劇年度必看\n\n2025  全年度  (整理時間: 2026-09-15)\n\n## 韓劇\n- [測試韓劇](https://www.imdb.com/title/tt1234567/)：8.2／10（7,526 票）\n- 資料不足劇：IMDb：資料不足\n\n## 日劇\n- [測試日劇](https://www.imdb.com/title/tt7654321/)：7.9／10（907 票）\n\n------------------------------\n`;
const missingTags = games.replace("牌組製作, 策略, 輕度 Rogue", "尚未補齊社群標籤");
const steamTagsFixtureDir = fileURLToPath(new URL("../test-data/steam-tags-2026-02/", import.meta.url));

test("解析四種報告與外部連結", () => {
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
  const shows = parseReport("liveAction", liveAction).entries;
  assert.equal(shows.length, 3);
  assert.deepEqual(shows.map(({ title, region, imdbScore, votes }) => ({ title, region, imdbScore, votes })), [
    { title: "測試韓劇", region: "韓劇", imdbScore: 8.2, votes: 7526 },
    { title: "資料不足劇", region: "韓劇", imdbScore: null, votes: null },
    { title: "測試日劇", region: "日劇", imdbScore: 7.9, votes: 907 },
  ]);
  assert.equal(new URL(shows[0].url).hostname, "www.imdb.com");
  assert.equal(new URL(shows[1].url).searchParams.get("q"), "資料不足劇 真人劇");
});

test("動畫相容舊格式、無評分與獨立劇場版區段", () => {
  const result = parseReport("anime", mixedAnime);
  assert.equal(result.entries.length, 4);
  assert.equal(result.integrity.issueCount, 0);
  assert.equal(result.integrityWarning, null);
  assert.deepEqual(result.entries.map(({ title, score, episodes, format, year, season }) => ({
    title, score, episodes, format, year, season,
  })), [
    { title: "完整動畫", score: 8.2, episodes: "12", format: "TV", year: 2024, season: "春" },
    { title: "舊格式動畫", score: 8.1, episodes: null, format: null, year: 2024, season: "春" },
    { title: "無評分劇場版", score: null, episodes: "1", format: "Movie", year: null, season: "劇場版" },
    { title: "有評分劇場版", score: 7.44, episodes: "1", format: "Movie", year: null, season: "劇場版" },
  ]);
  assert.deepEqual(result.sections.map(({ key, label, year }) => ({ key, label, year })), [
    { key: "2024-春", label: "2024 年春季", year: 2024 },
    { key: "theatrical", label: "劇場版", year: null },
  ]);
});

test("報告格式無法辨識時回傳行號與完整性警告", () => {
  const malformed = `2025  春  >7.70    (更新時間: 2025-07-01)\n- 缺少評分格式\n`;
  const result = parseReport("anime", malformed);
  assert.equal(result.entries.length, 0);
  assert.equal(result.integrity.issueCount, 1);
  assert.deepEqual(result.integrity.issues[0], {
    line: 2,
    reason: "動畫作品格式無法辨識",
    text: "- 缺少評分格式",
  });
  assert.match(result.integrityWarning, /行號：2/);
});

test("劇場版改為獨立區段後仍辨識舊版收藏與隱藏紀錄", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "catchlist-anime-state-"));
  fs.writeFileSync(path.join(directory, "動畫.md"), mixedAnime);
  const legacyKey = JSON.stringify(["anime", "2024-春", "有評分劇場版", 0]);
  fs.writeFileSync(path.join(directory, ".catchlist-favorites.json"), JSON.stringify({
    version: 1,
    entries: [{ key: legacyKey, media: "anime", title: "有評分劇場版", savedAt: "2026-01-01T00:00:00.000Z" }],
  }));
  const theater = loadLibrary(directory, "anime").entries.find((entry) => entry.title === "有評分劇場版");
  assert.equal(theater.favorite, true);
  setFavorite(directory, "anime", theater.id, false);
  assert.deepEqual(readFavorites(directory), []);

  fs.writeFileSync(path.join(directory, ".catchlist-hidden.json"), JSON.stringify({
    version: 1,
    entries: [{ hideKey: legacyKey, media: "anime", title: "有評分劇場版", hiddenAt: "2026-01-01T00:00:00.000Z" }],
  }));
  assert.equal(loadLibrary(directory, "anime").entries.some((entry) => entry.title === "有評分劇場版"), false);
  assert.equal(loadHiddenEntries(directory)[0].periodLabel, "劇場版");
  assert.throws(() => hideEntry(directory, "anime", theater.id), /已隱藏/);
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

test("真正刪除會直接移除 Markdown 作品，不建立備份", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "catchlist-reader-"));
  const filepath = path.join(directory, "遊戲.md");
  fs.writeFileSync(filepath, games, "utf8");
  const entry = loadLibrary(directory, "games").entries[0];

  deleteEntry(directory, "games", entry.id);
  assert.equal(loadLibrary(directory, "games").entries.length, 0);
  assert.equal(fs.existsSync(path.join(directory, ".catchlist-backups")), false);
});

test("隱藏紀錄會套用到所有清單的整體載入", async () => {
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
    ["liveAction", 0],
  ]);
});

test("動畫與電影載入結果不混入 tags", () => {
  assert.equal("tags" in parseReport("anime", anime).entries[0], false);
  assert.equal("tags" in parseReport("movies", movies).entries[0], false);
});

test("四類收藏獨立持久化，重讀與評分更新後保留，不修改報告", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "catchlist-favorites-"));
  for (const [media, filename, content] of [["games", "遊戲.md", games], ["anime", "動畫.md", anime], ["movies", "電影.md", movies], ["liveAction", "真人劇年度.md", liveAction]]) {
    const filepath = path.join(directory, filename);
    fs.writeFileSync(filepath, content);
    const entry = loadLibrary(directory, media).entries[0];
    setFavorite(directory, media, entry.id, true);
    setFavorite(directory, media, entry.id, true);
    assert.equal(fs.readFileSync(filepath, "utf8"), content);
    assert.equal(loadLibrary(directory, media).entries[0].favorite, true);
    fs.writeFileSync(filepath, content.replace("97%", "96%").replace("**8.20**", "**8.30**").replace("**8.15**", "**8.25**").replace("8.2／10", "8.3／10"));
    const refreshed = loadLibrary(directory, media).entries[0];
    assert.equal(refreshed.favorite, true);
    setFavorite(directory, media, refreshed.id, false);
    assert.equal(loadLibrary(directory, media).entries[0].favorite, false);
  }
  assert.deepEqual(readFavorites(directory), []);
});

test("收藏遊戲轉隱藏會取消收藏，恢復後尚未分類，其他隱藏紀錄不受影響", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "catchlist-personal-"));
  fs.writeFileSync(path.join(directory, "遊戲.md"), games);
  fs.writeFileSync(path.join(directory, "動畫.md"), anime);
  const game = loadLibrary(directory, "games").entries[0];
  setFavorite(directory, "games", game.id, true);
  hideEntry(directory, "games", game.id);
  hideEntry(directory, "anime", loadLibrary(directory, "anime").entries[0].id);
  const record = loadHiddenEntries(directory).find((entry) => entry.media === "games");
  assert.equal(record.available, true);
  assert.equal(record.entry.favorite, false);
  assert.equal(readFavorites(directory).length, 0);
  assert.equal(loadLibrary(directory, "games").entries.length, 0);
  restoreHiddenEntry(directory, record.hideKey);
  assert.equal(loadLibrary(directory, "games").entries[0].favorite, false);
  assert.equal(readHiddenEntries(directory).length, 1);
});

test("失效隱藏紀錄可清除，不重建或修改報告", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "catchlist-hidden-"));
  const filepath = path.join(directory, "遊戲.md");
  fs.writeFileSync(filepath, games);
  const game = loadLibrary(directory, "games").entries[0];
  hideEntry(directory, "games", game.id);
  deleteEntry(directory, "games", game.id);
  const original = fs.readFileSync(filepath, "utf8");
  const record = loadHiddenEntries(directory)[0];
  assert.equal(record.available, false);
  restoreHiddenEntry(directory, record.hideKey);
  assert.deepEqual(loadHiddenEntries(directory), []);
  assert.equal(fs.readFileSync(filepath, "utf8"), original);
});

test("四種遊戲隱藏分類與收藏互斥，復原隱藏會還原原收藏時間", t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "catchlist-exclusive-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.writeFileSync(path.join(directory, "遊戲.md"), games);
  const game = loadLibrary(directory, "games").entries[0];
  for (const reason of ["played", "backlog", "watchlist", "not_interested"]) {
    setFavorite(directory, "games", game.id, true);
    const original = readFavorites(directory);
    const operation = hideEntry(directory, "games", game.id, reason);
    assert.deepEqual(readFavorites(directory), []);
    assert.equal(loadHiddenEntries(directory)[0].entry.favorite, false);
    undoHide(directory, operation);
    assert.deepEqual(readFavorites(directory), original);
    hideEntry(directory, "games", game.id, reason);
    setFavorite(directory, "games", game.id, true);
    assert.deepEqual(readHiddenEntries(directory), []);
    assert.equal(loadLibrary(directory, "games").entries[0].favorite, true);
  }
  assert.equal(fs.readFileSync(path.join(directory, "遊戲.md"), "utf8"), games);
});

test("舊版重疊紀錄以隱藏為準，重新收藏與改分類皆清除衝突", t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "catchlist-legacy-exclusive-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.writeFileSync(path.join(directory, "遊戲.md"), games);
  const game = loadLibrary(directory, "games").entries[0];
  setFavorite(directory, "games", game.id, true);
  const favorites = fs.readFileSync(path.join(directory, ".catchlist-favorites.json"), "utf8");
  const overlap = () => {
    hideEntry(directory, "games", game.id, "played");
    fs.writeFileSync(path.join(directory, ".catchlist-favorites.json"), favorites);
    assert.equal(loadHiddenEntries(directory)[0].entry.favorite, false);
  };
  overlap();
  setFavorite(directory, "games", game.id, true);
  assert.deepEqual(readHiddenEntries(directory), []);
  assert.equal(readFavorites(directory).length, 1);
  overlap();
  setHiddenReason(directory, game.hideKey, "watchlist");
  assert.deepEqual(readFavorites(directory), []);
  restoreHiddenEntry(directory, game.hideKey);
  overlap();
  restoreHiddenEntry(directory, game.hideKey);
  assert.equal(loadLibrary(directory, "games").entries[0].favorite, false);
});

test("損壞的收藏紀錄不會被新收藏覆蓋", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "catchlist-corrupt-"));
  fs.writeFileSync(path.join(directory, "遊戲.md"), games);
  const entry = loadLibrary(directory, "games").entries[0];
  const filepath = path.join(directory, ".catchlist-favorites.json");
  fs.writeFileSync(filepath, "broken");
  assert.throws(() => setFavorite(directory, "games", entry.id, true), /格式不正確/);
  assert.equal(fs.readFileSync(filepath, "utf8"), "broken");
});
