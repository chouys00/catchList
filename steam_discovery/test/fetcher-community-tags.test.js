import assert from "node:assert/strict";
import test from "node:test";

import axios from "axios";

import { fetchCommunityTags } from "../fetcher.js";

async function withBlockedAxios(run) {
  const originalGet = axios.get;
  let calls = 0;
  axios.get = async () => {
    calls += 1;
    const error = new Error("測試禁止真實 HTTP");
    error.response = { status: 400 };
    throw error;
  };

  try {
    return await run(() => calls);
  } finally {
    axios.get = originalGet;
  }
}

test("fetchCommunityTags 以注入 requester 傳送繁中 Steam 頁面參數並解析標籤", async () => {
  await withBlockedAxios(async (axiosCalls) => {
    let received = null;
    const requester = async (...args) => {
      received = args;
      return {
        data: '<a class="app_tag"> 烹飪 </a><a class="app_tag">策略</a><a class="app_tag">烹飪</a>',
      };
    };

    const tags = await fetchCommunityTags("3205380", {
      requester,
      logger: { error: () => {} },
    });

    assert.deepEqual(tags, ["烹飪", "策略"]);
    assert.equal(axiosCalls(), 0);
    assert.equal(received[0], "https://store.steampowered.com/app/3205380");
    assert.deepEqual(received[1].params, { cc: "tw", l: "tchinese" });
    assert.equal(received[1].timeout, 15000);
    assert.deepEqual(received[2], { label: "community tags 3205380" });
  });
});

test("fetchCommunityTags 的注入 requester 失敗時回傳 null", async () => {
  await withBlockedAxios(async (axiosCalls) => {
    let requesterCalls = 0;
    const result = await fetchCommunityTags("3205380", {
      requester: async () => {
        requesterCalls += 1;
        throw new Error("request failed");
      },
      logger: { error: () => {} },
    });

    assert.equal(result, null);
    assert.equal(requesterCalls, 1);
    assert.equal(axiosCalls(), 0);
  });
});
