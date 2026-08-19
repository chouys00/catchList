import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadAnnualSelections, parseCliArgs, runAnnualUpdate } from "../main.js";
import { REGION_KEYS } from "../schema.js";

function annualSelections() {
  return REGION_KEYS.flatMap((region) => Array.from({ length: 10 }, (_, index) => ({
    region,
    title: `${region} 必看 ${index + 1}`,
    imdbUrl: `https://www.imdb.com/title/tt${String(index + 1).padStart(7, "0")}/`,
    imdbScore: 7.5 + index / 10,
    imdbVotes: 100 + index
  })));
}

function annualData() {
  return { selections: annualSelections(), selectedAt: "2026-08-19", imdbDataDate: "2026-08-17" };
}

function temporaryReport() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "live-action-annual-"));
  return { dir, report: path.join(dir, "真人劇年度.md"), input: path.join(dir, "2022.json") };
}

test("CLI 必須指定年度與 AI 清單，並支援預覽與自訂輸出", () => {
  const options = parseCliArgs(["--dry-run", "--year", "2022", "--input", "2022.json", "--output", "report.md"]);
  assert.deepEqual(options, { dryRun: true, year: 2022, inputFile: "2022.json", outputFile: "report.md" });
  assert.throws(() => parseCliArgs(["--year", "2022"]), /--input/);
  assert.throws(() => parseCliArgs(["--input", "2022.json", "--year", "22"]), /四位數年份/);
});

test("AI 年度清單只驗證結構，五區必須各有十部，IMDb 不參與選擇", () => {
  const { dir, input } = temporaryReport();
  try {
    fs.writeFileSync(input, JSON.stringify({ year: 2022, ...annualData() }), "utf8");
    const loaded = loadAnnualSelections(input, 2022);
    assert.equal(loaded.selections.length, 50);
    assert.equal(loaded.selections[0].imdbScore, 7.5);

    fs.writeFileSync(input, JSON.stringify({ year: 2022, selections: annualSelections().slice(1) }), "utf8");
    assert.throws(() => loadAnnualSelections(input, 2022), /剛好有 10 部/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("預覽不建立或修改年度報告", async () => {
  const { dir, report } = temporaryReport();
  try {
    const result = await runAnnualUpdate({ year: 2022, outputFile: report, dryRun: true, processYear: async () => annualData() });
    assert.equal(result.written, false);
    assert.equal(fs.existsSync(report), false);
    assert.match(result.preview, /2022  全年度/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("同年度首次寫入後直接略過，不重新處理或改寫內容", async () => {
  const { dir, report } = temporaryReport();
  let calls = 0;
  try {
    const processYear = async () => { calls += 1; return annualData(); };
    const first = await runAnnualUpdate({ year: 2022, outputFile: report, processYear });
    const original = fs.readFileSync(report, "utf8");
    const second = await runAnnualUpdate({ year: 2022, outputFile: report, processYear });
    assert.equal(first.written, true);
    assert.equal(second.skipped, true);
    assert.equal(calls, 1);
    assert.equal(fs.readFileSync(report, "utf8"), original);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
