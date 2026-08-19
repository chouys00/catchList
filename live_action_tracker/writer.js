import { loadSections, sanitizeDisplayText, writeSectionsFile } from "@catchlist/core";
import { REGION_KEYS, REGION_LABELS } from "./schema.js";

export const REPORT_HEADER = "# 真人劇年度必看\n\n"
  + "每年由 AI 參考各地口碑、創作代表性與年度話題整理五區必看作品。IMDb 分數與票數僅供閱讀，不影響入選；同一年度首次寫入後不會自動更新。\n\n";

export function annualKey(year) {
  return `${year}-00`;
}

function escapeMarkdown(value) {
  return sanitizeDisplayText(value, { maxLength: 300 }).replace(/[\\`*_{}[\]<>()#+!|]/g, "\\$&");
}

function formatNumber(value) {
  return Number(value).toLocaleString("en-US");
}

function formatShow(show) {
  const title = escapeMarkdown(show.title);
  const linkedTitle = show.imdbUrl ? `[${title}](${show.imdbUrl})` : title;
  const imdb = show.imdbScore == null
    ? "IMDb：資料不足"
    : `${Number(show.imdbScore).toFixed(1)}／10（${formatNumber(show.imdbVotes)} 票）`;
  return `- ${linkedTitle}：${imdb}`;
}

/** 產生固定五區、每區十部的年度必看區段。 */
export function formatYearSection({ year, selections = [], selectedAt = null, imdbDataDate = null }) {
  const dateText = selectedAt ? `  (整理時間: ${escapeMarkdown(selectedAt)})` : "";
  const lines = [`${year}  全年度${dateText}`, ""];
  for (const region of REGION_KEYS) {
    lines.push(`## ${REGION_LABELS[region]}`);
    for (const show of selections.filter((item) => item.region === region)) lines.push(formatShow(show));
    lines.push("");
  }
  if (imdbDataDate) lines.push(`IMDb 資料日期：${escapeMarkdown(imdbDataDate)}`);
  return lines.join("\n").trimEnd();
}

export function loadAnnualReportSections(filepath) {
  return loadSections(filepath, {
    preprocess: (content) => content.startsWith(REPORT_HEADER) ? content.slice(REPORT_HEADER.length) : content
  });
}

/** 同一年只會原子寫入一次；既有年度區段絕不覆寫。 */
export function writeAnnualReport(filepath, yearData) {
  const key = annualKey(yearData.year);
  const sections = loadAnnualReportSections(filepath);
  if (sections.has(key)) return { written: false, key, section: sections.get(key) };
  const section = formatYearSection(yearData);
  sections.set(key, section);
  writeSectionsFile(filepath, sections, { header: REPORT_HEADER });
  return { written: true, key, section };
}
