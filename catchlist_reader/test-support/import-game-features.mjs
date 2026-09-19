// 從已保存的商店 HTML 補齊功能，不連網、不修改報告；目的檔已存在就停止。
import fs from "node:fs";
import path from "node:path";
import { parseReport } from "../src/library.js";
import { parseOfficialFeatures, classifyPlayerMode } from "../src/game-features.js";
import { GAME_FEATURES_FILE } from "../src/game-feature-store.js";

const [snapshots, dataDir] = process.argv.slice(2);
if (!snapshots || !dataDir) throw new Error("用法：node import-game-features.mjs <快照資料夾> <報告資料夾>");
const entries = {};
const totals = { single: 0, multi: 0, unknown: 0, missingSnapshot: 0 };
const games = parseReport("games", fs.readFileSync(path.join(dataDir, "遊戲.md"), "utf8")).entries;
for (const game of games) {
  const filepath = path.join(snapshots, `${game.appid}.json`);
  if (!fs.existsSync(filepath)) { totals.missingSnapshot++; totals.unknown++; continue; }
  const source = JSON.parse(fs.readFileSync(filepath, "utf8"));
  if (String(source.appid) !== game.appid || source.status !== 200) throw new Error(`快照不完整：${game.appid}`);
  const featureIds = parseOfficialFeatures(source.html);
  entries[game.appid] = { featureIds, fetchedAt: source.fetchedAt, source: "steam-store" };
  totals[classifyPlayerMode(featureIds)]++;
}
const destination = path.join(dataDir, GAME_FEATURES_FILE);
fs.writeFileSync(destination, JSON.stringify({ version: 1, entries }, null, 2) + "\n", { encoding: "utf8", flag: "wx" });
console.log(JSON.stringify({ destination, games: games.length, ...totals }));
