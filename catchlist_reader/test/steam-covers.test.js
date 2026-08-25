import assert from "node:assert/strict";
import test from "node:test";

import { resolveSteamCover } from "../src/steam-covers.js";

test("Steam 封面解析使用 AppDetails 回傳的實際語系圖片網址", async () => {
  let requestedUrl = null;
  const coverUrl = await resolveSteamCover("4225940", async (url) => {
    requestedUrl = url;
    return {
      ok: true,
      json: async () => ({
        4225940: {
          success: true,
          data: {
            header_image: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/4225940/hash/header_tchinese.jpg?t=1"
          }
        }
      })
    };
  });

  assert.match(requestedUrl, /appids=4225940/);
  assert.equal(coverUrl, "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/4225940/hash/header_tchinese.jpg?t=1");
});

test("Steam 封面解析拒絕非 Steam 的圖片網址", async () => {
  const coverUrl = await resolveSteamCover("123", async () => ({
    ok: true,
    json: async () => ({ 123: { success: true, data: { header_image: "https://example.com/cover.jpg" } } })
  }));

  assert.equal(coverUrl, null);
});

test("Steam 封面請求逾時時回傳空結果", async () => {
  const coverUrl = await resolveSteamCover("123", async (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
  }), { timeoutMs: 5 });

  assert.equal(coverUrl, null);
});
