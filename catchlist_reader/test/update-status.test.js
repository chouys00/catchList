import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadUpdateStatus, reportCoverage, expectedPeriod, UPDATE_STATUS_FILE } from "../src/update-status.js";

const now = new Date(2026, 8, 16);
function temporary(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "catchlist-status-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test("舊版無紀錄時為未知，空月份仍列入收錄進度", (t) => {
  const dir = temporary(t);
  fs.writeFileSync(path.join(dir, "電影.md"), "2026  3月  >7.0\n沒有符合條件的作品\n");
  const result = loadUpdateStatus(dir, { now });
  assert.equal(result.media.movies.status, "unknown");
  assert.equal(result.media.movies.lastSuccessAt, null);
  assert.equal(result.media.movies.coverage.latestLabel, "2026 年 3 月");
  assert.equal(result.media.movies.coverage.isCurrent, true);
  assert.equal(result.media.games.reportExists, false);
});

test("季度、沉澱期與跨年日期符合每月收錄規則", () => {
  assert.equal(expectedPeriod("anime", now).key, "2026-Q2");
  assert.equal(expectedPeriod("movies", new Date(2026, 0, 31)).key, "2025-07");
  assert.equal(expectedPeriod("anime", new Date(2026, 0, 1)).key, "2025-Q4");
  assert.equal(reportCoverage("anime", "2026 春 >7.70\n沒有符合條件的動畫", now).isCurrent, true);
  assert.equal(reportCoverage("games", "2026 4月 >85%\n2026 2月 >85%", now).isCurrent, false);
  assert.equal(reportCoverage("liveAction", "2025 全年度\n", now).expectedKey, null);
});

test("毀損紀錄只顯示警告，仍可讀取報告進度", (t) => {
  const dir = temporary(t);
  fs.writeFileSync(path.join(dir, UPDATE_STATUS_FILE), "{broken");
  fs.writeFileSync(path.join(dir, "動畫.md"), "2026 春 >7.70\n");
  const result = loadUpdateStatus(dir, { now });
  assert.ok(result.warning);
  assert.equal(result.media.anime.status, "unknown");
  assert.equal(result.media.anime.coverage.isCurrent, true);
});

test("最新期間存在仍核對中間缺段，空期間與跨年皆正確", () => {
  const date = new Date(2026, 9, 2);
  const gap = reportCoverage('games', '2026 4月\n2026 1月\n2026 1月\n', date);
  assert.equal(gap.isCurrent, false);
  assert.equal(gap.missingCount, 2);
  assert.deepEqual(gap.missingLabels, ['2026 年 2 月', '2026 年 3 月']);
  const complete = reportCoverage('anime', '2025 秋 >7.7\n2026 冬 >7.7\n2026 春 >7.7\n2026 夏 >7.7\n', date);
  assert.equal(complete.isCurrent, true);
  assert.equal(complete.missingCount, 0);
  assert.equal(reportCoverage('anime', '', date).isCurrent, false);
});

test("未完成執行保留執行中，不推斷成功；紀錄時間與新增數檢查格式", (t) => {
  const dir = temporary(t);
  fs.writeFileSync(path.join(dir, UPDATE_STATUS_FILE), JSON.stringify({ version: 1, media: {
    anime: { status: "running", startedAt: "2026-09-16T00:00:00.000Z", lastSuccessAt: "bad", addedCount: -1 },
  } }));
  const result = loadUpdateStatus(dir, { now }).media.anime;
  assert.equal(result.status, "running");
  assert.equal(result.startedAt, "2026-09-16T00:00:00.000Z");
  assert.equal(result.lastSuccessAt, null);
  assert.equal(result.addedCount, null);
});

test("舊版零筆成功不能推斷新增時間，正數舊紀錄可沿用；新零筆保留成功紀錄", (t) => {
  const dir = temporary(t);
  const date = '2026-10-02T00:00:00.000Z';
  fs.writeFileSync(path.join(dir, UPDATE_STATUS_FILE), JSON.stringify({ version: 1, media: {
    movies: { status: 'success', addedCount: 0, lastSuccessAt: date },
    anime: { status: 'success', addedCount: 43, lastSuccessAt: date },
    games: { status: 'unchanged', addedCount: 0, lastSuccessAt: '2026-10-02', lastSuccessAddedCount: 138 },
  } }));
  const result = loadUpdateStatus(dir).media;
  assert.equal(result.movies.status, 'unchanged'); assert.equal(result.movies.lastSuccessAt, null);
  assert.equal(result.anime.lastSuccessAddedCount, 43);
  assert.equal(result.games.lastSuccessAddedCount, 138); assert.equal(result.games.lastSuccessAt, '2026-10-02');
});
