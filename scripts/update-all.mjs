// ============================================================
// update-all.mjs — 依序執行四個專案的每月更新
//
// 特性(為排程執行設計):
//   - 任一專案失敗不會中斷其他專案,全部跑完後統一回報
//   - 只要有任何專案失敗,整體以非零 exit code 結束
// ============================================================

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { npmInvocation } from "./npm-invocation.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export const PROJECTS = Object.freeze([
  { name: "動畫 (spiderMAL)",      dir: "spiderMAL" },
  { name: "電影 (imdb_tracker)",   dir: "imdb_tracker" },
  { name: "遊戲 (steam_discovery)", dir: "steam_discovery" },
  { name: "真人劇 (live_action_tracker)", dir: "live_action_tracker" },
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
} = {}) {
  const failures = [];

  for (const project of projects) {
    log("\n" + "█".repeat(60));
    log(`█  開始更新:${project.name}`);
    log("█".repeat(60) + "\n");

    const invocation = npmInvocation(platform, npmExecPath, nodePath);
    const result = spawn(invocation.command, invocation.args, {
      cwd: path.join(rootDir, project.dir),
      stdio: "inherit",
      shell: false,
    });

    if (result.status !== 0) {
      failures.push(project.name);
      const exitCode = result.status ?? "無法啟動";
      error(`\n❌ ${project.name} 更新失敗 (exit code: ${exitCode})`);
    }
  }

  log("\n" + "=".repeat(60));
  if (failures.length > 0) {
    error(`❌ 本次更新有 ${failures.length} 個專案失敗:${failures.join("、")}`);
    error("   失敗的專案下次執行會自動回補缺漏，也可單獨重跑，例如：npm run update:tv");
    return { failures, exitCode: 1 };
  }

  log("✅ 四個專案全部更新完成!");
  return { failures, exitCode: 0 };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runAllUpdates().exitCode;
}
