import assert from "node:assert/strict";
import test from "node:test";
import { bayesianScore, buildCalibrationSummary, buildThresholdSettings, calibrateRegion, percentile } from "../calibration/statistics.js";

test("百分位使用線性插值並處理空樣本", () => {
  assert.equal(percentile([], 0.25), null);
  assert.equal(percentile([1, 2, 3, 4], 0.25), 1.75);
  assert.ok(Math.abs(percentile([4, 1, 3, 2], 0.8) - 3.4) < Number.EPSILON * 4);
});

test("Bayesian 分數將低票數高分往區域平均拉回", () => {
  const lowVotes = bayesianScore({ voteAverage: 10, voteCount: 5 }, 7, 50);
  const highVotes = bayesianScore({ voteAverage: 10, voteCount: 500 }, 7, 50);
  assert.ok(lowVotes < highVotes);
  assert.ok(lowVotes > 7);
  assert.ok(highVotes < 10);
});

test("零票或無評分作品保留為覆蓋資料但不納入門檻樣本", () => {
  const result = calibrateRegion([
    { voteAverage: 0, voteCount: 0 },
    { voteAverage: 8, voteCount: 10 },
    { voteAverage: 7, voteCount: 20 }
  ], { minimumSampleSize: 2 });
  assert.equal(result.sampleCount, 2);
  assert.equal(result.sufficient, true);
  assert.equal(result.regionalMean, 7.5);
  assert.equal(result.votePercentiles.p25, 12.5);
  assert.equal(result.threshold.minimumVotes, 17.5);
  assert.ok(result.threshold.minimumVotes > 0);
});

test("足量樣本採歷史 p75 票數及 Bayesian p80，不設定固定名額", () => {
  const samples = Array.from({ length: 20 }, (_, index) => ({
    voteAverage: 6 + (index / 10), voteCount: 10 + (index * 10)
  }));
  const result = calibrateRegion(samples, { minimumSampleSize: 20 });
  assert.equal(result.sufficient, true);
  assert.equal(result.threshold.source, "calibrated");
  assert.equal(result.threshold.minimumVotes, 152.5);
  assert.equal(result.threshold.minimumWeightedScore, result.weightedScoreP80);
  assert.equal("quota" in result.threshold, false);
});

test("樣本不足時採該區明文備援，不借用其他地區門檻", () => {
  const fallback = { minimumVotes: 20, minimumWeightedScore: 7 };
  const result = calibrateRegion([{ voteAverage: 9, voteCount: 1 }], {
    minimumSampleSize: 20, fallback
  });
  assert.equal(result.sufficient, false);
  assert.deepEqual(result.threshold, { ...fallback, source: "fallback" });
  assert.match(result.warning, /樣本數 1/);
});

test("固定樣本與固定時間可重現相同版本化摘要", () => {
  const data = {
    kr: { monthsCovered: 24, discoverCount: 2, detailsLoaded: 2, genrePresent: 2, traditionalChineseNames: 1,
      samples: [{ voteAverage: 8, voteCount: 100 }, { voteAverage: 7, voteCount: 20 }] }
  };
  const metadata = { generatedAt: "2026-08-17T00:00:00.000Z", window: { start: "2024-03", end: "2026-02", monthCount: 24 } };
  assert.deepEqual(buildCalibrationSummary(data, metadata), buildCalibrationSummary(data, metadata));
  const summary = buildCalibrationSummary(data, metadata);
  assert.equal(summary.schemaVersion, 2);
  assert.equal(summary.regions.kr.monthsCovered, 24);
  assert.equal(summary.regions.kr.genreCoverageRate, 1);
  assert.equal(summary.regions.kr.traditionalChineseNameCoverageRate, 0.5);
  assert.equal(summary.regions.jp.threshold.source, "fallback");
});

test("門檻設定保留五區來源、樣本數與無固定名額規則", () => {
  const summary = buildCalibrationSummary({}, {
    generatedAt: "2026-08-17T00:00:00.000Z",
    window: { start: "2024-03", end: "2026-02", monthCount: 24 }
  });
  const settings = buildThresholdSettings(summary);
  assert.equal(settings.status, "needs-replan");
  assert.equal(settings.schemaVersion, 2);
  assert.equal(settings.selection.voteCountPercentile, 0.75);
  assert.equal(settings.selection.fixedMonthlyQuota, null);
  assert.deepEqual(Object.keys(settings.regions), ["kr", "jp", "tw", "cn", "western"]);
  assert.equal(settings.regions.kr.source, "fallback");
  assert.equal(settings.regions.kr.sampleCount, 0);
});
