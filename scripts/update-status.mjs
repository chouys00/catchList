import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { parseReport } from "../catchlist_reader/src/library.js";
import { UPDATE_STATUS_FILE, readUpdateStatusFile, successfulUpdateFields } from "../catchlist_reader/src/update-status.js";

function snapshot(project) {
  let content;
  try { content = fs.readFileSync(project.outputFile, "utf8"); }
  catch (error) { if (error.code === "ENOENT") return new Set(); throw error; }
  return new Set(parseReport(project.media, content).entries.map((entry) => entry.hideKey));
}

function save(project, update) {
  const filepath = path.join(path.dirname(project.outputFile), UPDATE_STATUS_FILE);
  const data = readUpdateStatusFile(filepath);
  const next = update(data.media[project.media] ?? {});
  data.media[project.media] = next;
  fs.mkdirSync(path.dirname(filepath), { recursive: true });
  const temporary = `${filepath}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify(data, null, 2) + "\n", { flag: "wx" });
    fs.renameSync(temporary, filepath);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

/** 測試使用臨時報告路徑；不從報告修改時間推斷執行結果。 */
export function createUpdateRecorder({ now = () => new Date() } = {}) {
  return {
    start(project) {
      const before = snapshot(project);
      const startedAt = now().toISOString();
      save(project, (previous) => ({ ...previous, ...successfulUpdateFields(previous), status: "running", startedAt, finishedAt: null, addedCount: null, error: null }));
      return { before, startedAt };
    },
    finish(project, context, result) {
      const finishedAt = now().toISOString();
      const success = result.status === 0;
      // 更新器可能部分寫入後失敗；保留實際新增數，成功與否另外呈現。
      const after = snapshot(project);
      const addedCount = context ? [...after].filter((key) => !context.before.has(key)).length : null;
      save(project, (previous) => ({
        ...previous, status: success ? addedCount > 0 ? "success" : addedCount === 0 ? "unchanged" : "unknown" : "failed",
        startedAt: context?.startedAt ?? previous.startedAt ?? null, finishedAt,
        ...successfulUpdateFields(previous),
        ...(success && addedCount > 0 ? { lastSuccessAt: finishedAt, lastSuccessAddedCount: addedCount } : {}),
        addedCount, error: success ? null : `更新程式失敗（結束碼：${result.status ?? "無法啟動"}）`,
      }));
    },
  };
}
