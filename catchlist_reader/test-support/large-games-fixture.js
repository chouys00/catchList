import fs from "node:fs";
import path from "node:path";

export const LARGE_GAME_COUNT = 1_000;

export function largeGameAppids() {
  return Array.from({ length: LARGE_GAME_COUNT }, (_, index) => String(6_000_000 + index));
}

export function steamCoverUrl() {
  return "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/620/header.jpg";
}

export function createLargeGamesFixture(dataDir) {
  const games = {};
  const lines = [];
  const appids = largeGameAppids();

  for (let index = 0; index < LARGE_GAME_COUNT; index += 1) {
    const number = index + 1;
    const month = (index % 10) + 1;
    const day = (index % 28) + 1;
    const appid = appids[index];
    const tags = index % 2 === 0 ? ["策略", "千筆驗收"] : ["策略", "自動續載"];
    if (index % 100 === 0) lines.push(`2026  ${month}月  (千筆驗收資料)`);
    lines.push(
      `- **千筆驗收遊戲 ${String(number).padStart(4, "0")}** (Large Game ${String(number).padStart(4, "0")})`,
      `  2026-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")} | 95% (${(1_000 + index).toLocaleString("en-US")}) | 策略, 獨立製作`,
      `  https://store.steampowered.com/app/${appid}`,
      "",
    );
    games[appid] = { tags, fetchedAt: "2026-08-25T00:00:00.000Z" };
  }
  lines.push("------------------------------", "");

  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, "遊戲.md"), lines.join("\n"), "utf8");
  fs.writeFileSync(path.join(dataDir, "遊戲標籤.json"), JSON.stringify({ version: 1, locale: "tchinese", games }, null, 2), "utf8");
  return { dataDir, appids };
}

export function createCoverCache(userDataDir, appids) {
  fs.mkdirSync(userDataDir, { recursive: true });
  const covers = Object.fromEntries(appids.map((appid) => [appid, steamCoverUrl(appid)]));
  const filepath = path.join(userDataDir, "steam-cover-cache.json");
  fs.writeFileSync(filepath, JSON.stringify({ version: 1, covers }), "utf8");
  return filepath;
}
