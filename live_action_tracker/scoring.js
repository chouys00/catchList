import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { REGION_KEYS } from "./schema.js";
import { evaluateLiveAction } from "./classifier.js";
import { bayesianScore } from "./calibration/statistics.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
function versionedCalibrationFile(basename) {
  for (const version of [6, 5, 4, 3, 2, 1]) {
    const file = path.join(ROOT, "calibration", `${basename}.v${version}.json`);
    if (fs.existsSync(file)) return file;
  }
  throw new Error(`找不到 ${basename} 的版本化校準設定。`);
}
const defaultSummary = JSON.parse(fs.readFileSync(versionedCalibrationFile("calibration-summary"), "utf8"));
const defaultThresholds = JSON.parse(fs.readFileSync(versionedCalibrationFile("thresholds"), "utf8"));

export const CONFIDENCE_LEVELS = Object.freeze({ HIGH: "high", MEDIUM: "medium", LOW: "low" });

function confidenceFor(region, voteCount, summary) {
  const percentiles = summary.regions[region]?.votePercentiles ?? {};
  if (percentiles.p75 != null && voteCount >= percentiles.p75) return CONFIDENCE_LEVELS.HIGH;
  if (percentiles.p50 != null && voteCount >= percentiles.p50) return CONFIDENCE_LEVELS.MEDIUM;
  return CONFIDENCE_LEVELS.LOW;
}

export function assessImdbEvidence(candidate, imdbRating, { minimumVotes = 100 } = {}) {
  if (!imdbRating || !Number.isFinite(Number(imdbRating.score))) {
    return { status: "insufficient", imdbScore: null, imdbVotes: null };
  }
  const imdbScore = Number(imdbRating.score);
  const imdbVotes = Number(imdbRating.votes);
  if (!Number.isFinite(imdbVotes) || imdbVotes < minimumVotes) {
    return { status: "insufficient", imdbScore, imdbVotes };
  }
  const tmdbHigh = Number(candidate.voteAverage) >= 7;
  const imdbHigh = imdbScore >= 7;
  return {
    status: tmdbHigh === imdbHigh ? "consistent" : "divergent",
    imdbScore,
    imdbVotes
  };
}

export function scoreCandidate(candidate, {
  summary = defaultSummary,
  thresholds = defaultThresholds,
  imdbRating = null,
  imdbMinimumVotes = 100
} = {}) {
  const classification = evaluateLiveAction(candidate);
  const region = classification.region;
  const threshold = region ? thresholds.regions?.[region] : null;
  const calibration = region ? summary.regions?.[region] : null;
  const eligibleByType = classification.accepted && REGION_KEYS.includes(region);
  const weightedScore = eligibleByType && calibration
    ? bayesianScore(candidate, calibration.regionalMean, threshold.minimumVotes)
    : null;
  const selected = Boolean(eligibleByType
    && threshold
    && Number(candidate.voteCount) >= threshold.minimumVotes
    && weightedScore >= threshold.minimumWeightedScore);
  const evidence = assessImdbEvidence(candidate, imdbRating, { minimumVotes: imdbMinimumVotes });
  return {
    ...candidate,
    region,
    exclusionReasons: classification.reasons,
    weightedScore,
    selected,
    confidence: region && calibration ? confidenceFor(region, Number(candidate.voteCount), summary) : CONFIDENCE_LEVELS.LOW,
    imdb: evidence
  };
}

export function selectAndSortCandidates(candidates, options = {}) {
  const byId = new Map();
  for (const candidate of candidates) {
    const scored = scoreCandidate(candidate, options);
    const current = byId.get(scored.tmdbId);
    if (!current || (scored.selected && !current.selected) || (scored.weightedScore ?? -Infinity) > (current.weightedScore ?? -Infinity)) {
      byId.set(scored.tmdbId, scored);
    }
  }
  const selected = [...byId.values()].filter((candidate) => candidate.selected);
  return REGION_KEYS.flatMap((region) => selected
    .filter((candidate) => candidate.region === region)
    .sort((a, b) => b.weightedScore - a.weightedScore || b.voteCount - a.voteCount || a.tmdbId - b.tmdbId));
}

export { defaultSummary, defaultThresholds };
