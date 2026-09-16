import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import electronPath from "electron";

test("手動遊戲正式橋接、桌面與窄螢幕新增、重複、收藏、隱藏、取消及其他頁隔離", { timeout: 65000 }, async () => {
  const result = await new Promise((resolve, reject) => {
    const child = spawn(electronPath, [fileURLToPath(new URL("../test-support/manual-game-workflows.cjs", import.meta.url))], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let stdout = ""; let stderr = "";
    child.stdout.on("data", (chunk) => stdout += chunk); child.stderr.on("data", (chunk) => stderr += chunk);
    child.on("error", reject); child.on("exit", (code) => code ? reject(new Error(stderr)) : resolve(JSON.parse(stdout.trim().split(/\r?\n/).at(-1))));
  });
  assert.equal(result.success, true); assert.equal(result.reportUnchanged, true); assert.deepEqual(result.widths, [1440, 1024, 390]);
});
