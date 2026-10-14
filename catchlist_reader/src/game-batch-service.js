import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { sourceEntries, parseReport, readHiddenEntries, readFavorites, HIDDEN_ENTRIES_FILE, FAVORITES_FILE } from "./library.js";
import { MANUAL_GAMES_FILE, readOptional, readManualGames, manualJson, gameKey, commitGameFiles, recoverGameTransaction } from "./manual-games.js";

const names = ["遊戲.md", MANUAL_GAMES_FILE, HIDDEN_ENTRIES_FILE, FAVORITES_FILE];
const digest = raw => crypto.createHash("sha256").update(raw, "utf8").digest("hex");
const json = entries => `${JSON.stringify({ version: 1, entries }, null, 2)}\n`;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// 預覽與提交共用一份來源版本；提交碼只可使用一次。
export class GameBatchService {
  constructor({ commit = commitGameFiles, backup = null } = {}) {
    this.commitFiles = commit;
    this.backup = backup ?? this.createBackup.bind(this);
    this.pending = new Map();
  }
  cancel() { this.pending.clear(); }
  original(filepath) {
    const raw = readOptional(filepath);
    if (raw !== null && !Buffer.from(raw, "utf8").equals(fs.readFileSync(filepath))) throw new Error("來源檔不是有效 UTF-8，已保留原檔；請先檢查資料");
    return raw;
  }
  versions(directory) { return Object.fromEntries(names.map(name => [name, this.original(path.join(directory, name))])); }
  hiddenRecords(directory) {
    const raw = readOptional(path.join(directory, HIDDEN_ENTRIES_FILE));
    const records = readHiddenEntries(directory);
    if ((raw !== null && JSON.parse(raw).entries.length !== records.length) || new Set(records.map(record => record.hideKey)).size !== records.length) throw new Error("隱藏紀錄有無法辨識或重複的資料，整批未套用；請先檢查紀錄");
    return records;
  }
  check(directory, originals) {
    for (const name of names) if (this.original(path.join(directory, name)) !== originals[name]) throw new Error("資料已變更，整批未套用；請重新讀取後再試");
  }
  prepare(directory, appids, action, reason) {
    this.cancel();
    if (!directory || !Array.isArray(appids) || !appids.length || appids.some(id => typeof id !== "string" || !/^[1-9]\d{0,9}$/.test(id))) throw new Error("請先勾選有效的遊戲");
    if (!["hide", "delete"].includes(action) || (action === "hide" && !["backlog", "watchlist", "played", "not_interested"].includes(reason))) throw new Error("批次操作不正確");
    directory = path.resolve(directory);
    recoverGameTransaction(directory);
    const originals = this.versions(directory);
    const source = sourceEntries(directory, "games", { strict: true });
    if (source.integrityWarning) throw new Error("遊戲報告有無法辨識的資料，請先檢查報告；整批未套用");
    const lookup = new Map(source.entries.map(entry => [String(entry.appid), entry]));
    const selected = [...new Set(appids)].map(id => {
      const entry = lookup.get(id);
      if (!entry) throw new Error("所選遊戲已不存在，整批未套用；請重新讀取");
      return { appid: id, title: entry.title, sources: [entry.reportSource ? "遊戲.md" : null, entry.manualAdded ? MANUAL_GAMES_FILE : null].filter(Boolean) };
    });
    const ids = new Set(selected.map(entry => entry.appid));
    const changes = [];
    let operation;
    let skippedCount = 0;
    if (action === "delete") {
      if (selected.some(entry => entry.sources.includes("遊戲.md"))) {
        const parsed = parseReport("games", originals["遊戲.md"]);
        const ranges = parsed.entries.filter(entry => ids.has(String(entry.appid))).sort((a, b) => a.lineStart - b.lineStart);
        let range = 0;
        const kept = parsed.lines.filter((_line, index) => {
          while (range < ranges.length && index >= ranges[range].lineEnd) range++;
          return range >= ranges.length || index < ranges[range].lineStart;
        });
        changes.push({ name: "遊戲.md", before: originals["遊戲.md"], after: kept.join(parsed.eol) });
      }
      if (selected.some(entry => entry.sources.includes(MANUAL_GAMES_FILE))) changes.push({ name: MANUAL_GAMES_FILE, before: originals[MANUAL_GAMES_FILE], after: manualJson(readManualGames(directory).entries.filter(entry => !ids.has(String(entry.appid)))) });
    } else {
      const records = this.hiddenRecords(directory);
      const existing = new Map(records.map(record => [record.hideKey, record]));
      if (existing.size !== records.length) throw new Error("隱藏紀錄重複，請先檢查紀錄；整批未套用");
      const edits = [];
      const hiddenAt = new Date().toISOString();
      const favorites = readFavorites(directory);
      const selectedKeys = new Set(selected.map(entry => gameKey(entry.appid)));
      const removedFavorites = favorites.filter(record => record.media === "games" && selectedKeys.has(record.key));
      const favoriteKeys = new Set(removedFavorites.map(record => record.key));
      for (const entry of selected) {
        const key = gameKey(entry.appid);
        const before = existing.get(key) ?? null;
        if (before && (before.reason ?? "played") === reason && !favoriteKeys.has(key)) { skippedCount++; continue; }
        const after = before ? { ...before, reason } : { hideKey: key, media: "games", title: entry.title, hiddenAt, reason };
        edits.push({ key, before, after });
        existing.set(key, after);
      }
      if (edits.length) changes.push({ name: HIDDEN_ENTRIES_FILE, before: originals[HIDDEN_ENTRIES_FILE], after: json([...existing.values()]) });
      if (removedFavorites.length) changes.push({ name: FAVORITES_FILE, before: originals[FAVORITES_FILE], after: json(favorites.filter(record => !removedFavorites.includes(record))) });
      operation = { directory, edits, removedFavorites };
    }
    this.check(directory, originals);
    const token = crypto.randomUUID();
    const preview = { token, action, reason, selected, count: selected.length, changedCount: selected.length - skippedCount, skippedCount, sources: [...new Set(changes.map(item => item.name))] };
    this.pending.set(token, { directory, originals, changes, operation, preview });
    return preview;
  }
  createBackup(directory, changes, preview) {
    const backupPath = path.join(directory, ".catchlist-backups", "batch-delete", `${new Date().toISOString().replace(/[:.]/g, "-")}-${crypto.randomUUID()}`);
    fs.mkdirSync(backupPath, { recursive: true });
    const files = [];
    for (const item of changes) {
      fs.writeFileSync(path.join(backupPath, item.name), item.before, { encoding: "utf8", flag: "wx" });
      const sha256 = digest(item.before);
      if (digest(fs.readFileSync(path.join(backupPath, item.name), "utf8")) !== sha256) throw new Error("備份驗證失敗，整批未刪除");
      files.push({ name: item.name, sha256 });
    }
    const manifest = JSON.stringify({ version: 1, createdAt: new Date().toISOString(), directory, action: "delete", selected: preview.selected, files }, null, 2) + "\n";
    fs.writeFileSync(path.join(backupPath, "manifest.json"), manifest, { encoding: "utf8", flag: "wx" });
    if (fs.readFileSync(path.join(backupPath, "manifest.json"), "utf8") !== manifest) throw new Error("備份清單驗證失敗，整批未刪除");
    return backupPath;
  }
  apply(directory, token) {
    const pending = this.pending.get(token);
    this.pending.delete(token);
    if (!pending || path.resolve(directory) !== pending.directory) throw new Error("確認已失效，請重新預覽批次操作");
    this.check(pending.directory, pending.originals);
    const backupPath = pending.preview.action === "delete" ? this.backup(pending.directory, pending.changes, pending.preview) : null;
    this.check(pending.directory, pending.originals);
    if (pending.changes.length) this.commitFiles(pending.directory, pending.changes);
    return { ...pending.preview, backupPath, operation: pending.operation };
  }
  undo(directory, operation) {
    if (path.resolve(directory) !== operation.directory) throw new Error("資料夾已變更，無法復原這批操作");
    const before = readOptional(path.join(directory, HIDDEN_ENTRIES_FILE));
    const records = this.hiddenRecords(directory);
    const current = new Map(records.map(record => [record.hideKey, record]));
    for (const edit of operation.edits) if (!same(current.get(edit.key), edit.after)) throw new Error("這批遊戲的隱藏紀錄已變更，未覆蓋後續操作");
    const favorites = readFavorites(directory);
    const removedFavorites = operation.removedFavorites ?? [];
    if (removedFavorites.some(record => favorites.some(item => item.key === record.key))) throw new Error("這批遊戲的收藏紀錄已變更，未覆蓋後續操作");
    for (const edit of operation.edits) { if (edit.before) current.set(edit.key, edit.before); else current.delete(edit.key); }
    const changes = operation.edits.length ? [{ name: HIDDEN_ENTRIES_FILE, before, after: json([...current.values()]) }] : [];
    // 舊版重疊紀錄仍以隱藏分類為準；只恢復原本沒有隱藏的收藏。
    const restored = removedFavorites.filter(record => !current.has(record.key));
    if (restored.length) changes.push({ name: FAVORITES_FILE, before: readOptional(path.join(directory, FAVORITES_FILE)), after: json([...favorites, ...restored]) });
    if (changes.length) this.commitFiles(directory, changes);
    return { media: "games", count: operation.edits.length, title: `${operation.edits.length} 款遊戲` };
  }
}
