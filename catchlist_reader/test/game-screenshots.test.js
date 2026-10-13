import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { GameScreenshots } from "../src/game-screenshots.js";
import { remainingScreeningGames } from "../src/renderer/game-screening.js";

test("截圖請求合併、限制三張、拒絕非 Steam 圖片且可跨執行讀取快取", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "screening-"));
  try {
    let calls = 0;
    const urls = [1, 2, 3, 4].map(i => `https://shared.akamai.steamstatic.com/screenshot-${i}.jpg`);
    const service = new GameScreenshots(path.join(dir, "cache.json"), async () => {
      calls++;
      return { ok: true, json: async () => ({ 620: { success: true, data: { screenshots: [{ path_full: "https://example.com/unsafe.jpg" }, ...urls.map(path_full => ({ path_full }))] } } }) };
    });
    assert.deepEqual(await Promise.all([service.resolve(620), service.resolve(620)]), [urls.slice(0, 3), urls.slice(0, 3)]);
    assert.equal(calls, 1);
    const cached = new GameScreenshots(path.join(dir, "cache.json"), () => { throw new Error("不應請求"); });
    assert.deepEqual(await cached.resolve(620), urls.slice(0, 3));
    await assert.rejects(service.resolve("../../file"), /編號/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("截圖來源暫時失敗後仍可重試，不把失敗保存成永久缺圖", async () => {
  let calls = 0;
  const service = new GameScreenshots("", async () => {
    calls++;
    if (calls === 1) return { ok: false };
    return { ok: true, json: async () => ({ 620: { success: true, data: { screenshots: [] } } }) };
  });
  await assert.rejects(service.resolve(620), /重試/);
  assert.deepEqual(await service.resolve(620), []);
  assert.equal(calls, 2);
});

test("快篩以 Steam 編號保存已看進度，篩選或排序改變不會重複呈現", () => {
  const entries = [{ appid: 1 }, { appid: "2" }, { appid: "3" }];
  assert.deepEqual(remainingScreeningGames(entries, new Set(["1", "3"])), [{ appid: "2" }]);
});
