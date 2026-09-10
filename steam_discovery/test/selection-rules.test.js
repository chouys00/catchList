import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { CONFIG } from "../config.js";
import { fetchSearchPage, parseAppDetails } from "../fetcher.js";
import { runSteamDiscovery } from "../main.js";
import { updateReport } from "../writer.js";
import { parseReport } from "../../catchlist_reader/src/library.js";

function appDetails({
  isFree = false,
  supportedLanguages = "English"
} = {}) {
  return {
    "123456": {
      success: true,
      data: {
        type: "game",
        name: "Test Game",
        is_free: isFree,
        supported_languages: supportedLanguages,
        categories: [{ id: 2, description: "Single-player" }],
        genres: [{ id: "23", description: "Indie" }],
        required_age: 0
      }
    }
  };
}

test("預設搜尋全語系並排除免費遊戲", () => {
  assert.equal(CONFIG.SUPPORTED_LANG, "");
  assert.equal(CONFIG.EXCLUDE_FREE_TO_PLAY, true);
});

test("全語系搜尋不傳 supportedlang 參數", async () => {
  let receivedOptions;

  const result = await fetchSearchPage(0, {
    config: { ...CONFIG, SUPPORTED_LANG: "" },
    requester: async (_url, options) => {
      receivedOptions = options;
      return { data: "" };
    }
  });

  assert.equal(result.success, true);
  assert.equal(Object.hasOwn(receivedOptions.params, "supportedlang"), false);
});

test("免費遊戲不會通過詳細資料篩選", () => {
  const result = parseAppDetails("123456", appDetails({ isFree: true }), CONFIG);
  assert.equal(result, null);
});

test("繁體中文或簡體中文任一成立都視為支援中文", () => {
  const traditional = parseAppDetails(
    "123456",
    appDetails({ supportedLanguages: "English, Traditional Chinese" }),
    CONFIG
  );
  const simplified = parseAppDetails(
    "123456",
    appDetails({ supportedLanguages: "English, Simplified Chinese" }),
    CONFIG
  );
  const englishOnly = parseAppDetails(
    "123456",
    appDetails({ supportedLanguages: "English" }),
    CONFIG
  );

  assert.equal(traditional.supportsChinese, true);
  assert.equal(simplified.supportsChinese, true);
  assert.equal(englishOnly.supportsChinese, false);
  assert.equal(Object.hasOwn(traditional, "supportTChinese"), false);
  assert.equal(Object.hasOwn(traditional, "supportSChinese"), false);
  assert.equal(Object.hasOwn(simplified, "supportTChinese"), false);
  assert.equal(Object.hasOwn(simplified, "supportSChinese"), false);
});

test("報告只寫入統一的中文支援狀態", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "steam-selection-rules-"));
  const reportFile = path.join(tempDir, "遊戲.md");
  const game = {
    appid: "123456",
    chineseName: "測試遊戲",
    englishName: "Test Game",
    releaseDate: "2026-01-15",
    reviewScore: 8,
    totalReviews: 800,
    positivePct: 90,
    genres: ["Indie"],
    supportsChinese: true,
    supportsController: false,
    isAdult: false
  };

  updateReport([{ year: 2026, month: 1, games: [game] }], reportFile);

  const report = fs.readFileSync(reportFile, "utf8");
  assert.match(report, /\[AppID: 123456 \| 中文支援: 支援中文\]/);
  assert.doesNotMatch(report, /繁體中文|簡體中文/);

  const parsed = parseReport("games", report).entries;
  assert.equal(parsed.length, 1);
  assert.deepEqual(
    {
      appid: parsed[0].appid,
      title: parsed[0].title,
      releaseDate: parsed[0].releaseDate,
      score: parsed[0].score,
      reviews: parsed[0].reviews,
      genres: parsed[0].genres
    },
    {
      appid: "123456",
      title: "測試遊戲",
      releaseDate: "2026-01-15",
      score: 90,
      reviews: 800,
      genres: ["Indie"]
    }
  );
});

test("本機取樣使用指定輸出檔並在達到上限後停止", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "steam-sample-output-"));
  const reportFile = path.join(tempDir, "遊戲新版預覽.md");
  const candidates = ["111", "222"].map((appid) => ({
    appid,
    englishName: `Game ${appid}`,
    releaseDate: "2026-03-01",
    reviewScore: 8,
    reviewLabel: "Very Positive",
    totalReviews: 800,
    positivePct: 90
  }));
  let detailsCalls = 0;
  let receivedReportFile;

  await runSteamDiscovery({
    argv: [
      "node", "main.js",
      "--year", "2026",
      "--month", "3",
      "--sample-limit", "1",
      "--output", reportFile
    ],
    config: CONFIG,
    logger: { log: () => {}, error: () => {} },
    processRef: { exitCode: 0 },
    waitFn: async () => {},
    locateMonthBinarySearchFn: async () => 0,
    collectGamesForMonthFn: async () => ({ candidates, endStart: 50 }),
    fetchAppDetailsFn: async () => {
      detailsCalls += 1;
      return {
        chineseName: "測試遊戲",
        genres: ["Indie"],
        supportsChinese: false,
        supportsController: false,
        isAdult: false
      };
    },
    backfillCommunityTagsFn: async () => ({ fetched: 0, skipped: 0, failed: [] }),
    updateReportFn: (payload, filepath) => {
      assert.equal(payload[0].games.length, 1);
      receivedReportFile = filepath;
    }
  });

  assert.equal(detailsCalls, 1);
  assert.equal(receivedReportFile, path.resolve(reportFile));
});
