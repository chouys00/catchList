import assert from "node:assert/strict";
import test from "node:test";

import { compareVersions, parseVersion, runReleaseGuard } from "../test-support/release-guard.mjs";

test("版本比較可阻止 major、minor 與 patch 倒退", () => {
  assert.deepEqual(parseVersion("1.2.3"), [1, 2, 3]);
  assert.ok(compareVersions("1.0.10", "1.0.9") > 0);
  assert.ok(compareVersions("1.1.0", "1.0.99") > 0);
  assert.ok(compareVersions("2.0.0", "1.99.99") > 0);
  assert.equal(compareVersions("1.0.10", "1.0.10"), 0);
  assert.throws(() => parseVersion("1.0"), /x\.y\.z/);
});

test("正式建置版本、鎖檔與發行基準符合規則", () => {
  const result = runReleaseGuard();
  assert.equal(result.currentVersion, result.lockVersion);
  assert.ok(compareVersions(result.currentVersion, result.minimumVersion) >= 0);
});
