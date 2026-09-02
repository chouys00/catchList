import assert from "node:assert/strict";
import test from "node:test";

import { gameDisplayTags, parseGameTagSidecar, parseReport, removeEntry, shouldShowPeriodRail } from "../src/tauri-shell/library.js";
import { createBridge } from "../src/tauri-shell/tauri-bridge.js";

const anime = `2025  春  >7.70    (更新時間: 2025-07-01)\n\n- 測試動畫  **8.20**  (12 · TV)\n- 測試動畫  **8.20**  (12 · TV)\n------------------------------\n`;
const movies = `2025  9月  >7.00    (更新時間: 2026-07-01)\n\n- 測試電影  **8.15**  \`(IMDb: 8.3 | 一般外國片 (-0.15) | 144k票)\`\n------------------------------\n`;
const games = `2025  9月  (更新時間: 2026-03-01)\n\n- **測試遊戲** (Test Game) [🎮]\n  2025-09-02 | 97% (12,345) | 動作, 獨立製作\n  https://store.steampowered.com/app/123456\n\n------------------------------\n`;
const gamesWithInvalidTagEntry = games.replace("------------------------------", `- **另一款遊戲** (Another Game) [🎮]\n  2025-09-03 | 95% (2,345) | 冒險, 角色扮演\n  https://store.steampowered.com/app/654321\n\n------------------------------`);
const gameTags = JSON.stringify({
  version: 1,
  locale: "tchinese",
  games: {
    123456: { tags: [" 牌組製作 ", "策略", "策略", ""], fetchedAt: "2026-08-24T00:00:00.000Z" },
  },
});

test("Tauri 解析器支援三種既有 Markdown 格式", () => {
  assert.equal(parseReport("anime", anime).entries.length, 2);
  assert.equal(parseReport("movies", movies).entries[0].category, "一般外國片");
  assert.equal(parseReport("games", games).entries[0].url, "https://store.steampowered.com/app/123456");
  assert.deepEqual(parseReport("games", games).entries[0].tags, []);
});

test("Tauri 遊戲畫面跨月份且以社群標籤或 genres 備援", () => {
  assert.equal(shouldShowPeriodRail("games"), false);
  assert.equal(shouldShowPeriodRail("anime"), true);
  assert.equal(shouldShowPeriodRail("movies"), true);
  assert.deepEqual(gameDisplayTags({ tags: ["牌組製作", "策略"], genres: ["冒險"] }), ["牌組製作", "策略"]);
  assert.deepEqual(gameDisplayTags({ tags: [], genres: ["冒險", "獨立製作"] }), ["冒險", "獨立製作"]);
});

test("Tauri 遊戲同日期同分數時依評論數再依標題排序", async () => {
  const { sortEntriesForMedia } = await import("../src/tauri-shell/library.js");
  const entries = [
    { id: "beta", releaseDate: "2026-02-08", score: 97, reviews: 100, title: "Beta" },
    { id: "popular", releaseDate: "2026-02-08", score: 97, reviews: 200, title: "Zeta" },
    { id: "alpha", releaseDate: "2026-02-08", score: 97, reviews: 100, title: "Alpha" },
  ];

  const sorted = sortEntriesForMedia?.("games", entries);

  assert.deepEqual(sorted?.map((entry) => entry.id), ["popular", "alpha", "beta"]);
});

test("Tauri 將 tagWarning 顯示為不阻斷的 genres 備援提示", async () => {
  const { renderTagWarningNotice } = await import("../src/tauri-shell/library.js");

  const markup = renderTagWarningNotice?.("AppID 654321 缺少 fetchedAt");

  assert.match(markup ?? "", /class="tag-sidecar-warning" role="status"/);
  assert.match(markup ?? "", /AppID 654321 缺少 fetchedAt/);
  assert.match(markup ?? "", /目前仍可使用報告內的遊戲類型/);
  assert.equal(renderTagWarningNotice?.(null), "");
});

test("Tauri 刪除內容保留區段標題並識別重複作品", () => {
  const report = parseReport("anime", anime);
  const next = removeEntry("anime", anime, report.entries[1].id);
  assert.match(next, /^2025  春  >7\.70/m);
  assert.equal((next.match(/測試動畫/g) ?? []).length, 1);
});

test("橋接層只使用 Tauri command 並轉換後端快照", async () => {
  const calls = [];
  const snapshot = { dataDir: "C:\\CatchList", canUndo: false, gameTags: { filename: "遊戲標籤.json", exists: true, content: gameTags }, reports: [
    { media: "games", filename: "遊戲.md", exists: true, content: games },
    { media: "anime", filename: "動畫.md", exists: true, content: anime },
    { media: "movies", filename: "電影.md", exists: true, content: movies },
  ] };
  const bridge = createBridge(async (command, args) => { calls.push({ command, args }); return snapshot; });
  const loaded = await bridge.load();
  assert.equal(loaded.libraries[0].entries.length, 1);
  assert.deepEqual(loaded.libraries[0].entries[0].tags, ["牌組製作", "策略"]);
  assert.equal(loaded.libraries[0].tagWarning, null);
  await bridge.deleteEntry("games", loaded.libraries[0].entries[0].id, loaded.libraries[0]);
  await bridge.openUrls(["https://store.steampowered.com/app/123456"]);
  assert.deepEqual(calls.map((item) => item.command), ["library_load", "library_delete_entry", "external_open_urls"]);
  assert.match(calls[1].args.nextContent, /2025  9月/);
  assert.doesNotMatch(calls[1].args.nextContent, /測試遊戲/);
});

test("橋接層略過單筆非法 sidecar 資料並保留合法遊戲標籤", async () => {
  const snapshot = { dataDir: "C:\\CatchList", canUndo: false, gameTags: {
    filename: "遊戲標籤.json",
    exists: true,
    content: JSON.stringify({
      version: 1,
      locale: "tchinese",
      games: {
        123456: { tags: ["牌組製作", "策略"], fetchedAt: "2026-08-24T00:00:00.000Z" },
        654321: { tags: "冒險", fetchedAt: "2026-08-24T00:00:00.000Z" },
      },
    }),
  }, reports: [
    { media: "games", filename: "遊戲.md", exists: true, content: gamesWithInvalidTagEntry },
    { media: "anime", filename: "動畫.md", exists: true, content: anime },
    { media: "movies", filename: "電影.md", exists: true, content: movies },
  ] };

  const loaded = await createBridge(async () => snapshot).load();
  const gameLibrary = loaded.libraries.find((item) => item.media === "games");
  assert.deepEqual(gameLibrary.entries.map((entry) => ({ appid: entry.appid, tags: entry.tags })), [
    { appid: "123456", tags: ["牌組製作", "策略"] },
    { appid: "654321", tags: [] },
  ]);
  assert.match(gameLibrary.tagWarning, /654321/);
  assert.equal(loaded.libraries.find((item) => item.media === "anime").entries.length, 2);
  assert.equal(loaded.libraries.find((item) => item.media === "movies").entries.length, 1);
});

test("橋接層略過空 fetchedAt 並保留合法遊戲標籤", async () => {
  const snapshot = { dataDir: "C:\\CatchList", canUndo: false, gameTags: {
    filename: "遊戲標籤.json",
    exists: true,
    content: JSON.stringify({
      version: 1,
      locale: "tchinese",
      games: {
        123456: { tags: ["牌組製作", "策略"], fetchedAt: "2026-08-24T00:00:00.000Z" },
        654321: { tags: ["冒險"], fetchedAt: "   " },
      },
    }),
  }, reports: [
    { media: "games", filename: "遊戲.md", exists: true, content: gamesWithInvalidTagEntry },
    { media: "anime", filename: "動畫.md", exists: true, content: anime },
    { media: "movies", filename: "電影.md", exists: true, content: movies },
  ] };

  const loaded = await createBridge(async () => snapshot).load();
  const gameLibrary = loaded.libraries.find((item) => item.media === "games");

  assert.deepEqual(gameLibrary.entries.map((entry) => ({ appid: entry.appid, tags: entry.tags })), [
    { appid: "123456", tags: ["牌組製作", "策略"] },
    { appid: "654321", tags: [] },
  ]);
  assert.match(gameLibrary.tagWarning, /654321.*fetchedAt/);
});

test("Tauri sidecar 標籤壓縮空白、去空值去重並限制前 20 筆", () => {
  const result = parseGameTagSidecar({
    filename: "遊戲標籤.json",
    exists: true,
    content: JSON.stringify({
      version: 1,
      locale: "tchinese",
      games: {
        123456: {
          tags: [
            "  策略   角色扮演  ", "策略 角色扮演", "", "標籤01", "標籤02",
            "標籤03", "標籤04", "標籤05", "標籤06", "標籤07",
            "標籤08", "標籤09", "標籤10", "標籤11", "標籤12",
            "標籤13", "標籤14", "標籤15", "標籤16", "標籤17",
            "標籤18", "標籤19", "標籤20", "標籤21",
          ],
          fetchedAt: "2026-08-24T00:00:00.000Z",
        },
      },
    }),
  });

  assert.deepEqual(result.games.get("123456"), [
    "策略 角色扮演", "標籤01", "標籤02", "標籤03", "標籤04",
    "標籤05", "標籤06", "標籤07", "標籤08", "標籤09",
    "標籤10", "標籤11", "標籤12", "標籤13", "標籤14",
    "標籤15", "標籤16", "標籤17", "標籤18", "標籤19",
  ]);
  assert.equal(result.warning, null);
});

test("sidecar 不存在、損壞或版本不支援時不阻斷三份報告", async () => {
  const cases = [
    { name: "不存在", gameTags: { filename: "遊戲標籤.json", exists: false, content: null }, warning: null },
    { name: "損壞", gameTags: { filename: "遊戲標籤.json", exists: true, content: "{" }, warning: /無法讀取遊戲標籤/ },
    { name: "版本不支援", gameTags: { filename: "遊戲標籤.json", exists: true, content: JSON.stringify({ version: 2, locale: "tchinese", games: {} }) }, warning: /版本/ },
    { name: "語系不支援", gameTags: { filename: "遊戲標籤.json", exists: true, content: JSON.stringify({ version: 1, locale: "english", games: {} }) }, warning: /語系/ },
  ];

  for (const fixture of cases) {
    const snapshot = { dataDir: "C:\\CatchList", canUndo: false, gameTags: fixture.gameTags, reports: [
      { media: "games", filename: "遊戲.md", exists: true, content: games },
      { media: "anime", filename: "動畫.md", exists: true, content: anime },
      { media: "movies", filename: "電影.md", exists: true, content: movies },
    ] };
    const loaded = await createBridge(async () => snapshot).load();
    assert.deepEqual(loaded.libraries.map((item) => item.entries.length), [1, 2, 1, 0], fixture.name);
    assert.deepEqual(loaded.libraries[0].entries[0].tags, [], fixture.name);
    if (fixture.warning) assert.match(loaded.libraries[0].tagWarning, fixture.warning, fixture.name);
    else assert.equal(loaded.libraries[0].tagWarning, null, fixture.name);
  }
});
