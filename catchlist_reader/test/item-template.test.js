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
  genres: ["動作", "冒險"],
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
  assert.ok(markup.indexOf("2026-02-18") < markup.indexOf("92%"));
  assert.ok(markup.indexOf("92%") < markup.indexOf("動作、冒險"));
});

test("renderer 以 module 載入含 import 的 app.js", () => {
  const htmlPath = fileURLToPath(new URL("../src/renderer/index.html", import.meta.url));
  const html = fs.readFileSync(htmlPath, "utf8");

  assert.match(html, /<script type="module" src="app\.js"><\/script>/);
  assert.match(html, /img-src 'self' data: https:\/\/\*\.steamstatic\.com/);
  assert.match(html, /<dialog id="coverDialog"/);
});
