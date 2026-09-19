import fs from "node:fs";
import path from "node:path";
import { JsonJournal } from "@catchlist/core";

export const RAW_CACHE_VERSION = 1;
export const STRUCTURED_CACHE_VERSION = 1;
export const PROGRESS_VERSION = 1;

function validAppid(appid) {
  return /^\d+$/.test(String(appid));
}

function readJson(filepath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filepath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(filepath, value) {
  fs.mkdirSync(path.dirname(filepath), { recursive: true });
  const temporary = `${filepath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, filepath);
}

function appPath(root, kind, appid) {
  if (!validAppid(appid)) throw new Error(`無效 AppID：${appid}`);
  return path.join(root, kind, `${appid}.json`);
}

function validRaw(record) {
  return record && record.cacheVersion === RAW_CACHE_VERSION && validAppid(record.appid)
    && typeof record.html === "string" && typeof record.fetchedAt === "string";
}

function validStructured(record) {
  return record && record.cacheVersion === STRUCTURED_CACHE_VERSION && validAppid(record.appid)
    && Number.isInteger(record.parserVersion) && record.details && typeof record.details === "object";
}

export function createInitializationCache(root) {
  const cacheRoot = path.resolve(root);
  const progressPath = path.join(cacheRoot, "progress.json");
  let progressStore;
  function progressJournal() {
    return progressStore ??= new JsonJournal(progressPath, {
      decode: stored => stored?.version === PROGRESS_VERSION ? stored.entries : {},
      encode: entries => ({ version: PROGRESS_VERSION, entries }),
    });
  }


  function loadRaw(appid) {
    const record = readJson(appPath(cacheRoot, "raw", appid));
    return validRaw(record) ? record : null;
  }

  function saveRaw(appid, { status = 200, headers = {}, html, fetchedAt }) {
    const record = {
      cacheVersion: RAW_CACHE_VERSION,
      appid: String(appid),
      status,
      headers,
      html: String(html ?? ""),
      fetchedAt: fetchedAt ?? new Date().toISOString()
    };
    writeJson(appPath(cacheRoot, "raw", appid), record);
    return record;
  }

  function loadStructured(appid, parserVersion) {
    const record = readJson(appPath(cacheRoot, "structured", appid));
    return validStructured(record) && record.parserVersion === parserVersion ? record : null;
  }

  function saveStructured(appid, details, parsedAt = new Date().toISOString()) {
    const record = {
      cacheVersion: STRUCTURED_CACHE_VERSION,
      appid: String(appid),
      parserVersion: details.parserVersion,
      rawCacheVersion: RAW_CACHE_VERSION,
      parsedAt,
      details
    };
    writeJson(appPath(cacheRoot, "structured", appid), record);
    return record;
  }

  function loadProgress() {
    return { version: PROGRESS_VERSION, entries: progressJournal().data };
  }

  function saveProgress(progress) {
    // 相容舊有完整寫入介面，正式逐筆流程改走日誌。
    const normalized = { version: PROGRESS_VERSION, entries: progress.entries ?? {} };
    progressJournal().flush();
    writeJson(progressPath, normalized);
    progressStore = null;
    return normalized;
  }

  function recordProgress(appid, entry) {
    if (!validAppid(appid)) throw new Error(`無效 AppID：${appid}`);
    progressJournal().set(String(appid), { ...entry, updatedAt: entry.updatedAt ?? new Date().toISOString() });
    return loadProgress();
  }

  function flush() { progressStore?.flush(); }

  function pendingAppids(appids) {
    const entries = loadProgress().entries;
    return Array.from(new Set(appids.map(String).filter(validAppid)))
      .filter((appid) => entries[appid]?.state !== "success");
  }

  return {
    root: cacheRoot,
    flush,
    loadRaw,
    saveRaw,
    loadStructured,
    saveStructured,
    loadProgress,
    saveProgress,
    recordProgress,
    pendingAppids
  };
}
