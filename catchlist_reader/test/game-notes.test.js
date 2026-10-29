import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as lib from "../src/library.js";
import { GAME_NOTES_FILE, readGameNotes } from "../src/game-notes.js";
import { noteButton, noteSummary } from "../src/renderer/game-note-ui.js";

test("備註依 Steam 編號保存，分類、重新讀取與報告更新後仍保留，清空只移除該款", t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "catchlist-notes-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const report = path.join(dir, "遊戲.md");
  fs.copyFileSync(new URL("../test-data/steam-tags-2026-02/遊戲.md", import.meta.url), report);
  const original = fs.readFileSync(report, "utf8");
  const [game, other] = lib.loadLibrary(dir, "games").entries;
  lib.setGameNote(dir, game.id, "  等更新；安裝中文 MOD\n再玩  ");
  lib.setGameNote(dir, other.id, "直接玩");
  assert.equal(lib.loadLibrary(dir, "games").entries[0].note, "等更新；安裝中文 MOD\n再玩");
  lib.setFavorite(dir, "games", game.id, true, "shared");
  lib.hideEntry(dir, "games", game.id, "backlog");
  assert.equal(lib.loadHiddenEntries(dir)[0].entry.note, "等更新；安裝中文 MOD\n再玩");
  lib.setGameNote(dir, game.id, "需要 MOD");
  lib.setFavorite(dir, "games", game.id, true);
  assert.equal(lib.loadLibrary(dir, "games").entries[0].note, "需要 MOD");
  assert.equal(fs.readFileSync(report, "utf8"), original);
  fs.writeFileSync(report, original.replace(game.title, "改過的名稱"));
  const renamed = lib.loadLibrary(dir, "games").entries.find(entry => entry.appid === game.appid);
  assert.equal(renamed.note, "需要 MOD");
  lib.setGameNote(dir, renamed.id, "  ");
  assert.equal(readGameNotes(dir)[game.appid], undefined);
  assert.equal(readGameNotes(dir)[other.appid], "直接玩");
  assert.throws(() => lib.setGameNote(dir, "missing", "備註"), /不存在/);
  assert.throws(() => lib.setGameNote(dir, renamed.id, "字".repeat(301)), /300/);
  const broken = '{"version":1,"notes":{"123":false}}';
  fs.writeFileSync(path.join(dir, GAME_NOTES_FILE), broken);
  assert.throws(() => lib.setGameNote(dir, renamed.id, "替代"), /格式/);
  assert.equal(fs.readFileSync(path.join(dir, GAME_NOTES_FILE), "utf8"), broken);
});

test("備註及標題以純文字顯示，沒有備註時不增加摘要列", () => {
  const game = { id: '"<id>', title: '<script>標題</script>', note: '<img src=x onerror=alert(1)>\n等更新' };
  assert.doesNotMatch(noteButton(game) + noteSummary(game), /<script>|<img/);
  assert.match(noteSummary(game), /&lt;img/);
  assert.equal(noteSummary({ ...game, note: "" }), "");
});
