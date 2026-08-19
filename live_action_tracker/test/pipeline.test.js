import assert from "node:assert/strict";
import test from "node:test";
import { buildRegionalSelections } from "../pipeline.js";

test("固定資料端到端產生入選、IMDb 佐證、名稱與 TMDb 連結", async () => {
  const base = { originalName: "Original", voteAverage: 8, voteCount: 100, genreIds: [18], type: "Scripted", episodeCount: 10, adult: false, originCountries: ["KR"], translations: [], externalIds: { imdbId: "tt1", wikidataId: "Q1" } };
  const result = await buildRegionalSelections([{ ...base, tmdbId: 1 }, { ...base, tmdbId: 1, voteCount: 1 }, { ...base, tmdbId: 2, originalName: "同名" }], {
    imdbIndex: new Map([["tt1", { score: 8.1, votes: 500 }]]),
    wikidataResolver: async (id) => id === "Q1" ? "維基名" : null,
    scoring: {
      summary: { regions: { kr: { regionalMean: 7, votePercentiles: { p50: 10, p75: 50 } } } },
      thresholds: { regions: { kr: { minimumVotes: 10, minimumWeightedScore: 7.5 } } }
    }
  });
  assert.equal(result.selections.length, 2);
  assert.equal(result.selections[0].displayName, "維基名");
  assert.equal(result.selections[0].imdb.status, "consistent");
  assert.match(result.selections[0].tmdbUrl, /\/tv\/1$/);
  assert.equal(result.regions.kr.length, 2);
});

test("端到端輸出依五區固定順序分組，不形成跨區總榜", async () => {
  const base = { originalName: "Show", voteAverage: 8, voteCount: 100, genreIds: [18], type: "Scripted", episodeCount: 10, adult: false, translations: [], externalIds: {} };
  const result = await buildRegionalSelections([
    { ...base, tmdbId: 2, originCountries: ["US"], voteAverage: 9 },
    { ...base, tmdbId: 1, originCountries: ["KR"], voteAverage: 8 }
  ], { scoring: {
    summary: { regions: {
      kr: { regionalMean: 7, votePercentiles: { p50: 10, p75: 50 } },
      western: { regionalMean: 6, votePercentiles: { p50: 10, p75: 50 } }
    } },
    thresholds: { regions: {
      kr: { minimumVotes: 1, minimumWeightedScore: 7 },
      western: { minimumVotes: 1, minimumWeightedScore: 7 }
    } }
  } });
  assert.deepEqual(result.selections.map((item) => item.region), ["kr", "western"]);
});
