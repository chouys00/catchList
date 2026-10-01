import assert from "node:assert/strict";
import test from "node:test";
import { validExternalUrl, openExternalUrls } from "../src/external-links.js";
import { renderItemTemplate } from "../src/renderer/item-template.js";

test("時數按鈕的網址可通過正式開啟流程，交給外部瀏覽器", async () => {
  for (const name of ["Grunn", "Test Game", 'A&B: "遊戲" / #1?', "Women's Kingdom"]) {
    const markup = renderItemTemplate({ id: "test", title: "顯示名稱", originalTitle: name, tags: [], genres: [] }, "games");
    const raw = markup.match(/class="copy-title-button game-time-button"[^>]*data-open="([^"]+)"/)[1];
    const url = raw.replaceAll("&#39;", "'").replaceAll("&amp;", "&");
    const calls = [];
    assert.equal(await openExternalUrls([url], async (...args) => calls.push(args)), true);
    assert.deepEqual(calls, [[`https://howlongtobeat.com/?q=${encodeURIComponent(name)}`, { activate: false }]]);
  }
});

test("時數入口只允許正確網站的 HTTPS 搜尋網址", () => {
  assert.equal(validExternalUrl("https://howlongtobeat.com/?q=Grunn"), true);
  for (const url of ["http://howlongtobeat.com/?q=Grunn", "https://howlongtobeat.com.evil.test/?q=Grunn", "https://evil.test/?q=Grunn", "https://howlongtobeat.com/", "https://howlongtobeat.com/?q=%20", "https://howlongtobeat.com/login?q=Grunn", "https://user:pass@howlongtobeat.com/?q=Grunn", "https://howlongtobeat.com:8443/?q=Grunn", "file:///C:/test", "invalid", null, {}]) {
    assert.equal(validExternalUrl(url), false, String(url));
  }
});

test("既有 Steam、Google、IMDb、YouTube 連結仍可開啟，重複網址只開一次", async () => {
  const urls = ["https://store.steampowered.com/app/123456", "https://www.google.com/search?q=Test", "https://www.imdb.com/title/tt1234567/", "https://www.youtube.com/watch?v=N5nNKAVB4O4"];
  const calls = [];
  await openExternalUrls([...urls, urls[0]], async url => calls.push(url));
  assert.deepEqual(calls, urls);
});

test("無效網址或超量請求不會開啟任何分頁", async () => {
  for (const urls of [null, "https://howlongtobeat.com/?q=Grunn", ["https://howlongtobeat.com/?q=Grunn", "invalid"], Array(251).fill("https://howlongtobeat.com/?q=Grunn")]) {
    let opened = false;
    await assert.rejects(openExternalUrls(urls, async () => { opened = true; }), /外部連結不正確或數量過多/);
    assert.equal(opened, false);
  }
});
