import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import electronPath from "electron";

test("Steam 確認使用正式主程序與橋接：桌面、窄視窗、兩入口、取消、跨程序保存及隔離清除", { timeout: 120000 }, async t => {
  const script = fileURLToPath(new URL("../test-support/steam-confirmation-workflows.cjs", import.meta.url));
  const run = args => new Promise((resolve, reject) => {
    const child = spawn(electronPath, [script, ...args], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    const deadline = setTimeout(() => { child.kill(); reject(new Error("Steam 確認測試子程序逾時")); }, 100000);
    let stdout = ""; let stderr = "";
    child.stdout.on("data", chunk => stdout += chunk); child.stderr.on("data", chunk => stderr += chunk);
    child.on("error", error => { clearTimeout(deadline); reject(error); });
    child.on("exit", code => { clearTimeout(deadline); code ? reject(new Error(stderr + stdout)) : resolve(JSON.parse(stdout.trim().split(/\r?\n/).at(-1))); });
  });
  const result = await run([]);
  t.after(() => fs.rmSync(result.temp, { recursive: true, force: true }));
  assert.equal(result.success, true); assert.equal(result.realMain, true); assert.equal(result.remoteIsolated, true);
  const probe = await run([`--probe-root=${result.temp}`]);
  assert.equal(probe.persisted, true); assert.equal(probe.isolatedClear, true);
});
