import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { loadLibrary } from "../../catchlist_reader/src/library.js";
import { INITIALIZATION_OUTPUT_ROOT, resolveInitializationOutput, runInitialization } from "../initialize.js";

function row(appid, overrides = {}) {
  return {
    AppID: String(appid), Name: `Game ${appid}`, "Release date": "2020-01-10",
    Positive: "900", Negative: "100", Genres: "Indie", Categories: "Single-player", Tags: "Puzzle", ...overrides
  };
}

async function* datasetRows() {
  yield row(20);
  yield row(20);
  yield row(30, { Tags: "PvP" });
  yield row(40, { Positive: "0", Negative: "0" });
}

function complete(appid) {
  return {
    appid: String(appid), pageState: "complete", retry: false, reasons: [], title: `繁中 ${appid}`,
    releaseDate: "2020-01-10", tagRecords: [{ id: "492", name: "獨立製作" }], communityTags: ["獨立製作"],
    supportTChinese: true, supportSChinese: true, isFree: false, hasInAppPurchases: false, hasMMO: false, vrMode: "supported", isEarlyAccess: false
  };
}

test("固定小樣本能端到端輸出完整且無重複的初始化資料", async () => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "steam-initialize-"));
  const calls = [];
  const run = () => runInitialization({
    argv: ["node", "initialize.js", "--dataset", "sample.csv", "--from", "2020-01", "--through", "2020-01", "--resume"],
    outputRoot: output,
    loadDataset: async function* () { yield* datasetRows(); },
    createCache: () => ({ root: path.join(output, "cache") }),
    getDetails: async (appid) => { calls.push(String(appid)); return { details: complete(appid) }; },
    logger: { log() {} }
  });
  const first = await run();
  const second = await run();
  assert.deepEqual(calls, ["20", "20"]);
  assert.equal(first.passed.length, 1);
  assert.equal(first.missing.length, 0);
  assert.equal(first.excluded.length, 2);
  assert.deepEqual(first.summary.totals, second.summary.totals);
  const report = fs.readFileSync(path.join(output, "遊戲.md"), "utf8");
  assert.equal((report.match(/AppID: 20/g) ?? []).length, 1);
  assert.match(report, /中文支援: 支援中文/);
  assert.ok(fs.existsSync(path.join(output, "遊戲標籤.json")));
  assert.ok(fs.existsSync(path.join(output, "初始化摘要.json")));
  assert.ok(fs.existsSync(path.join(output, "排除明細.json")));
  assert.ok(fs.existsSync(path.join(output, "評論缺失.json")));
  assert.ok(fs.existsSync(path.join(output, "待重試.json")));
  const viewer = loadLibrary(output, "games");
  assert.equal(viewer.entries.length, 1);
  assert.equal(viewer.entries[0].appid, "20");
  assert.deepEqual(viewer.entries[0].tags, ["獨立製作"]);
  assert.equal(viewer.tagWarning, null);
});

test("輸出路徑只允許初始化資料夾，拒絕雲端正式報告與既有預覽", () => {
  assert.equal(resolveInitializationOutput(), INITIALIZATION_OUTPUT_ROOT);
  assert.throws(() => resolveInitializationOutput("G:/我的雲端硬碟/CatchList/遊戲.md"), /只能是/);
  assert.throws(() => resolveInitializationOutput("steam_discovery/preview/遊戲.md"), /只能是/);
});

test("初始化入口沒有搜尋頁或 appdetails 資料來源", () => {
  const source = fs.readFileSync(new URL("../initialize.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /search\/results|api\/appdetails|appreviews/);
});

test("離線重整優先使用原始快取重新解析，不發出商店頁請求", async () => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "steam-initialize-offline-"));
  let requests = 0;
  const result = await runInitialization({
    argv: ["node", "initialize.js", "--dataset", "sample.csv", "--from", "2020-01", "--through", "2020-01", "--offline"],
    outputRoot: output,
    loadDataset: async function* () { yield row(99); },
    createCache: () => ({
      loadStructured: () => null,
      loadRaw: () => ({ status: 200, fetchedAt: "2026-09-10T00:00:00.000Z", html: '<div id="appHubAppName">快取測試</div><table><tr><td>繁體中文</td></tr><tr><td>簡體中文</td></tr></table>' }),
      saveStructured: () => {}
    }),
    getDetails: async () => { requests += 1; throw new Error("離線模式不應請求"); },
    logger: { log() {} }
  });
  assert.equal(requests, 0);
  assert.equal(result.passed.length, 1);
  assert.equal(result.passed[0].supportsChinese, true);
});
