import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { classifyPlayerMode } from "./game-features.js";
import { readGameFeatures } from "./game-feature-store.js";
import { MANUAL_GAMES_FILE, readManualGames, manualEntry, manualJson, commitGameFiles, recoverGameTransaction, readOptional } from "./manual-games.js";

export const MEDIA_CONFIG = {
  games: { label: "遊戲", filename: "遊戲.md", unit: "款" },
  anime: { label: "動畫", filename: "動畫.md", unit: "部" },
  movies: { label: "電影", filename: "電影.md", unit: "部" },
  liveAction: { label: "真人劇", filename: "真人劇年度.md", unit: "部" },
};
export const HIDDEN_ENTRIES_FILE = ".catchlist-hidden.json";
export const FAVORITES_FILE = ".catchlist-favorites.json";
const MISSING_COMMUNITY_TAGS = "尚未補齊社群標籤";

function clean(value) {
  return String(value ?? "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

function normalizeTags(tags) {
  const seen = new Set();
  const normalized = [];
  for (const tag of tags) {
    const value = clean(tag);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    normalized.push(value);
    if (normalized.length === 20) break;
  }
  return normalized;
}

function parseChineseSupport(badges) {
  const value = badges.find((badge) => badge.startsWith("中文支援:"))
    ?.split(":").slice(1).join(":").trim();
  if (value === "支援中文") return "supported";
  if (value === "不支援中文") return "unsupported";
  return "unknown";
}

function createId(media, sectionKey, raw, occurrence) {
  return crypto
    .createHash("sha256")
    .update(`${media}\0${sectionKey}\0${raw}\0${occurrence}`)
    .digest("hex")
    .slice(0, 24);
}

function createHideKey(media, sectionKey, title, occurrence) {
  return JSON.stringify([media, sectionKey, title, occurrence]);
}

function parseVoteCount(raw) {
  const match = clean(raw).match(/([\d,.]+)\s*([kKmM萬]?)票/);
  if (!match) return null;
  const value = Number(match[1].replace(/,/g, ""));
  if (!Number.isFinite(value)) return null;
  const multiplier = match[2].toLowerCase() === "k" ? 1_000
    : match[2].toLowerCase() === "m" ? 1_000_000
      : match[2] === "萬" ? 10_000 : 1;
  return Math.round(value * multiplier);
}

function finalizeEntry(media, section, raw, occurrence, range, fields) {
  const hideKey = media === "games"
    ? JSON.stringify([media, fields.appid, "", 0])
    : createHideKey(media, section.key, fields.title, occurrence);
  const legacyHideKeys = media === "games" ? [] : (section.legacyKeys ?? [])
    .map((sectionKey) => createHideKey(media, sectionKey, fields.title, occurrence));
  return {
    id: createId(media, section.key, raw, occurrence),
    hideKey,
    ...(legacyHideKeys.length ? { legacyHideKeys } : {}),
    media,
    sectionKey: section.key,
    periodLabel: section.label,
    year: section.year,
    lineStart: range.start,
    lineEnd: range.end,
    ...fields,
  };
}

function parseAnime(lines) {
  const entries = [];
  const diagnostics = [];
  const occurrences = new Map();
  let section = null;
  let lastDatedSection = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const heading = line.match(/^(\d{4})\s+(春|夏|秋|冬)\s+>([\d.]+)/);
    if (heading) {
      section = {
        key: `${heading[1]}-${heading[2]}`,
        label: `${heading[1]} 年${heading[2]}季`,
        year: Number(heading[1]),
        season: heading[2],
        threshold: Number(heading[3]),
      };
      lastDatedSection = section;
      continue;
    }
    if (/^劇場版(?:\s|$)/.test(line)) {
      section = {
        key: "theatrical",
        label: "劇場版",
        year: null,
        season: "劇場版",
        legacyKeys: lastDatedSection ? [lastDatedSection.key] : [],
      };
      continue;
    }
    if (/\((?:更新|整理)時間[:：]/.test(line)) {
      diagnostics.push({ line: index + 1, reason: "動畫區段標題無法辨識", text: line });
      section = null;
      continue;
    }
    if (!section || !line.startsWith("- ")) continue;
    const match = line.match(/^- (.+?)\s+\*\*((?:\d+(?:\.\d+)?)|--|—)\*\*(?:\s+\(([^·)]+)\s*·\s*([^)]+)\))?\s*$/);
    if (!match) {
      diagnostics.push({ line: index + 1, reason: "動畫作品格式無法辨識", text: line });
      continue;
    }
    const occurrenceKey = `${section.key}\0${line}`;
    const occurrence = occurrences.get(occurrenceKey) ?? 0;
    occurrences.set(occurrenceKey, occurrence + 1);
    entries.push(finalizeEntry("anime", section, line, occurrence, { start: index, end: index + 1 }, {
      title: clean(match[1]),
      score: /^\d/.test(match[2]) ? Number(match[2]) : null,
      episodes: clean(match[3]) || null,
      format: clean(match[4]) || null,
      season: section.season,
      searchUrl: `https://www.google.com/search?q=${encodeURIComponent(`${clean(match[1])} 動畫`)}`,
    }));
  }
  return { entries, diagnostics };
}

function parseMovies(lines) {
  const entries = [];
  const diagnostics = [];
  const occurrences = new Map();
  let section = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const heading = line.match(/^(\d{4})\s+(\d{1,2})月\s+>([\d.]+)/);
    if (heading) {
      section = {
        key: `${heading[1]}-${String(heading[2]).padStart(2, "0")}`,
        label: `${heading[1]} 年 ${Number(heading[2])} 月`,
        year: Number(heading[1]),
        month: Number(heading[2]),
        threshold: Number(heading[3]),
      };
      continue;
    }
    if (/\((?:更新|整理)時間[:：]/.test(line)) {
      diagnostics.push({ line: index + 1, reason: "電影區段標題無法辨識", text: line });
      section = null;
      continue;
    }
    if (!section || !line.startsWith("- ")) continue;
    const match = line.match(/^- (.+?)\s+\*\*(\d+(?:\.\d+)?)\*\*\s+`\(IMDb:\s*([\d.]+)\s*\|\s*(.+?)\s+\(([+-]\d+(?:\.\d+)?)\)\s*\|\s*([^)]+)\)`\s*$/);
    if (!match) {
      diagnostics.push({ line: index + 1, reason: "電影作品格式無法辨識", text: line });
      continue;
    }
    const occurrenceKey = `${section.key}\0${line}`;
    const occurrence = occurrences.get(occurrenceKey) ?? 0;
    occurrences.set(occurrenceKey, occurrence + 1);
    entries.push(finalizeEntry("movies", section, line, occurrence, { start: index, end: index + 1 }, {
      title: clean(match[1]),
      score: Number(match[2]),
      imdbScore: Number(match[3]),
      category: clean(match[4]),
      adjustment: Number(match[5]),
      votesLabel: clean(match[6]),
      votes: parseVoteCount(match[6]),
      month: section.month,
      searchUrl: `https://www.google.com/search?q=${encodeURIComponent(`${clean(match[1])} 電影`)}`,
    }));
  }
  return { entries, diagnostics };
}

function parseLiveAction(lines) {
  const entries = [];
  const diagnostics = [];
  const occurrences = new Map();
  let section = null;
  let region = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const heading = line.match(/^(\d{4})\s+全年度(?:\s|$)/);
    if (heading) {
      section = { key: `${heading[1]}-00`, label: `${heading[1]} 年全年度`, year: Number(heading[1]) };
      region = null;
      continue;
    }
    if (/\((?:更新|整理)時間[:：]/.test(line)) {
      diagnostics.push({ line: index + 1, reason: "真人劇區段標題無法辨識", text: line });
      section = null;
      region = null;
      continue;
    }
    const regionHeading = line.match(/^##\s+(.+)\s*$/);
    if (section && regionHeading) {
      region = clean(regionHeading[1]);
      continue;
    }
    if (!section || !region || !line.startsWith("- ")) continue;
    const linked = line.match(/^- \[(.+?)\]\((https:\/\/www\.imdb\.com\/title\/[^)]+)\)：(?:IMDb：)?([\d.]+)／10（([\d,]+)\s*票）\s*$/);
    const unavailable = line.match(/^- (.+?)：IMDb：資料不足\s*$/);
    if (!linked && !unavailable) {
      diagnostics.push({ line: index + 1, reason: "真人劇作品格式無法辨識", text: line });
      continue;
    }
    const title = clean(linked?.[1] ?? unavailable[1]);
    const occurrenceKey = `${section.key}\0${line}`;
    const occurrence = occurrences.get(occurrenceKey) ?? 0;
    occurrences.set(occurrenceKey, occurrence + 1);
    const imdbScore = linked ? Number(linked[3]) : null;
    entries.push(finalizeEntry("liveAction", section, line, occurrence, { start: index, end: index + 1 }, {
      title,
      region,
      imdbScore,
      score: imdbScore ?? 0,
      votes: linked ? Number(linked[4].replace(/,/g, "")) : null,
      votesLabel: linked ? `${linked[4]} 票` : "資料不足",
      url: linked?.[2] ?? `https://www.google.com/search?q=${encodeURIComponent(`${title} 真人劇`)}`,
      hasImdbUrl: Boolean(linked),
    }));
  }
  return { entries, diagnostics };
}

function parseGames(lines, { legacyInitialization = false } = {}) {
  const entries = [];
  const diagnostics = [];
  const occurrences = new Map();
  let section = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const heading = line.match(/^(\d{4})\s+(\d{1,2})月\s+/);
    if (heading) {
      section = {
        key: `${heading[1]}-${String(heading[2]).padStart(2, "0")}`,
        label: `${heading[1]} 年 ${Number(heading[2])} 月`,
        year: Number(heading[1]),
        month: Number(heading[2]),
      };
      continue;
    }
    if (/\((?:更新|整理)時間[:：]/.test(line)) {
      diagnostics.push({ line: index + 1, reason: "遊戲區段標題無法辨識", text: line });
      section = null;
      continue;
    }
    if (!section || !line.startsWith("- **")) continue;
    const titleMatch = line.match(/^- \*\*(.+?)\*\* \((.*)\)(?: \[(.*)\])?\s*$/);
    const detailLine = lines[index + 1] ?? "";
    const tagLine = (lines[index + 2] ?? "").match(/^\s+社群標籤:\s*(.*)\s*$/);
    const urlIndex = tagLine ? index + 3 : index + 2;
    const urlLine = lines[urlIndex] ?? "";
    const detailMatch = detailLine.match(/^\s+(\d{4}-\d{2}-\d{2}) \| (\d+)% \(([\d,]+)\) \| (.+)\s*$/);
    const urlMatch = urlLine.match(/^\s+(https:\/\/store\.steampowered\.com\/app\/(\d+))\s*$/);
    if (!titleMatch || !detailMatch || !urlMatch) {
      diagnostics.push({ line: index + 1, reason: "遊戲作品格式無法辨識", text: line });
      continue;
    }
    const rawLines = tagLine ? [line, detailLine, lines[index + 2], urlLine] : [line, detailLine, urlLine];
    const raw = rawLines.join("\n");
    const occurrenceKey = `${section.key}\0${raw}`;
    const occurrence = occurrences.get(occurrenceKey) ?? 0;
    occurrences.set(occurrenceKey, occurrence + 1);
    let end = urlIndex + 1;
    if (lines[end] === "") end += 1;
    const badges = clean(titleMatch[3]).split("|").map(clean).filter(Boolean);
    entries.push(finalizeEntry("games", section, raw, occurrence, { start: index, end }, {
      title: clean(titleMatch[1]),
      originalTitle: clean(titleMatch[2]),
      badges,
      chineseSupport: parseChineseSupport(badges),
      officialFeatureIds: badges.some((badge) => badge.startsWith("商店功能:"))
        ? (badges.find((badge) => badge.startsWith("商店功能:"))?.slice(5).trim().split(",").filter(Boolean).map(Number) ?? []) : undefined,
      releaseDate: detailMatch[1],
      score: Number(detailMatch[2]),
      reviews: Number(detailMatch[3].replace(/,/g, "")),
      genres: legacyInitialization && !tagLine ? [] : detailMatch[4].split(",").map(clean).filter(Boolean),
      tags: tagLine
        ? (clean(tagLine[1]) === MISSING_COMMUNITY_TAGS ? [] : normalizeTags(tagLine[1].split(",")))
        : (legacyInitialization ? normalizeTags(detailMatch[4].split(",")) : []),
      month: section.month,
      appid: urlMatch[2],
      url: urlMatch[1],
    }));
    index = end - 1;
  }
  return { entries, diagnostics };
}

export function parseReport(media, content) {
  if (!MEDIA_CONFIG[media]) throw new Error(`不支援的清單類型：${media}`);
  const eol = content.includes("\r\n") ? "\r\n" : "\n";
  const lines = content.split(/\r?\n/);
  const parsed = media === "games" ? parseGames(lines, {
    legacyInitialization: /^# Steam 歷史初始化預覽\s*$/m.test(content),
  })
    : media === "anime" ? parseAnime(lines) : media === "movies" ? parseMovies(lines) : parseLiveAction(lines);
  const { entries, diagnostics } = parsed;
  const sections = [...new Map(entries.map((entry) => [entry.sectionKey, {
    key: entry.sectionKey,
    label: entry.periodLabel,
    year: entry.year,
    month: entry.month ?? null,
    season: entry.season ?? null,
  }])).values()];
  const integrityWarning = diagnostics.length
    ? `報告有 ${diagnostics.length} 處格式無法辨識（行號：${diagnostics.slice(0, 5).map((item) => item.line).join("、")}${diagnostics.length > 5 ? "…" : ""}），部分作品可能未顯示。`
    : null;
  return {
    media,
    entries,
    sections,
    eol,
    lines,
    integrity: { parsedCount: entries.length, issueCount: diagnostics.length, issues: diagnostics },
    integrityWarning,
  };
}

export function resolveReportPath(dataDir, media) {
  const base = path.resolve(dataDir);
  const target = path.resolve(base, MEDIA_CONFIG[media].filename);
  if (path.dirname(target) !== base) throw new Error("報告路徑超出資料資料夾");
  return target;
}

export function sourceEntries(dataDir, media, { strict = false, reportCache = null } = {}) {
  if (media === "games") recoverGameTransaction(dataDir);
  const filepath = resolveReportPath(dataDir, media);
  const content = reportCache ? null : readOptional(filepath);
  const parsed = reportCache ? reportCache.read(media, filepath) : { ...parseReport(media, content ?? ""), exists: content !== null };
  if (media !== "games") return parsed;
  let manual = [];
  let warning = null;
  try { manual = readManualGames(dataDir).entries; } catch (error) { if (strict) throw error; warning = error.message; }
  const merged = new Map(manual.map((record) => [record.appid, manualEntry(record)]));
  let features = {};
  try { features = readGameFeatures(dataDir); }
  catch { warning = [warning, "商店功能資料無法讀取，缺漏項目顯示未確認；原檔已保留"].filter(Boolean).join("；"); }
  for (const entry of parsed.entries) {
    const previous = merged.get(entry.appid);
    // 報告若重複收錄同款，以第一筆為準，個人狀態仍以 AppID 識別。
    if (previous?.reportSource) continue;
    merged.set(entry.appid, { ...entry, officialFeatureIds: entry.officialFeatureIds ?? previous?.officialFeatureIds,
      reportSource: true, manualAdded: Boolean(previous?.manualAdded), addedAt: previous?.addedAt });
  }
  const entries = [...merged.values()].map((entry) => {
    const officialFeatureIds = entry.officialFeatureIds ?? features[entry.appid]?.featureIds;
    return { ...entry, officialFeatureIds, playerMode: classifyPlayerMode(officialFeatureIds) };
  });
  return { ...parsed, entries, warning, exists: parsed.exists || manual.length > 0 };
}

function stateKeys(entry) {
  return [entry.hideKey, ...(entry.legacyHideKeys ?? [])];
}

export function loadLibrary(dataDir, media, hiddenKeys, favorites, reportCache = null) {
  const filepath = resolveReportPath(dataDir, media);
  const parsed = sourceEntries(dataDir, media, { reportCache });
  if (!parsed.exists && !parsed.warning) {
    return {
      ...MEDIA_CONFIG[media],
      media,
      filepath,
      exists: false,
      entries: [],
      sections: [],
      knownKeys: [],
    };
  }
  const stat = fs.existsSync(filepath) ? fs.statSync(filepath) : null;
  const effectiveHiddenKeys = hiddenKeys ?? new Set(readHiddenEntries(dataDir).map((entry) => entry.hideKey));
  const favoriteKeys = favorites ?? new Set(readFavorites(dataDir).map((entry) => entry.key));
  return {
    ...MEDIA_CONFIG[media],
    media,
    filepath,
    exists: parsed.exists,
    warning: parsed.warning,
    updatedAt: stat?.mtime.toISOString() ?? null,
    knownKeys: [...new Set(parsed.entries.flatMap(stateKeys))],
    entries: parsed.entries
      .filter((entry) => stateKeys(entry).every((key) => !effectiveHiddenKeys.has(key)))
      .map(({ lineStart, lineEnd, ...entry }) => ({ ...entry, favorite: stateKeys(entry).some((key) => favoriteKeys.has(key)) })),
    sections: parsed.sections,
  };
}

export function loadAllLibraries(dataDir, reportCache = null) {
  const hiddenKeys = new Set(readHiddenEntries(dataDir).map((entry) => entry.hideKey));
  const favorites = new Set(readFavorites(dataDir).map((entry) => entry.key));
  return Object.keys(MEDIA_CONFIG).map((media) => loadLibrary(dataDir, media, hiddenKeys, favorites, reportCache));
}

export function readFavorites(dataDir) {
  const filepath = path.join(path.resolve(dataDir), FAVORITES_FILE);
  if (!fs.existsSync(filepath)) return [];
  let parsed;
  try { parsed = JSON.parse(fs.readFileSync(filepath, "utf8")); }
  catch { throw new Error("收藏紀錄檔格式不正確，請先檢查檔案，原始紀錄尚未改動"); }
  if (parsed?.version !== 1 || !Array.isArray(parsed.entries)
    || parsed.entries.some((entry) => !entry || typeof entry.key !== "string" || !Object.hasOwn(MEDIA_CONFIG, entry.media))) {
    throw new Error("收藏紀錄檔格式不正確，請先檢查檔案，原始紀錄尚未改動");
  }
  return parsed.entries;
}

export function setFavorite(dataDir, media, entryId, favorite) {
  if (typeof favorite !== "boolean") throw new Error("收藏狀態不正確");
  const entry = sourceEntries(dataDir, media).entries.find((item) => item.id === entryId);
  if (!entry) throw new Error("作品已變更或不存在，請重新載入清單");
  const records = readFavorites(dataDir);
  const keys = new Set(stateKeys(entry));
  const exists = records.some((record) => keys.has(record.key));
  if (exists === favorite) return;
  const entries = favorite
    ? [...records, { key: entry.hideKey, media, title: entry.title, savedAt: new Date().toISOString() }]
    : records.filter((record) => !keys.has(record.key));
  atomicWrite(path.join(path.resolve(dataDir), FAVORITES_FILE), `${JSON.stringify({ version: 1, entries }, null, 2)}\n`);
}

export function loadHiddenEntries(dataDir, reportCache = null) {
  const records = readHiddenEntries(dataDir);
  const byMedia = new Map();
  return records.map((record) => {
    if (!byMedia.has(record.media)) {
      const entries = sourceEntries(dataDir, record.media, { reportCache }).entries;
      byMedia.set(record.media, new Map(entries.flatMap((entry) => stateKeys(entry).map((key) => [key, entry]))));
    }
    const entry = byMedia.get(record.media).get(record.hideKey);
    return { ...record, title: entry?.title ?? record.title, periodLabel: entry?.periodLabel ?? "", available: Boolean(entry) };
  }).sort((a, b) => String(b.hiddenAt).localeCompare(String(a.hiddenAt)));
}

export function restoreHiddenEntry(dataDir, hideKey) {
  if (typeof hideKey !== "string") throw new Error("隱藏紀錄不正確");
  return undoHide(dataDir, { hideKey });
}

function atomicWrite(filepath, content) {
  const dir = path.dirname(filepath);
  const temp = path.join(dir, `.${path.basename(filepath)}.${process.pid}.${Date.now()}.tmp`);
  try {
    fs.writeFileSync(temp, content, "utf8");
    fs.renameSync(temp, filepath);
  } finally {
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
}

export function readHiddenEntries(dataDir) {
  const filepath = path.join(path.resolve(dataDir), HIDDEN_ENTRIES_FILE);
  if (!fs.existsSync(filepath)) return [];
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(filepath, "utf8"));
  } catch {
    throw new Error("隱藏紀錄檔格式不正確");
  }
  if (parsed?.version !== 1 || !Array.isArray(parsed.entries)) {
    throw new Error("隱藏紀錄檔格式不正確");
  }
  return parsed.entries.filter((entry) =>
    entry && typeof entry.hideKey === "string" && Object.hasOwn(MEDIA_CONFIG, entry.media)
  );
}

function writeHiddenEntries(dataDir, entries) {
  const filepath = path.join(path.resolve(dataDir), HIDDEN_ENTRIES_FILE);
  atomicWrite(filepath, `${JSON.stringify({ version: 1, entries }, null, 2)}\n`);
  return filepath;
}

export function hideEntry(dataDir, media, entryId) {
  const parsed = sourceEntries(dataDir, media);
  const entry = parsed.entries.find((item) => item.id === entryId);
  if (!entry) throw new Error("作品已變更或不存在，請重新載入清單");

  const entries = readHiddenEntries(dataDir);
  const keys = new Set(stateKeys(entry));
  if (entries.some((item) => keys.has(item.hideKey))) {
    throw new Error("這部作品已隱藏");
  }
  const hiddenAt = new Date().toISOString();
  const record = { hideKey: entry.hideKey, media, title: entry.title, hiddenAt };
  const hiddenFilepath = writeHiddenEntries(dataDir, [...entries, record]);
  return {
    media,
    entryId,
    title: entry.title,
    hideKey: entry.hideKey,
    hiddenFilepath,
    hiddenAt,
  };
}

export function undoHide(dataDir, operation) {
  if (!operation?.hideKey) throw new Error("沒有可復原的隱藏操作");
  const entries = readHiddenEntries(dataDir);
  const nextEntries = entries.filter((entry) => entry.hideKey !== operation.hideKey);
  if (nextEntries.length === entries.length) throw new Error("隱藏紀錄已不存在");
  writeHiddenEntries(dataDir, nextEntries);
  return { media: operation.media, title: operation.title };
}

export function deleteEntry(dataDir, media, entryId) {
  if (media === "games") {
    const entry = sourceEntries(dataDir, media, { strict: true }).entries.find((item) => item.id === entryId);
    if (!entry) throw new Error("作品已變更或不存在，請重新載入清單");
    const changes = [];
    if (entry.reportSource) {
      const before = fs.readFileSync(resolveReportPath(dataDir, media), "utf8");
      const parsed = parseReport(media, before);
      for (const item of parsed.entries.filter((item) => item.appid === entry.appid).sort((a, b) => b.lineStart - a.lineStart)) parsed.lines.splice(item.lineStart, item.lineEnd - item.lineStart);
      changes.push({ name: "遊戲.md", before, after: parsed.lines.join(parsed.eol) });
    }
    if (entry.manualAdded) {
      const manual = readManualGames(dataDir);
      changes.push({ name: MANUAL_GAMES_FILE, before: manual.raw, after: manualJson(manual.entries.filter((item) => item.appid !== entry.appid)) });
    }
    commitGameFiles(dataDir, changes);
    return { media, entryId, title: entry.title };
  }
  const filepath = resolveReportPath(dataDir, media);
  if (!fs.existsSync(filepath)) throw new Error(`找不到 ${MEDIA_CONFIG[media].filename}`);
  const original = fs.readFileSync(filepath, "utf8");
  const parsed = parseReport(media, original);
  const entry = parsed.entries.find((item) => item.id === entryId);
  if (!entry) throw new Error("作品已變更或不存在，請重新載入清單");

  const nextLines = [...parsed.lines];
  nextLines.splice(entry.lineStart, entry.lineEnd - entry.lineStart);
  atomicWrite(filepath, nextLines.join(parsed.eol));
  return { media, entryId, title: entry.title };
}

export function hasReportFiles(directory) {
  if (!directory || !fs.existsSync(directory)) return false;
  return fs.existsSync(path.join(directory, MANUAL_GAMES_FILE)) || Object.values(MEDIA_CONFIG).some(({ filename }) => fs.existsSync(path.join(directory, filename)));
}
