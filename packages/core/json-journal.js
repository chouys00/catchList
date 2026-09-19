import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

/** 單一更新程序使用：逐筆日誌可續跑，完整 JSON 僅定期合併。 */
export class JsonJournal {
  constructor(filepath, { decode = value => value, encode = value => value, checkpointEvery = 100, fileSystem = fs } = {}) {
    this.filepath = filepath;
    this.journalPath = `${filepath}.journal`;
    this.fs = fileSystem;
    this.encode = encode;
    this.checkpointEvery = checkpointEvery;
    this.pending = 0;
    let data;
    try { data = decode(JSON.parse(this.fs.readFileSync(filepath, "utf8"))); } catch { data = {}; }
    this.data = data && typeof data === "object" && !Array.isArray(data) ? data : {};
    let journal = "";
    try { journal = this.fs.readFileSync(this.journalPath, "utf8"); } catch (error) { if (error.code !== "ENOENT") throw error; }
    for (const line of journal.split("\n")) {
      if (!line.trim()) continue;
      try {
        const record = JSON.parse(line);
        if (typeof record.key !== "string" || !Object.hasOwn(record, "value")) continue;
        Object.defineProperty(this.data, record.key, { value: record.value, writable: true, enumerable: true, configurable: true });
        this.pending++;
      } catch { /* 突然中斷的半筆快取不採用，其餘成功紀錄仍可重播。 */ }
    }
  }
  set(key, value) {
    this.fs.mkdirSync(path.dirname(this.filepath), { recursive: true });
    // 前置換行隔開上次中斷留下的半筆內容。
    this.fs.appendFileSync(this.journalPath, `\n${JSON.stringify({ key: String(key), value })}\n`, "utf8");
    Object.defineProperty(this.data, String(key), { value, writable: true, enumerable: true, configurable: true });
    this.pending++;
    if (this.pending >= this.checkpointEvery) this.flush();
  }
  flush() {
    if (!this.pending) return;
    const temporary = `${this.filepath}.${crypto.randomUUID()}.tmp`;
    try {
      this.fs.writeFileSync(temporary, `${JSON.stringify(this.encode(this.data), null, 2)}\n`, { encoding: "utf8", flag: "wx" });
      this.fs.renameSync(temporary, this.filepath);
      // 合併後才移除日誌；此處中斷仍可安全重播相同鍵值。
      this.fs.unlinkSync(this.journalPath);
      this.pending = 0;
    } finally {
      if (this.fs.existsSync(temporary)) this.fs.unlinkSync(temporary);
    }
  }
}
