import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runAllUpdates } from "../update-all.mjs";
import { createUpdateRecorder } from "../update-status.mjs";
import { loadUpdateStatus, UPDATE_STATUS_FILE } from "../../catchlist_reader/src/update-status.js";

function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "catchlist-update-run-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const project = { name: "動畫", dir: ".", media: "anime", outputFile: path.join(dir, "動畫.md") };
  return { dir, project };
}

test("紀錄開始、成功、新增數與失敗，失敗保留上次成功時間", async (t) => {
  const { dir, project } = setup(t);
  const recorder = createUpdateRecorder({ now: () => new Date("2026-09-16T00:00:00Z") });
  let context = recorder.start(project);
  assert.equal(loadUpdateStatus(dir).media.anime.status, "running");
  fs.writeFileSync(project.outputFile, "2026 春 >7.70\n- 範例動畫 **8.2** (12集 · TV)\n");
  recorder.finish(project, context, { status: 0 });
  let status = loadUpdateStatus(dir).media.anime;
  assert.equal(status.status, "success");
  assert.equal(status.addedCount, 1);
  assert.equal(status.lastSuccessAt, "2026-09-16T00:00:00.000Z");
  context = recorder.start(project);
  recorder.finish(project, context, { status: 1 });
  status = loadUpdateStatus(dir).media.anime;
  assert.equal(status.status, "failed");
  assert.equal(status.addedCount, 0);
  assert.equal(status.lastSuccessAt, "2026-09-16T00:00:00.000Z");
});

test("整合執行僅寫入注入的報告資料夾，無新增也是成功", async (t) => {
  const { dir, project } = setup(t);
  const result = await runAllUpdates({ projects: [project], rootDir: dir, platform: "linux", log() {}, error() {}, spawn() { return { status: 0 }; } });
  assert.equal(result.exitCode, 0);
  assert.equal(loadUpdateStatus(dir).media.anime.addedCount, 0);
  assert.equal(fs.existsSync(path.join(dir, UPDATE_STATUS_FILE)), true);
});

test("紀錄無法寫入與更新程式拋錯都不阻止後續類別，毀損檔保留", async (t) => {
  const { dir, project } = setup(t);
  const filepath = path.join(dir, UPDATE_STATUS_FILE);
  fs.writeFileSync(filepath, "{broken");
  let calls = 0;
  const result = await runAllUpdates({
    projects: [project, { ...project, name: "第二類" }], rootDir: dir, platform: "linux", log() {}, error() {},
    spawn() { calls += 1; if (calls === 1) throw new Error("啟動失敗"); return { status: 0 }; },
  });
  assert.equal(calls, 2);
  assert.equal(result.exitCode, 1);
  assert.equal(result.statusWarnings.length, 4);
  assert.deepEqual(result.failures, ["動畫"]);
  assert.equal(fs.readFileSync(filepath, "utf8"), "{broken");
});

test("不同輸出資料夾分別保存，同資料夾的各類紀錄不互相覆蓋", async (t) => {
  const { dir, project } = setup(t);
  const gameDir = path.join(dir, "games-output");
  let calls = 0;
  const projects = [project,
    { name: "電影", dir: ".", media: "movies", outputFile: path.join(dir, "電影.md") },
    { name: "遊戲", dir: ".", media: "games", outputFile: path.join(gameDir, "遊戲.md") },
  ];
  const result = await runAllUpdates({ projects, rootDir: dir, platform: "linux", log() {}, error() {},
    spawn() { calls += 1; return { status: calls === 2 ? 1 : 0 }; },
  });
  assert.deepEqual(result.failures, ["電影"]);
  assert.equal(loadUpdateStatus(dir).media.anime.status, "success");
  assert.equal(loadUpdateStatus(dir).media.movies.status, "failed");
  assert.equal(loadUpdateStatus(dir).media.games.status, "unknown");
  assert.equal(loadUpdateStatus(gameDir).media.games.status, "success");
});
