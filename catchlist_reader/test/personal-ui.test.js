import assert from "node:assert/strict";
import test from "node:test";
import { hiddenListMarkup, updateStatusMarkup } from "../src/renderer/personal-ui.js";
import { renderItemTemplate } from "../src/renderer/item-template.js";

test("收藏按鈕提供明確的名稱與切換狀態", () => {
  const entry = { id: "a", title: "作品", score: 8, periodLabel: "2025", episodes: "12", format: "TV", searchUrl: "https://www.google.com" };
  assert.match(renderItemTemplate(entry, "anime"), /aria-pressed="false" aria-label="加入收藏 作品"/);
  assert.match(renderItemTemplate({ ...entry, favorite: true }, "anime"), /aria-pressed="true" aria-label="取消收藏 作品"/);
});

test("隱藏搜尋支援大小寫，失效紀錄及名稱不會變成 HTML", () => {
  const result = hiddenListMarkup([{ title: '<img src=x> TEST', hideKey: '["x"]', available: false }], "test");
  assert.equal(result.count, 1);
  assert.match(result.markup, /&lt;img src=x&gt;/);
  assert.match(result.markup, /清除隱藏紀錄/);
  assert.equal(hiddenListMarkup([], "").count, 0);
});

test("無紀錄不宣稱成功，失敗摘要與新增零筆如實顯示", () => {
  const initial = updateStatusMarkup({}, "games", false);
  assert.match(initial, /尚無每月執行紀錄/);
  assert.doesNotMatch(initial, /最近每月執行成功/);
  const failed = updateStatusMarkup({ updateStatus: { media: { games: { status: "failed", addedCount: 0, error: "<network>" } } } }, "games", true);
  assert.match(failed, /1 類更新失敗/);
  assert.match(failed, /新增 0 筆/);
  assert.match(failed, /&lt;network&gt;/);
});
