import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runSteamDiscovery } from "../main.js";
import { CONFIG } from "../config.js";

const candidate = {
  appid: "3205380", englishName: "Tiny Kitchen", releaseDate: "2026-02-14",
  reviewScore: 9, reviewLabel: "Overwhelmingly Positive", totalReviews: 1234, positivePct: 98,
};
const details = {
  chineseName: "小小廚房", genres: ["模擬"], priceText: "NT$ 268", supportsChinese: true,
  isVROnly: false, isAdult: false, supportsController: true,
  headerImage: "https://cdn.example/header.jpg", categories: ["單人"],
};

function monthlyOptions(reportFile, overrides = {}) {
  return {
    argv: ["node", "main.js", "--year", "2026", "--month", "2"],
    config: { ...CONFIG, OUTPUT_FILE: reportFile },
    logger: { log: () => {}, error: () => {} },
    processRef: { exitCode: 0 },
    waitFn: async () => {},
    locateMonthBinarySearchFn: async () => 0,
    collectGamesForMonthFn: async () => ({ candidates: [candidate], endStart: 50 }),
    fetchAppDetailsFn: async () => details,
    ...overrides,
  };
}

test("--backfill-tags 直接修補既有 Markdown，不建立標籤 sidecar", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "steam-main-tags-"));
  const reportFile = path.join(directory, "遊戲.md");
  fs.writeFileSync(reportFile, "existing", "utf8");
  let received;
  await runSteamDiscovery({
    argv: ["node", "main.js", "--backfill-tags"],
    config: { ...CONFIG, OUTPUT_FILE: reportFile },
    logger: { log: () => {}, error: () => {} },
    processRef: { exitCode: 0 },
    backfillCommunityTagsFn: async (args) => { received = args; return { fetched: 1, skipped: 1, failed: [] }; },
  });
  assert.equal(received.filepath, reportFile);
  assert.equal(fs.existsSync(path.join(directory, "遊戲標籤.json")), false);
});

test("--backfill-tags 找不到報告時設非零 exit code", async () => {
  const reportFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "steam-main-tags-")), "不存在.md");
  const errors = [];
  const processRef = { exitCode: 0 };
  await runSteamDiscovery({
    argv: ["node", "main.js", "--backfill-tags"], config: { ...CONFIG, OUTPUT_FILE: reportFile },
    logger: { log: () => {}, error: (message) => errors.push(String(message)) }, processRef,
  });
  assert.equal(processRef.exitCode, 1);
  assert.match(errors.join("\n"), /找不到既有遊戲報告/);
});

test("每月更新先取得社群標籤，再把標籤交給 Markdown writer", async () => {
  const reportFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "steam-main-tags-")), "遊戲.md");
  const order = [];
  const written = [];
  await runSteamDiscovery(monthlyOptions(reportFile, {
    fetchCommunityTagsFn: async (appid) => { order.push(`tags:${appid}`); return ["牌組製作", "策略"]; },
    updateReportFn: (payload) => { order.push("write"); written.push(payload); },
  }));
  assert.deepEqual(order, ["tags:3205380", "write"]);
  assert.deepEqual(written[0][0].games[0].communityTags, ["牌組製作", "策略"]);
});

test("每月更新的真實 writer 把類型與社群標籤寫入同一份報告", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "steam-writer-path-"));
  const reportFile = path.join(directory, "遊戲.md");
  await runSteamDiscovery(monthlyOptions(reportFile, {
    fetchCommunityTagsFn: async () => ["牌組製作", "策略"],
  }));
  const content = fs.readFileSync(reportFile, "utf8");
  assert.match(content, /2026-02-14 \| 98% \(1,234\) \| 模擬/);
  assert.match(content, /社群標籤: 牌組製作, 策略/);
  assert.equal(fs.existsSync(path.join(directory, "遊戲標籤.json")), false);
});

test("真實 writer 只寫入注入的報告與同層連結頁", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "steam-writer-path-"));
  const injectedDirectory = path.join(directory, "injected");
  const configuredDirectory = path.join(directory, "configured");
  const reportFile = path.join(injectedDirectory, "遊戲.md");
  const configuredReport = path.join(configuredDirectory, "遊戲.md");
  fs.mkdirSync(injectedDirectory, { recursive: true });
  fs.mkdirSync(configuredDirectory, { recursive: true });
  fs.writeFileSync(configuredReport, "不得改寫\n", "utf8");
  const originalOutput = CONFIG.OUTPUT_FILE;
  try {
    CONFIG.OUTPUT_FILE = configuredReport;
    await runSteamDiscovery(monthlyOptions(reportFile, {
      fetchCommunityTagsFn: async () => ["牌組製作", "策略"],
    }));
    assert.equal(fs.readFileSync(configuredReport, "utf8"), "不得改寫\n");
    assert.equal(fs.existsSync(reportFile), true);
    assert.equal(fs.existsSync(path.join(injectedDirectory, "open_links.html")), true);
  } finally {
    CONFIG.OUTPUT_FILE = originalOutput;
  }
});

test("社群標籤取得失敗仍寫入月報並留下缺漏文字", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "steam-main-tags-"));
  const reportFile = path.join(directory, "遊戲.md");
  const errors = [];
  await runSteamDiscovery(monthlyOptions(reportFile, {
    logger: { log: () => {}, error: (message) => errors.push(String(message)) },
    fetchCommunityTagsFn: async () => { throw new Error("network failed"); },
  }));
  assert.match(fs.readFileSync(reportFile, "utf8"), /社群標籤: 尚未補齊社群標籤/);
  assert.match(errors.join("\n"), /尚未補齊社群標籤/);
});
