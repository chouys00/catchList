import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { observationEndMonth, parseCliArgs, pendingMonths, runUpdate } from "../main.js";
import { writeMonthReport } from "../writer.js";

const referenceDate = new Date("2026-08-17T00:00:00Z");

function selection(tmdbId) {
  return [{
    tmdbId, region: "kr", weightedScore: 8, displayName: `劇 ${tmdbId}`, originalName: `Show ${tmdbId}`,
    firstAirDate: "2025-01-01", voteAverage: 8, voteCount: 100,
    imdb: { imdbScore: null, imdbVotes: null, status: "insufficient" }, confidence: "medium", genreNames: ["Drama"]
  }];
}

function temporaryReport() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "live-action-main-"));
  return { dir, report: path.join(dir, "真人劇.md") };
}

test("六個月觀察期的終點與首次回補 12 個月固定", () => {
  const end = observationEndMonth(referenceDate);
  assert.deepEqual(end, { key: "2026-02", year: 2026, month: 2, startDate: "2026-02-01", endDate: "2026-02-28" });
  const months = pendingMonths(new Map(), { referenceDate });
  assert.equal(months.length, 12);
  assert.equal(months[0].key, "2025-03");
  assert.equal(months.at(-1).key, "2026-02");
});

test("既有報告從最早月份補缺，跨年與未到觀察期月份正確處理", () => {
  const sections = new Map([["2024-11", "x"], ["2025-01", "x"], ["2025-03", "未來"]]);
  const months = pendingMonths(sections, { referenceDate: new Date("2025-08-17T00:00:00Z") });
  assert.deepEqual(months.map((month) => month.key), ["2024-12", "2025-02"]);
});

test("預覽不建立或修改輸出檔", async () => {
  const { dir, report } = temporaryReport();
  const logs = [];
  try {
    fs.writeFileSync(report, "既有內容\n", "utf8");
    const result = await runUpdate({
      outputFile: report, dryRun: true, requestedMonth: "2025-03", referenceDate,
      processMonth: async () => ({ selections: selection(1), candidates: [] }), log: (line) => logs.push(line)
    });
    assert.equal(result.results[0].written, false);
    assert.equal(fs.readFileSync(report, "utf8"), "既有內容\n");
    assert.match(logs.join("\n"), /預覽 2025-03/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("未到六個月觀察期的月份只能預覽，不能正式寫入", async () => {
  const { dir, report } = temporaryReport();
  try {
    await assert.rejects(runUpdate({
      outputFile: report, requestedMonth: "2026-08", referenceDate,
      processMonth: async () => ({ selections: selection(1) })
    }), /只能處理至 2026-02/);
    assert.equal(fs.existsSync(report), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("每月候選詳情以有限併發載入", async () => {
  let active = 0;
  let maxActive = 0;
  const client = {
    async discoverMonth({ originCountries }) {
      return [1, 2, 3].map((id) => ({ id: id + originCountries[0].charCodeAt(0) }));
    },
    async getCandidate(item) {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setImmediate(resolve));
      active -= 1;
      return {
        tmdbId: item.id, voteAverage: 8, voteCount: 100, genreIds: [18], type: "Scripted",
        episodeCount: 10, adult: false, originCountries: ["KR"], translations: [], externalIds: {}
      };
    },
    flushCache() {}
  };
  await runUpdate({
    outputFile: temporaryReport().report, dryRun: true, requestedMonth: "2025-03", referenceDate,
    client, wikidataResolver: async () => null, log: () => {}
  });
  assert.equal(maxActive, 4);
});

test("逐月原子寫入保留已完成月份，失敗後只續補缺月", async () => {
  const { dir, report } = temporaryReport();
  const processed = [];
  try {
    writeMonthReport(report, { year: 2025, month: 6, selections: [], updatedAt: "2026-08-17" });
    await assert.rejects(runUpdate({
      outputFile: report, referenceDate: new Date("2026-02-17T00:00:00Z"), updatedAt: "2026-08-17",
      processMonth: async (month) => {
        processed.push(month.key);
        if (month.key === "2025-08") throw new Error("模擬第二月失敗");
        return { selections: selection(7) };
      }
    }), /模擬第二月失敗/);
    assert.deepEqual(processed, ["2025-07", "2025-08"]);
    const afterFailure = fs.readFileSync(report, "utf8");
    assert.match(afterFailure, /2025  7月/);
    assert.doesNotMatch(afterFailure, /2025  8月/);

    const resumed = [];
    await runUpdate({
      outputFile: report, referenceDate: new Date("2026-02-17T00:00:00Z"), updatedAt: "2026-08-17",
      processMonth: async (month) => { resumed.push(month.key); return { selections: selection(8) }; }
    });
    assert.deepEqual(resumed, ["2025-08"]);
    const completed = fs.readFileSync(report, "utf8");
    assert.match(completed, /2025  8月/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("同月份重跑不重抓且內容不變，CLI 參數可解析", async () => {
  const { dir, report } = temporaryReport();
  let calls = 0;
  try {
    const options = parseCliArgs(["--dry-run", "--output", report, "--month", "2025-03"]);
    assert.deepEqual(options, { dryRun: true, outputFile: report, month: "2025-03", imdbRatingsFile: null });
    await runUpdate({ outputFile: report, requestedMonth: "2025-03", referenceDate, updatedAt: "2026-08-17", processMonth: async () => { calls += 1; return { selections: selection(1) }; } });
    const first = fs.readFileSync(report, "utf8");
    await runUpdate({ outputFile: report, requestedMonth: "2025-03", referenceDate, updatedAt: "2026-08-18", processMonth: async () => { calls += 1; return { selections: selection(2) }; } });
    assert.equal(calls, 1);
    assert.equal(fs.readFileSync(report, "utf8"), first);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
