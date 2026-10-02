import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { enrichWithCN, searchBangumi } from "../.cursor/skills/find-anime/lib/bangumi.js";
import { getSeasonAnime } from "../.cursor/skills/find-anime/lib/tenrai.js";
import { JsonJournal } from "../../packages/core/json-journal.js";

test("中文名成功快取跨實例重用，過期重查且不保存失敗結果", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "anime-cache-"));
  try {
    const file = path.join(dir, "anime-cache.json"); let requests = 0;
    const anime = [{ title: "Anime", title_japanese: "日文", score: 8.2 }];
    const search = async () => { requests++; return [{ name: "日文", name_cn: "动画" }]; };
    const first = await enrichWithCN(anime, null, { cache: new JsonJournal(file), search, now: () => 1000, wait: async () => {} });
    const second = await enrichWithCN(anime, null, { cache: new JsonJournal(file), search, now: () => 2000, wait: async () => { throw Error("快取不等待"); } });
    assert.deepEqual(second, first); assert.equal(requests, 1); assert.equal(first[0].title_cn, "動畫");
    await enrichWithCN(anime, null, { cache: new JsonJournal(file), search, now: () => 31 * 86400000, wait: async () => {} }); assert.equal(requests, 2);
    const missing = [{ title: "missing" }];
    for (let i = 0; i < 2; i++) await enrichWithCN(missing, null, { cache: new JsonJournal(file), search: async () => { requests++; throw Error("timeout"); }, wait: async () => {} });
    assert.equal(requests, 4); assert.equal(new JsonJournal(file).data.missing, undefined);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test("動畫與中文名稱來源設定逾時，Tenrai 失敗重試次數有上限", async () => {
  let attempts = 0;
  await assert.rejects(() => getSeasonAnime(2025, "spring", { get: async (_url, options) => { assert.equal(options.timeout, 15000); attempts++; throw Error("timeout"); }, wait: async () => {} }), /timeout/);
  assert.equal(attempts, 3);
  const names = await searchBangumi("name", { get: async (_url, options) => { assert.equal(options.timeout, 15000); return { data: { list: [] } }; } });
  assert.deepEqual(names, []);

});
