import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { formatMonthSection, loadReportSections, REPORT_HEADER, writeMonthReport } from "../writer.js";

function sample(tmdbId, region, overrides = {}) {
  return {
    tmdbId,
    region,
    weightedScore: 8,
    displayName: "繁中\u0000名",
    originalName: "Original * Name",
    firstAirDate: "2025-03-15",
    voteAverage: 8.2,
    voteCount: 1234,
    imdb: { imdbScore: 8.1, imdbVotes: 5678, status: "consistent" },
    confidence: "high",
    genreNames: ["Drama", "Crime"],
    ...overrides
  };
}

test("月份輸出固定五區順序、區內排序、名稱清理與 TMDb 連結", () => {
  const section = formatMonthSection({
    year: 2025, month: 3, updatedAt: "2026-08-17",
    selections: [
      sample(2, "western", { weightedScore: 9 }),
      sample(3, "kr", { weightedScore: 7, displayName: "較低" }),
      sample(1, "kr", { weightedScore: 9, displayName: "較高" })
    ]
  });
  assert.deepEqual(section.split("\n\n").map((part) => part.split("\n")[0]), [
    "2025  3月  (更新時間: 2026-08-17)", "## 韓劇", "## 日劇", "## 台劇", "## 陸劇", "## 歐美劇"
  ]);
  assert.ok(section.indexOf("**較高**") < section.indexOf("**較低**"));
  assert.match(section, /繁中名/);
  assert.ok(section.includes("Original \\* Name"));
  assert.match(section, /\[TMDb\]\(https:\/\/www\.themoviedb\.org\/tv\/1\)/);
  assert.match(REPORT_HEADER, /JustWatch/);
});

test("所有區域顯示臺灣訂閱制供應商與 JustWatch 來源", () => {
  const section = formatMonthSection({
    year: 2025, month: 3, updatedAt: "2026-08-17",
    selections: [sample(2, "tw", { taiwanSubscriptionProviders: ["Netflix", "Disney Plus"] })]
  });
  assert.match(section, /臺灣訂閱制：Netflix、Disney Plus｜資料來源：JustWatch（經 TMDb）/);
});

test("空月份與空區輸出固定完成標記", () => {
  const section = formatMonthSection({ year: 2025, month: 4, updatedAt: "2026-08-17" });
  assert.match(section, /本月無符合門檻的真人劇/);
  assert.equal((section.match(/本區無符合門檻作品/g) ?? []).length, 5);
});

test("同批重複 TMDb ID 只保留一筆，同名不同 ID 都保留", () => {
  const section = formatMonthSection({
    year: 2025, month: 5, updatedAt: "2026-08-17",
    selections: [sample(1, "kr", { displayName: "同名" }), sample(1, "kr", { displayName: "重複" }), sample(2, "kr", { displayName: "同名" })]
  });
  assert.equal((section.match(/https:\/\/www\.themoviedb\.org\/tv\/1/g) ?? []).length, 1);
  assert.equal((section.match(/\*\*同名\*\*/g) ?? []).length, 2);
});

test("頁首不會遮蔽第一個月份，既有月份區段不會被覆寫", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "live-action-writer-"));
  const report = path.join(dir, "真人劇.md");
  try {
    const first = writeMonthReport(report, { year: 2025, month: 3, selections: [sample(1, "kr")], updatedAt: "2026-08-17" });
    const original = fs.readFileSync(report, "utf8");
    const second = writeMonthReport(report, { year: 2025, month: 3, selections: [sample(2, "kr")], updatedAt: "2026-08-18" });
    assert.equal(first.written, true);
    assert.equal(second.written, false);
    assert.ok(original.startsWith(REPORT_HEADER));
    assert.deepEqual([...loadReportSections(report).keys()], ["2025-03"]);
    assert.equal(fs.readFileSync(report, "utf8"), original);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
