import fs from "node:fs";
import { Readable } from "node:stream";
import readline from "node:readline";
import zlib from "node:zlib";

function asTargetSet(targetIds) {
  return targetIds instanceof Set ? targetIds : new Set(targetIds ?? []);
}

function parsePositiveNumber(value, field, id) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`IMDb ${field} 格式錯誤：${id}`);
  }
  return number;
}

/** 串流解析 IMDb title.ratings.tsv（輸入可為純文字或解壓後的 Readable）。 */
export async function parseImdbRatingsTsv(input, { targetIds = [] } = {}) {
  const targets = asTargetSet(targetIds);
  const ratings = new Map();
  const duplicates = [];
  const invalidRows = [];
  let rowCount = 0;
  let headerSeen = false;

  const readable = typeof input === "string" || input instanceof URL
    ? fs.createReadStream(input)
    : input;
  const rl = readline.createInterface({ input: readable, crlfDelay: Infinity });
  for await (const line of rl) {
    if (!headerSeen) {
      const header = line.split("\t");
      if (header.length !== 3 || header.join("\t") !== "tconst\taverageRating\tnumVotes") {
        throw new Error("IMDb ratings TSV 標題格式錯誤。");
      }
      headerSeen = true;
      continue;
    }
    if (!line.trim()) continue;
    rowCount += 1;
    const fields = line.split("\t");
    if (fields.length !== 3 || !/^tt\d+$/.test(fields[0])) {
      invalidRows.push({ line: rowCount + 1, reason: "欄位或 ID 格式錯誤" });
      continue;
    }
    const [imdbId, averageRating, numVotes] = fields;
    if (!targets.has(imdbId)) continue;
    try {
      const rating = {
        imdbId,
        score: parsePositiveNumber(averageRating, "averageRating", imdbId),
        votes: parsePositiveNumber(numVotes, "numVotes", imdbId)
      };
      if (ratings.has(imdbId)) duplicates.push(imdbId);
      ratings.set(imdbId, rating);
    } catch {
      invalidRows.push({ line: rowCount + 1, reason: "評分或票數格式錯誤", imdbId });
    }
  }
  if (!headerSeen) throw new Error("IMDb ratings TSV 缺少標題列。");
  return { ratings, stats: { rowCount, matchedCount: ratings.size, duplicates, invalidRows } };
}

export async function parseImdbRatingsGzip(input, options = {}) {
  const source = typeof input === "string" || input instanceof URL
    ? fs.createReadStream(input)
    : input;
  return parseImdbRatingsTsv(source.pipe(zlib.createGunzip()), options);
}

export async function buildImdbRatingIndex({ input, compressed = true, targetIds = [] }) {
  if (!input) throw new TypeError("建立 IMDb 索引需要輸入串流。");
  return compressed
    ? parseImdbRatingsGzip(input, { targetIds })
    : parseImdbRatingsTsv(input, { targetIds });
}

export function streamFromText(text) {
  return Readable.from([text]);
}
