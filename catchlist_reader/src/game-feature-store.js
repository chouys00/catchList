import fs from "node:fs";
import path from "node:path";

export const GAME_FEATURES_FILE = ".catchlist-game-features.json";

export function readGameFeatures(directory) {
  let raw;
  try { raw = fs.readFileSync(path.join(directory, GAME_FEATURES_FILE), "utf8"); }
  catch (error) { if (error.code === "ENOENT") return {}; throw error; }
  const data = JSON.parse(raw);
  if (data.version !== 1 || !data.entries || Array.isArray(data.entries) || typeof data.entries !== "object"
    || Object.entries(data.entries).some(([appid, entry]) => !/^\d+$/.test(appid)
      || !Array.isArray(entry?.featureIds) || entry.featureIds.some((id) => !Number.isInteger(id) || id <= 0))) {
    throw new Error("商店功能資料格式不正確");
  }
  return data.entries;
}
