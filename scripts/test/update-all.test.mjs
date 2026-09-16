import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { PROJECTS, runAllUpdates } from "../update-all.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function runWithStatuses(statuses) {
  const calls = [];
  const errors = [];
  const result = runAllUpdates({
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

test("三個每月更新器都成功時固定依序執行並回傳成功", () => {
  const { calls, errors, result } = runWithStatuses([0, 0, 0]);

  assert.equal(result.exitCode, 0);
  assert.deepEqual(result.failures, []);
  assert.deepEqual(calls.map((call) => path.basename(call.cwd)), PROJECTS.map((project) => project.dir));
  assert.deepEqual(calls.map((call) => call.command), Array(3).fill("C:/node/node.exe"));
  assert.deepEqual(calls.map((call) => call.args), Array(3).fill(["C:/npm/npm-cli.js", "run", "update"]));
  assert.deepEqual(calls.map((call) => call.shell), Array(3).fill(false));
  assert.deepEqual(errors, []);
});

test("既有更新器失敗不會阻止後續每月更新器", () => {
  const { calls, errors, result } = runWithStatuses([0, 1, 0]);

  assert.equal(calls.length, 3);
  assert.equal(path.basename(calls.at(-1).cwd), "steam_discovery");
  assert.equal(result.exitCode, 1);
  assert.deepEqual(result.failures, ["電影 (imdb_tracker)"]);
  assert.match(errors.join("\n"), /電影/);
});
