import assert from "node:assert/strict";
import test from "node:test";
import { filterByTaiwanSubscription, taiwanSubscriptionProviders } from "../availability.js";

test("只讀取臺灣訂閱制供應商並去重", () => {
  assert.deepEqual(taiwanSubscriptionProviders({ results: { TW: {
    flatrate: [{ provider_name: "Netflix" }, { provider_name: "Netflix" }, { provider_name: "Disney Plus" }],
    rent: [{ provider_name: "Apple TV Store" }]
  } } }), ["Disney Plus", "Netflix"]);
  assert.deepEqual(taiwanSubscriptionProviders({ results: { TW: { rent: [{ provider_name: "Apple TV Store" }] } } }), []);
});

test("所有地區缺少臺灣訂閱制資料時排除", async () => {
  const calls = [];
  const result = await filterByTaiwanSubscription([
    { tmdbId: 1, region: "western", displayName: "保留" },
    { tmdbId: 2, region: "western", displayName: "排除" },
    { tmdbId: 3, region: "tw", displayName: "台劇" }
  ], { getWatchProviders: async (id) => {
    calls.push(id);
    return id !== 2 ? { results: { TW: { flatrate: [{ provider_name: "Netflix" }] } } } : { results: {} };
  } });
  assert.deepEqual(calls, [1, 2, 3]);
  assert.deepEqual(result.selections.map((item) => item.tmdbId), [1, 3]);
  assert.deepEqual(result.selections[0].taiwanSubscriptionProviders, ["Netflix"]);
  assert.deepEqual(result.excluded.map((item) => item.tmdbId), [2]);
});

test("臺灣串流查詢失敗會往外拋出，不會誤判為沒有上架", async () => {
  await assert.rejects(filterByTaiwanSubscription([{ tmdbId: 1, region: "western" }], {
    getWatchProviders: async () => { throw new Error("TMDb 暫時失敗"); }
  }), /TMDb 暫時失敗/);
});
