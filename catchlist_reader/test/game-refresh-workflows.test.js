import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import electronPath from "electron";

test("單款更新正式橋接與 Chromium 桌面、窄視窗、讀取、成功、失敗及重啟保存", { timeout: 65000 }, async () => {
  const result = await new Promise((resolve, reject) => {
    const child = spawn(electronPath, [fileURLToPath(new URL("../test-support/game-refresh-workflows.cjs", import.meta.url))], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let stdout = ""; let stderr = "";
    child.stdout.on("data", chunk => stdout += chunk); child.stderr.on("data", chunk => stderr += chunk);
    child.on("error", reject); child.on("exit", code => code ? reject(new Error(stderr)) : resolve(JSON.parse(stdout.trim().split(/\r?\n/).at(-1))));
  });
  assert.equal(result.success, true); assert.equal(result.persistence, true); assert.equal(result.reportUnchanged, true);
});
