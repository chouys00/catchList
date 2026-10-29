import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as lib from "../src/library.js";
import { GameBatchService } from "../src/game-batch-service.js";
import { ManualGameService } from "../src/manual-game-service.js";
import { entriesForView, viewNavigation } from "../src/renderer/personal-ui.js";
import { catalogGames, catalogLabels } from "../src/renderer/catalog-search.js";
import { createGameQuery } from "../src/renderer/game-browser.js";

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "catchlist-shared-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.copyFileSync(new URL("../test-data/steam-tags-2026-02/遊戲.md", import.meta.url), path.join(dir, "遊戲.md"));
  return dir;
}

test("舊收藏唯讀相容、切換種類保留時間、取消與重新載入分類正確", t => {
  const dir = fixture(t), game = lib.loadLibrary(dir, "games").entries[0];
  const file = path.join(dir, lib.FAVORITES_FILE);
  const legacy = JSON.stringify({ version: 1, entries: [{ key: game.hideKey, media: "games", title: game.title, savedAt: "2020-01-01" }] });
  fs.writeFileSync(file, legacy);
  assert.equal(lib.loadAllLibraries(dir).find(l => l.media === "games").entries[0].favoriteKind, "personal");
  assert.equal(fs.readFileSync(file, "utf8"), legacy);
  lib.setFavorite(dir, "games", game.id, true, "shared");
  assert.equal(lib.readFavorites(dir).length, 1);
  assert.equal(lib.readFavorites(dir)[0].savedAt, "2020-01-01");
  assert.equal(lib.loadLibrary(dir, "games").entries[0].favoriteKind, "shared");
  lib.setFavorite(dir, "games", game.id, true);
  assert.equal(lib.loadLibrary(dir, "games").entries[0].favoriteKind, "personal");
  lib.setFavorite(dir, "games", game.id, false, "personal");
  assert.equal(lib.loadLibrary(dir, "games").entries[0].favoriteKind, null);
  assert.throws(() => lib.setFavorite(dir, "games", game.id, true, "invalid"), /種類/);
});

test("兩種收藏皆與所有隱藏分類互斥，單筆及批次復原保留種類", t => {
  const dir = fixture(t), game = lib.loadLibrary(dir, "games").entries[0];
  const original = fs.readFileSync(path.join(dir, "遊戲.md"), "utf8");
  for (const kind of ["personal", "shared"]) {
    for (const reason of ["watchlist", "backlog", "played", "not_interested"]) {
      lib.setFavorite(dir, "games", game.id, true, kind);
      const before = lib.readFavorites(dir);
      const operation = lib.hideEntry(dir, "games", game.id, reason);
      assert.deepEqual(lib.readFavorites(dir), []);
      lib.undoHide(dir, operation);
      assert.deepEqual(lib.readFavorites(dir), before);
      const service = new GameBatchService();
      const batch = service.apply(dir, service.prepare(dir, [game.appid], "hide", reason).token);
      assert.deepEqual(lib.readFavorites(dir), []);
      service.undo(dir, batch.operation);
      assert.deepEqual(lib.readFavorites(dir), before);
      lib.hideEntry(dir, "games", game.id, reason);
      lib.setFavorite(dir, "games", game.id, true, kind);
      assert.equal(lib.readHiddenEntries(dir).length, 0);
      assert.equal(lib.loadLibrary(dir, "games").entries[0].favoriteKind, kind);
    }
  }
  assert.equal(fs.readFileSync(path.join(dir, "遊戲.md"), "utf8"), original);
});

test("解除隱藏寫入失敗，收藏與隱藏紀錄皆恢復原樣", t => {
  const dir = fixture(t), game = lib.loadLibrary(dir, "games").entries[0];
  lib.setFavorite(dir, "games", game.id, true, "shared");
  lib.hideEntry(dir, "games", game.id, "watchlist");
  const files = [lib.FAVORITES_FILE, lib.HIDDEN_ENTRIES_FILE];
  const before = files.map(file => fs.readFileSync(path.join(dir, file), "utf8"));
  const originalRename = fs.renameSync;
  let failed = false;
  const mock = t.mock.method(fs, "renameSync", (from, to) => {
    if (!failed && to === path.join(dir, lib.HIDDEN_ENTRIES_FILE)) { failed = true; throw new Error("模擬磁碟寫入失敗"); }
    return originalRename(from, to);
  });
  assert.throws(() => lib.setFavorite(dir, "games", game.id, true, "shared"), /寫入失敗/);
  mock.mock.restore();
  assert.deepEqual(files.map(file => fs.readFileSync(path.join(dir, file), "utf8")), before);
});

test("導覽、搜尋、排序及分類標示區分個人與共樂收藏", () => {
  const entries = [{ id: "a", appid: "1", title: "個人遊戲", favorite: true }, { id: "b", appid: "2", title: "共樂遊戲", favorite: true, favoriteKind: "shared" }, { id: "c", appid: "3", title: "未分類", favorite: false }];
  assert.deepEqual(entriesForView(entries, "favorites").map(e => e.id), ["a"]);
  assert.deepEqual(entriesForView(entries, "shared").map(e => e.id), ["b"]);
  assert.deepEqual(entriesForView(entries, "all").map(e => e.id), ["c"]);
  const nav = viewNavigation("shared", "games", entries, 0);
  assert.doesNotMatch(nav, /data-view="hidden"/);
  assert.match(nav, /共樂收藏，1 款/);
  assert.match(viewNavigation("all", "anime", [], 0), /data-view="hidden"/);
  const games = catalogGames({ libraries: [{ media: "games", entries }] });
  assert.deepEqual(catalogLabels(games[1]), ["共樂收藏"]);
  assert.deepEqual(catalogLabels(games[0]), ["個人收藏"]);
  const query = createGameQuery();
  assert.equal(query(entries, { query: "遊戲", sort: "title" }, "shared")[0].id, "b");
});

test("手動加入共樂收藏並可依 AppID 定位既有作品", async t => {
  const dir = fixture(t);
  const service = new ManualGameService({ lookup: async () => ({ appid: "123", title: "一起玩", score: null, reviews: 0, releaseDate: null, releaseLabel: "即將推出", genres: [], tags: [], chineseSupport: "unknown", fetchedAt: "2026-10-14" }) });
  const preview = await service.prepare(dir, "123");
  service.commit(dir, preview.token, "shared");
  const entry = lib.loadLibrary(dir, "games").entries.find(e => e.appid === "123");
  assert.equal(entry.favoriteKind, "shared");
  assert.equal(lib.readHiddenEntries(dir).length, 0);
  assert.equal((await service.prepare(dir, "123")).duplicate.entry.appid, "123");
});
