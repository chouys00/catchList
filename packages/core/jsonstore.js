// ============================================================
// jsonstore.js — 簡易 JSON 檔快取讀寫
// ============================================================

import fs from "node:fs";

export function loadJson(filepath, fallback = {}) {
  try {
    if (fs.existsSync(filepath)) {
      return JSON.parse(fs.readFileSync(filepath, "utf-8"));
    }
  } catch {}
  return fallback;
}

export function saveJson(filepath, data) {
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2), "utf-8");
}
