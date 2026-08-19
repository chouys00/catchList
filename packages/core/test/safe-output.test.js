import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { atomicWriteFile, sanitizeDisplayText } from "../safe-output.js";

test("sanitizeDisplayText 移除控制與雙向覆寫字元並保留可讀文字", () => {
  const value = sanitizeDisplayText("  星際\u0000冒險\u202Eabc\n  ", { maxLength: 50 });
  assert.equal(value, "星際冒險abc");
});

test("atomicWriteFile 完整替換目標內容且不留下暫存檔", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "catchlist-safe-output-"));
  const target = path.join(dir, "report.md");
  try {
    fs.writeFileSync(target, "舊內容", "utf8");
    atomicWriteFile(target, "新內容", "utf8");
    assert.equal(fs.readFileSync(target, "utf8"), "新內容");
    assert.deepEqual(fs.readdirSync(dir), ["report.md"]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
