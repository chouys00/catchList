import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const MEDIA_CONFIG = {
  games: { label: "遊戲", filename: "遊戲.md", unit: "款" },
  anime: { label: "動畫", filename: "動畫.md", unit: "部" },
  movies: { label: "電影", filename: "電影.md", unit: "部" },
};
const GAME_TAGS_FILENAME = "遊戲標籤.json";

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

function createId(media, sectionKey, raw, occurrence) {
  return crypto
    .createHash("sha256")
    .update(`${media}\0${sectionKey}\0${raw}\0${occurrence}`)
    .digest("hex")
    .slice(0, 24);
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
  return {
    id: createId(media, section.key, raw, occurrence),
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
  const occurrences = new Map();
  let section = null;

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
      continue;
    }
    if (!section || !line.startsWith("- ")) continue;
    const match = line.match(/^- (.+?)\s+\*\*(\d+(?:\.\d+)?)\*\*\s+\(([^·)]+)\s*·\s*([^)]+)\)\s*$/);
    if (!match) continue;
    const occurrenceKey = `${section.key}\0${line}`;
    const occurrence = occurrences.get(occurrenceKey) ?? 0;
    occurrences.set(occurrenceKey, occurrence + 1);
    entries.push(finalizeEntry("anime", section, line, occurrence, { start: index, end: index + 1 }, {
      title: clean(match[1]),
      score: Number(match[2]),
      episodes: clean(match[3]),
      format: clean(match[4]),
      season: section.season,
      searchUrl: `https://www.google.com/search?q=${encodeURIComponent(`${clean(match[1])} 動畫`)}`,
    }));
  }
  return entries;
}

function parseMovies(lines) {
  const entries = [];
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
    if (!section || !line.startsWith("- ")) continue;
    const match = line.match(/^- (.+?)\s+\*\*(\d+(?:\.\d+)?)\*\*\s+`\(IMDb:\s*([\d.]+)\s*\|\s*(.+?)\s+\(([+-]\d+(?:\.\d+)?)\)\s*\|\s*([^)]+)\)`\s*$/);
    if (!match) continue;
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
  return entries;
}

function parseGames(lines) {
  const entries = [];
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
    if (!section || !line.startsWith("- **")) continue;
    const titleMatch = line.match(/^- \*\*(.+?)\*\* \((.*)\)(?: \[(.*)\])?\s*$/);
    const detailLine = lines[index + 1] ?? "";
    const urlLine = lines[index + 2] ?? "";
    const detailMatch = detailLine.match(/^\s+(\d{4}-\d{2}-\d{2}) \| (\d+)% \(([\d,]+)\) \| (.+)\s*$/);
    const urlMatch = urlLine.match(/^\s+(https:\/\/store\.steampowered\.com\/app\/(\d+))\s*$/);
    if (!titleMatch || !detailMatch || !urlMatch) continue;
    const raw = [line, detailLine, urlLine].join("\n");
    const occurrenceKey = `${section.key}\0${raw}`;
    const occurrence = occurrences.get(occurrenceKey) ?? 0;
    occurrences.set(occurrenceKey, occurrence + 1);
    let end = index + 3;
    if (lines[end] === "") end += 1;
    entries.push(finalizeEntry("games", section, raw, occurrence, { start: index, end }, {
      title: clean(titleMatch[1]),
      originalTitle: clean(titleMatch[2]),
      badges: clean(titleMatch[3]).split("|").map(clean).filter(Boolean),
      releaseDate: detailMatch[1],
      score: Number(detailMatch[2]),
      reviews: Number(detailMatch[3].replace(/,/g, "")),
      genres: detailMatch[4].split(",").map(clean).filter(Boolean),
      month: section.month,
      appid: urlMatch[2],
      url: urlMatch[1],
    }));
    index = end - 1;
  }
  return entries;
}

export function parseReport(media, content) {
  if (!MEDIA_CONFIG[media]) throw new Error(`不支援的清單類型：${media}`);
  const eol = content.includes("\r\n") ? "\r\n" : "\n";
  const lines = content.split(/\r?\n/);
  const entries = media === "games" ? parseGames(lines)
    : media === "anime" ? parseAnime(lines) : parseMovies(lines);
  const sections = [...new Map(entries.map((entry) => [entry.sectionKey, {
    key: entry.sectionKey,
    label: entry.periodLabel,
    year: entry.year,
    month: entry.month ?? null,
    season: entry.season ?? null,
  }])).values()];
  return { media, entries, sections, eol, lines };
}

export function resolveReportPath(dataDir, media) {
  const base = path.resolve(dataDir);
  const target = path.resolve(base, MEDIA_CONFIG[media].filename);
  if (path.dirname(target) !== base) throw new Error("報告路徑超出資料資料夾");
  return target;
}

export function isCanonicalPathInsideDirectory(directory, filepath) {
  const base = path.resolve(directory);
  const target = path.resolve(filepath);
  const relative = path.relative(base, target);
  return relative !== ""
    && relative !== ".."
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative);
}

function loadGameTags(dataDir) {
  const base = path.resolve(dataDir);
  const target = path.resolve(base, GAME_TAGS_FILENAME);
  if (path.dirname(target) !== base) throw new Error("標籤路徑超出資料資料夾");

  let metadata;
  try {
    metadata = fs.lstatSync(target);
  } catch (error) {
    if (error?.code === "ENOENT") return { games: {}, warning: null };
    return { games: {}, warning: `無法讀取遊戲標籤：${error.message}` };
  }

  try {
    if (metadata.isSymbolicLink() || !metadata.isFile()) {
      throw new Error("遊戲標籤檔不可為連結，且必須是一般檔案");
    }
    const canonicalBase = fs.realpathSync(base);
    const canonicalTarget = fs.realpathSync(target);
    if (!isCanonicalPathInsideDirectory(canonicalBase, canonicalTarget)) {
      throw new Error("遊戲標籤 canonical 路徑超出所選資料夾");
    }

    const payload = JSON.parse(fs.readFileSync(canonicalTarget, "utf8"));
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("檔案格式不正確");
    }
    if (payload.version !== 1) {
      throw new Error(`不支援的 sidecar 版本：${payload.version ?? "缺少版本"}`);
    }
    if (payload.locale !== "tchinese") {
      throw new Error(`不支援的 sidecar 語系：${payload.locale ?? "缺少語系"}`);
    }
    if (!payload.games || typeof payload.games !== "object" || Array.isArray(payload.games)) {
      throw new Error("games 欄位格式不正確");
    }

    const games = {};
    const warnings = [];
    for (const [appid, entry] of Object.entries(payload.games)) {
      if (!/^\d+$/.test(appid)) {
        warnings.push(`AppID 格式不正確：${appid}`);
        continue;
      }
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        warnings.push(`AppID ${appid} 的資料格式不正確`);
        continue;
      }
      if (!Array.isArray(entry.tags) || entry.tags.some((tag) => typeof tag !== "string")) {
        warnings.push(`AppID ${appid} 的 tags 格式不正確`);
        continue;
      }
      if (typeof entry.fetchedAt !== "string" || !entry.fetchedAt.trim()) {
        warnings.push(`AppID ${appid} 缺少 fetchedAt`);
        continue;
      }
      games[appid] = { tags: normalizeTags(entry.tags), fetchedAt: entry.fetchedAt };
    }
    return {
      games,
      warning: warnings.length ? `遊戲標籤部分資料無法讀取：${warnings.join("；")}` : null,
    };
  } catch (error) {
    return { games: {}, warning: `無法讀取遊戲標籤：${error.message}` };
  }
}

export function loadLibrary(dataDir, media) {
  const filepath = resolveReportPath(dataDir, media);
  const tagState = media === "games" ? loadGameTags(dataDir) : { games: {}, warning: null };
  if (!fs.existsSync(filepath)) {
    return {
      ...MEDIA_CONFIG[media],
      media,
      filepath,
      exists: false,
      entries: [],
      sections: [],
      tagWarning: tagState.warning,
    };
  }
  const content = fs.readFileSync(filepath, "utf8");
  const parsed = parseReport(media, content);
  const stat = fs.statSync(filepath);
  return {
    ...MEDIA_CONFIG[media],
    media,
    filepath,
    exists: true,
    updatedAt: stat.mtime.toISOString(),
    entries: parsed.entries.map(({ lineStart, lineEnd, ...entry }) => {
      if (media !== "games") return entry;
      return { ...entry, tags: [...(tagState.games[entry.appid]?.tags ?? [])] };
    }),
    sections: parsed.sections,
    tagWarning: tagState.warning,
  };
}

export function loadAllLibraries(dataDir) {
  return Object.keys(MEDIA_CONFIG).map((media) => loadLibrary(dataDir, media));
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
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

export function deleteEntry(dataDir, media, entryId) {
  const filepath = resolveReportPath(dataDir, media);
  if (!fs.existsSync(filepath)) throw new Error(`找不到 ${MEDIA_CONFIG[media].filename}`);
  const original = fs.readFileSync(filepath, "utf8");
  const parsed = parseReport(media, original);
  const entry = parsed.entries.find((item) => item.id === entryId);
  if (!entry) throw new Error("作品已變更或不存在，請重新載入清單");

  const backupDir = path.join(path.resolve(dataDir), ".catchlist-backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, `${MEDIA_CONFIG[media].filename}.${timestamp()}.${entry.id}.bak`);
  fs.copyFileSync(filepath, backupPath, fs.constants.COPYFILE_EXCL);

  const nextLines = [...parsed.lines];
  nextLines.splice(entry.lineStart, entry.lineEnd - entry.lineStart);
  atomicWrite(filepath, nextLines.join(parsed.eol));
  return {
    media,
    entryId,
    title: entry.title,
    filepath,
    backupPath,
    deletedAt: new Date().toISOString(),
  };
}

export function undoDelete(operation) {
  if (!operation?.filepath || !operation?.backupPath) throw new Error("沒有可復原的刪除操作");
  if (!fs.existsSync(operation.backupPath)) throw new Error("刪除備份已不存在");
  const content = fs.readFileSync(operation.backupPath, "utf8");
  atomicWrite(operation.filepath, content);
  return { media: operation.media, title: operation.title };
}

export function hasReportFiles(directory) {
  if (!directory || !fs.existsSync(directory)) return false;
  return Object.values(MEDIA_CONFIG).some(({ filename }) => fs.existsSync(path.join(directory, filename)));
}
