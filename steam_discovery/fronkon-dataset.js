import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { finished } from "node:stream/promises";
import { StringDecoder } from "node:string_decoder";
import axios from "axios";

export const FRONKON_DATASET = Object.freeze({
  revision: "4a166081a2b458f8e874d08c1acea98df991c6d5",
  sha256: "1b48008b01a799d82385d6e66ba0cb65dd477b6aa4b6c2ec8c443025ab6880ad",
  bytes: 401140503,
  url: "https://huggingface.co/datasets/FronkonGames/steam-games-dataset/resolve/4a166081a2b458f8e874d08c1acea98df991c6d5/games.csv?download=true"
});

export const FRONKON_HEADERS = Object.freeze([
  "AppID", "Name", "Release date", "Estimated owners", "Peak CCU", "Required age", "Price", "DiscountDLC count", "About the game", "Supported languages", "Full audio languages", "Reviews", "Header image", "Website", "Support url", "Support email", "Windows", "Mac", "Linux", "Metacritic score", "Metacritic url", "User score", "Positive", "Negative", "Score rank", "Achievements", "Recommendations", "Notes", "Average playtime forever", "Average playtime two weeks", "Median playtime forever", "Median playtime two weeks", "Developers", "Publishers", "Categories", "Genres", "Tags", "Screenshots", "Movies"
]);

// 固定 revision 的資料列在標頭未宣告的位置插入了 DLC count；保留原始標頭契約，僅供列值對應使用。
const FRONKON_ROW_HEADERS_WITH_DLC_COUNT = Object.freeze([
  ...FRONKON_HEADERS.slice(0, 8), "DLC count", ...FRONKON_HEADERS.slice(8)
]);

function assertHeaders(headers) {
  if (headers.length !== FRONKON_HEADERS.length || headers.some((header, index) => header !== FRONKON_HEADERS[index])) {
    throw new Error("FronkonGames CSV 欄位與固定資料契約不符。");
  }
}

async function* csvRows(stream) {
  let field = "";
  let row = [];
  let quoted = false;
  let quotePending = false;
  const decoder = new StringDecoder("utf8");
  function* consume(text) {
    for (const char of text) {
      if (quotePending) {
        if (char === '"') { field += char; quotePending = false; continue; }
        quoted = false;
        quotePending = false;
      }
      if (quoted) {
        if (char === '"') quotePending = true;
        else field += char;
        continue;
      }
      if (char === '"' && field === "") { quoted = true; continue; }
      if (char === ",") { row.push(field); field = ""; continue; }
      if (char === "\n") { row.push(field.replace(/\r$/, "")); yield row; row = []; field = ""; continue; }
      field += char;
    }
  }
  for await (const chunk of stream) {
    const text = Buffer.isBuffer(chunk) ? decoder.write(chunk) : String(chunk);
    yield* consume(text);
  }
  yield* consume(decoder.end());
  if (quotePending) { quoted = false; quotePending = false; }
  if (quoted) throw new Error("FronkonGames CSV 有未結束的引號欄位。");
  if (field || row.length) { row.push(field.replace(/\r$/, "")); yield row; }
}

export async function verifyFronkonFile(filepath, expected = FRONKON_DATASET) {
  const hash = crypto.createHash("sha256");
  let bytes = 0;
  for await (const chunk of fs.createReadStream(filepath)) { hash.update(chunk); bytes += chunk.length; }
  const actual = { bytes, sha256: hash.digest("hex") };
  if (expected.bytes != null && actual.bytes !== expected.bytes) throw new Error(`FronkonGames CSV 位元組數不符：${actual.bytes}`);
  if (expected.sha256 && actual.sha256 !== expected.sha256) throw new Error("FronkonGames CSV SHA-256 不符。");
  return actual;
}

async function defaultFetch(url) {
  if (typeof globalThis.fetch === "function") return globalThis.fetch(url);
  const response = await axios.get(url, { responseType: "stream", validateStatus: () => true });
  return { ok: response.status >= 200 && response.status < 300, status: response.status, body: response.data };
}

function readableBody(body) {
  return body && typeof body.getReader === "function" ? Readable.fromWeb(body) : body;
}

export async function downloadFronkonDataset(filepath, { fetchFn = defaultFetch, expected = FRONKON_DATASET } = {}) {
  const response = await fetchFn(expected.url);
  if (!response.ok || !response.body) throw new Error(`FronkonGames 下載失敗：HTTP ${response.status}`);
  await fs.promises.mkdir(path.dirname(filepath), { recursive: true });
  const output = fs.createWriteStream(filepath, { flags: "w" });
  const hash = crypto.createHash("sha256");
  let bytes = 0;
  try {
    for await (const chunk of readableBody(response.body)) { hash.update(chunk); bytes += chunk.length; if (!output.write(chunk)) await new Promise((resolve) => output.once("drain", resolve)); }
    output.end();
    await finished(output);
  } catch (error) { output.destroy(); throw error; }
  if (expected.bytes != null && bytes !== expected.bytes) throw new Error(`FronkonGames CSV 位元組數不符：${bytes}`);
  if (expected.sha256 && hash.digest("hex") !== expected.sha256) throw new Error("FronkonGames CSV SHA-256 不符。");
  return { filepath, bytes };
}

export async function* loadFronkonDataset({ filepath, expected = FRONKON_DATASET, verify = true } = {}) {
  if (!filepath) throw new Error("必須指定 FronkonGames CSV 本機檔案。" );
  if (verify) await verifyFronkonFile(filepath, expected);
  const rows = csvRows(fs.createReadStream(filepath));
  const header = await rows.next();
  if (header.done) throw new Error("FronkonGames CSV 是空檔案。");
  assertHeaders(header.value);
  let rowNumber = 1;
  for await (const values of rows) {
    rowNumber += 1;
    const hasUnlistedDlcCount = values.length === FRONKON_ROW_HEADERS_WITH_DLC_COUNT.length && /^\d+$/.test(values[8]);
    // 舊式資料列可能多出一個空白尾欄；它不對應任何契約欄位。
    if (!hasUnlistedDlcCount && values.length === FRONKON_HEADERS.length + 1 && values.at(-1) === "") values.pop();
    if (!hasUnlistedDlcCount && values.length !== FRONKON_HEADERS.length) throw new Error(`FronkonGames CSV 欄位數不符：第 ${rowNumber} 列 AppID ${values[0] ?? "未知"}，預期 ${FRONKON_HEADERS.length}，實際 ${values.length}`);
    yield Object.fromEntries((hasUnlistedDlcCount ? FRONKON_ROW_HEADERS_WITH_DLC_COUNT : FRONKON_HEADERS).map((name, index) => [name, values[index]]));
  }
}
