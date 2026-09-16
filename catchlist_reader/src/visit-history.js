import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const VISIT_FILE = ".catchlist-visits.json";

// 每個類別第一次來訪時固定比較基準；重新讀取和個人操作不清除本次新增。
export class VisitHistory {
  constructor() { this.baselines = new Map(); }

  annotate(directory, libraries, activeMedia) {
    const filepath = path.join(path.resolve(directory), VISIT_FILE);
    try {
      let history = { version: 1, media: {} };
      if (fs.existsSync(filepath)) {
        history = JSON.parse(fs.readFileSync(filepath, "utf8"));
        if (history?.version !== 1 || !history.media || typeof history.media !== "object" || Array.isArray(history.media)
          || Object.values(history.media).some((record) => !record || !Array.isArray(record.keys) || record.keys.some((key) => typeof key !== "string"))) {
          throw new Error("invalid history");
        }
      }
      const library = libraries.find((item) => item.media === activeMedia && item.exists);
      if (library) {
        const sessionKey = `${filepath}\0${activeMedia}`;
        if (!this.baselines.has(sessionKey)) {
          this.baselines.set(sessionKey, new Set(history.media[activeMedia]?.keys ?? library.knownKeys));
        }
        const previous = history.media[activeMedia]?.keys ?? [];
        const keys = [...new Set([...previous, ...library.knownKeys])];
        if (!history.media[activeMedia] || keys.length !== previous.length) {
          history.media[activeMedia] = { keys, visitedAt: new Date().toISOString() };
          const temporary = `${filepath}.${crypto.randomUUID()}.tmp`;
          try {
            fs.writeFileSync(temporary, JSON.stringify(history, null, 2), { encoding: "utf8", flag: "wx" });
            fs.renameSync(temporary, filepath);
          } finally {
            if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
          }
        }
      }
      return { libraries: libraries.map((item) => {
        const baseline = this.baselines.get(`${filepath}\0${item.media}`);
        return { ...item, entries: item.entries.map((entry) => ({ ...entry, isNew: baseline ? !baseline.has(entry.hideKey) : false })) };
      }), visitWarning: null };
    } catch {
      return { libraries, visitWarning: "新收錄紀錄無法讀取或儲存，暫停新收錄判斷。請檢查資料夾權限與 .catchlist-visits.json。" };
    }
  }
}
