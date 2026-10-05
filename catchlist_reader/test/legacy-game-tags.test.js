import assert from "node:assert/strict";
import test from "node:test";
import { parseReport } from "../src/library.js";
import { parseReport as parseTauri } from "../src/tauri-shell/library.js";
import { renderItemTemplate } from "../src/renderer/item-template.js";
import { filterAndSortGames } from "../src/renderer/game-browser.js";

const labels = "策略, 模擬, 城市營造, 基地建設, 大戰略, 管理, 建造, 歷史, 經濟, 殖民模擬, 沙盒, 資源管理, 開放世界, 生存, 單人, 可製作模組, 外交, 架空歷史, 4X, 即時策略";
const report = (values, explicit = "") => `2025  3月  (更新時間: 2026-03-01)\n\n- **災厄堡壘 Cataclismo** (Cataclismo) [AppID: 1422440 | 中文支援: 支援中文]\n  2025-03-20 | 91% (3,593) | ${values}\n${explicit}  https://store.steampowered.com/app/1422440\n`;

for (const [name, parse] of [["Electron", parseReport], ["Tauri", parseTauri]]) {
  test(`${name} 無預覽標題的舊社群標籤可顯示與篩選，保留原始內容及識別碼`, () => {
    const old = parse("games", report(labels)).entries[0];
    assert.deepEqual(old.tags, labels.split(", "));
    assert.deepEqual(old.genres, []);
    assert.equal(filterAndSortGames([old], { tags: ["城市營造"] }).length, 1);
    assert.equal(filterAndSortGames([old], { tags: ["恐怖"] }).length, 0);
    const markup = renderItemTemplate(old, "games", { selectedTags: [], tagLimit: 6 });
    assert.doesNotMatch(markup, /尚未補齊社群標籤/);
    assert.match(markup, /data-game-tag="城市營造"/);
    assert.match(markup, /＋14/);
    const preview = parse("games", `# Steam 歷史初始化預覽\n${report(labels)}`).entries[0];
    assert.equal(old.id, preview.id);
    assert.equal(old.raw, preview.raw);
  });

  test(`${name} 少量舊標籤也能辨識，官方類型及明確缺漏仍保留提示`, () => {
    assert.deepEqual(parse("games", report("恐怖, 視覺小說")).entries[0].tags, ["恐怖", "視覺小說"]);
    const genres = parse("games", report("動作, 冒險, 獨立製作")).entries[0];
    assert.deepEqual(genres.tags, []);
    assert.deepEqual(genres.genres, ["動作", "冒險", "獨立製作"]);
    const missing = parse("games", report(labels, "  社群標籤: 尚未補齊社群標籤\n")).entries[0];
    assert.deepEqual(missing.tags, []);
    assert.match(renderItemTemplate(missing, "games", { selectedTags: [] }), /尚未補齊社群標籤/);
    const explicit = parse("games", report(labels, "  社群標籤: 解謎\n")).entries[0];
    assert.deepEqual(explicit.tags, ["解謎"]);
  });
}
