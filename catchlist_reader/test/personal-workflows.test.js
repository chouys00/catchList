import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import electronPath from "electron";

test("正式橋接與隔離資料完成四類收藏、隱藏恢復、重新載入及桌面窄螢幕互動", { timeout: 60000 }, async () => {
  const result = await new Promise((resolve, reject) => {
    const child = spawn(electronPath, [fileURLToPath(new URL("../test-support/personal-workflows.cjs", import.meta.url))], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code !== 0) return reject(new Error(`個人清單互動測試失敗：${code}\n${stderr}`));
      try { resolve(JSON.parse(stdout.trim().split(/\r?\n/).at(-1))); } catch (error) { reject(error); }
    });
  });
  assert.deepEqual(result.flows, ["games", "anime", "movies", "liveAction"]);
  assert.equal(result.restoredAfterReload, true);
  assert.equal(result.reportBytesUnchanged, true);
  assert.equal(result.cancelFavorite, true);
  assert.deepEqual(result.responsiveWidths, [1440, 1000, 390]);
});
