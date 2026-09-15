import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { renderItemTemplate } from "../src/renderer/item-template.js";

const anime = {
  id: "anime-1",
  title: "測試動畫",
  score: 9.2,
  periodLabel: "2026 年春季",
  episodes: "19",
  format: "TV",
  searchUrl: "https://example.com/anime"
};

const movie = {
  id: "movie-1",
  title: "測試電影",
  score: 8.15,
  periodLabel: "2026 年 2 月",
  imdbScore: 7.8,
  votesLabel: "12 萬票",
  category: "劇情",
  searchUrl: "https://example.com/movie"
};

const game = {
  id: "game-1",
  title: "測試遊戲",
  originalTitle: "Test Game",
  releaseDate: "2026-02-18",
  score: 92,
  reviews: 18452,
  chineseSupport: "supported",
  genres: ["動作", "冒險"],
  tags: ["策略", "牌組製作", "輕度 Rogue", "單人", "甲板構築"],
  appid: "123456",
  coverUrl: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/123456/hash/header_tchinese.jpg?t=1",
  url: "https://example.com/game"
};

test("動畫列先顯示評分與名稱，再顯示年份和集數", () => {
  const markup = renderItemTemplate(anime, "anime");

  assert.match(markup, /^<article class="item anime"><span class="score">9\.20<\/span><div class="title">/);
  assert.ok(markup.indexOf("2026 年春季") < markup.indexOf("19 · TV"));
});

test("電影列先顯示評分與名稱，再顯示年份、IMDb 與類別", () => {
  const markup = renderItemTemplate(movie, "movies");

  assert.match(markup, /^<article class="item movies"><span class="score">8\.15<\/span><div class="title">/);
  assert.ok(markup.indexOf("2026 年 2 月") < markup.indexOf("IMDb 7.8 · 12 萬票"));
  assert.ok(markup.indexOf("IMDb 7.8 · 12 萬票") < markup.indexOf("劇情"));
});

test("遊戲列把好評率與評論數組合為同一欄", () => {
  const markup = renderItemTemplate(game, "games");

  assert.match(markup, /^<article class="item games"><button class="game-cover" type="button" data-cover=/);
  assert.match(markup, /<img src="https:\/\/shared\.akamai\.steamstatic\.com\/store_item_assets\/steam\/apps\/123456\/hash\/header_tchinese\.jpg\?t=1" alt="遊戲封面：測試遊戲">/);
  assert.match(markup, /<span class="rating"><strong>92%<\/strong><small>\(18,452\)<\/small><\/span>/);
  assert.match(markup, /class="title game-title-link"[^>]+data-open="https:\/\/example\.com\/game"/);
  assert.match(markup, /測試遊戲[\s\S]*Test Game/);
  assert.match(markup, /class="language-status supported"[^>]+aria-label="支援中文"/);
  assert.equal(markup.includes(">Steam</button>"), false);
  assert.match(markup, /class="icon-button"[^>]+aria-label="隱藏 測試遊戲"/);
  assert.match(markup, /class="icon-button danger"[^>]+aria-label="真正刪除 測試遊戲"/);
  assert.ok(markup.indexOf("2026-02-18") < markup.indexOf("92%"));
  assert.ok(markup.indexOf("92%") < markup.indexOf("策略"));
});

test("中文支援圖示涵蓋不支援與待確認狀態", () => {
  const unsupported = renderItemTemplate({ ...game, chineseSupport: "unsupported" }, "games");
  const unknown = renderItemTemplate({ ...game, chineseSupport: "unknown" }, "games");
  assert.match(unsupported, /class="language-status unsupported"[^>]+aria-label="不支援中文"/);
  assert.match(unknown, /class="language-status unknown"[^>]+aria-label="中文支援待確認"/);
});

test("遊戲列把已選標籤排到前面並提供展開按鈕", () => {
  const markup = renderItemTemplate(game, "games", {
    selectedTags: ["牌組製作"],
    expanded: false,
    tagLimit: 3,
  });

  assert.ok(markup.indexOf('data-selected-tag="牌組製作"') < markup.indexOf('data-game-tag="策略"'));
  assert.match(markup, /data-game-tag="牌組製作"[\s\S]*牌組製作<\/button>/);
  assert.match(markup, /data-expand-tags="123456" aria-expanded="false" aria-label="顯示測試遊戲的其餘 2 個標籤">＋2<\/button>/);
  assert.equal(markup.includes("尚未補齊社群標籤"), false);
});

test("遊戲列展開全部標籤後在同一位置提供收起按鈕", () => {
  const markup = renderItemTemplate(game, "games", {
    selectedTags: [],
    expanded: true,
    tagLimit: 3,
  });

  assert.match(markup, /data-expand-tags="123456" aria-expanded="true" aria-label="收起測試遊戲的社群標籤">收起<\/button>/);
  assert.match(markup, /甲板構築/);
  assert.equal(markup.includes("＋2"), false);
});

test("沒有社群標籤時改顯示 genres 與補齊提示", () => {
  const markup = renderItemTemplate({
    ...game,
    appid: "fallback-app",
    tags: [],
    genres: ["模擬", "休閒"],
  }, "games", {
    selectedTags: [],
    expanded: false,
    tagLimit: 3,
  });

  assert.match(markup, /尚未補齊社群標籤/);
  assert.match(markup, /模擬/);
  assert.match(markup, /休閒/);
  assert.equal(markup.includes('data-game-tag="模擬"'), false);
});

test("fallback genres 超過顯示上限時仍提供展開按鈕", () => {
  const collapsed = renderItemTemplate({
    ...game,
    appid: "fallback-many",
    tags: [],
    genres: ["模擬", "休閒", "策略", "建造", "管理"],
  }, "games", {
    selectedTags: [],
    expanded: false,
    tagLimit: 3,
  });
  const expanded = renderItemTemplate({
    ...game,
    appid: "fallback-many",
    tags: [],
    genres: ["模擬", "休閒", "策略", "建造", "管理"],
  }, "games", {
    selectedTags: [],
    expanded: true,
    tagLimit: 3,
  });

  assert.match(collapsed, /data-expand-tags="fallback-many" aria-expanded="false" aria-label="顯示測試遊戲的其餘 2 個類型">＋2<\/button>/);
  assert.equal(collapsed.includes("建造"), false);
  assert.match(expanded, /建造/);
  assert.match(expanded, /管理/);
  assert.match(expanded, /data-expand-tags="fallback-many" aria-expanded="true" aria-label="收起測試遊戲的遊戲類型">收起<\/button>/);
});

test("renderer 以 module 載入含 import 的 app.js", () => {
  const htmlPath = fileURLToPath(new URL("../src/renderer/index.html", import.meta.url));
  const html = fs.readFileSync(htmlPath, "utf8");

  assert.match(html, /<script type="module" src="app\.js"><\/script>/);
  assert.match(html, /img-src 'self' data: https:\/\/\*\.steamstatic\.com/);
  assert.match(html, /<dialog id="coverDialog"/);
});
