import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import electronPath from "electron";

test("動畫封面、影片、作品校正、重試與收藏在桌面和窄視窗可操作", { timeout: 80000 }, async () => {
  const result = await new Promise((resolve, reject) => {
    const child = spawn(electronPath, [fileURLToPath(new URL("../test-support/anime-media-workflows.cjs", import.meta.url))], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.on("error", reject);
    child.on("exit", code => {
      if (code !== 0) return reject(new Error(`動畫互動測試失敗 ${code}\n${stderr}`));
      try { resolve(JSON.parse(stdout.trim().split(/\r?\n/).at(-1))); } catch (error) { reject(error); }
    });
  });
  assert.equal(result.desktop && result.mobile && result.identitySelection && result.favorites, true);
});
