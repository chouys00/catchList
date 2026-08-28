import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const readerDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rootDir = path.resolve(readerDir, "..");
const read = (relativePath) => fs.readFileSync(path.join(readerDir, relativePath), "utf8");
const packageVersion = JSON.parse(read("package.json")).version;

test("檢視器的封裝設定與兩套介面都顯示相同版本", () => {
  const tauriConfig = JSON.parse(read("src-tauri/tauri.conf.json"));
  const cargoManifest = read("src-tauri/Cargo.toml");
  const lockfile = JSON.parse(fs.readFileSync(path.join(rootDir, "package-lock.json"), "utf8"));

  assert.equal(tauriConfig.version, packageVersion);
  assert.equal(lockfile.packages["catchlist_reader"].version, packageVersion);
  assert.match(cargoManifest, new RegExp(`^version = "${packageVersion.replaceAll(".", "\\.")}"$`, "m"));
  assert.match(read("src/renderer/index.html"), new RegExp(`v${packageVersion}`));
  assert.match(read("src/tauri-shell/index.html"), new RegExp(`v${packageVersion}`));
});
