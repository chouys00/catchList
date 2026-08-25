import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { deleteEntry, loadLibrary, parseReport, undoDelete } from "../src/library.js";

const anime = `2025  春  >7.70    (更新時間: 2025-07-01)\n\n- 測試動畫  **8.20**  (12 · TV)\n- 測試動畫  **8.20**  (12 · TV)\n------------------------------\n`;
const movies = `2025  9月  >7.00    (更新時間: 2026-07-01  最低投票門檻: 30,000 票)\n\n- 測試電影  **8.15**  \`(IMDb: 8.3 | 一般外國片 (-0.15) | 144k票)\`\n------------------------------\n`;
const games = `2025  9月  (更新時間: 2026-03-01)\n\n- **測試遊戲** (Test Game) [🎮]\n  2025-09-02 | 97% (12,345) | 動作, 獨立製作\n  https://store.steampowered.com/app/123456\n\n------------------------------\n`;

test("解析三種報告與外部連結", () => {
  const animeEntries = parseReport("anime", anime).entries;
  assert.equal(animeEntries.length, 2);
  assert.notEqual(animeEntries[0].id, animeEntries[1].id);
  assert.equal(new URL(animeEntries[0].searchUrl).searchParams.get("q"), "測試動畫 動畫");

  const movie = parseReport("movies", movies).entries[0];
  assert.equal(movie.score, 8.15);
  assert.equal(movie.category, "一般外國片");
  assert.equal(movie.votes, 144000);
  assert.equal(new URL(movie.searchUrl).searchParams.get("q"), "測試電影 電影");

  const game = parseReport("games", games).entries[0];
  assert.equal(game.title, "測試遊戲");
  assert.equal(game.score, 97);
  assert.deepEqual(game.genres, ["動作", "獨立製作"]);
});

test("刪除指定重複作品、保留標題並可完整復原", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "catchlist-reader-"));
  const filepath = path.join(directory, "動畫.md");
  fs.writeFileSync(filepath, anime, "utf8");
  const entries = loadLibrary(directory, "anime").entries;

  const operation = deleteEntry(directory, "anime", entries[1].id);
  const afterDelete = fs.readFileSync(filepath, "utf8");
  assert.match(afterDelete, /^2025  春  >7\.70/m);
  assert.equal((afterDelete.match(/測試動畫/g) ?? []).length, 1);
  assert.equal(fs.existsSync(operation.backupPath), true);

  undoDelete(operation);
  assert.equal(fs.readFileSync(filepath, "utf8"), anime);
});
