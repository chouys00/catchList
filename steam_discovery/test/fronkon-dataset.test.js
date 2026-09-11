import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import test from "node:test";

import { FRONKON_HEADERS, downloadFronkonDataset, loadFronkonDataset, verifyFronkonFile } from "../fronkon-dataset.js";
import { selectFirstRoundAll } from "../initialization-selection.js";

function fixture(rows) {
  return `${FRONKON_HEADERS.join(",")}\n${rows.join("\n")}\n`;
}

function expectedFor(text) {
  return { bytes: Buffer.byteLength(text), sha256: crypto.createHash("sha256").update(text).digest("hex") };
}

function csvRow({ appid, name, releaseDate, about = "", positive, negative }) {
  const values = Array(FRONKON_HEADERS.length).fill("");
  values[0] = appid;
  values[1] = name;
  values[2] = releaseDate;
  values[8] = about;
  values[22] = positive;
  values[23] = negative;
  return values.join(",");
}

test("串流載入器可解析含逗號與換行的 RFC 4180 資料列", async () => {
  const content = fixture([
    csvRow({ appid: "1", name: "Game", releaseDate: "2020-01-01", about: '"line one\nline two, still one field"', positive: "10", negative: "2" }),
    csvRow({ appid: "2", name: "Second", releaseDate: "2020-02-01", positive: "20", negative: "3" })
  ]);
  const filepath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "fronkon-dataset-")), "games.csv");
  fs.writeFileSync(filepath, content);
  const rows = [];
  for await (const row of loadFronkonDataset({ filepath, expected: expectedFor(content) })) rows.push(row);
  assert.equal(rows.length, 2);
  assert.equal(rows[0]["About the game"], "line one\nline two, still one field");
  assert.equal(rows[1].Positive, "20");
});

test("固定來源多出的空白尾欄不會改變資料契約欄位", async () => {
  const content = fixture([`${csvRow({ appid: "9", name: "Trailing column", releaseDate: "2020-01-01", positive: "10", negative: "2" })},`]);
  const filepath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "fronkon-trailing-column-")), "games.csv");
  fs.writeFileSync(filepath, content);
  const rows = [];
  for await (const row of loadFronkonDataset({ filepath, expected: expectedFor(content) })) rows.push(row);
  assert.equal(rows[0].AppID, "9");
  assert.equal(rows[0].Movies, "");
});

test("固定來源未宣告的 DLC count 欄不會讓評論欄位右移", async () => {
  const values = Array(FRONKON_HEADERS.length).fill("");
  values[0] = "275850";
  values[1] = "No Man's Sky";
  values[2] = '"Aug 1, 2023"';
  values[22] = "293332";
  values[23] = "59526";
  values[38] = "movie";
  values.splice(8, 0, "1");
  const content = fixture([values.join(",")]);
  const filepath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "fronkon-dlc-count-")), "games.csv");
  fs.writeFileSync(filepath, content);
  const rows = [];
  for await (const row of loadFronkonDataset({ filepath, expected: expectedFor(content) })) rows.push(row);
  assert.equal(rows[0].Positive, "293332");
  assert.equal(rows[0].Negative, "59526");
});

test("載入前會拒絕錯誤雜湊與欄位契約", async () => {
  const filepath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "fronkon-invalid-")), "games.csv");
  fs.writeFileSync(filepath, "wrong,header\n");
  await assert.rejects(verifyFronkonFile(filepath, { bytes: 1, sha256: "bad" }), /位元組數不符/);
  await assert.rejects(async () => { for await (const _row of loadFronkonDataset({ filepath, verify: false })) { void _row; } }, /欄位與固定資料契約不符/);
});

test("下載器串流寫入並驗證固定輸入", async () => {
  const content = fixture([csvRow({ appid: "1", name: "Game", releaseDate: "2020-01-01", positive: "10", negative: "2" })]);
  const filepath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "fronkon-download-")), "nested", "games.csv");
  const result = await downloadFronkonDataset(filepath, {
    expected: { ...expectedFor(content), url: "https://example.test/games.csv" },
    fetchFn: async () => new Response(content, { status: 200 })
  });
  assert.equal(result.bytes, Buffer.byteLength(content));
  assert.equal(fs.readFileSync(filepath, "utf8"), content);
});

test("下載器能讀取 Axios 形式的 Node 串流回應", async () => {
  const content = fixture([csvRow({ appid: "1", name: "Game", releaseDate: "2020-01-01", positive: "10", negative: "2" })]);
  const filepath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "fronkon-axios-stream-")), "games.csv");
  const result = await downloadFronkonDataset(filepath, {
    expected: { ...expectedFor(content), url: "https://example.test/games.csv" },
    fetchFn: async () => ({ ok: true, status: 200, body: Readable.from([Buffer.from(content)]) })
  });
  assert.equal(result.bytes, Buffer.byteLength(content));
});

test("固定輸入經串流載入後產生可重現的第一輪摘要", async () => {
  const content = fixture([
    csvRow({ appid: "20", name: "Candidate", releaseDate: "2020-01-01", positive: "426", negative: "75" }),
    csvRow({ appid: "3", name: "Missing", releaseDate: "2020-01-01", positive: "0", negative: "0" })
  ]);
  const filepath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "fronkon-integration-")), "games.csv");
  fs.writeFileSync(filepath, content);
  const rows = [];
  for await (const row of loadFronkonDataset({ filepath, expected: expectedFor(content) })) rows.push(row);
  assert.deepEqual(selectFirstRoundAll(rows).summary, { total: 2, candidates: 1, excluded: 1, missing: 0 });
});
