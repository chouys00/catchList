import { hasLegacyCommunityTags } from "../legacy-game-tags.js";
const validMedia = new Set(["games", "anime", "movies"]);

export function shouldShowPeriodRail(media) { return media !== "games"; }
export function gameDisplayTags(entry) {
  const tags = Array.isArray(entry?.tags) ? entry.tags.filter(Boolean) : [];
  return tags.length ? tags : (Array.isArray(entry?.genres) ? entry.genres.filter(Boolean) : []);
}

export function sortEntriesForMedia(media, entries) {
  return [...entries].sort((left, right) => {
    if (media === "games") {
      return String(right.releaseDate ?? "").localeCompare(String(left.releaseDate ?? ""))
        || Number(right.score ?? 0) - Number(left.score ?? 0)
        || Number(right.reviews ?? 0) - Number(left.reviews ?? 0)
        || String(left.title ?? "").localeCompare(String(right.title ?? ""), "zh-Hant");
    }
    return Number(right.score ?? 0) - Number(left.score ?? 0)
      || String(left.title ?? "").localeCompare(String(right.title ?? ""), "zh-Hant");
  });
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[char]);
}

function clean(value) { return String(value ?? "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim(); }
function chineseSupport(badges) { const value = badges.find((badge) => badge.startsWith("中文支援:"))?.split(":").slice(1).join(":").trim(); if (value === "支援中文") return "supported"; if (value === "不支援中文") return "unsupported"; return "unknown"; }
function normalizeTags(tags) {
  const result = [];
  const seen = new Set();
  for (const tag of tags) {
    const value = clean(tag);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
    if (result.length === 20) break;
  }
  return result;
}

function makeId(media, sectionKey, raw, occurrence) {
  let a = 0x811c9dc5; let b = 0x9e3779b9;
  for (const char of `${media}\0${sectionKey}\0${raw}\0${occurrence}`) { a = Math.imul(a ^ char.charCodeAt(0), 0x01000193); b = Math.imul(b ^ char.charCodeAt(0), 0x85ebca6b); }
  return [a, b, a ^ b].map((value) => (value >>> 0).toString(16).padStart(8, "0")).join("");
}
function add(entries, occurrences, media, section, raw, start, end, fields) { const key = `${section.key}\0${raw}`; const occurrence = occurrences.get(key) ?? 0; occurrences.set(key, occurrence + 1); entries.push({ id: makeId(media, section.key, raw, occurrence), hideKey: JSON.stringify([media, media === "games" ? fields.appid : section.key, media === "games" ? "" : fields.title, media === "games" ? 0 : occurrence]), media, sectionKey: section.key, periodLabel: section.label, year: section.year, lineStart: start, lineEnd: end, ...fields }); }
function anime(lines) { const entries = []; const occurrences = new Map(); let section; lines.forEach((line, index) => { const heading = line.match(/^(\d{4})\s+(春|夏|秋|冬)\s+>[\d.]+/); if (heading) { section = { key: `${heading[1]}-${heading[2]}`, label: `${heading[1]} 年${heading[2]}季`, year: Number(heading[1]), season: heading[2] }; return; } const match = section && line.match(/^- (.+?)\s+\*\*(\d+(?:\.\d+)?)\*\*\s+\(([^·)]+)\s*·\s*([^)]+)\)\s*$/); if (match) add(entries, occurrences, "anime", section, line, index, index + 1, { title: clean(match[1]), score: Number(match[2]), episodes: clean(match[3]), format: clean(match[4]), season: section.season, searchUrl: `https://www.google.com/search?q=${encodeURIComponent(`${clean(match[1])} 動畫`)}` }); }); return entries; }
function movies(lines) { const entries = []; const occurrences = new Map(); let section; lines.forEach((line, index) => { const heading = line.match(/^(\d{4})\s+(\d{1,2})月\s+>[\d.]+/); if (heading) { const month = Number(heading[2]); section = { key: `${heading[1]}-${String(month).padStart(2, "0")}`, label: `${heading[1]} 年 ${month} 月`, year: Number(heading[1]), month }; return; } const match = section && line.match(/^- (.+?)\s+\*\*(\d+(?:\.\d+)?)\*\*\s+`\(IMDb:\s*([\d.]+)\s*\|\s*(.+?)\s+\(([+-]\d+(?:\.\d+)?)\)\s*\|\s*([^)]+)\)`\s*$/); if (match) add(entries, occurrences, "movies", section, line, index, index + 1, { title: clean(match[1]), score: Number(match[2]), imdbScore: Number(match[3]), category: clean(match[4]), adjustment: Number(match[5]), votesLabel: clean(match[6]), searchUrl: `https://www.google.com/search?q=${encodeURIComponent(`${clean(match[1])} 電影`)}` }); }); return entries; }
function games(lines, legacyInitialization) { const entries = []; const occurrences = new Map(); let section; for (let index = 0; index < lines.length; index += 1) { const line = lines[index]; const heading = line.match(/^(\d{4})\s+(\d{1,2})月\s+/); if (heading) { const month = Number(heading[2]); section = { key: `${heading[1]}-${String(month).padStart(2, "0")}`, label: `${heading[1]} 年 ${month} 月`, year: Number(heading[1]), month }; continue; } const title = section && line.match(/^- \*\*(.+?)\*\* \((.*)\)(?: \[(.*)\])?\s*$/); const detail = (lines[index + 1] ?? "").match(/^\s+(\d{4}-\d{2}-\d{2}) \| (\d+)% \(([\d,]+)\) \| (.+)\s*$/); const tagLine = (lines[index + 2] ?? "").match(/^\s+社群標籤:\s*(.*)\s*$/); const urlIndex = tagLine ? index + 3 : index + 2; const url = (lines[urlIndex] ?? "").match(/^\s+(https:\/\/store\.steampowered\.com\/app\/(\d+))\s*$/); if (!title || !detail || !url) continue; const raw = [line, lines[index + 1], ...(tagLine ? [lines[index + 2]] : []), lines[urlIndex]].join("\n"); let end = urlIndex + 1; if (lines[end] === "") end += 1; const detailLabels = detail[4].split(",").map(clean).filter(Boolean); const embeddedTags = !tagLine && hasLegacyCommunityTags(detailLabels, legacyInitialization); const tags = tagLine ? (clean(tagLine[1]) === "尚未補齊社群標籤" ? [] : normalizeTags(tagLine[1].split(","))) : (embeddedTags ? normalizeTags(detailLabels) : []); const badges = clean(title[3]).split("|").map(clean).filter(Boolean); add(entries, occurrences, "games", section, raw, index, end, { title: clean(title[1]), originalTitle: clean(title[2]), badges, chineseSupport: chineseSupport(badges), releaseDate: detail[1], score: Number(detail[2]), reviews: Number(detail[3].replace(/,/g, "")), genres: embeddedTags ? [] : detailLabels, tags, month: section.month, appid: url[2], url: url[1] }); index = end - 1; } return entries; }

export function parseReport(media, content) { if (!validMedia.has(media)) throw new Error("不支援的清單類型"); const lines = content.split(/\r?\n/); const entries = media === "games" ? games(lines, /^# Steam 歷史初始化預覽\s*$/m.test(content)) : media === "anime" ? anime(lines) : movies(lines); const sections = [...new Map(entries.map((entry) => [entry.sectionKey, { key: entry.sectionKey, label: entry.periodLabel, year: entry.year, month: entry.month ?? null, season: entry.season ?? null }])).values()]; return { entries, sections, lines, eol: content.includes("\r\n") ? "\r\n" : "\n" }; }
