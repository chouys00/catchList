import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { extractReportAppids, resolveTagFile, runSteamDiscovery } from "../main.js";
import { CONFIG } from "../config.js";

test("sidecar 與遊戲報告放在同一資料夾", () => {
  assert.equal(resolveTagFile("D:/data/遊戲.md"), path.resolve("D:/data/遊戲標籤.json"));
});

test("初始化會去重並只接受 Steam app URL", () => {
  const markdown = [
    "https://store.steampowered.com/app/3205380",
    "https://store.steampowered.com/app/3205380",
    "https://store.steampowered.com/app/3300800?snr=1_5_9__205",
    "https://example.com/app/123",
    "https://store.steampowered.com/bundle/999"
  ].join("\n");

  assert.deepEqual(extractReportAppids(markdown), ["3205380", "3300800"]);
});

test("--backfill-tags 只補抓既有報告的缺漏標籤，不重寫 Markdown", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "steam-main-tags-"));
  const reportFile = path.join(tempDir, "遊戲.md");
  const reportContent = [
    "https://store.steampowered.com/app/3205380",
    "https://store.steampowered.com/app/3205380",
    "https://store.steampowered.com/app/3300800?snr=1_5_9__205"
  ].join("\n");
  fs.writeFileSync(reportFile, reportContent, "utf8");

  const order = [];
  const processRef = { exitCode: 0 };
  let receivedArgs = null;

  await runSteamDiscovery({
    argv: ["node", "main.js", "--backfill-tags"],
    config: {
      ...CONFIG,
      OUTPUT_FILE: reportFile
    },
    logger: {
      log: () => {},
      error: () => {}
    },
    processRef,
    waitFn: async () => {
      throw new Error("backfill mode 不應等待每月搜尋節流");
    },
    fetchSearchPageFn: async () => {
      throw new Error("backfill mode 不應搜尋月份");
    },
    fetchAppDetailsFn: async () => {
      throw new Error("backfill mode 不應呼叫 appdetails");
    },
    backfillCommunityTagsFn: async (args) => {
      receivedArgs = args;
      order.push("backfill");
      return { fetched: 1, skipped: 1, failed: [] };
    },
    updateReportFn: () => {
      order.push("update");
    }
  });

  assert.deepEqual(order, ["backfill"]);
  assert.deepEqual(receivedArgs.appids, ["3205380", "3300800"]);
  assert.equal(receivedArgs.filepath, path.join(tempDir, "遊戲標籤.json"));
  assert.equal(processRef.exitCode, 0);
});

test("--backfill-tags 找不到報告時設非零 exit code 並顯示明確錯誤", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "steam-main-tags-"));
  const reportFile = path.join(tempDir, "不存在的遊戲.md");
  const errors = [];
  const processRef = { exitCode: 0 };

  await runSteamDiscovery({
    argv: ["node", "main.js", "--backfill-tags"],
    config: {
      ...CONFIG,
      OUTPUT_FILE: reportFile
    },
    logger: {
      log: () => {},
      error: (message) => {
        errors.push(String(message));
      }
    },
    processRef,
    backfillCommunityTagsFn: async () => {
      throw new Error("缺少報告時不應進入 backfill");
    }
  });

  assert.equal(processRef.exitCode, 1);
  assert.match(errors.join("\n"), /找不到既有遊戲報告/);
});

test("每月更新會先補抓入選遊戲標籤，再寫入既有月報", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "steam-main-tags-"));
  const reportFile = path.join(tempDir, "遊戲.md");
  const order = [];
  const processRef = { exitCode: 0 };
  const logMessages = [];
  const candidate = {
    appid: "3205380",
    englishName: "Tiny Kitchen",
    releaseDate: "2026-02-14",
    reviewScore: 9,
    reviewLabel: "Overwhelmingly Positive",
    totalReviews: 1234,
    positivePct: 98
  };
  const details = {
    chineseName: "小小廚房",
    genres: ["模擬"],
    priceText: "NT$ 268",
    supportTChinese: true,
    isVROnly: false,
    isAdult: false,
    supportsController: true,
    headerImage: "https://cdn.example/header.jpg",
    categories: ["單人"]
  };
  const written = [];

  await runSteamDiscovery({
    argv: ["node", "main.js", "--year", "2026", "--month", "2"],
    config: {
      ...CONFIG,
      OUTPUT_FILE: reportFile
    },
    logger: {
      log: (message) => {
        logMessages.push(String(message));
      },
      error: () => {}
    },
    processRef,
    waitFn: async () => {},
    locateMonthBinarySearchFn: async () => 0,
    collectGamesForMonthFn: async () => ({
      candidates: [candidate],
      endStart: 50
    }),
    fetchAppDetailsFn: async () => details,
    backfillCommunityTagsFn: async (args) => {
      order.push("backfill");
      assert.deepEqual(args.appids, ["3205380"]);
      return { fetched: 0, skipped: 0, failed: ["3205380"] };
    },
    updateReportFn: (payload) => {
      order.push("update");
      written.push(payload);
    }
  });

  assert.deepEqual(order, ["backfill", "update"]);
  assert.equal(written.length, 1);
  assert.equal(written[0][0].games.length, 1);
  assert.equal(written[0][0].games[0].appid, "3205380");
  assert.equal(processRef.exitCode, 0);
  assert.match(logMessages.join("\n"), /本次回補全部完成/);
});

test("每月更新的真實 writer 只寫入注入報告與同層連結頁", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "steam-writer-path-"));
  const injectedDir = path.join(tempDir, "injected");
  const configuredDir = path.join(tempDir, "configured");
  const reportFile = path.join(injectedDir, "遊戲.md");
  const linksFile = path.join(injectedDir, "open_links.html");
  const configuredReport = path.join(configuredDir, "遊戲.md");
  const configuredContent = "全域設定路徑不得被注入執行改寫\n";
  const originalOutputFile = CONFIG.OUTPUT_FILE;
  const originalCwd = process.cwd();

  fs.mkdirSync(injectedDir, { recursive: true });
  fs.mkdirSync(configuredDir, { recursive: true });
  fs.writeFileSync(configuredReport, configuredContent, "utf8");

  const candidate = {
    appid: "3205380",
    englishName: "Omelet You Cook",
    releaseDate: "2026-02-08",
    reviewScore: 9,
    reviewLabel: "Overwhelmingly Positive",
    totalReviews: 1500,
    positivePct: 97
  };
  const details = {
    chineseName: "你有餅嗎？",
    genres: ["動作", "休閒", "獨立製作", "策略"],
    priceText: "NT$ 188",
    supportTChinese: true,
    isVROnly: false,
    isAdult: false,
    supportsController: true,
    headerImage: "https://cdn.example/header.jpg",
    categories: ["單人"]
  };

  try {
    CONFIG.OUTPUT_FILE = configuredReport;
    process.chdir(tempDir);

    await runSteamDiscovery({
      argv: ["node", "main.js", "--year", "2026", "--month", "2"],
      config: { ...CONFIG, OUTPUT_FILE: reportFile },
      logger: { log: () => {}, error: () => {} },
      processRef: { exitCode: 0 },
      waitFn: async () => {},
      locateMonthBinarySearchFn: async () => 0,
      collectGamesForMonthFn: async () => ({ candidates: [candidate], endStart: 50 }),
      fetchAppDetailsFn: async () => details,
      backfillCommunityTagsFn: async () => ({ fetched: 1, skipped: 0, failed: [] })
    });

    assert.equal(fs.readFileSync(configuredReport, "utf8"), configuredContent);
    assert.equal(fs.existsSync(reportFile), true);
    assert.equal(fs.existsSync(linksFile), true);
    assert.match(fs.readFileSync(reportFile, "utf8"), /你有餅嗎？/);
    assert.match(fs.readFileSync(reportFile, "utf8"), new RegExp(linksFile.replace(/\\/g, "/").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  } finally {
    CONFIG.OUTPUT_FILE = originalOutputFile;
    process.chdir(originalCwd);
  }
});

test("每月標籤補抓直接拋例外時，仍會寫入月報並保留入選清單", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "steam-main-tags-"));
  const reportFile = path.join(tempDir, "遊戲.md");
  const errors = [];
  const processRef = { exitCode: 0 };
  const candidate = {
    appid: "3205380",
    englishName: "Tiny Kitchen",
    releaseDate: "2026-02-14",
    reviewScore: 9,
    reviewLabel: "Overwhelmingly Positive",
    totalReviews: 1234,
    positivePct: 98
  };
  const details = {
    chineseName: "小小廚房",
    genres: ["模擬"],
    priceText: "NT$ 268",
    supportTChinese: true,
    isVROnly: false,
    isAdult: false,
    supportsController: true,
    headerImage: "https://cdn.example/header.jpg",
    categories: ["單人"]
  };
  const written = [];

  await runSteamDiscovery({
    argv: ["node", "main.js", "--year", "2026", "--month", "2"],
    config: {
      ...CONFIG,
      OUTPUT_FILE: reportFile
    },
    logger: {
      log: () => {},
      error: (message) => {
        errors.push(String(message));
      }
    },
    processRef,
    waitFn: async () => {},
    locateMonthBinarySearchFn: async () => 0,
    collectGamesForMonthFn: async () => ({
      candidates: [candidate],
      endStart: 50
    }),
    fetchAppDetailsFn: async () => details,
    backfillCommunityTagsFn: async () => {
      throw new Error("rename failed");
    },
    updateReportFn: (payload) => {
      written.push(payload);
    }
  });

  assert.equal(written.length, 1);
  assert.equal(written[0][0].games.length, 1);
  assert.equal(written[0][0].games[0].appid, "3205380");
  assert.equal(processRef.exitCode, 0);
  assert.match(errors.join("\n"), /標籤補抓發生例外/);
});
