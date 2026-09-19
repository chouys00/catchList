import fs from "node:fs";

function stamp(stat) {
  return `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`;
}

/** 只快取報告解析；寫入與刪除仍走原本的即時讀檔驗證。 */
export class ReportCache {
  constructor(parse, fileSystem = fs) { this.parse = parse; this.fs = fileSystem; this.entries = new Map(); }
  read(media, filepath) {
    const key = `${media}\0${filepath}`;
    let before;
    try { before = stamp(this.fs.statSync(filepath, { bigint: true })); }
    catch (error) {
      this.entries.delete(key);
      if (error.code === "ENOENT") return { ...this.parse(media, ""), exists: false };
      throw error;
    }
    const cached = this.entries.get(key);
    if (cached?.stamp === before) return cached.value;
    this.entries.delete(key);
    const value = { ...this.parse(media, this.fs.readFileSync(filepath, "utf8")), exists: true };
    // 同步工具若在讀取期間替換檔案，本次不快取，下次重新確認。
    try {
      if (stamp(this.fs.statSync(filepath, { bigint: true })) === before) {
        if (this.entries.size >= 16) this.entries.delete(this.entries.keys().next().value);
        this.entries.set(key, { stamp: before, value });
      }
    } catch { /* 下次讀取回報檔案狀態。 */ }
    return value;
  }
}
