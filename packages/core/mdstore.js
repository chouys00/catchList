// ============================================================
// mdstore.js — Markdown 報告的區段存取
// 報告格式:各區段以 "------------------------------" 分隔,
// 每段第一行為「YYYY  MM月 ...」標題。
// ============================================================

import fs from "node:fs";
import path from "node:path";
import { atomicWriteFile } from "./safe-output.js";

export const SECTION_DELIMITER = "------------------------------";

/**
 * 從區段第一行解析出 "YYYY-MM" 鍵。
 * 支援「2026  6月 ...」與「2026  全年度 ...」(全年度視為 00)。
 * @returns {string|null}
 */
export function parseYearMonthKey(firstLine) {
  const yearMatch = firstLine.match(/^(\d{4})/);
  if (!yearMatch) return null;

  const year = parseInt(yearMatch[1]);
  let month = 0;
  if (!firstLine.includes("全年度")) {
    const monthMatch = firstLine.match(/\s+(\d+)月/);
    if (monthMatch) month = parseInt(monthMatch[1]);
  }
  return `${year}-${String(month).padStart(2, "0")}`;
}

/**
 * 解析現有報告檔的既有區塊。
 * @param {string} filepath
 * @param {object} [opts]
 * @param {(content: string) => string} [opts.preprocess] - 解析前先清理內容(例如移除頁首)
 * @param {(firstLine: string) => string|null} [opts.parseKey] - 自訂鍵解析,預設為年月解析
 * @returns {Map<string, string>} key: "YYYY-MM", value: 區段原文
 */
export function loadSections(filepath, opts = {}) {
  const { preprocess, parseKey = parseYearMonthKey } = opts;
  const sections = new Map();

  if (!fs.existsSync(filepath)) return sections;

  let content = fs.readFileSync(filepath, "utf-8");
  if (preprocess) content = preprocess(content);

  for (const block of content.split(SECTION_DELIMITER)) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    const key = parseKey(trimmed.split("\n")[0].trim());
    if (key) sections.set(key, trimmed);
  }

  return sections;
}

/**
 * 將所有區段依鍵值由新到舊排序後寫回檔案。
 * @param {string} filepath
 * @param {Map<string, string>} sections
 * @param {object} [opts]
 * @param {string} [opts.header] - 置於檔案最頂部的固定內容
 */
export function writeSectionsFile(filepath, sections, opts = {}) {
  const { header = "" } = opts;
  const sortedKeys = [...sections.keys()].sort((a, b) => b.localeCompare(a));

  const parts = [];
  for (const key of sortedKeys) {
    parts.push(sections.get(key));
    parts.push(SECTION_DELIMITER);
    parts.push("");
  }

  atomicWriteFile(filepath, header + parts.join("\n").trimEnd() + "\n", "utf-8");
}
