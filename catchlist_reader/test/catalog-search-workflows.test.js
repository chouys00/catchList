import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import electronPath from "electron";

test("跨分類搜尋、直接分類及桌面窄螢幕互動", { timeout: 120000 }, async () => {
  const result = await new Promise((resolve, reject) => {
    const child = spawn(electronPath, [fileURLToPath(new URL("../test-support/catalog-search-workflows.cjs", import.meta.url))], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
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
  assert.equal(result.catalogSearch, true);
  assert.equal(result.reportBytesUnchanged, true);
});
