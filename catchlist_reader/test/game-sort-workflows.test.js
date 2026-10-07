import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import electronPath from "electron";

test("遊戲範圍輸入、雙向排序、五萬筆續載、封面快取與窄視窗", { timeout: 120000 }, async () => {
  const result = await new Promise((resolve, reject) => {
    const child = spawn(electronPath, [fileURLToPath(new URL("../test-support/game-sort-workflows.cjs", import.meta.url))], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let stdout = "", stderr = "";
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.on("error", reject);
    child.on("exit", code => {
      if (code !== 0) return reject(new Error(`遊戲排序互動測試失敗：${code}\n${stderr}`));
      try { resolve(JSON.parse(stdout.trim().split(/\r?\n/).at(-1))); } catch (error) { reject(error); }
    });
  });
  assert.equal(result.count, 50000);
  assert.equal(result.coversReused, true);
  assert.equal(result.catalogDirection, true);
  assert.deepEqual(result.errors, []);
});
