import assert from "node:assert/strict";
import test from "node:test";
import { defaultThresholds, scoreCandidate, selectAndSortCandidates } from "../scoring.js";

const summary = { regions: { kr: { regionalMean: 7, votePercentiles: { p50: 10, p75: 50 } } } };
const thresholds = { regions: { kr: { minimumVotes: 10, minimumWeightedScore: 7.5 } } };
function candidate(overrides = {}) {
  return { tmdbId: 1, originalName: "Original", voteAverage: 8, voteCount: 100, genreIds: [18], type: "Scripted", episodeCount: 10, adult: false, originCountries: ["KR"], externalIds: {}, translations: [], ...overrides };
}

test("五區採使用者指定的加權分覆蓋門檻", () => {
  const expectedThresholds = { kr: [32, 8], jp: [7, 7.5], tw: [11.5, 7.5], cn: [4, 8], western: [33, 8] };
  for (const [region, [minimumVotes, minimumWeightedScore]] of Object.entries(expectedThresholds)) {
    assert.equal(defaultThresholds.regions[region].minimumVotes, minimumVotes);
    assert.equal(defaultThresholds.regions[region].minimumWeightedScore, minimumWeightedScore);
    assert.equal(defaultThresholds.regions[region].source, "user-override");
  }
});

test("TMDb 門檻決定入選，IMDb 缺漏只標記資料不足", () => {
  const result = scoreCandidate(candidate(), { summary, thresholds });
  assert.equal(result.selected, true);
  assert.equal(result.imdb.status, "insufficient");
  assert.equal(result.confidence, "high");
});

test("IMDb 來源一致、分歧與票數不足都有明確標記", () => {
  assert.equal(scoreCandidate(candidate(), { summary, thresholds, imdbRating: { score: 8, votes: 200 } }).imdb.status, "consistent");
  assert.equal(scoreCandidate(candidate(), { summary, thresholds, imdbRating: { score: 5, votes: 200 } }).imdb.status, "divergent");
  assert.equal(scoreCandidate(candidate(), { summary, thresholds, imdbRating: { score: 8, votes: 99 } }).imdb.status, "insufficient");
});

test("排序只在同區進行，品質不足的區域可為零筆", () => {
  const selected = selectAndSortCandidates([
    candidate({ tmdbId: 2, voteCount: 20, voteAverage: 8 }),
    candidate({ tmdbId: 1, voteCount: 100, voteAverage: 8 }),
    candidate({ tmdbId: 3, voteCount: 100, voteAverage: 6 })
  ], { summary, thresholds });
  assert.deepEqual(selected.map((item) => item.tmdbId), [1, 2]);
});

test("同 TMDb ID 去重，同名不同 ID 保留", () => {
  const selected = selectAndSortCandidates([
    candidate({ tmdbId: 1, originalName: "同名" }),
    candidate({ tmdbId: 1, originalName: "同名", voteCount: 1 }),
    candidate({ tmdbId: 2, originalName: "同名" })
  ], { summary, thresholds });
  assert.deepEqual(selected.map((item) => item.tmdbId).sort(), [1, 2]);
});

test("五區依固定區序排列且只在各區內排序", () => {
  const multiSummary = { regions: {
    kr: { regionalMean: 7, votePercentiles: { p50: 10, p75: 50 } },
    western: { regionalMean: 6, votePercentiles: { p50: 10, p75: 50 } }
  } };
  const multiThresholds = { regions: {
    kr: { minimumVotes: 1, minimumWeightedScore: 7 },
    western: { minimumVotes: 1, minimumWeightedScore: 7 }
  } };
  const selected = selectAndSortCandidates([
    candidate({ tmdbId: 3, originCountries: ["US"], voteAverage: 9 }),
    candidate({ tmdbId: 2, voteAverage: 8.5 }),
    candidate({ tmdbId: 4, originCountries: ["US"], voteAverage: 8 }),
    candidate({ tmdbId: 1, voteAverage: 9 })
  ], { summary: multiSummary, thresholds: multiThresholds });
  assert.deepEqual(selected.map((item) => [item.region, item.tmdbId]), [
    ["kr", 1], ["kr", 2], ["western", 3], ["western", 4]
  ]);
});
