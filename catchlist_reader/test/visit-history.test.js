import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { VisitHistory, VISIT_FILE } from "../src/visit-history.js";

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "catchlist-visits-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}
function library(media, keys, visible = keys) {
  return { media, exists: true, knownKeys: keys, entries: visible.map((hideKey) => ({ hideKey, score: 95 })) };
}
const flags = (result, media = "games") => result.libraries.find((item) => item.media === media).entries.map((item) => item.isNew);

test("首次建立基準；跨次來訪新增可見，同次重讀持續標記，下一次不重複", (t) => {
  const dir = fixture(t);
  const first = new VisitHistory();
  assert.deepEqual(flags(first.annotate(dir, [library("games", ["a"])], "games")), [false]);
  const second = new VisitHistory();
  assert.deepEqual(flags(second.annotate(dir, [library("games", ["a", "b"])], "games")), [false, true]);
  assert.deepEqual(flags(second.annotate(dir, [library("games", ["a", "b"])], "games")), [false, true]);
  assert.deepEqual(flags(second.annotate(dir, [library("games", ["a", "b", "c"])], "games")), [false, true, true]);
  assert.deepEqual(flags(new VisitHistory().annotate(dir, [library("games", ["a", "b", "c"])], "games")), [false, false, false]);
});

test("各類別來訪分開記錄；隱藏恢復及分數修改不當成新作品", (t) => {
  const dir = fixture(t);
  const visits = new VisitHistory();
  visits.annotate(dir, [library("games", ["a", "hidden"], ["a"]), library("anime", ["x"])], "games");
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, VISIT_FILE))).media.anime, undefined);
  assert.deepEqual(flags(visits.annotate(dir, [library("games", ["a", "hidden"])], "games")), [false, false]);
  const changed = library("games", ["a"]); changed.entries[0].score = 99;
  assert.deepEqual(flags(visits.annotate(dir, [changed], "games")), [false]);
  visits.annotate(dir, [library("anime", ["x"])], "anime");
  new VisitHistory().annotate(dir, [library("games", ["a"]), library("anime", ["x", "y"])], "games");
  assert.deepEqual(flags(new VisitHistory().annotate(dir, [library("anime", ["x", "y"])], "anime"), "anime"), [false, true]);
});

test("毀損紀錄保留原檔且不阻斷閱讀；缺少報告不建立基準；資料夾分開", (t) => {
  const dir = fixture(t), other = fixture(t);
  const visits = new VisitHistory();
  visits.annotate(dir, [{ media: "games", exists: false, entries: [] }], "games");
  assert.equal(fs.existsSync(path.join(dir, VISIT_FILE)), false);
  visits.annotate(dir, [library("games", ["a"])], "games");
  assert.deepEqual(flags(visits.annotate(other, [library("games", ["b"])], "games")), [false]);
  fs.writeFileSync(path.join(dir, VISIT_FILE), "broken");
  const result = visits.annotate(dir, [library("games", ["a", "b"])], "games");
  assert.ok(result.visitWarning);
  assert.equal(result.libraries[0].entries.length, 2);
  assert.equal(fs.readFileSync(path.join(dir, VISIT_FILE), "utf8"), "broken");
});
