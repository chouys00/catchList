import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  backfillCommunityTags,
  normalizeCommunityTags,
  parseCommunityTags,
  parseReportCommunityTags,
} from "../community-tags.js";

function report(tagLines = ["  社群標籤: 既有標籤", "  社群標籤: 尚未補齊社群標籤"]) {
  return `2026  2月  (更新時間: 2026-09-11)\n\n- **遊戲一** (Game One) [AppID: 111]\n  2026-02-01 | 95% (1,000) | 動作, 冒險\n${tagLines[0]}\n  https://store.steampowered.com/app/111\n\n- **遊戲二** (Game Two) [AppID: 222]\n  2026-02-02 | 96% (2,000) | 策略\n${tagLines[1]}\n  https://store.steampowered.com/app/222\n\n------------------------------\n`;
}

test("解析繁中社群標籤並保留 Steam 排序", () => {
  const html = '<a class="app_tag"> 視覺小說 </a><a class="app_tag">恐怖</a><a class="app_tag">視覺小說</a>';
  assert.deepEqual(parseCommunityTags(html), ["視覺小說", "恐怖"]);
});

test("社群標籤會清理空白、去重並限制前 20 筆", () => {
  const tags = ["  策略   角色扮演  ", "策略 角色扮演", "", ...Array.from({ length: 25 }, (_, index) => `標籤${index + 1}`)];
  assert.equal(normalizeCommunityTags(tags).length, 20);
  assert.deepEqual(normalizeCommunityTags(tags).slice(0, 2), ["策略 角色扮演", "標籤1"]);
});

test("報告解析器直接讀取 Markdown 社群標籤與缺漏狀態", () => {
  const parsed = parseReportCommunityTags(report());
  assert.deepEqual(parsed.games.map(({ appid, tags }) => ({ appid, tags })), [
    { appid: "111", tags: ["既有標籤"] },
    { appid: "222", tags: [] },
  ]);
});

test("缺漏文字前後有多餘空白時仍視為待補抓", () => {
  const content = report(["  社群標籤: 既有標籤", "  社群標籤: 尚未補齊社群標籤   "]);
  assert.deepEqual(parseReportCommunityTags(content).games[1].tags, []);
});

test("舊版完整初始化報告把既有分類欄視為社群標籤", () => {
  const legacy = `# Steam 歷史初始化預覽\n\n2026  2月  (更新時間: 2026-09-10)\n\n- **遊戲一** (Game One)\n  2026-02-01 | 95% (1,000) | 視覺小說, 恐怖\n  https://store.steampowered.com/app/111\n`;
  assert.deepEqual(parseReportCommunityTags(legacy).games[0].tags, ["視覺小說", "恐怖"]);
});

test("補抓只處理 Markdown 缺漏項目並在成功後立即寫回報告", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "steam-report-tags-"));
  const filepath = path.join(directory, "遊戲.md");
  fs.writeFileSync(filepath, report(), "utf8");
  const calls = [];
  const result = await backfillCommunityTags({
    filepath,
    fetchTags: async (appid) => { calls.push(appid); return ["牌組製作", "策略"]; },
    wait: async () => { throw new Error("只有一筆缺漏時不應等待"); },
  });
  assert.deepEqual(calls, ["222"]);
  assert.deepEqual(result, { fetched: 1, skipped: 1, failed: [] });
  assert.match(fs.readFileSync(filepath, "utf8"), /社群標籤: 牌組製作, 策略/);
});

test("補抓失敗會保留明確缺漏文字供下次重試", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "steam-report-tags-"));
  const filepath = path.join(directory, "遊戲.md");
  fs.writeFileSync(filepath, report(["  社群標籤: 尚未補齊社群標籤", "  社群標籤: 尚未補齊社群標籤"]), "utf8");
  const waits = [];
  const result = await backfillCommunityTags({
    filepath,
    fetchTags: async (appid) => appid === "111" ? ["動作"] : null,
    wait: async (ms) => waits.push(ms),
  });
  assert.deepEqual(result, { fetched: 1, skipped: 0, failed: ["222"] });
  assert.deepEqual(waits, [1500]);
  const content = fs.readFileSync(filepath, "utf8");
  assert.match(content, /社群標籤: 動作/);
  assert.match(content, /社群標籤: 尚未補齊社群標籤/);
});
