import assert from "node:assert/strict";
import test from "node:test";

import { parseReport, removeEntry } from "../src/tauri-shell/library.js";
import { createBridge } from "../src/tauri-shell/tauri-bridge.js";

const anime = `2025  春  >7.70    (更新時間: 2025-07-01)\n\n- 測試動畫  **8.20**  (12 · TV)\n- 測試動畫  **8.20**  (12 · TV)\n------------------------------\n`;
const movies = `2025  9月  >7.00    (更新時間: 2026-07-01)\n\n- 測試電影  **8.15**  \`(IMDb: 8.3 | 一般外國片 (-0.15) | 144k票)\`\n------------------------------\n`;
const games = `2025  9月  (更新時間: 2026-03-01)\n\n- **測試遊戲** (Test Game) [🎮]\n  2025-09-02 | 97% (12,345) | 動作, 獨立製作\n  https://store.steampowered.com/app/123456\n\n------------------------------\n`;

test("Tauri 解析器支援三種既有 Markdown 格式", () => {
  assert.equal(parseReport("anime", anime).entries.length, 2);
  assert.equal(parseReport("movies", movies).entries[0].category, "一般外國片");
  assert.equal(parseReport("games", games).entries[0].url, "https://store.steampowered.com/app/123456");
});

test("Tauri 刪除內容保留區段標題並識別重複作品", () => {
  const report = parseReport("anime", anime);
  const next = removeEntry("anime", anime, report.entries[1].id);
  assert.match(next, /^2025  春  >7\.70/m);
  assert.equal((next.match(/測試動畫/g) ?? []).length, 1);
});

test("橋接層只使用 Tauri command 並轉換後端快照", async () => {
  const calls = [];
  const snapshot = { dataDir: "C:\\CatchList", canUndo: false, reports: [
    { media: "games", filename: "遊戲.md", exists: true, content: games },
    { media: "anime", filename: "動畫.md", exists: true, content: anime },
    { media: "movies", filename: "電影.md", exists: true, content: movies },
  ] };
  const bridge = createBridge(async (command, args) => { calls.push({ command, args }); return snapshot; });
  const loaded = await bridge.load();
  assert.equal(loaded.libraries[0].entries.length, 1);
  await bridge.deleteEntry("games", loaded.libraries[0].entries[0].id, loaded.libraries[0]);
  await bridge.openUrls(["https://store.steampowered.com/app/123456"]);
  assert.deepEqual(calls.map((item) => item.command), ["library_load", "library_delete_entry", "external_open_urls"]);
  assert.match(calls[1].args.nextContent, /2025  9月/);
  assert.doesNotMatch(calls[1].args.nextContent, /測試遊戲/);
});
