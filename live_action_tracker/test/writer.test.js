import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { REGION_KEYS } from "../schema.js";
import { formatYearSection, loadAnnualReportSections, REPORT_HEADER, writeAnnualReport } from "../writer.js";

function selections() {
  return REGION_KEYS.flatMap((region) => Array.from({ length: 10 }, (_, index) => ({
    region,
    title: index === 0 ? "名稱 * 保留" : `${region} ${index + 1}`,
    imdbUrl: `https://www.imdb.com/title/tt${String(index + 1).padStart(7, "0")}/`,
    imdbScore: 8,
    imdbVotes: 1234
  })));
}

test("年度輸出固定五區、IMDb 連結、分數與票數格式", () => {
  const section = formatYearSection({ year: 2022, selections: selections(), selectedAt: "2026-08-19", imdbDataDate: "2026-08-17" });
  assert.deepEqual(section.split("\n\n").map((part) => part.split("\n")[0]), [
    "2022  全年度  (整理時間: 2026-08-19)", "## 韓劇", "## 日劇", "## 台劇", "## 陸劇", "## 歐美劇", "IMDb 資料日期：2026-08-17"
  ]);
  assert.ok(section.includes("[名稱 \\* 保留](https://www.imdb.com/title/tt0000001/)"));
  assert.match(section, /8\.0／10（1,234 票）/);
  assert.match(section, /IMDb 資料日期：2026-08-17/);
  assert.match(REPORT_HEADER, /同一年度首次寫入後不會自動更新/);
});

test("年度區段以 00 鍵去重，既有內容不會被覆寫", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "live-action-annual-writer-"));
  const report = path.join(dir, "真人劇年度.md");
  try {
    const first = writeAnnualReport(report, { year: 2022, selections: selections() });
    const original = fs.readFileSync(report, "utf8");
    const second = writeAnnualReport(report, { year: 2022, selections: [] });
    assert.equal(first.written, true);
    assert.equal(second.written, false);
    assert.ok(original.startsWith(REPORT_HEADER));
    assert.deepEqual([...loadAnnualReportSections(report).keys()], ["2022-00"]);
    assert.equal(fs.readFileSync(report, "utf8"), original);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
