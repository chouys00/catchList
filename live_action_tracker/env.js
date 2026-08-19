import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
export const LOCAL_ENV_FILE = path.join(PACKAGE_ROOT, ".env");

function normalizedValue(rawValue) {
  const value = rawValue.trim();
  if (value.length === 0) return "";
  const quoted = /^(?:"([\s\S]*)"|'([\s\S]*)')$/.exec(value);
  if ((value.startsWith('"') || value.startsWith("'")) && !quoted) {
    throw new Error("TMDB_API_TOKEN 的 .env 引號格式無效。");
  }
  return quoted ? (quoted[1] ?? quoted[2]).trim() : value;
}

/** 只讀取本機 .env 的 TMDB_API_TOKEN，不匯入其他環境設定。 */
export function readTmdbTokenFromEnvFile(envFile = LOCAL_ENV_FILE) {
  if (!fs.existsSync(envFile)) return null;
  const stat = fs.lstatSync(envFile);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error("TMDb .env 必須是專案內的一般檔案。");
  }

  let token = null;
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    if (/^\s*(?:#|$)/.test(line)) continue;
    const match = /^\s*TMDB_API_TOKEN\s*=\s*(.*?)\s*$/.exec(line);
    if (!match) continue;
    if (token !== null) throw new Error("TMDb .env 不可重複設定 TMDB_API_TOKEN。");
    token = normalizedValue(match[1]);
  }
  return token || null;
}

export function resolveTmdbToken(env = process.env, {
  envFile = LOCAL_ENV_FILE,
  allowEnvFile = env === process.env
} = {}) {
  const environmentToken = typeof env?.TMDB_API_TOKEN === "string" ? env.TMDB_API_TOKEN.trim() : "";
  if (environmentToken) return environmentToken;
  return allowEnvFile ? readTmdbTokenFromEnvFile(envFile) : null;
}
