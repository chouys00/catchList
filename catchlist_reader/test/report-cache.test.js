import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ReportCache } from "../src/report-cache.js";
import { parseReport, loadAllLibraries, loadHiddenEntries, setFavorite, hideEntry, restoreHiddenEntry, deleteEntry } from "../src/library.js";

const report = name => `2025  春  >7.70\n- ${name}  **8.20**  (12 · TV)\n------------------------------\n`;
test("重讀不再解析，收藏隱藏不重讀報告，刪除後立即更新", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "reader-cache-"));
  try {
    const file = path.join(dir, "動畫.md"); fs.writeFileSync(file, report("動畫甲"));
    let parses = 0, reads = 0;
    const cache = new ReportCache((media, text) => { if (text) parses++; return parseReport(media, text); }, { ...fs, readFileSync(...args) { reads++; return fs.readFileSync(...args); } });
    const get = () => loadAllLibraries(dir, cache).find(x => x.media === "anime");
    const entry = get().entries[0]; get();
    assert.equal(parses, 1); assert.equal(reads, 1);
    setFavorite(dir, "anime", entry.id, true); assert.equal(get().entries[0].favorite, true);
    hideEntry(dir, "anime", entry.id); assert.equal(get().entries.length, 0);
    const hidden = loadHiddenEntries(dir, cache); assert.equal(hidden[0].available, true);
    assert.equal(parses, 1); assert.equal(reads, 1);
    restoreHiddenEntry(dir, hidden[0].hideKey); assert.equal(get().entries[0].favorite, true);
    deleteEntry(dir, "anime", entry.id); assert.equal(get().entries.length, 0); assert.equal(parses, 2);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test("外部等長修改、保留修改時間、原子替換、缺檔與重建都失效", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "reader-cache-external-"));
  try {
    const file = path.join(dir, "動畫.md"); fs.writeFileSync(file, report("動畫甲"));
    const cache = new ReportCache(parseReport);
    const title = () => cache.read("anime", file).entries[0]?.title;
    assert.equal(title(), "動畫甲"); const stat = fs.statSync(file);
    fs.writeFileSync(file, report("動畫乙")); fs.utimesSync(file, stat.atime, stat.mtime);
    assert.equal(title(), "動畫乙");
    fs.writeFileSync(file + ".tmp", report("動畫丙")); fs.renameSync(file + ".tmp", file);
    assert.equal(title(), "動畫丙"); fs.unlinkSync(file);
    assert.equal(cache.read("anime", file).exists, false);
    fs.writeFileSync(file, report("動畫丁")); assert.equal(title(), "動畫丁");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
