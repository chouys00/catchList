import assert from "node:assert/strict";
import { Readable } from "node:stream";
import test from "node:test";
import zlib from "node:zlib";
import { buildImdbRatingIndex, streamFromText } from "../sources/imdb.js";

const header = "tconst\taverageRating\tnumVotes\n";

test("IMDb ratings 只索引目標 ID，並記錄重複 ID", async () => {
  const input = streamFromText(`${header}tt1\t8.1\t200\ntt2\t7.0\t5\ntt1\t8.2\t300\n`);
  const result = await buildImdbRatingIndex({ input, compressed: false, targetIds: ["tt1"] });
  assert.equal(result.ratings.get("tt1").score, 8.2);
  assert.deepEqual(result.stats.duplicates, ["tt1"]);
  assert.equal(result.ratings.has("tt2"), false);
});

test("IMDb 缺 ID、格式錯誤與缺資料不會讓 TMDb 索引失敗", async () => {
  const input = streamFromText(`${header}tt1\t\\N\t20\ntt2\t7.5\tbad\nnot-an-id\t8\t2\n`);
  const result = await buildImdbRatingIndex({ input, compressed: false, targetIds: ["tt1", "tt2", "tt3"] });
  assert.equal(result.ratings.size, 0);
  assert.equal(result.stats.invalidRows.length, 3);
  assert.equal(result.stats.matchedCount, 0);
});

test("IMDb TSV 標題錯誤會明確失敗", async () => {
  await assert.rejects(
    buildImdbRatingIndex({ input: streamFromText("bad\n"), compressed: false }),
    /標題格式錯誤/
  );
});

test("IMDb gzip TSV 以串流解壓並只保留目標 ID", async () => {
  const compressed = zlib.gzipSync(`${header}tt1\t8.4\t900\ntt2\t6.1\t10\n`);
  const result = await buildImdbRatingIndex({
    input: Readable.from([compressed]),
    targetIds: ["tt1"]
  });
  assert.deepEqual(result.ratings.get("tt1"), { imdbId: "tt1", score: 8.4, votes: 900 });
  assert.equal(result.ratings.has("tt2"), false);
});
