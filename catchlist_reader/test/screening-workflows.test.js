import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import electron from "electron";

test("快篩桌面與窄視窗、進度續接、隱藏收藏復原及快捷鍵", { timeout: 60000 }, async () => {
  const result = await new Promise((resolve, reject) => {
    const child = spawn(electron, [fileURLToPath(new URL("../test-support/screening-workflows.cjs", import.meta.url))], { windowsHide: true });
    let output = "", errors = "";
    child.stdout.on("data", chunk => { output += chunk; });
    child.stderr.on("data", chunk => { errors += chunk; });
    child.on("error", reject);
    child.on("exit", code => {
      if (code !== 0) return reject(new Error(errors));
      try { resolve(JSON.parse(output.trim().split(/\r?\n/).at(-1))); } catch (error) { reject(error); }
    });
  });
  assert.equal(result.persistence, true);
  assert.equal(result.hideUndo, true);
  assert.equal(result.favoriteUndo, true);
  assert.equal(result.shortcuts, true);
  assert.equal(result.completion, true);
});
