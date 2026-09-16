import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const readerDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryDir = path.resolve(readerDir, "..");

export function parseVersion(version) {
  const match = String(version).match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) throw new Error(`版本號必須是 x.y.z：${version}`);
  return match.slice(1).map(Number);
}

export function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

function readJson(filepath) {
  return JSON.parse(fs.readFileSync(filepath, "utf8"));
}

export function runReleaseGuard() {
  const packageJson = readJson(path.join(readerDir, "package.json"));
  const packageLock = readJson(path.join(repositoryDir, "package-lock.json"));
  const releasePolicy = readJson(path.join(repositoryDir, "reader-release-policy.json"));
  const currentVersion = packageJson.version;
  parseVersion(currentVersion);

  const lockVersion = packageLock.packages?.catchlist_reader?.version;
  if (lockVersion !== currentVersion) {
    throw new Error(`package-lock.json 的閱讀器版本是 ${lockVersion ?? "缺少"}，應為 ${currentVersion}`);
  }

  const minimumVersion = releasePolicy.minimumVersion;
  if (compareVersions(currentVersion, minimumVersion) < 0) {
    throw new Error(`禁止版本倒退：目前 ${currentVersion}，發行基準 ${minimumVersion}`);
  }

  if (releasePolicy.officialRuntime !== "electron-portable") throw new Error("正式執行環境必須維持 electron-portable");
  const requiredFeatures = new Set(releasePolicy.requiredFeatures);
  for (const feature of ["liveAction", "persistentHide", "communityTags", "gameScoreFilter", "gameReviewFilter", "favorites", "hiddenManagement", "updateStatus", "backToTop"]) {
    if (!requiredFeatures.has(feature)) throw new Error(`發行政策缺少核心功能：${feature}`);
  }

  if (packageJson.main !== "src/main.js") throw new Error("正式閱讀器入口必須維持 src/main.js");
  if (packageJson.build?.win?.target?.[0]?.target !== "portable") throw new Error("正式建置必須維持 Windows portable 目標");
  if (!String(packageJson.build?.win?.artifactName).includes("${version}")) throw new Error("EXE 檔名必須包含版本號");

  return { currentVersion, minimumVersion, lockVersion };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = runReleaseGuard();
    console.log(`版本防護通過：${result.currentVersion}（發行基準 ${result.minimumVersion}）`);
  } catch (error) {
    console.error(`版本防護失敗：${error.message}`);
    process.exitCode = 1;
  }
}
