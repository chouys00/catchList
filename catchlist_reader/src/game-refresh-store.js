import path from "node:path";
import { readOptional, atomicText } from "./manual-games.js";

export const GAME_REFRESH_FILE = ".catchlist-game-refresh.json";
export function validStats(value) {
  return value && Number.isInteger(value.reviews) && value.reviews >= 0
    && (value.reviews === 0 ? value.score === null : Number.isInteger(value.score) && value.score >= 0 && value.score <= 100)
    && Array.isArray(value.tags) && value.tags.length > 0 && value.tags.length <= 20
    && value.tags.every(tag => typeof tag === "string" && tag.trim())
    && typeof value.statsUpdatedAt === "string" && Number.isFinite(Date.parse(value.statsUpdatedAt));
}
export function readGameRefresh(directory) {
  const raw = readOptional(path.join(directory, GAME_REFRESH_FILE));
  if (raw === null) return {};
  try {
    const data = JSON.parse(raw);
    if (data.version !== 1 || !data.entries || Array.isArray(data.entries) || typeof data.entries !== "object"
      || Object.entries(data.entries).some(([id, value]) => !/^[1-9]\d{0,9}$/.test(id) || !validStats(value))) throw new Error();
    return Object.fromEntries(Object.entries(data.entries).map(([id, value]) => [id, {
      score: value.score, reviews: value.reviews, tags: value.tags, statsUpdatedAt: value.statsUpdatedAt,
    }]));
  } catch { throw new Error("遊戲更新資料格式不正確，已保留原檔；請檢查 .catchlist-game-refresh.json"); }
}
export function saveGameRefresh(directory, appid, stats) {
  if (!/^[1-9]\d{0,9}$/.test(appid) || !validStats(stats)) throw new Error("Steam 資料不完整，已保留原資訊");
  const entries = readGameRefresh(directory);
  entries[appid] = { score: stats.score, reviews: stats.reviews, tags: stats.tags, statsUpdatedAt: stats.statsUpdatedAt };
  atomicText(path.join(directory, GAME_REFRESH_FILE), `${JSON.stringify({ version: 1, entries }, null, 2)}\n`);
}
