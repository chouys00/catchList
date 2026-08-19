import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { readTmdbTokenFromEnvFile, resolveTmdbToken } from "../env.js";

function withTempDirectory(run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "catchlist-env-"));
  try {
    return run(directory);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test("本機 .env 只讀取 TMDB_API_TOKEN，並接受成對引號", () => withTempDirectory((directory) => {
  const envFile = path.join(directory, ".env");
  fs.writeFileSync(envFile, "UNRELATED=value\nTMDB_API_TOKEN=\"fixture-token\"\n", "utf8");
  assert.equal(readTmdbTokenFromEnvFile(envFile), "fixture-token");
}));

test("環境變數優先於 .env，注入測試環境不會讀取本機檔案", () => withTempDirectory((directory) => {
  const envFile = path.join(directory, ".env");
  fs.writeFileSync(envFile, "TMDB_API_TOKEN=file-token\n", "utf8");
  assert.equal(resolveTmdbToken({ TMDB_API_TOKEN: "environment-token" }, { envFile }), "environment-token");
  assert.equal(resolveTmdbToken({}, { envFile }), null);
  assert.equal(resolveTmdbToken({}, { envFile, allowEnvFile: true }), "file-token");
}));

test(".env 重複或不是一般檔案時明確失敗", () => withTempDirectory((directory) => {
  const envFile = path.join(directory, ".env");
  fs.writeFileSync(envFile, "TMDB_API_TOKEN=first\nTMDB_API_TOKEN=second\n", "utf8");
  assert.throws(() => readTmdbTokenFromEnvFile(envFile), /不可重複/);
  assert.throws(() => readTmdbTokenFromEnvFile(directory), /一般檔案/);
}));
