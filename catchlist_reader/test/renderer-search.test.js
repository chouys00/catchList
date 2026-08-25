import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

import electronPath from "electron";

const harnessPath = fileURLToPath(new URL("../test-support/renderer-search-harness.cjs", import.meta.url));

function runHarness() {
  return new Promise((resolve, reject) => {
    const child = spawn(electronPath, [harnessPath], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error(`Electron 搜尋互動測試失敗（exit ${code}）\n${stderr}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout.trim().split(/\r?\n/).at(-1)));
      } catch (error) {
        reject(new Error(`無法解析 Electron 搜尋互動結果：${error.message}\nstdout: ${stdout}\nstderr: ${stderr}`));
      }
    });
  });
}

test("搜尋欄位在輸入、刪除、游標編輯、分頁切換與清除後維持正常互動", { timeout: 30_000 }, async () => {
  const result = await runHarness();

  assert.deepEqual(result.typed, {
    value: "abcdef", focused: true, selectionStart: 6, selectionEnd: 6, resultCount: "0 筆結果",
  });
  assert.deepEqual(result.backspaced, {
    value: "abcd", focused: true, selectionStart: 4, selectionEnd: 4, resultCount: "0 筆結果",
  });
  assert.deepEqual(result.insertedInMiddle, {
    value: "abXcd", focused: true, selectionStart: 3, selectionEnd: 3, resultCount: "0 筆結果",
  });
  assert.deepEqual(result.replacedSelection, {
    value: "aZd", focused: true, selectionStart: 2, selectionEnd: 2, resultCount: "0 筆結果",
  });
  assert.deepEqual(result.chinese, {
    value: "極光旅人", focused: true, selectionStart: 4, selectionEnd: 4, resultCount: "1 筆結果",
  });
  assert.equal(result.animeBeforeSearch.value, "");
  assert.equal(result.animeAfterSearch.value, "星海");
  assert.equal(result.animeAfterSearch.resultCount, "1 筆結果");
  assert.equal(result.restoredGameSearch.value, "極光旅人");
  assert.deepEqual(result.cleared, {
    value: "", focused: true, selectionStart: 0, selectionEnd: 0, resultCount: "5 筆結果",
  });
});
