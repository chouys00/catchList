import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  backfillCommunityTags,
  loadTagStore,
  parseCommunityTags
} from "../community-tags.js";

test("解析繁中社群標籤並保留 Steam 排序", () => {
  const html = '<a class="app_tag"> 類 Rogue 牌組製作 </a><a class="app_tag">烹飪</a><a class="app_tag">烹飪</a>';
  assert.deepEqual(parseCommunityTags(html), ["類 Rogue 牌組製作", "烹飪"]);
});

test("只補抓缺漏 AppID，單筆失敗不覆寫成功資料", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "steam-community-tags-"));
  const filepath = path.join(tempDir, "遊戲標籤.json");

  fs.writeFileSync(filepath, JSON.stringify({
    version: 1,
    locale: "tchinese",
    games: {
      "3205380": {
        tags: ["既有標籤"],
        fetchedAt: "2026-08-23T00:00:00.000Z"
      }
    }
  }, null, 2));

  const result = await backfillCommunityTags({
    appids: ["3205380", "3300800", "bad"],
    filepath,
    fetchTags: async (appid) => appid === "3300800" ? null : ["烹飪"],
    wait: async () => {},
    now: () => "2026-08-24T00:00:00.000Z"
  });

  assert.deepEqual(result, { fetched: 0, skipped: 1, failed: ["3300800"] });
  assert.deepEqual(loadTagStore(filepath).games["3205380"].tags, ["既有標籤"]);
});

test("會去除重複與非法 AppID，並在兩次實際請求間等待 1500ms", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "steam-community-tags-"));
  const filepath = path.join(tempDir, "遊戲標籤.json");
  const fetchedAppids = [];
  const waits = [];

  const result = await backfillCommunityTags({
    appids: ["111", "bad", "111", "222"],
    filepath,
    fetchTags: async (appid) => {
      fetchedAppids.push(appid);
      return [`標籤-${appid}`];
    },
    wait: async (ms) => {
      waits.push(ms);
    },
    now: () => "2026-08-24T00:00:00.000Z"
  });

  assert.deepEqual(fetchedAppids, ["111", "222"]);
  assert.deepEqual(waits, [1500]);
  assert.deepEqual(result, { fetched: 2, skipped: 0, failed: [] });
  assert.deepEqual(loadTagStore(filepath).games["111"].tags, ["標籤-111"]);
  assert.deepEqual(loadTagStore(filepath).games["222"].tags, ["標籤-222"]);
});

test("sidecar 壞格式時退回預設空資料", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "steam-community-tags-"));
  const filepath = path.join(tempDir, "遊戲標籤.json");

  fs.writeFileSync(filepath, "{broken", "utf8");

  assert.deepEqual(loadTagStore(filepath), {
    version: 1,
    locale: "tchinese",
    games: {}
  });
});

test("sidecar 語系錯誤時退回繁中空資料", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "steam-community-tags-"));
  const filepath = path.join(tempDir, "遊戲標籤.json");

  fs.writeFileSync(filepath, JSON.stringify({
    version: 1,
    locale: "english",
    games: {
      111: { tags: ["策略"], fetchedAt: "2026-08-24T00:00:00.000Z" }
    }
  }), "utf8");

  assert.deepEqual(loadTagStore(filepath), {
    version: 1,
    locale: "tchinese",
    games: {}
  });
});

test("sidecar 略過單筆壞資料與空 fetchedAt 並保留合法紀錄", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "steam-community-tags-"));
  const filepath = path.join(tempDir, "遊戲標籤.json");

  fs.writeFileSync(filepath, JSON.stringify({
    version: 1,
    locale: "tchinese",
    games: {
      111: { tags: ["策略"], fetchedAt: "2026-08-24T00:00:00.000Z" },
      222: { tags: "角色扮演", fetchedAt: "2026-08-24T00:00:00.000Z" },
      333: { tags: ["冒險"], fetchedAt: "   " }
    }
  }), "utf8");

  assert.deepEqual(loadTagStore(filepath).games, {
    111: { tags: ["策略"], fetchedAt: "2026-08-24T00:00:00.000Z" }
  });
});

test("sidecar 標籤壓縮空白、去空值去重並限制前 20 筆", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "steam-community-tags-"));
  const filepath = path.join(tempDir, "遊戲標籤.json");

  fs.writeFileSync(filepath, JSON.stringify({
    version: 1,
    locale: "tchinese",
    games: {
      111: {
        tags: [
          "  策略   角色扮演  ", "策略 角色扮演", "", "標籤01", "標籤02",
          "標籤03", "標籤04", "標籤05", "標籤06", "標籤07",
          "標籤08", "標籤09", "標籤10", "標籤11", "標籤12",
          "標籤13", "標籤14", "標籤15", "標籤16", "標籤17",
          "標籤18", "標籤19", "標籤20", "標籤21"
        ],
        fetchedAt: "2026-08-24T00:00:00.000Z"
      }
    }
  }), "utf8");

  assert.deepEqual(loadTagStore(filepath).games["111"].tags, [
    "策略 角色扮演", "標籤01", "標籤02", "標籤03", "標籤04",
    "標籤05", "標籤06", "標籤07", "標籤08", "標籤09",
    "標籤10", "標籤11", "標籤12", "標籤13", "標籤14",
    "標籤15", "標籤16", "標籤17", "標籤18", "標籤19"
  ]);
});
