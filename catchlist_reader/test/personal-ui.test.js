import assert from "node:assert/strict";
import test from "node:test";
import { entriesForView, hiddenListMarkup, updateStatusMarkup, viewNavigation } from "../src/renderer/personal-ui.js";
import { renderItemTemplate } from "../src/renderer/item-template.js";

test("收藏按鈕提供明確的名稱與切換狀態", () => {
  const entry = { id: "a", title: "作品", score: 8, periodLabel: "2025", episodes: "12", format: "TV", searchUrl: "https://www.google.com" };
  assert.match(renderItemTemplate(entry, "anime"), /aria-pressed="false" aria-label="加入收藏 作品"/);
  assert.match(renderItemTemplate({ ...entry, favorite: true }, "anime"), /aria-pressed="true" aria-label="取消收藏 作品"/);
});

test("已收藏作品只出現在收藏頁，不再出現在全部清單", () => {
  const entries = [{ id: "plain", favorite: false }, { id: "saved", favorite: true }];
  assert.deepEqual(entriesForView(entries, "all").map((entry) => entry.id), ["plain"]);
  assert.deepEqual(entriesForView(entries, "favorites").map((entry) => entry.id), ["saved"]);
  assert.deepEqual(entriesForView(entries, "played").map((entry) => entry.id), ["plain", "saved"]);

  const markup = viewNavigation("all", "anime", entries, 0);
  assert.match(markup, /data-view="all"[^>]*>全部<span>1<\/span>/);
  assert.match(markup, /data-view="favorites"[^>]*>待看收藏<span>1<\/span>/);
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
  assert.match(initial, /尚無檢查紀錄/);
  assert.doesNotMatch(initial, /最近每月執行成功/);
  const failed = updateStatusMarkup({ updateStatus: { media: { games: { status: "failed", addedCount: 0, error: "<network>" } } } }, "games", true);
  assert.match(failed, /最近檢查失敗/);
  assert.match(failed, /新增 0 筆/);
  assert.match(failed, /&lt;network&gt;/);
});

test("零筆顯示無新增，另列最後有新增的成功日期及筆數", () => {
  const markup = updateStatusMarkup({ updateStatus: { media: {
    games: { status: 'unchanged', addedCount: 0, finishedAt: '2026-10-02T01:00:00Z', lastSuccessAt: '2026-10-02', lastSuccessAddedCount: 138 },
  } } }, 'games', true);
  assert.match(markup, /檢查完成，無新增/);
  assert.match(markup, /2026\/10\/02<small>詳細時間未留存/);
  assert.match(markup, /<strong>138<\/strong><span> 筆/);
  assert.doesNotMatch(markup, /成功 · 新增 0 筆/);
  assert.doesNotMatch(markup, /最後更新成功：2026\/10\/02 00:00/);
});

test("收錄狀態與新增紀錄分開，其他類別失敗不污染目前摘要", () => {
  const markup = updateStatusMarkup({ updateStatus: { media: {
    games: { status: 'unchanged', coverage: { isCurrent: true, latestLabel: '2026 年 4 月' } },
    movies: { status: 'failed', error: '網路失敗', coverage: { isCurrent: true } },
  } } }, 'games', true);
  assert.match(markup.split('<section')[0], /已補齊收錄期間/);
  assert.doesNotMatch(markup.split('<section')[0], /failed|失敗/);
  assert.match(markup, /<details class="update-checks">/);
  assert.match(markup, /最後一次新增/);
  assert.match(markup, /待確認/);
  assert.doesNotMatch(markup, /新增 0 筆/);
});


test("遊戲分類導覽提供候補、玩過了與暫不考慮，其他媒體不增加入口", () => {
  const markup = viewNavigation("played", "games", [], 9, { backlog: 2, played: 4, not_interested: 3 });
  for (const key of ["backlog", "played", "not_interested"]) assert.ok(markup.includes(`data-view="${key}"`));
  assert.match(markup, /data-view="played" aria-pressed="true">玩過了<span>4/);
  assert.doesNotMatch(viewNavigation("all", "anime", [], 0), /data-view="played"|data-view="not_interested"/);
});
