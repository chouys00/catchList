import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { classifyPlayerMode, parseOfficialFeatures, MULTIPLAYER_FEATURE_IDS } from "../src/game-features.js";
import { loadLibrary, parseReport, setFavorite, hideEntry, restoreHiddenEntry } from "../src/library.js";
import { GAME_FEATURES_FILE } from "../src/game-feature-store.js";
import { parseGameDetails } from "../src/steam-game-lookup.js";
import { createGameQuery } from "../src/renderer/game-browser.js";
import { renderItemTemplate } from "../src/renderer/item-template.js";

const report = (badge = "") => `2026  2月  (更新時間: 2026-09-19)\n\n- **測試** (Test) [AppID: 123 | 中文支援: 支援中文${badge}]\n  2026-02-01 | 95% (1,000) | 策略\n  社群標籤: 單人, 多人\n  https://store.steampowered.com/app/123\n`;

test("指定的多人與合作功能優先於單人；PvP、遠端同樂與其他附加功能不能當作多人", () => {
  for (const id of MULTIPLAYER_FEATURE_IDS) assert.equal(classifyPlayerMode([2, id]), "multi");
  assert.equal(classifyPlayerMode([2, 22, 25, 41, 42, 43, 44, 62]), "single");
  for (const id of [36, 37, 47, 49]) assert.equal(classifyPlayerMode([2, id]), "single");
  assert.equal(classifyPlayerMode([62]), "unknown");
  assert.equal(classifyPlayerMode(undefined), "unknown");
  assert.equal(classifyPlayerMode([]), "unknown");
});

test("只解析官方功能連結，不採用社群、推薦區或任意文字", () => {
  const html = `<a class="app_tag" href="/search/?category2=38">多人</a>
    <a class="game_area_details_specs_ctn" href="https://store.steampowered.com/search/?category2=2&amp;snr=1"><div class="label">單人</div></a>
    <a class='game_area_details_specs_ctn other' href='/search/?category2=44'>遠端同樂</a>
    <a href="/search/?category2=20">推薦</a>`;
  assert.deepEqual(parseOfficialFeatures(html), [2, 44]);
});

test("歷史功能檔、報告與手動查詢使用相同規則，補資料不改收藏與隱藏識別", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "catchlist-features-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, "遊戲.md"), report());
  const before = loadLibrary(dir, "games").entries[0];
  assert.equal(before.playerMode, "unknown");
  setFavorite(dir, "games", before.id, true);
  fs.writeFileSync(path.join(dir, GAME_FEATURES_FILE), JSON.stringify({ version: 1, entries: { 123: { featureIds: [2, 38] } } }));
  let entry = loadLibrary(dir, "games").entries[0];
  assert.equal(entry.playerMode, "multi"); assert.equal(entry.id, before.id); assert.equal(entry.favorite, true);
  hideEntry(dir, "games", entry.id); assert.equal(loadLibrary(dir, "games").entries.length, 0);
  restoreHiddenEntry(dir, entry.hideKey); assert.equal(loadLibrary(dir, "games").entries[0].playerMode, "multi");
  fs.writeFileSync(path.join(dir, "遊戲.md"), report(" | 商店功能: 2,22"));
  assert.deepEqual(parseReport("games", report(" | 商店功能: 2,22")).entries[0].officialFeatureIds, [2, 22]);
  assert.equal(loadLibrary(dir, "games").entries[0].playerMode, "single");
  fs.writeFileSync(path.join(dir, GAME_FEATURES_FILE), "損壞");
  assert.match(loadLibrary(dir, "games").warning, /商店功能/);
  assert.equal(loadLibrary(dir, "games").entries[0].playerMode, "single");
  fs.writeFileSync(path.join(dir, "遊戲.md"), report());
  assert.equal(loadLibrary(dir, "games").entries[0].playerMode, "unknown");
  const manual = parseGameDetails("123", { 123: { success: true, data: { type: "game", name: "測試", categories: [{ id: 2 }, { id: 38 }] } } });
  assert.equal(classifyPlayerMode(manual.officialFeatureIds), "multi");
});

test("模式篩選更新快取，與中文及收藏條件交集；圖示清楚區分單人與多人", () => {
  const entries = [{ id: "1", playerMode: "single", chineseSupport: "supported", favorite: true },
    { id: "2", playerMode: "multi", chineseSupport: "supported", favorite: true },
    { id: "3", playerMode: "multi", chineseSupport: "unsupported" }, { id: "4" }];
  const query = createGameQuery();
  assert.equal(query(entries, { playerMode: "single" }).length, 1);
  assert.equal(query(entries, { playerMode: "multi" }).length, 2);
  assert.equal(query(entries, { playerMode: "multi", chinese: "supported" }, "favorites")[0].id, "2");
  assert.equal(query(entries, { playerMode: "unknown" })[0].id, "4");
  assert.equal(query(entries, { playerMode: "all" }).length, 4);
  const html = renderItemTemplate({ title: "測試", reviews: 100, playerMode: "multi" }, "games");
  assert.match(html, /也可能支援單人/);
  assert.match(html, /data-mode="multi"/);
});
