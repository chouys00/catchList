import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { GameBatchService } from "../src/game-batch-service.js";
import { addManualRecord, readManualGames, atomicText, commitGameFiles, gameKey } from "../src/manual-games.js";
import { sourceEntries, hideEntry, readHiddenEntries, setHiddenReason, setFavorite } from "../src/library.js";

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "catchlist-batch-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const item = id => `- **遊戲 ${id}** (Game ${id}) [AppID: ${id} | 中文支援: 支援中文]\n  2025-09-02 | 97% (12,345) | 動作\n  社群標籤: 策略\n  https://store.steampowered.com/app/${id}\n\n`;
  fs.writeFileSync(path.join(dir, "遊戲.md"), `2025  9月  (更新時間: 2026-03-01)\n\n${item("123")}${item("456")}${item("123")}------------------------------\n`);
  addManualRecord(dir, { appid: "123", title: "手動123", score: 80, reviews: 5, releaseDate: null, releaseLabel: "即將推出", genres: [], tags: [], chineseSupport: "unknown", fetchedAt: "2026-09-16T00:00:00.000Z", addedAt: "2026-09-16T00:00:00.000Z" }, null);
  return dir;
}
const raw = dir => fs.readFileSync(path.join(dir, "遊戲.md"), "utf8");

test("批次預覽不寫入；刪除兩來源與重複收錄，備份內容和 SHA 相符", t => {
  const dir = fixture(t), service = new GameBatchService();
  const before = raw(dir), manualBefore = fs.readFileSync(path.join(dir, ".catchlist-manual-games.json"), "utf8");
  const p = service.prepare(dir, ["123", "123"], "delete");
  assert.equal(p.count, 1); assert.equal(raw(dir), before); assert.ok(!fs.existsSync(path.join(dir, ".catchlist-backups")));
  const result = service.apply(dir, p.token);
  assert.deepEqual(sourceEntries(dir, "games").entries.map(e => e.appid), ["456"]);
  assert.equal(readManualGames(dir).entries.length, 0);
  assert.match(raw(dir), /2025  9月/); assert.match(raw(dir), /------------------------------/);
  assert.equal(fs.readFileSync(path.join(result.backupPath, "遊戲.md"), "utf8"), before);
  assert.equal(fs.readFileSync(path.join(result.backupPath, ".catchlist-manual-games.json"), "utf8"), manualBefore);
  const manifest = JSON.parse(fs.readFileSync(path.join(result.backupPath, "manifest.json"), "utf8"));
  for (const file of manifest.files) assert.equal(crypto.createHash("sha256").update(fs.readFileSync(path.join(result.backupPath, file.name))).digest("hex"), file.sha256);
  assert.throws(() => service.apply(dir, p.token), /失效/);
});
test("缺失對象、確認期間改檔及切換資料夾均零刪除", t => {
  const dir = fixture(t), service = new GameBatchService(), before = raw(dir);
  assert.throws(() => service.prepare(dir, ["123", "999"], "delete"), /不存在/);
  assert.equal(raw(dir), before);
  let p = service.prepare(dir, ["123"], "delete");
  fs.appendFileSync(path.join(dir, "遊戲.md"), "\n外部修改");
  const changed = raw(dir);
  assert.throws(() => service.apply(dir, p.token), /資料已變更/);
  assert.equal(raw(dir), changed); assert.ok(!fs.existsSync(path.join(dir, ".catchlist-backups")));
  p = service.prepare(dir, ["123"], "delete");
  assert.throws(() => service.apply(path.join(dir, "other"), p.token), /失效/);
  assert.equal(raw(dir), changed);
});
test("備份失敗零刪除；第二來源寫入失敗整批復原，備份保留", t => {
  const dir = fixture(t), before = raw(dir);
  let service = new GameBatchService({ backup: () => { throw Error("備份失敗"); } });
  let p = service.prepare(dir, ["123", "456"], "delete");
  assert.throws(() => service.apply(dir, p.token), /備份失敗/); assert.equal(raw(dir), before);
  service = new GameBatchService({ commit: (directory, changes) => { let n = 0; commitGameFiles(directory, changes, (file, content) => { if (++n === 2) throw Error("模擬寫入失敗"); atomicText(file, content); }); } });
  p = service.prepare(dir, ["123", "456"], "delete");
  assert.throws(() => service.apply(dir, p.token), /寫入失敗/);
  assert.equal(raw(dir), before); assert.equal(readManualGames(dir).entries.length, 1);
  assert.ok(fs.existsSync(path.join(dir, ".catchlist-backups"))); assert.ok(!fs.existsSync(path.join(dir, ".catchlist-game-transaction.json")));
});
test("批次隱藏保留時間與收藏，略過相同分類；整批復原保留無關紀錄", t => {
  const dir = fixture(t), service = new GameBatchService();
  const entries = sourceEntries(dir, "games").entries;
  hideEntry(dir, "games", entries[0].id, "played");
  const original = readHiddenEntries(dir)[0]; setFavorite(dir, "games", entries[0].id, true);
  const fav = fs.readFileSync(path.join(dir, ".catchlist-favorites.json"), "utf8");
  const result = service.apply(dir, service.prepare(dir, ["123", "456"], "hide", "backlog").token);
  assert.equal(readHiddenEntries(dir)[0].hiddenAt, original.hiddenAt);
  assert.equal(readHiddenEntries(dir)[0].reason, "backlog");
  assert.equal(service.prepare(dir, ["123", "456"], "hide", "backlog").skippedCount, 2);
  const extra = { hideKey: "other", media: "anime", title: "其他", hiddenAt: "now" };
  fs.writeFileSync(path.join(dir, ".catchlist-hidden.json"), JSON.stringify({ version: 1, entries: [...readHiddenEntries(dir), extra] }));
  service.undo(dir, result.operation);
  assert.deepEqual(readHiddenEntries(dir), [original, extra]);
  assert.equal(fs.readFileSync(path.join(dir, ".catchlist-favorites.json"), "utf8"), fav);
});
test("復原遇到所選紀錄後續變更時整批停止", t => {
  const dir = fixture(t), service = new GameBatchService();
  const result = service.apply(dir, service.prepare(dir, ["123", "456"], "hide", "backlog").token);
  setHiddenReason(dir, gameKey("456"), "played");
  const before = fs.readFileSync(path.join(dir, ".catchlist-hidden.json"), "utf8");
  assert.throws(() => service.undo(dir, result.operation), /已變更/);
  assert.equal(fs.readFileSync(path.join(dir, ".catchlist-hidden.json"), "utf8"), before);
});
