import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { GameCoverCache, GameCoverService } from "../src/game-cover-cache.js";
import { loadLibrary } from "../src/library.js";
import { LARGE_GAME_COUNT, createLargeGamesFixture, steamCoverUrl } from "../test-support/large-games-fixture.js";

test("千筆隔離 fixture 可載入，首批封面可跨快取實例命中而不重新請求", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "catchlist-large-games-"));
  try {
    const fixture = createLargeGamesFixture(path.join(directory, "data"));
    const library = loadLibrary(fixture.dataDir, "games");
    assert.equal(library.entries.length, LARGE_GAME_COUNT);
    assert.deepEqual(library.entries[0].tags, ["策略", "千筆驗收"]);
    assert.deepEqual(library.entries[1].tags, ["策略", "自動續載"]);

    const firstBatch = library.entries.slice(0, 50).map(({ appid }) => appid);
    const cachePath = path.join(directory, "user-data", "steam-cover-cache.json");
    let firstCalls = 0;
    const first = new GameCoverService({
      cache: new GameCoverCache(cachePath),
      resolveCover: async (appid) => { firstCalls += 1; return steamCoverUrl(appid); },
    });
    const resolved = await first.resolve(firstBatch);
    assert.equal(firstCalls, 50);
    assert.deepEqual(Object.keys(resolved), firstBatch);

    let secondCalls = 0;
    const second = new GameCoverService({
      cache: new GameCoverCache(cachePath),
      resolveCover: async () => { secondCalls += 1; return null; },
    });
    assert.deepEqual(await second.resolve(firstBatch), resolved);
    assert.equal(secondCalls, 0);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
