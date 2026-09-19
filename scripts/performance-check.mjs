// 唯讀正式報告，寫入只限自行建立的暫存資料夾。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { parseReport } from "../catchlist_reader/src/library.js";
import { ReportCache } from "../catchlist_reader/src/report-cache.js";
import { filterAndSortGames, createGameQuery } from "../catchlist_reader/src/renderer/game-browser.js";
import { createInitializationCache } from "../steam_discovery/initialization-cache.js";
import { JsonJournal } from "../packages/core/json-journal.js";
import { runAllUpdates } from "./update-all.mjs";

function measure(fn, count = 30) {
  fn(); const times = [];
  for (let i = 0; i < count; i++) { const start = performance.now(); fn(); times.push(performance.now() - start); }
  times.sort((a,b) => a-b);
  return Number(times[Math.floor(count / 2)].toFixed(3));
}
const file = process.argv[2] || "G:/我的雲端硬碟/CatchList/遊戲.md";
const content = fs.readFileSync(file, "utf8");
const entries = parseReport("games", content).entries;
const reportCache = new ReportCache(parseReport);
assert.deepEqual(reportCache.read("games", file).entries, entries);
const query = createGameQuery();
const filters = { query: "a", sort: "date" };
assert.deepEqual(query(entries, filters), filterAndSortGames(entries, filters));
const result = { entries: entries.length, report: { beforeMs: measure(() => parseReport("games", fs.readFileSync(file, "utf8"))), cachedMs: measure(() => reportCache.read("games", file)) }, search: { beforeMs: measure(() => filterAndSortGames(entries, filters)), cachedMs: measure(() => query(entries, filters)), changedQueryMs: measure(() => { query(entries, { ...filters, query: "遊戲" }); query(entries, filters); }) } };
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "catchlist-performance-"));
try {
  const progress = { version: 1, entries: Object.fromEntries(Array.from({ length: 3338 }, (_, i) => [i + 1, { state: "success", attempts: 1 }])) };
  fs.writeFileSync(path.join(temp, "progress.json"), JSON.stringify(progress));
  const cache = createInitializationCache(temp);
  assert.deepEqual(cache.loadProgress(), progress);
  result.progress = { beforeMs: measure(() => JSON.parse(fs.readFileSync(path.join(temp, "progress.json"), "utf8"))), cachedMs: measure(() => cache.loadProgress()) };
  let writes = 0;
  const store = new JsonJournal(path.join(temp, "details.json"), { fileSystem: { ...fs, writeFileSync(...args) { writes++; return fs.writeFileSync(...args); } } });
  for (let i = 0; i < 250; i++) store.set(i, { name: `Game ${i}` });
  store.flush(); assert.equal(Object.keys(new JsonJournal(store.filepath).data).length, 250);
  result.fullCacheWrites = { before: 250, after: writes };
  const durations = [];
  for (const concurrency of [1, 2]) {
    const start = performance.now();
    const run = await runAllUpdates({ concurrency, recorder: null, platform: "linux", log() {}, error() {}, spawn: () => new Promise(resolve => setTimeout(() => resolve({ status: 0 }), 100)) });
    assert.equal(run.exitCode, 0); durations.push(Number((performance.now() - start).toFixed(1)));
  }
  result.schedulerSimulation = { sequentialMs: durations[0], concurrentMs: durations[1], note: "三項各 100 毫秒的模擬工作，非真實網路耗時" };
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
console.log(JSON.stringify(result, null, 2));
