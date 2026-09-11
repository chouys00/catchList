import assert from "node:assert/strict";
import test from "node:test";

import { normalizeTaxonomy, selectFirstRound, selectFirstRoundAll, selectSecondRound } from "../initialization-selection.js";

function row(overrides = {}) {
  return {
    AppID: "42", "Release date": "2020-06-15", Positive: "850", Negative: "150",
    Genres: "Indie", Categories: "Single-player", Tags: "Puzzle", Price: "0", ...overrides
  };
}

test("第一輪使用未四捨五入的 85% 與大於 500 則門檻", () => {
  assert.equal(selectFirstRound(row({ Positive: "426", Negative: "75", AppID: "1" })).status, "candidate");
  assert.deepEqual(selectFirstRound(row({ Positive: "425", Negative: "75", AppID: "2" })).reasons, ["review_count_at_threshold_discarded"]);
  assert.equal(selectFirstRound(row({ Positive: "426", Negative: "75", AppID: "3" })).status, "candidate");
  assert.equal(selectFirstRound(row({ Positive: "840", Negative: "160", AppID: "4" })).status, "excluded");
});

test("固定資料集的英文月份發行日可納入指定範圍", () => {
  const result = selectFirstRound(row({ "Release date": "Aug 1, 2023", AppID: "90" }), { from: "2023-08", through: "2023-08" });
  assert.equal(result.releaseMonth, "2023-08");
  assert.equal(result.releaseDate, "2023-08-01");
  assert.equal(result.status, "candidate");
});

test("0/0 與接近門檻資料直接捨棄，異常資料維持待確認", () => {
  const zero = selectFirstRound(row({ Positive: "0", Negative: "0" }));
  assert.equal(zero.status, "excluded");
  assert.deepEqual(zero.reasons, ["zero_total_reviews_discarded"]);
  assert.deepEqual(selectFirstRound(row({ Positive: "not-a-number" })).reasons, ["invalid_review_counts"]);
  assert.deepEqual(selectFirstRound(row({ Positive: "845", Negative: "155" })).reasons, ["positive_pct_near_threshold_discarded"]);
});

test("正規化文字、ID 與多重第一輪排除原因", () => {
  assert.deepEqual(normalizeTaxonomy("['MOBA', 'PvP']"), [{ id: null, name: "moba" }, { id: null, name: "pvp" }]);
  const result = selectFirstRound(row({
    Tags: [{ id: 1718, description: "多人連線戰術競技" }, { id: 1753, description: "MMORPG" }],
    Genres: ["Utilities"], Categories: [{ id: 20, description: "大型多人線上" }]
  }));
  assert.equal(result.status, "excluded");
  assert.deepEqual(result.reasons, [
    "massively_multiplayer:categories:20", "mmorpg:tags:1753", "moba:tags:1718", "software:genres:utilities"
  ]);
});

test("price = 0 不會單獨視為免費遊玩", () => {
  assert.equal(selectFirstRound(row({ Price: "0" })).status, "candidate");
  assert.deepEqual(selectFirstRound(row({ Genres: "Free to Play" })).reasons, ["free_to_play:genres:free to play"]);
});

test("摘要依 AppID 與原因穩定排序，且每筆都有最終狀態", () => {
  const first = selectFirstRoundAll([row({ AppID: "20" }), row({ AppID: "3", Positive: "0", Negative: "0" }), row({ AppID: "10", Tags: "PvP" })]);
  const second = selectFirstRoundAll([row({ AppID: "10", Tags: "PvP" }), row({ AppID: "20" }), row({ AppID: "3", Positive: "0", Negative: "0" })]);
  assert.deepEqual(first, second);
  assert.deepEqual(first.summary, { total: 3, candidates: 1, excluded: 2, missing: 0 });
});

test("完整頁面未出現排除訊號時通過，不完整頁面直接排除", () => {
  const candidate = selectFirstRound(row());
  const complete = {
    pageState: "complete", retry: false, isFree: false, hasInAppPurchases: false,
    hasMMO: false, vrMode: "none", isEarlyAccess: false, communityTags: ["Puzzle"]
  };
  assert.equal(selectSecondRound(candidate, complete).status, "passed");
  assert.deepEqual(selectSecondRound(candidate, { pageState: "incomplete_200", retry: false, reasons: ["incomplete_200"] }), {
    status: "excluded", reasons: ["store_page_unavailable:incomplete_200"]
  });
});
