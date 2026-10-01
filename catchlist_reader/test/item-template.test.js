import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { formatGameTitleCopyText, renderItemTemplate } from "../src/renderer/item-template.js";

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

const liveAction = {
  id: "show-1",
  title: "測試真人劇",
  periodLabel: "2025 年全年度",
  region: "韓劇",
  imdbScore: 8.2,
  votesLabel: "7,526 票",
  hasImdbUrl: true,
  url: "https://www.imdb.com/title/tt1234567/",
};

test("動畫列先顯示評分與名稱，再顯示年份和集數", () => {
  const markup = renderItemTemplate(anime, "anime");

  assert.match(markup, /^<article class="item anime" data-anime-row="anime-1">/);
  assert.match(markup, /class="anime-cover anime-cover-empty"/);
  assert.ok(markup.indexOf('class="score"') < markup.indexOf('class="title title-actions"'));
  assert.ok(markup.indexOf("2026 年春季") < markup.indexOf("19 · TV"));
  assert.match(markup, /class="game-title-link"[^>]+data-open="https:\/\/www\.google\.com\/search\?q=%E6%B8%AC%E8%A9%A6%E5%8B%95%E7%95%AB"[^>]+aria-label="使用 Google 搜尋 測試動畫"/);
  assert.match(markup, /class="copy-title-button"[^>]+data-copy-title="anime-1"[^>]+aria-label="複製 測試動畫 的名稱"/);
});

test("動畫封面可放大、宣傳影片需點擊才開啟，補充集數不覆蓋原資料", () => {
  const markup = renderItemTemplate({ ...anime, animeMedia: { status: "ready", coverUrl: "https://cdn.myanimelist.net/images/test.jpg", trailerUrl: "https://www.youtube.com/watch?v=N5nNKAVB4O4", trailerTitle: "Hyouka Promo", trailerAuthor: "AnimaxAsia", episodes: 22 } }, "anime");
  assert.match(markup, /data-cover="https:\/\/cdn.myanimelist.net/);
  assert.match(markup, /觀看宣傳影片/);
  assert.match(markup, /Hyouka Promo/);
  assert.match(markup, /19 · TV/);
  assert.doesNotMatch(markup, /<iframe|autoplay=/);
});

test("電影列先顯示評分與名稱，再顯示年份、IMDb 與類別", () => {
  const markup = renderItemTemplate(movie, "movies");

  assert.match(markup, /^<article class="item movies"><span class="score">8\.15<\/span><div class="title title-actions">/);
  assert.ok(markup.indexOf("2026 年 2 月") < markup.indexOf("IMDb 7.8 · 12 萬票"));
  assert.ok(markup.indexOf("IMDb 7.8 · 12 萬票") < markup.indexOf("劇情"));
  assert.match(markup, /class="game-title-link"[^>]+aria-label="使用 Google 搜尋 測試電影"/);
  assert.match(markup, /class="copy-title-button"[^>]+data-copy-title="movie-1"/);
});

test("動畫缺少評分、集數與類型時顯示明確替代文字", () => {
  const markup = renderItemTemplate({
    ...anime,
    score: null,
    episodes: null,
    format: null,
    periodLabel: "劇場版",
  }, "anime");

  assert.match(markup, /<span class="score">—<\/span>/);
  assert.match(markup, /劇場版/);
  assert.match(markup, /集數與類型未提供/);
});

test("真人劇列顯示年度、地區與 IMDb 資訊", () => {
  const markup = renderItemTemplate(liveAction, "liveAction");

  assert.match(markup, /2025 年全年度/);
  assert.match(markup, /韓劇/);
  assert.match(markup, /IMDb 8\.2 · 7,526 票/);
  assert.match(markup, /data-open="https:\/\/www\.imdb\.com\/title\/tt1234567\/"/);
  assert.match(markup, />開啟 IMDb<\/button>/);
  assert.match(markup, /class="game-title-link"[^>]+data-open="https:\/\/www\.google\.com\/search\?q=%E6%B8%AC%E8%A9%A6%E7%9C%9F%E4%BA%BA%E5%8A%87"/);
  assert.match(markup, /class="copy-title-button"[^>]+data-copy-title="show-1"/);
});

test("作品名稱與搜尋網址會安全放進按鈕屬性", () => {
  const markup = renderItemTemplate({ ...anime, id: 'a"b', title: 'A&B <劇>' }, "anime");
  assert.match(markup, /data-copy-title="a&quot;b"/);
  assert.match(markup, /data-open="https:\/\/www\.google\.com\/search\?q=A%26B%20%3C%E5%8A%87%3E"/);
  assert.match(markup, /A&amp;B &lt;劇&gt;/);
});

test("遊戲列把好評率與評論數組合為同一欄", () => {
  const markup = renderItemTemplate(game, "games");

  assert.match(markup, /^<article class="item games" data-game-row="123456"><button class="game-cover" type="button" data-cover=/);
  assert.match(markup, /<img src="https:\/\/shared\.akamai\.steamstatic\.com\/store_item_assets\/steam\/apps\/123456\/hash\/header_tchinese\.jpg\?t=1" alt="遊戲封面：測試遊戲">/);
  assert.match(markup, /<span class="rating"><strong>92%<\/strong><small>\(18,452\)<\/small><\/span>/);
  assert.match(markup, /class="game-title-link"[^>]+data-open="https:\/\/example\.com\/game"/);
  assert.match(markup, /class="copy-title-button"[^>]+data-copy-title="game-1"[^>]+aria-label="複製 測試遊戲 的中英文名稱"[^>]+title="複製中英文名稱"/);
  assert.match(markup, /測試遊戲[\s\S]*Test Game/);
  assert.match(markup, /class="language-status supported"[^>]+aria-label="支援中文"/);
  assert.equal(markup.includes(">Steam</button>"), false);
  assert.match(markup, /class="icon-button"[^>]+aria-label="隱藏 測試遊戲"/);
  assert.match(markup, /class="icon-button danger"[^>]+aria-label="真正刪除 測試遊戲"/);
  assert.ok(markup.indexOf("92%") < markup.indexOf("2026-02-18"));
  assert.ok(markup.indexOf("2026-02-18") < markup.indexOf("策略"));
});

test("遊戲名稱複製文字以中文在前，並排除空白與重複名稱", () => {
  assert.equal(formatGameTitleCopyText(" 測試遊戲 ", " Test Game "), "測試遊戲\nTest Game");
  assert.equal(formatGameTitleCopyText("Tiny Bunny", " Tiny Bunny "), "Tiny Bunny");
  assert.equal(formatGameTitleCopyText("只有中文", "  "), "只有中文");
  assert.equal(formatGameTitleCopyText("A&B <遊戲>", "Quote \"Game\""), "A&B <遊戲>\nQuote \"Game\"");
});

test("遊戲時數按鈕在複製後方，優先搜尋原名並安全編碼", () => {
  const name = '  A&B: "Game" / 中文? #1  ';
  const markup = renderItemTemplate({ ...game, originalTitle: name }, "games");
  assert.ok(markup.indexOf('data-copy-title=') < markup.indexOf('game-time-button'));
  assert.ok(markup.includes(`data-open="https://howlongtobeat.com/?q=${encodeURIComponent(name.trim()).replaceAll("'", "&#39;")}"`));
  assert.match(markup, /aria-label="在 HowLongToBeat 查詢 A&amp;B/);
  assert.match(markup, /title="查詢遊戲時數（HowLongToBeat）"/);
  assert.match(markup, /data-open="https:\/\/example\.com\/game"/);
});

test("遊戲缺少原名時以顯示名稱查詢，其他媒體不顯示時數按鈕", () => {
  for (const originalTitle of [undefined, null, "  "]) {
    const markup = renderItemTemplate({ ...game, originalTitle, title: " Grunn " }, "games");
    assert.ok(markup.includes('data-open="https://howlongtobeat.com/?q=Grunn"'));
  }
  assert.doesNotMatch(renderItemTemplate({ ...game, title: "", originalTitle: "" }, "games"), /game-time-button/);
  for (const [entry, media] of [[anime, "anime"], [movie, "movies"], [liveAction, "liveAction"]]) {
    assert.doesNotMatch(renderItemTemplate(entry, media), /howlongtobeat|game-time-button/);
  }
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
  assert.match(html, /id="backToTop"[^>]+data-action="back-to-top"[^>]+aria-label="返回頂部"/);
});
