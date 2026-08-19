import { loadSections, monthKey, sanitizeDisplayText, writeSectionsFile } from "@catchlist/core";
import { REGION_KEYS, REGION_LABELS } from "./schema.js";

export const REPORT_HEADER = "# 真人劇追蹤\n\n"
  + "依首播月份整理；各區依自身 Bayesian 加權分排序，TMDb 為主要評分來源，IMDb 僅作佐證。所有劇集另須列有臺灣訂閱制串流；串流可用性資料由 JustWatch 經 TMDb 提供。\n\n";

function escapeMarkdown(value, options) {
  return sanitizeDisplayText(value, options).replace(/[\\`*_{}[\]<>()#+!|]/g, "\\$&");
}

function formatNumber(value) {
  return Number(value ?? 0).toLocaleString("en-US");
}

function formatScore(value) {
  const score = Number(value);
  return Number.isFinite(score) ? score.toFixed(1) : "-";
}

function labelForEvidence(status) {
  return { consistent: "來源一致", divergent: "意見分歧", insufficient: "資料不足" }[status] ?? "資料不足";
}

function labelForConfidence(confidence) {
  return { high: "高", medium: "中", low: "低" }[confidence] ?? "低";
}

function deduplicateByTmdbId(selections) {
  const byId = new Map();
  for (const selection of selections ?? []) {
    const id = Number(selection?.tmdbId);
    if (!Number.isInteger(id) || id <= 0 || byId.has(id)) continue;
    byId.set(id, selection);
  }
  return [...byId.values()];
}

function formatShow(selection) {
  const displayName = escapeMarkdown(selection.displayName || `TMDb ${selection.tmdbId}`);
  const originalName = escapeMarkdown(selection.originalName || "未提供原名");
  const title = displayName === originalName ? `**${displayName}**` : `**${displayName}**（${originalName}）`;
  const imdb = selection.imdb ?? {};
  const imdbText = imdb.imdbScore == null
    ? "IMDb：資料不足"
    : `IMDb：${formatScore(imdb.imdbScore)}（${formatNumber(imdb.imdbVotes)} 票，${labelForEvidence(imdb.status)}）`;
  const genres = Array.isArray(selection.genreNames) && selection.genreNames.length > 0
    ? selection.genreNames.map((genre) => escapeMarkdown(genre, { maxLength: 80 })).join("、")
    : "未提供";
  const tmdbId = Number(selection.tmdbId);

  return [
    `- ${title}`,
    `  首播：${escapeMarkdown(selection.firstAirDate || "未提供")}｜TMDb：${formatScore(selection.voteAverage)}（${formatNumber(selection.voteCount)} 票）｜${imdbText}｜信心：${labelForConfidence(selection.confidence)}`,
    `  類型：${genres}｜[TMDb](https://www.themoviedb.org/tv/${tmdbId})`,
    ...(Array.isArray(selection.taiwanSubscriptionProviders)
      ? [`  臺灣訂閱制：${selection.taiwanSubscriptionProviders.map((provider) => escapeMarkdown(provider, { maxLength: 80 })).join("、")}｜資料來源：JustWatch（經 TMDb）`]
      : [])
  ];
}

/** 讀取真人劇報告的月份區段；固定頁首不會被誤判為第一個月份。 */
export function loadReportSections(filepath) {
  return loadSections(filepath, {
    preprocess: (content) => content.startsWith(REPORT_HEADER) ? content.slice(REPORT_HEADER.length) : content
  });
}

/** 產生可重現的單月區段；空月與空區同樣會寫入。 */
export function formatMonthSection({ year, month, selections = [], updatedAt = "1970-01-01" }) {
  const lines = [`${year}  ${month}月  (更新時間: ${updatedAt})`, ""];
  const unique = deduplicateByTmdbId(selections);
  for (const region of REGION_KEYS) {
    lines.push(`## ${REGION_LABELS[region]}`);
    const shows = unique.filter((selection) => selection.region === region)
      .sort((a, b) => Number(b.weightedScore ?? -Infinity) - Number(a.weightedScore ?? -Infinity)
        || Number(b.voteCount ?? 0) - Number(a.voteCount ?? 0)
        || Number(a.tmdbId) - Number(b.tmdbId));
    if (shows.length === 0) {
      lines.push("- （本區無符合門檻作品）", "");
      continue;
    }
    for (const show of shows) lines.push(...formatShow(show));
    lines.push("");
  }
  if (unique.length === 0) lines.splice(2, 0, "(本月無符合門檻的真人劇)", "");
  return lines.join("\n").trimEnd();
}

/**
 * 以月份區段防重複，單次呼叫只原子寫入一個完成月份。
 * @returns {{ written: boolean, key: string, section: string }}
 */
export function writeMonthReport(filepath, monthData) {
  const key = monthKey(monthData.year, monthData.month);
  const sections = loadReportSections(filepath);
  if (sections.has(key)) return { written: false, key, section: sections.get(key) };
  const section = formatMonthSection(monthData);
  sections.set(key, section);
  writeSectionsFile(filepath, sections, { header: REPORT_HEADER });
  return { written: true, key, section };
}
