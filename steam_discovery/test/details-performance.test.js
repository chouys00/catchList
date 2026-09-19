import test from "node:test";
import assert from "node:assert/strict";
import { fetchAppDetails } from "../fetcher.js";

test("快取命中不等待也不請求，未命中仍先等待 1.5 秒", async () => {
  const events = [];
  const options = { cache: { 1: { _cacheVersion: 2, chineseName: "快取" } }, wait: async ms => events.push(ms), requester: async () => { events.push("network"); return { data: {} }; }, saveCache: () => {} };
  assert.deepEqual(await fetchAppDetails("1", options), { chineseName: "快取" });
  assert.deepEqual(events, []);
  assert.equal(await fetchAppDetails("2", options), null);
  assert.deepEqual(events, [1500, "network"]);
});
