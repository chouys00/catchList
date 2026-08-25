import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { GameCoverCache, GameCoverService } from "../src/game-cover-cache.js";

const coverUrl = "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/123/hash/header_tchinese.jpg";

test("封面快取可跨新實例讀取，命中時不重新請求 Steam", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "catchlist-cover-cache-"));
  try {
    const filePath = path.join(directory, "steam-cover-cache.json");
    let calls = 0;
    const first = new GameCoverService({
      cache: new GameCoverCache(filePath),
      resolveCover: async () => { calls += 1; return coverUrl; },
    });
    assert.deepEqual(await first.resolve(["123"]), { 123: coverUrl });
    assert.equal(calls, 1);

    const second = new GameCoverService({
      cache: new GameCoverCache(filePath),
      resolveCover: async () => { calls += 1; return coverUrl; },
    });
    assert.deepEqual(await second.resolve(["123"]), { 123: coverUrl });
    assert.equal(calls, 1);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("損壞快取與失敗封面不阻斷，下一次成功結果會重建快取", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "catchlist-cover-cache-"));
  try {
    const filePath = path.join(directory, "steam-cover-cache.json");
    fs.writeFileSync(filePath, "{broken", "utf8");
    const cache = new GameCoverCache(filePath);
    const service = new GameCoverService({ cache, resolveCover: async () => null });
    assert.deepEqual(await service.resolve(["123"]), { 123: null });
    assert.equal(cache.get("123"), null);

    const rebuilt = new GameCoverService({ cache: new GameCoverCache(filePath), resolveCover: async () => coverUrl });
    assert.deepEqual(await rebuilt.resolve(["123"]), { 123: coverUrl });
    assert.equal(new GameCoverCache(filePath).get("123"), coverUrl);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
