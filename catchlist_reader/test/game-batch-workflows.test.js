import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import electronPath from "electron";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
test("隔離 Electron 批次勾選、分類、備份刪除、鍵盤及窄版畫面", { timeout: 120000 }, async () => {
  const result = await new Promise((resolve, reject) => {
    const child = spawn(electronPath, [fileURLToPath(new URL("../test-support/game-batch-workflows.cjs", import.meta.url))], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let stdout = "", stderr = "";
    child.stdout.on("data", chunk => stdout += chunk); child.stderr.on("data", chunk => stderr += chunk);
    child.on("error", reject); child.on("exit", code => { if (code !== 0) return reject(Error(stderr)); try { resolve(JSON.parse(stdout.trim().split(/\r?\n/).at(-1))); } catch(error) { reject(error); } });
  });
  const temporary = path.resolve(result.temp);
  assert.equal(path.dirname(temporary), path.resolve(os.tmpdir()));
  assert.ok(path.basename(temporary).startsWith("catchlist-batch-ui-"));
  fs.rmSync(temporary, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  assert.equal(result.loadedSelection, true); assert.equal(result.classification, true); assert.equal(result.keyboard, true); assert.equal(result.backupVerified, true); assert.deepEqual(result.errors, []);
});
