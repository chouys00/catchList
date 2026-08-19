import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { calibrationMonths, calibrationOutputPaths, parseCalibrationArgs, runCalibration } from "../calibration/run.js";

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("校準視窗固定為六個月觀察期前的 24 個完整月份", () => {
  const months = calibrationMonths(new Date("2026-08-17T00:00:00Z"));
  assert.equal(months.length, 24);
  assert.deepEqual(months[0], { key: "2024-03", startDate: "2024-03-01", endDate: "2024-03-31" });
  assert.deepEqual(months.at(-1), { key: "2026-02", startDate: "2026-02-01", endDate: "2026-02-28" });
});

test("校準輸出位置不受 npm workspace 工作目錄影響", () => {
  const outputs = calibrationOutputPaths();
  assert.equal(outputs.summary, path.join(PACKAGE_ROOT, "calibration", "calibration-summary.v2.json"));
  assert.equal(outputs.thresholds, path.join(PACKAGE_ROOT, "calibration", "thresholds.v2.json"));
});

test("校準可明確選擇只重用既有實際快取", () => {
  assert.deepEqual(parseCalibrationArgs([]), { reuseCache: false });
  assert.deepEqual(parseCalibrationArgs(["--reuse-cache"]), { reuseCache: true });
  assert.throws(() => parseCalibrationArgs(["--unknown"]), /不支援的校準參數/);
});

test("校準流程統計五區且只收錄分類相符的真人劇", async () => {
  let nextId = 1;
  const client = {
    async discoverMonth({ originCountries }) {
      return [{ id: nextId++, expectedCountry: originCountries[0] }];
    },
    async getCandidate(item) {
      return {
        tmdbId: item.id, voteAverage: 8, voteCount: 100, genreIds: [18], type: "Scripted",
        episodeCount: 10, adult: false, originCountries: [item.expectedCountry],
        translations: [{ iso_639_1: "zh", iso_3166_1: "TW", data: { name: "測試劇" } }]
      };
    }
  };
  const summary = await runCalibration({ client, referenceDate: new Date("2026-08-17T00:00:00Z") });
  for (const region of Object.values(summary.regions)) {
    assert.equal(region.monthsCovered, 24);
    assert.equal(region.acceptedCount, 24);
    assert.equal(region.genreCoverageRate, 1);
    assert.equal(region.traditionalChineseNameCoverageRate, 1);
  }
});

test("en-TW 名稱不會誤算成繁中名稱覆蓋", async () => {
  let nextId = 1;
  const client = {
    async discoverMonth({ originCountries }) {
      return [{ id: nextId++, expectedCountry: originCountries[0] }];
    },
    async getCandidate(item) {
      return {
        tmdbId: item.id, voteAverage: 8, voteCount: 100, genreIds: [18], type: "Scripted",
        episodeCount: 10, adult: false, originCountries: [item.expectedCountry],
        translations: [{ iso_639_1: "en", iso_3166_1: "TW", data: { name: "English title" } }]
      };
    }
  };
  const summary = await runCalibration({ client, referenceDate: new Date("2026-08-17T00:00:00Z") });
  for (const region of Object.values(summary.regions)) {
    assert.equal(region.traditionalChineseNameCoverageRate, 0);
  }
});

test("校準以有限併發載入候選且每月刷新快取", async () => {
  let active = 0;
  let maxActive = 0;
  let flushes = 0;
  const client = {
    async discoverMonth({ originCountries }) {
      return [1, 2, 3, 4].map((id) => ({ id, expectedCountry: originCountries[0] }));
    },
    async getCandidate(item) {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setImmediate(resolve));
      active -= 1;
      return {
        tmdbId: item.id, voteAverage: 8, voteCount: 100, genreIds: [18], type: "Scripted",
        episodeCount: 10, adult: false, originCountries: [item.expectedCountry], translations: []
      };
    },
    flushCache() { flushes += 1; }
  };
  await runCalibration({
    client, referenceDate: new Date("2026-08-17T00:00:00Z"), candidateConcurrency: 2
  });
  assert.equal(maxActive, 2);
  assert.equal(flushes, 121);
});
