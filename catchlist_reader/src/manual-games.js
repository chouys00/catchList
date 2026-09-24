import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const MANUAL_GAMES_FILE = ".catchlist-manual-games.json";
const JOURNAL = ".catchlist-game-transaction.json";
export const gameKey = (appid) => JSON.stringify(["games", String(appid), "", 0]);
export function readOptional(filepath) {
  try { return fs.readFileSync(filepath, "utf8"); } catch (error) { if (error.code === "ENOENT") return null; throw error; }
}
export function atomicText(filepath, content) {
  const temporary = `${filepath}.${crypto.randomUUID()}.tmp`;
  try { fs.writeFileSync(temporary, content, { encoding: "utf8", flag: "wx" }); fs.renameSync(temporary, filepath); }
  finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}
// 雙來源刪除留下短期交易紀錄；中斷後先回復，避免只刪掉其中一份。
export function recoverGameTransaction(directory) {
  const journal = path.join(directory, JOURNAL);
  const raw = readOptional(journal);
  if (raw === null) return;
  const transaction = JSON.parse(raw);
  if (!Array.isArray(transaction) || transaction.length < 2 || transaction.length > 3 || new Set(transaction.map((x) => x.name)).size !== transaction.length
    || transaction.some((x) => !["遊戲.md", MANUAL_GAMES_FILE, ".catchlist-hidden.json", ".catchlist-favorites.json"].includes(x.name) || (x.before !== null && typeof x.before !== "string") || typeof x.after !== "string")) throw new Error("遊戲交易復原紀錄異常，請保留檔案並檢查");
  for (const item of transaction) {
    const current = readOptional(path.join(directory, item.name));
    if (current !== item.before && current !== item.after) throw new Error("遊戲資料已由其他程式修改，無法自動復原刪除；請保留復原紀錄");
  }
  for (const item of transaction) {
    if (item.before === null) fs.rmSync(path.join(directory, item.name), { force: true });
    else atomicText(path.join(directory, item.name), item.before);
  }
  fs.unlinkSync(journal);
}
export function commitGameFiles(directory, changes, write = atomicText) {
  recoverGameTransaction(directory);
  for (const item of changes) if (readOptional(path.join(directory, item.name)) !== item.before) throw new Error("資料已變更，請重新讀取後再試");
  if (changes.length === 1) { write(path.join(directory, changes[0].name), changes[0].after); return; }
  const journal = path.join(directory, JOURNAL);
  fs.writeFileSync(journal, JSON.stringify(changes), { encoding: "utf8", flag: "wx" });
  try {
    for (const item of changes) write(path.join(directory, item.name), item.after);
    fs.unlinkSync(journal);
  } catch (error) {
    recoverGameTransaction(directory);
    throw error;
  }
}
function validEntry(entry) {
  return entry && /^[1-9]\d{0,9}$/.test(entry.appid) && typeof entry.title === "string" && entry.title.trim()
    && typeof entry.addedAt === "string" && Number.isFinite(Date.parse(entry.addedAt))
    && typeof entry.fetchedAt === "string" && Number.isFinite(Date.parse(entry.fetchedAt))
    && [entry.score, entry.reviews].every((n) => n === null || (Number.isFinite(n) && n >= 0))
    && (entry.score === null || entry.score <= 100) && (entry.reviews === null || Number.isInteger(entry.reviews))
    && ["supported", "unsupported", "unknown"].includes(entry.chineseSupport)
    && (entry.officialFeatureIds === undefined || (Array.isArray(entry.officialFeatureIds) && entry.officialFeatureIds.every((id) => Number.isInteger(id) && id > 0)))
    && [entry.tags, entry.genres].every((list) => Array.isArray(list) && list.every((x) => typeof x === "string"))
    && (entry.releaseDate === null || /^\d{4}-\d{2}-\d{2}$/.test(entry.releaseDate))
    && typeof entry.releaseLabel === "string";
}
export function readManualGames(directory) {
  recoverGameTransaction(directory);
  const raw = readOptional(path.join(directory, MANUAL_GAMES_FILE));
  if (raw === null) return { raw, entries: [] };
  try {
    const data = JSON.parse(raw);
    if (data.version !== 1 || !Array.isArray(data.entries) || data.entries.some((x) => !validEntry(x))
      || new Set(data.entries.map((x) => x.appid)).size !== data.entries.length) throw new Error();
    return { raw, entries: data.entries };
  } catch { throw new Error("手動遊戲清單格式不正確，已保留原檔；請檢查 .catchlist-manual-games.json"); }
}
export function manualEntry(record) {
  const year = record.releaseDate ? Number(record.releaseDate.slice(0, 4)) : null;
  const month = record.releaseDate ? Number(record.releaseDate.slice(5, 7)) : null;
  return { ...record, id: `manual-${record.appid}`, hideKey: gameKey(record.appid), media: "games", manualAdded: true,
    reportSource: false, url: `https://store.steampowered.com/app/${record.appid}`, year, month,
    sectionKey: "manual", periodLabel: "手動加入", originalTitle: record.originalTitle || "" };
}
export const manualJson = (entries) => `${JSON.stringify({ version: 1, entries }, null, 2)}\n`;
export function addManualRecord(directory, record, expectedRaw, stateChanges = []) {
  const current = readManualGames(directory);
  if (current.raw !== expectedRaw) throw new Error("手動清單已變更，請重新讀取遊戲預覽");
  if (current.entries.some((item) => item.appid === record.appid)) throw new Error("遊戲已收錄，請重新讀取");
  if (!validEntry(record)) throw new Error("遊戲預覽資料不完整，請重新讀取");
  commitGameFiles(directory, [{ name: MANUAL_GAMES_FILE, before: current.raw, after: manualJson([...current.entries, record]) }, ...stateChanges]);
}
