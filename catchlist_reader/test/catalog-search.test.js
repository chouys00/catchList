import test from "node:test";
import assert from "node:assert/strict";
import { catalogGames, catalogLabels } from "../src/renderer/catalog-search.js";
import { createGameQuery } from "../src/renderer/game-browser.js";

test("合併收藏與有效隱藏資料，排除失效紀錄並依 AppID 去重", () => {
  const entry = { id: "game-1", appid: "1", title: "測試", favorite: true };
  const payload = { libraries: [{ media: "games", entries: [entry] }], hiddenEntries: [
    { media: "games", available: true, hideKey: "steam:1", reason: "played", entry },
    { media: "games", available: false, entry: { id: "game-2", appid: "2" } },
    { media: "anime", available: true, entry: { id: "anime-1" } },
  ] };
  const games = catalogGames(payload);
  assert.equal(games.length, 1);
  assert.equal(games[0].hiddenKey, "steam:1");
  assert.deepEqual(catalogLabels(games[0]), ["待玩收藏", "玩過了"]);
  assert.equal(catalogGames(payload), games);
  assert.notEqual(catalogGames({ ...payload }), games);
  assert.equal(entry.catalogReason, undefined);
});

test("大量遊戲跨分類搜尋包含收藏，沿用名稱與 AppID 比對及快取", () => {
  const payload = { libraries: [{ media: "games", entries: Array.from({ length: 20000 }, (_, i) => ({
    id: `game-${i}`, appid: String(i), title: `遊戲 ${i}`, originalTitle: `Game ${i}`, favorite: i % 2 === 0,
  })) }] };
  const games = catalogGames(payload);
  const query = createGameQuery();
  const result = query(games, { query: "GAME 19998" }, "catalog");
  assert.equal(result.length, 1);
  assert.equal(result[0].favorite, true);
  assert.equal(query(games, { query: "GAME 19998" }, "catalog"), result);
  assert.equal(query(games, { query: "19998" }, "catalog")[0].appid, "19998");
  assert.deepEqual(catalogLabels({}), ["尚未分類"]);
});
