import assert from "node:assert/strict";
import test from "node:test";
import { classifyRegion, evaluateLiveAction } from "../classifier.js";

const regionCases = [
  [["KR"], "kr"], [["JP"], "jp"], [["TW"], "tw"], [["CN"], "cn"],
  [["US"], "western"], [["AU"], "western"], [["FR"], "western"],
  [["US", "CN", "KR"], "kr"], [["US", "CN", "JP"], "jp"],
  [["US", "TW", "CN"], "tw"], [["US", "CN"], "cn"], [["IN"], null], [[], null]
];

for (const [countries, expected] of regionCases) {
  test(`地區分類 ${countries.join("+") || "空值"} -> ${expected}`, () => {
    assert.equal(classifyRegion(countries), expected);
  });
}

function candidate(overrides = {}) {
  return {
    adult: false, genreIds: [18], type: "Scripted", episodeCount: 12,
    originCountries: ["KR"], ...overrides
  };
}

const exclusionCases = [
  [{ adult: true }, "adult"], [{ genreIds: [16, 18] }, "animation"],
  [{ genreIds: [99] }, "documentary"], [{ genreIds: [10764] }, "reality"],
  [{ genreIds: [10763] }, "news"], [{ genreIds: [10767] }, "talk"],
  [{ episodeCount: 1 }, "single_episode"], [{ genreIds: [] }, "missing_genres"],
  [{ originCountries: [] }, "missing_origin_country"], [{ originCountries: ["IN"] }, "unsupported_region"],
  [{ type: "Reality" }, "unscripted_type"], [{ type: null }, "missing_type"]
];

for (const [overrides, reason] of exclusionCases) {
  test(`排除原因 ${reason}`, () => {
    const result = evaluateLiveAction(candidate(overrides));
    assert.equal(result.accepted, false);
    assert.ok(result.reasons.includes(reason));
  });
}

test("合格劇情節目保留完整國家資料並正確分類", () => {
  const show = candidate({ originCountries: ["US", "TW", "CN"] });
  const result = evaluateLiveAction(show);
  assert.deepEqual(show.originCountries, ["US", "TW", "CN"]);
  assert.deepEqual(result, { accepted: true, region: "tw", reasons: [] });
});
