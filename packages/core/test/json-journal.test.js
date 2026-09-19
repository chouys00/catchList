import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { JsonJournal } from "../json-journal.js";

test("未合併日誌可跨實例恢復，半筆損壞後仍能保存下一筆", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "json-journal-"));
  try {
    const file = path.join(dir, "cache.json"); fs.writeFileSync(file, JSON.stringify({ old: 1 }));
    const store = new JsonJournal(file); store.set("a", 2); store.set("b", 3);
    assert.deepEqual(JSON.parse(fs.readFileSync(file)), { old: 1 });
    fs.appendFileSync(file + ".journal", '{"key":"broken"');
    const resumed = new JsonJournal(file); assert.deepEqual(resumed.data, { old: 1, a: 2, b: 3 });
    resumed.set("c", 4); assert.equal(new JsonJournal(file).data.c, 4);
    resumed.flush(); assert.equal(fs.existsSync(file + ".journal"), false);
    assert.deepEqual(JSON.parse(fs.readFileSync(file)), resumed.data);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test("合併失敗保留原檔與日誌，成功後減少完整檔案寫入", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "json-journal-fail-"));
  try {
    const file = path.join(dir, "cache.json"); fs.writeFileSync(file, "{}"); let writes = 0;
    const store = new JsonJournal(file, { fileSystem: { ...fs, writeFileSync(...args) { writes++; return fs.writeFileSync(...args); }, renameSync() { throw Error("locked"); } } });
    for (let i = 0; i < 20; i++) store.set(i, i);
    assert.equal(writes, 0); assert.throws(() => store.flush(), /locked/);
    assert.equal(fs.readFileSync(file, "utf8"), "{}");
    const resumed = new JsonJournal(file); assert.equal(Object.keys(resumed.data).length, 20); resumed.flush();
    assert.equal(Object.keys(JSON.parse(fs.readFileSync(file))).length, 20);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
