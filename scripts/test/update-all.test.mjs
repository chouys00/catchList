import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { PROJECTS, runAllUpdates, spawnUpdate } from "../update-all.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

async function runWithStatuses(statuses) {
  const calls = [];
  const errors = [];
  const result = await runAllUpdates({
    concurrency: 1,
    rootDir: root,
    recorder: null,
    platform: "win32",
    npmExecPath: "C:/npm/npm-cli.js",
    nodePath: "C:/node/node.exe",
    log: () => {},
    error: (line) => errors.push(line),
    spawn(command, args, options) {
      calls.push({ command, args, cwd: options.cwd, shell: options.shell });
      return { status: statuses[calls.length - 1] };
    },
  });
  return { calls, errors, result };
}

test("根目錄 workspace 與年度真人劇指令可解析", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const packageLock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));

  assert.ok(packageJson.workspaces.includes("live_action_tracker"));
  assert.equal(packageJson.scripts["update:tv"], "npm run update --workspace live-action-tracker --");
  assert.ok(packageLock.packages.live_action_tracker);
});

test("三個每月更新器都成功時設為單工時依序執行並回傳成功", async () => {
  const { calls, errors, result } = await runWithStatuses([0, 0, 0]);

  assert.equal(result.exitCode, 0);
  assert.deepEqual(result.failures, []);
  assert.deepEqual(calls.map((call) => path.basename(call.cwd)), PROJECTS.map((project) => project.dir));
  assert.deepEqual(calls.map((call) => call.command), Array(3).fill("C:/node/node.exe"));
  assert.deepEqual(calls.map((call) => call.args), Array(3).fill(["C:/npm/npm-cli.js", "run", "update"]));
  assert.deepEqual(calls.map((call) => call.shell), Array(3).fill(false));
  assert.deepEqual(errors, []);
});

test("既有更新器失敗不會阻止後續每月更新器", async () => {
  const { calls, errors, result } = await runWithStatuses([0, 1, 0]);

  assert.equal(calls.length, 3);
  assert.equal(path.basename(calls.at(-1).cwd), "steam_discovery");
  assert.equal(result.exitCode, 1);
  assert.deepEqual(result.failures, ["電影 (imdb_tracker)"]);
  assert.match(errors.join("\n"), /電影/);
});

test("預設最多兩個更新器同時工作，失敗後繼續且狀態寫入不交錯", async () => {
  const active = new Set(), events = [], finishers = [];
  let peak = 0;
  const running = runAllUpdates({
    platform: "linux",
    recorder: { start(p) { events.push(`start:${p.media}`); return p.media; }, finish(p, context, result) { assert.equal(context, p.media); events.push(`finish:${p.media}:${result.status}`); } },
    log() {}, error() {},
    spawn(_command, _args, options) {
      const name = path.basename(options.cwd); active.add(name); peak = Math.max(peak, active.size);
      return new Promise(resolve => finishers.push(status => { active.delete(name); resolve({ status }); }));
    },
  });
  assert.equal(finishers.length, 2);
  finishers[0](1); await new Promise(resolve => setImmediate(resolve));
  assert.equal(finishers.length, 3); assert.equal(peak, 2);
  finishers[1](0); finishers[2](0);
  const result = await running;
  assert.equal(result.exitCode, 1); assert.deepEqual(result.failures, [PROJECTS[0].name]);
  assert.equal(events.filter(e => e.startsWith("start:")).length, 3);
  assert.equal(events.filter(e => e.startsWith("finish:")).length, 3);
});
test("啟動例外與狀態儲存失敗皆回報，其他更新器仍執行", async () => {
  let calls = 0;
  const result = await runAllUpdates({ platform: "linux", log() {}, error() {}, recorder: { start() { throw Error("locked"); }, finish() {} }, spawn() { calls++; if (calls === 1) throw Error("spawn failed"); return { status: 0 }; } });
  assert.equal(calls, 3); assert.equal(result.exitCode, 1); assert.equal(result.statusWarnings.length, 3); assert.equal(result.failures.length, 1);
});

test("非同步程序等待真正結束碼，啟動失敗也能結束等待", async () => {
  const result = await spawnUpdate(process.execPath, ["-e", "process.exit(7)"], { stdio: "ignore", shell: false });
  assert.equal(result.status, 7);
  const missing = await spawnUpdate(path.join(root, "nonexistent-command-for-test"), [], { stdio: "ignore", shell: false });
  assert.equal(missing.status, null); assert.ok(missing.error);
});
