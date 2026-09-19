import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { CONFIG } from "../config.js";
import { fetchSearchPage, parseAppDetails } from "../fetcher.js";
import { locateMonthBinarySearch, runSteamDiscovery } from "../main.js";
import { updateReport } from "../writer.js";
import { parseReport } from "../../catchlist_reader/src/library.js";
import { getRetryDelayMs } from "../../packages/core/http.js";

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
  let receivedRetryOptions;

  const result = await fetchSearchPage(0, {
    config: { ...CONFIG, SUPPORTED_LANG: "" },
    requester: async (_url, options, retryOptions) => {
      receivedOptions = options;
      receivedRetryOptions = retryOptions;
      return { data: "" };
    }
  });

  assert.equal(result.success, true);
  assert.equal(Object.hasOwn(receivedOptions.params, "supportedlang"), false);
  assert.equal(receivedRetryOptions.retries, 2);
  assert.equal(receivedRetryOptions.rateLimitBaseDelay, 60000);
});

test("429 優先遵守 Retry-After 並保留最低冷卻時間", () => {
  assert.equal(getRetryDelayMs({
    status: 429,
    attempt: 0,
    baseDelay: 1500,
    rateLimitBaseDelay: 60000,
    retryAfter: "120"
  }), 120000);

  assert.equal(getRetryDelayMs({
    status: 429,
    attempt: 0,
    baseDelay: 1500,
    rateLimitBaseDelay: 60000
  }), 60000);
});

test("搜尋失敗時停止月份更新且不寫入空區段", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "steam-search-failure-"));
  const reportFile = path.join(tempDir, "遊戲.md");
  const waits = [];
  let writes = 0;

  await assert.rejects(
    runSteamDiscovery({
      argv: ["node", "main.js", "--year", "2024", "--month", "12", "--output", reportFile],
      config: CONFIG,
      logger: { log: () => {}, error: () => {} },
      processRef: { exitCode: 0 },
      waitFn: async (ms) => {
        waits.push(ms);
      },
      fetchSearchPageFn: async () => ({ games: [], success: false }),
      updateReportFn: () => {
        writes += 1;
      }
    }),
    /停止本月更新，未寫入空月份/
  );

  assert.deepEqual(waits, [CONFIG.SEARCH_REQUEST_DELAY_MS]);
  assert.equal(writes, 0);
});

test("定位會擴大搜尋範圍後鎖定舊年份", async () => {
  const calls = [];
  const scanStart = await locateMonthBinarySearch(2022, 12, {
    config: {
      ...CONFIG,
      SEARCH_REQUEST_DELAY_MS: 0,
      SEARCH_MAX_START: 100000,
      SEARCH_MAX_LOCATE_ATTEMPTS: 20
    },
    logger: { log: () => {} },
    waitFn: async () => {},
    fetchSearchPageFn: async (start) => {
      calls.push(start);
      const releaseDateStr = start < 50000
        ? "Jan 1, 2025"
        : start < 75000
          ? "Jan 1, 2023"
          : start === 75000
            ? "Dec 1, 2022"
            : "Jan 1, 2021";
      return { games: [{ releaseDateStr }], success: true };
    }
  });

  assert.equal(scanStart, 74850);
  assert.deepEqual(calls.slice(0, 4), [25000, 50000, 100000, 75000]);
});

test("定位達安全索引上限時明確失敗，不退回線性掃描", async () => {
  const calls = [];

  await assert.rejects(
    locateMonthBinarySearch(2022, 12, {
      config: {
        ...CONFIG,
        SEARCH_REQUEST_DELAY_MS: 0,
        SEARCH_MAX_START: 50000
      },
      logger: { log: () => {} },
      waitFn: async () => {},
      fetchSearchPageFn: async (start) => {
        calls.push(start);
        return { games: [{ releaseDateStr: "Jan 1, 2023" }], success: true };
      }
    }),
    /安全索引上限 50000/
  );

  assert.deepEqual(calls, [25000, 50000]);
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

test("報告保留統一中文支援與官方功能，閱讀器可完整讀回", () => {
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
    officialFeatureIds: [2, 38],
    supportsController: false,
    isAdult: false
  };

  updateReport([{ year: 2026, month: 1, games: [game] }], reportFile);

  const report = fs.readFileSync(reportFile, "utf8");
  assert.match(report, /\[AppID: 123456 \| 中文支援: 支援中文 \| 商店功能: 2,38\]/);
  assert.doesNotMatch(report, /繁體中文|簡體中文/);

  const parsed = parseReport("games", report).entries;
  assert.equal(parsed.length, 1);
  assert.deepEqual(parsed[0].officialFeatureIds, [2, 38]);
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
    fetchCommunityTagsFn: async () => ["獨立製作"],
    updateReportFn: (payload, filepath) => {
      assert.equal(payload[0].games.length, 1);
      receivedReportFile = filepath;
    }
  });

  assert.equal(detailsCalls, 1);
  assert.equal(receivedReportFile, path.resolve(reportFile));
});
