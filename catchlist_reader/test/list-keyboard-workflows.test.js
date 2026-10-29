import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import electronPath from "electron";

test("四種列表鍵盤捲動、千筆 End、取消與輸入元件相容", { timeout: 120000 }, async () => {
  const result = await new Promise((resolve, reject) => {
    const child = spawn(electronPath, [fileURLToPath(new URL("../test-support/list-keyboard-workflows.cjs", import.meta.url))], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let stdout = "", stderr = "";
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.on("error", reject);
    child.on("exit", code => {
      if (code !== 0) return reject(new Error(`列表鍵盤驗收失敗：${code}\n${stderr}`));
      try { resolve(JSON.parse(stdout.trim().split(/\r?\n/).at(-1))); } catch (error) { reject(error); }
    });
  });
  assert.equal(result.count, 1000);
  assert.deepEqual(result.flows, ["games", "anime", "movies", "liveAction"]);
  assert.equal(result.cancellation, true);
  assert.equal(result.controlsProtected, true);
  assert.deepEqual(result.errors, []);
});
