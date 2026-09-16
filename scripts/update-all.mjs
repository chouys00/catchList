// ============================================================
// update-all.mjs — 依序執行三個專案的每月更新
//
// 特性(為排程執行設計):
//   - 任一專案失敗不會中斷其他專案,全部跑完後統一回報
//   - 只要有任何專案失敗,整體以非零 exit code 結束
// ============================================================

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { npmInvocation } from "./npm-invocation.mjs";
import { createUpdateRecorder } from "./update-status.mjs";
import { CONFIG as MOVIES_CONFIG } from "../imdb_tracker/config.js";
import { CONFIG as GAMES_CONFIG } from "../steam_discovery/config.js";
import { TARGET_PATH } from "../spiderMAL/.cursor/skills/find-anime/lib/constants.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export const PROJECTS = Object.freeze([
  { name: "動畫 (spiderMAL)", dir: "spiderMAL", media: "anime", outputFile: TARGET_PATH },
  { name: "電影 (imdb_tracker)", dir: "imdb_tracker", media: "movies", outputFile: MOVIES_CONFIG.OUTPUT_FILE },
  { name: "遊戲 (steam_discovery)", dir: "steam_discovery", media: "games", outputFile: GAMES_CONFIG.OUTPUT_FILE },
]);

/**
 * 每個更新器都會嘗試執行；單一失敗只會記錄，絕不阻止後續項目。
 * 可注入 spawn 供離線測試，避免測試誤觸發實際網路更新。
 */
export function runAllUpdates({
  projects = PROJECTS,
  spawn = spawnSync,
  rootDir = root,
  platform = process.platform,
  npmExecPath = process.env.npm_execpath,
  nodePath = process.execPath,
  log = console.log,
  error = console.error,
  recorder = createUpdateRecorder(),
} = {}) {
  const failures = [];
  const statusWarnings = [];

  for (const project of projects) {
    log("\n" + "█".repeat(60));
    log(`█  開始更新:${project.name}`);
    log("█".repeat(60) + "\n");

    const trackedProject = { ...project, outputFile: project.outputFile
      ? path.resolve(rootDir, project.dir, project.outputFile) : undefined };
    let context;
    const record = (action) => {
      if (!recorder || !trackedProject.outputFile) return;
      try { return action(); }
      catch (cause) {
        const message = `${project.name} 無法儲存更新狀態：${cause.message}`;
        statusWarnings.push(message);
        error(message);
      }
    };
    context = record(() => recorder.start(trackedProject));
    let result;
    try {
      const invocation = npmInvocation(platform, npmExecPath, nodePath);
      result = spawn(invocation.command, invocation.args, {
        cwd: path.join(rootDir, project.dir),
        stdio: "inherit",
        shell: false,
      });
    } catch (cause) {
      result = { status: null, error: cause };
    }
    record(() => recorder.finish(trackedProject, context, result));

    if (result.status !== 0) {
      failures.push(project.name);
      const exitCode = result.status ?? "無法啟動";
      error(`\n❌ ${project.name} 更新失敗 (exit code: ${exitCode})`);
    }
  }

  log("\n" + "=".repeat(60));
  if (failures.length > 0) {
    error(`❌ 本次更新有 ${failures.length} 個專案失敗:${failures.join("、")}`);
    error("   失敗的專案下次執行會自動回補缺漏，也可單獨重跑，例如：npm run update:games");
    return { failures, statusWarnings, exitCode: 1 };
  }

  log("✅ 三個每月專案全部更新完成!");
  return { failures, statusWarnings, exitCode: statusWarnings.length ? 1 : 0 };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runAllUpdates().exitCode;
}
