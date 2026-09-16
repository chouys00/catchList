import assert from "node:assert/strict";
import test from "node:test";

import { collectTagOptions, collectTagOptionsFromIndex, createTagIndex, filterAndSortGames, visibleGameTags } from "../src/renderer/game-browser.js";

test("三種排序保留篩選與新收錄條件，不修改來源陣列", () => {
  const source = [
    { title: "最新", releaseDate: "2026-02-01", score: 90, reviews: 500, isNew: true },
    { title: "最高分", releaseDate: "2025-02-01", score: 99, reviews: 1000, isNew: true },
    { title: "最多票", releaseDate: "2024-02-01", score: 95, reviews: 10000, isNew: false },
  ];
  assert.equal(filterAndSortGames(source, { sort: "date" })[0].title, "最新");
  assert.equal(filterAndSortGames(source, { sort: "score" })[0].title, "最高分");
  assert.equal(filterAndSortGames(source, { sort: "reviews" })[0].title, "最多票");
  assert.deepEqual(filterAndSortGames(source, { sort: "reviews", newOnly: true, min: 95 }).map((entry) => entry.title), ["最高分"]);
  assert.deepEqual(source.map((entry) => entry.title), ["最新", "最高分", "最多票"]);
});

const entries = [
  {
    appid: "newer",
    title: "新牌組遠征",
    originalTitle: "New Deck Quest",
    year: 2026,
    month: 2,
    releaseDate: "2026-02-18",
    score: 95,
    reviews: 25000,
    chineseSupport: "supported",
    genres: ["策略", "角色扮演"],
    tags: ["策略", "牌組製作", "輕度 Rogue", "單人"],
  },
  {
    appid: "older",
    title: "舊牌組戰記",
    originalTitle: "Old Deck Tale",
    year: 2025,
    month: 11,
    releaseDate: "2025-11-04",
    score: 95,
    reviews: 18000,
    chineseSupport: "unsupported",
    genres: ["策略"],
    tags: ["牌組製作", "策略", "回合制"],
  },
  {
    appid: "popular",
    title: "超熱門戰棋",
    originalTitle: "Popular Tactics",
    year: 2026,
    month: 2,
    releaseDate: "2026-02-18",
    score: 95,
    reviews: 60000,
    chineseSupport: "supported",
    genres: ["策略"],
    tags: ["策略", "回合制"],
  },
  {
    appid: "query-only",
    title: "銀河牌庫",
    originalTitle: "Galaxy Deck",
    year: 2024,
    month: 7,
    releaseDate: "2024-07-01",
    score: 88,
    reviews: 12000,
    chineseSupport: "unknown",
    genres: ["模擬"],
    tags: ["牌組製作", "劇情豐富"],
  },
  {
    appid: "fallback",
    title: "沒有標籤的舊作",
    originalTitle: "Legacy Game",
    year: 2023,
    month: 3,
    releaseDate: "2023-03-10",
    score: 91,
    reviews: 9000,
    chineseSupport: "unknown",
    genres: ["動作"],
    tags: [],
  },
];

test("標籤使用 AND 並依日期、好評率、評論數排序", () => {
  const result = filterAndSortGames(entries, {
    query: "",
    year: "all",
    month: "all",
    min: "90",
    tags: ["策略", "牌組製作"],
  });

  assert.deepEqual(result.map(({ appid }) => appid), ["newer", "older"]);
});

test("名稱、年份、月份與最低好評率可組合篩選", () => {
  const result = filterAndSortGames(entries, {
    query: "deck",
    year: "2024",
    month: "7",
    min: "80",
    tags: ["牌組製作"],
  });

  assert.deepEqual(result.map(({ appid }) => appid), ["query-only"]);
});

test("最低評論數可和其他條件組合篩選", () => {
  const result = filterAndSortGames(entries, {
    min: "90",
    minReviews: "20000",
  });

  assert.deepEqual(result.map(({ appid }) => appid), ["popular", "newer"]);
});

test("中文支援狀態可和其他條件組合篩選", () => {
  const supported = filterAndSortGames(entries, { chinese: "supported" });
  const unsupported = filterAndSortGames(entries, { chinese: "unsupported" });
  const unknown = filterAndSortGames(entries, { chinese: "unknown" });
  assert.deepEqual(supported.map(({ appid }) => appid), ["popular", "newer"]);
  assert.deepEqual(unsupported.map(({ appid }) => appid), ["older"]);
  assert.deepEqual(unknown.map(({ appid }) => appid), ["query-only", "fallback"]);
});

test("標籤選項把已選項固定在前並依數量排序", () => {
  const result = collectTagOptions(entries, ["牌組製作", "不存在的標籤"], "制");

  assert.deepEqual(result, [
    { tag: "牌組製作", count: 3, selected: true },
    { tag: "不存在的標籤", count: 0, selected: true },
    { tag: "回合制", count: 2, selected: false },
  ]);
});

test("標籤索引保留原本的計數、搜尋、排序與已選規則", () => {
  const index = createTagIndex(entries);
  assert.deepEqual(
    collectTagOptionsFromIndex(index, ["牌組製作", "不存在的標籤"], "制"),
    collectTagOptions(entries, ["牌組製作", "不存在的標籤"], "制"),
  );
  assert.deepEqual(
    collectTagOptionsFromIndex(index, [], ""),
    collectTagOptions(entries, [], ""),
  );
});

test("已選社群標籤優先，缺漏時才顯示官方類型", () => {
  const entry = {
    tags: ["策略", "牌組製作", "輕度 Rogue", "單人"],
    genres: ["模擬", "休閒"],
  };

  assert.deepEqual(visibleGameTags(entry, ["牌組製作"], false, 3), {
    visible: ["牌組製作", "策略", "輕度 Rogue"],
    hiddenCount: 1,
    fallback: false,
  });
  assert.deepEqual(visibleGameTags(entry, ["牌組製作"], true, 3), {
    visible: ["牌組製作", "策略", "輕度 Rogue", "單人"],
    hiddenCount: 0,
    fallback: false,
  });
  assert.equal(visibleGameTags({ tags: [], genres: ["動作"] }, [], false, 3).fallback, true);
});
