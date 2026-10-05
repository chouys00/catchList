import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import electronPath from "electron";

test("各媒體捲動位置、分批載入、短頁面及非同步切換維持正常互動", { timeout: 60_000 }, async () => {
  const result = await new Promise((resolve, reject) => {
    const child = spawn(electronPath, [fileURLToPath(new URL("../test-support/media-scroll-workflows.cjs", import.meta.url))], {
      windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "", stderr = "";
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.on("error", reject);
    child.on("exit", code => {
      if (code !== 0) return reject(Error(`Electron 捲動互動測試失敗（exit ${code}）\n${stderr}`));
      try { resolve(JSON.parse(stdout.trim().split(/\r?\n/).at(-1))); }
      catch (error) { reject(Error(`${error.message}\n${stdout}\n${stderr}`)); }
    });
  });
  assert.deepEqual(result, { independentMedia: true, gameBatches: true, filters: true, shorterPage: true, pendingScroll: true, staleLoads: true, resizedBatches: true });
});
