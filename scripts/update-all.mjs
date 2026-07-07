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

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const projects = [
  { name: "動畫 (spiderMAL)",      dir: "spiderMAL" },
  { name: "電影 (imdb_tracker)",   dir: "imdb_tracker" },
  { name: "遊戲 (steam_discovery)", dir: "steam_discovery" },
];

const failures = [];

for (const p of projects) {
  console.log("\n" + "█".repeat(60));
  console.log(`█  開始更新:${p.name}`);
  console.log("█".repeat(60) + "\n");

  const result = spawnSync("npm", ["run", "update"], {
    cwd: path.join(root, p.dir),
    stdio: "inherit",
    shell: true, // Windows 上執行 npm.cmd 需要 shell
  });

  if (result.status !== 0) {
    failures.push(p.name);
    console.error(`\n❌ ${p.name} 更新失敗 (exit code: ${result.status})`);
  }
}

console.log("\n" + "=".repeat(60));
if (failures.length > 0) {
  console.error(`❌ 本次更新有 ${failures.length} 個專案失敗:${failures.join("、")}`);
  console.error(`   失敗的專案下次執行會自動回補缺漏,也可單獨重跑,例如:npm run update:anime`);
  process.exitCode = 1;
} else {
  console.log("✅ 三個專案全部更新完成!");
}
