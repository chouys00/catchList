import { REGION_KEYS } from "../schema.js";

export const VOTE_COUNT_PERCENTILE = 0.75;
export const WEIGHTED_SCORE_PERCENTILE = 0.8;

export const FALLBACK_THRESHOLDS = Object.freeze({
  kr: { minimumVotes: 50, minimumWeightedScore: 7.2 },
  jp: { minimumVotes: 30, minimumWeightedScore: 7.1 },
  tw: { minimumVotes: 20, minimumWeightedScore: 7.0 },
  cn: { minimumVotes: 30, minimumWeightedScore: 7.0 },
  western: { minimumVotes: 150, minimumWeightedScore: 7.2 }
});

export function percentile(values, fraction) {
  if (!Array.isArray(values) || values.length === 0) return null;
  if (fraction < 0 || fraction > 1) throw new RangeError("百分位必須介於 0 與 1。");
  const sorted = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const index = (sorted.length - 1) * fraction;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + ((sorted[upper] - sorted[lower]) * (index - lower));
}

export function bayesianScore({ voteAverage, voteCount }, regionalMean, minimumVotes) {
  const rating = Number(voteAverage);
  const votes = Number(voteCount);
  if (![rating, votes, regionalMean, minimumVotes].every(Number.isFinite) || votes < 0 || minimumVotes < 0) {
    throw new TypeError("Bayesian 分數輸入無效。");
  }
  if (votes + minimumVotes === 0) return regionalMean;
  return ((votes / (votes + minimumVotes)) * rating)
    + ((minimumVotes / (votes + minimumVotes)) * regionalMean);
}

export function calibrateRegion(samples, { minimumSampleSize = 20, fallback } = {}) {
  const valid = samples.filter((sample) => Number.isFinite(sample.voteAverage)
    && sample.voteAverage > 0
    && Number.isFinite(sample.voteCount) && sample.voteCount > 0);
  const selectedFallback = fallback ?? { minimumVotes: 50, minimumWeightedScore: 7 };
  if (valid.length === 0) {
    return {
      sampleCount: 0,
      sufficient: false,
      regionalMean: null,
      votePercentiles: { p25: null, p50: null, p75: null },
      weightedScoreP80: null,
      threshold: { ...selectedFallback, source: "fallback" },
      warning: `樣本數 0，少於最低需求 ${minimumSampleSize}。`
    };
  }

  const regionalMean = valid.reduce((sum, sample) => sum + sample.voteAverage, 0) / valid.length;
  const votes = valid.map((sample) => sample.voteCount);
  const minimumVotes = percentile(votes, VOTE_COUNT_PERCENTILE);
  const weightedScores = valid.map((sample) => bayesianScore(sample, regionalMean, minimumVotes));
  const weightedScoreP80 = percentile(weightedScores, WEIGHTED_SCORE_PERCENTILE);
  const sufficient = valid.length >= minimumSampleSize;

  return {
    sampleCount: valid.length,
    sufficient,
    regionalMean,
    votePercentiles: {
      p25: percentile(votes, 0.25),
      p50: percentile(votes, 0.5),
      p75: minimumVotes
    },
    weightedScoreP80,
    threshold: sufficient
      ? { minimumVotes, minimumWeightedScore: weightedScoreP80, source: "calibrated" }
      : { ...selectedFallback, source: "fallback" },
    warning: sufficient ? null : `樣本數 ${valid.length}，少於最低需求 ${minimumSampleSize}。`
  };
}

export function buildCalibrationSummary(regionSamples, metadata = {}) {
  const regions = {};
  for (const region of REGION_KEYS) {
    const data = regionSamples[region] ?? { samples: [] };
    regions[region] = {
      monthsCovered: data.monthsCovered ?? 0,
      discoverCount: data.discoverCount ?? 0,
      detailsLoaded: data.detailsLoaded ?? 0,
      acceptedCount: data.samples?.length ?? 0,
      genreCoverageRate: data.detailsLoaded ? data.genrePresent / data.detailsLoaded : 0,
      traditionalChineseNameCoverageRate: data.detailsLoaded ? data.traditionalChineseNames / data.detailsLoaded : 0,
      ...calibrateRegion(data.samples ?? [], {
        minimumSampleSize: metadata.minimumSampleSize ?? 20,
        fallback: FALLBACK_THRESHOLDS[region]
      })
    };
  }
  return {
    schemaVersion: 2,
    generatedAt: metadata.generatedAt ?? new Date().toISOString(),
    window: metadata.window ?? null,
    regions
  };
}

export function buildThresholdSettings(summary) {
  const regions = Object.fromEntries(REGION_KEYS.map((region) => [region, {
    ...summary.regions[region].threshold,
    sampleCount: summary.regions[region].sampleCount
  }]));
  return {
    schemaVersion: 2,
    status: Object.values(summary.regions).every((region) => region.sufficient)
      ? "calibrated"
      : "needs-replan",
    generatedAt: summary.generatedAt,
    historyWindowMonths: summary.window?.monthCount ?? 24,
    observationDelayMonths: 6,
    minimumSampleSize: 20,
    selection: {
      voteCountPercentile: VOTE_COUNT_PERCENTILE,
      weightedScorePercentile: WEIGHTED_SCORE_PERCENTILE,
      fixedMonthlyQuota: null
    },
    regions
  };
}
