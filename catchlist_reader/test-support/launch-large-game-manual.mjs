import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import electronPath from "electron";
import { createCoverCache, createLargeGamesFixture, largeGameAppids } from "./large-games-fixture.js";

const requestedRoot = process.env.CATCHLIST_MANUAL_ROOT?.trim();
const root = requestedRoot ? path.resolve(requestedRoot) : fs.mkdtempSync(path.join(os.tmpdir(), "catchlist-reader-manual-"));
const dataDir = path.join(root, "data");
const userDataDir = path.join(root, "user-data");
const fixture = fs.existsSync(path.join(dataDir, "遊戲.md"))
  ? null
  : createLargeGamesFixture(dataDir);
createCoverCache(userDataDir, fixture?.appids ?? largeGameAppids());

console.log(`千筆隔離驗收資料：${dataDir}`);
console.log(`隔離封面快取：${userDataDir}`);
console.log(fixture
  ? "已預先建立 1,000 筆封面快取，不會呼叫 Steam appdetails API。關閉閱讀器視窗即可結束驗收程式。"
  : "沿用既有隔離資料與封面快取，不會呼叫 Steam appdetails API。關閉閱讀器視窗即可結束驗收程式。");

const readerRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const child = spawn(electronPath, [readerRoot, `--data-dir=${dataDir}`], {
  env: {
    ...process.env,
    CATCHLIST_DATA_DIR: dataDir,
    CATCHLIST_USER_DATA_DIR: userDataDir,
  },
  stdio: "inherit",
  windowsHide: false,
});
child.on("exit", (code) => process.exitCode = code ?? 0);
