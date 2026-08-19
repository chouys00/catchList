import assert from "node:assert/strict";
import test from "node:test";
import { npmInvocation } from "../npm-invocation.mjs";

test("Windows 以 Node 執行 npm CLI，不使用 cmd shell", () => {
  const invocation = npmInvocation("win32", "C:/npm/npm-cli.js", "C:/node/node.exe");
  assert.deepEqual(invocation, {
    command: "C:/node/node.exe",
    args: ["C:/npm/npm-cli.js", "run", "update"],
  });
});
