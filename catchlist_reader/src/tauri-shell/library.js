const validMedia = new Set(["games", "anime", "movies", "liveAction"]);

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

export function renderTagWarningNotice(warning) {
  if (!warning) return "";
  return `<p class="tag-sidecar-warning" role="status">${escapeHtml(warning)}。目前仍可使用報告內的遊戲類型。</p>`;
}

function clean(value) { return String(value ?? "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim(); }
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

export function parseGameTagSidecar(sidecar) {
  const empty = () => ({ games: new Map(), warning: null });
  if (!sidecar?.exists) return empty();
  if (typeof sidecar.content !== "string") return { games: new Map(), warning: "無法讀取遊戲標籤：檔案內容無法讀取" };
  try {
    const payload = JSON.parse(sidecar.content);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("檔案格式不正確");
    if (payload.version !== 1) throw new Error(`不支援的 sidecar 版本：${payload.version ?? "缺少版本"}`);
    if (payload.locale !== "tchinese") throw new Error(`不支援的 sidecar 語系：${payload.locale ?? "缺少語系"}`);
    if (!payload.games || typeof payload.games !== "object" || Array.isArray(payload.games)) throw new Error("games 欄位格式不正確");
    const games = new Map();
    const warnings = [];
    for (const [appid, entry] of Object.entries(payload.games)) {
      if (!/^\d+$/.test(appid)) { warnings.push(`AppID 格式不正確：${appid}`); continue; }
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) { warnings.push(`AppID ${appid} 的資料格式不正確`); continue; }
      if (!Array.isArray(entry.tags) || entry.tags.some((tag) => typeof tag !== "string")) { warnings.push(`AppID ${appid} 的 tags 格式不正確`); continue; }
      if (typeof entry.fetchedAt !== "string" || !entry.fetchedAt.trim()) { warnings.push(`AppID ${appid} 缺少 fetchedAt`); continue; }
      games.set(appid, normalizeTags(entry.tags));
    }
    return { games, warning: warnings.length ? `遊戲標籤部分資料無法讀取：${warnings.join("；")}` : null };
  } catch (error) {
    return { games: new Map(), warning: `無法讀取遊戲標籤：${error.message}` };
  }
}
function makeId(media, sectionKey, raw, occurrence) {
  let a = 0x811c9dc5; let b = 0x9e3779b9;
  for (const char of `${media}\0${sectionKey}\0${raw}\0${occurrence}`) { a = Math.imul(a ^ char.charCodeAt(0), 0x01000193); b = Math.imul(b ^ char.charCodeAt(0), 0x85ebca6b); }
  return [a, b, a ^ b].map((value) => (value >>> 0).toString(16).padStart(8, "0")).join("");
}
function add(entries, occurrences, media, section, raw, start, end, fields) { const key = `${section.key}\0${raw}`; const occurrence = occurrences.get(key) ?? 0; occurrences.set(key, occurrence + 1); entries.push({ id: makeId(media, section.key, raw, occurrence), media, sectionKey: section.key, periodLabel: section.label, year: section.year, lineStart: start, lineEnd: end, ...fields }); }
function anime(lines) { const entries = []; const occurrences = new Map(); let section; lines.forEach((line, index) => { const heading = line.match(/^(\d{4})\s+(春|夏|秋|冬)\s+>[\d.]+/); if (heading) { section = { key: `${heading[1]}-${heading[2]}`, label: `${heading[1]} 年${heading[2]}季`, year: Number(heading[1]), season: heading[2] }; return; } const match = section && line.match(/^- (.+?)\s+\*\*(\d+(?:\.\d+)?)\*\*\s+\(([^·)]+)\s*·\s*([^)]+)\)\s*$/); if (match) add(entries, occurrences, "anime", section, line, index, index + 1, { title: clean(match[1]), score: Number(match[2]), episodes: clean(match[3]), format: clean(match[4]), season: section.season, searchUrl: `https://www.google.com/search?q=${encodeURIComponent(`${clean(match[1])} 動畫`)}` }); }); return entries; }
function movies(lines) { const entries = []; const occurrences = new Map(); let section; lines.forEach((line, index) => { const heading = line.match(/^(\d{4})\s+(\d{1,2})月\s+>[\d.]+/); if (heading) { const month = Number(heading[2]); section = { key: `${heading[1]}-${String(month).padStart(2, "0")}`, label: `${heading[1]} 年 ${month} 月`, year: Number(heading[1]), month }; return; } const match = section && line.match(/^- (.+?)\s+\*\*(\d+(?:\.\d+)?)\*\*\s+`\(IMDb:\s*([\d.]+)\s*\|\s*(.+?)\s+\(([+-]\d+(?:\.\d+)?)\)\s*\|\s*([^)]+)\)`\s*$/); if (match) add(entries, occurrences, "movies", section, line, index, index + 1, { title: clean(match[1]), score: Number(match[2]), imdbScore: Number(match[3]), category: clean(match[4]), adjustment: Number(match[5]), votesLabel: clean(match[6]), searchUrl: `https://www.google.com/search?q=${encodeURIComponent(`${clean(match[1])} 電影`)}` }); }); return entries; }
function liveAction(lines) { const entries = []; const occurrences = new Map(); let section; let region; lines.forEach((line, index) => { const heading = line.match(/^(\d{4})\s+全年度(?:\s+\([^)]*\))?\s*$/); if (heading) { section = { key: `${heading[1]}-00`, label: `${heading[1]} 全年度`, year: Number(heading[1]) }; region = null; return; } const regionHeading = line.match(/^##\s+(.+?)\s*$/); if (section && regionHeading) { region = clean(regionHeading[1]); return; } const match = section && region && line.match(/^- (?:\[(.+?)\]\((https:\/\/www\.imdb\.com\/title\/[^)]+)\)|(.+?))：(IMDb：資料不足|(?:IMDb：)?([\d.]+)／10（([\d,]+)\s*票）)\s*$/); if (match) { const title = clean(match[1] ?? match[3]); add(entries, occurrences, "liveAction", section, line, index, index + 1, { title, region, imdbUrl: match[2] ?? null, imdbScore: match[5] == null ? null : Number(match[5]), imdbVotes: match[6] == null ? null : Number(match[6].replace(/,/g, "")), searchUrl: `https://www.google.com/search?q=${encodeURIComponent(`${title} 真人劇`)}` }); } }); return entries; }
function games(lines, tagState) { const entries = []; const occurrences = new Map(); let section; for (let index = 0; index < lines.length; index += 1) { const line = lines[index]; const heading = line.match(/^(\d{4})\s+(\d{1,2})月\s+/); if (heading) { const month = Number(heading[2]); section = { key: `${heading[1]}-${String(month).padStart(2, "0")}`, label: `${heading[1]} 年 ${month} 月`, year: Number(heading[1]), month }; continue; } const title = section && line.match(/^- \*\*(.+?)\*\* \((.*)\)(?: \[(.*)\])?\s*$/); const detail = (lines[index + 1] ?? "").match(/^\s+(\d{4}-\d{2}-\d{2}) \| (\d+)% \(([\d,]+)\) \| (.+)\s*$/); const url = (lines[index + 2] ?? "").match(/^\s+(https:\/\/store\.steampowered\.com\/app\/(\d+))\s*$/); if (!title || !detail || !url) continue; const raw = [line, lines[index + 1], lines[index + 2]].join("\n"); let end = index + 3; if (lines[end] === "") end += 1; add(entries, occurrences, "games", section, raw, index, end, { title: clean(title[1]), originalTitle: clean(title[2]), releaseDate: detail[1], score: Number(detail[2]), reviews: Number(detail[3].replace(/,/g, "")), genres: detail[4].split(",").map(clean).filter(Boolean), tags: [...(tagState.games.get(url[2]) ?? [])], month: section.month, appid: url[2], url: url[1] }); index = end - 1; } return entries; }

export function parseReport(media, content, tagState = null) { if (!validMedia.has(media)) throw new Error("不支援的清單類型"); const lines = content.split(/\r?\n/); const gameTags = tagState ?? parseGameTagSidecar(null); const entries = media === "games" ? games(lines, gameTags) : media === "anime" ? anime(lines) : media === "movies" ? movies(lines) : liveAction(lines); const sections = [...new Map(entries.map((entry) => [entry.sectionKey, { key: entry.sectionKey, label: entry.periodLabel, year: entry.year, month: entry.month ?? null, season: entry.season ?? null }])).values()]; return { entries, sections, lines, eol: content.includes("\r\n") ? "\r\n" : "\n", ...(media === "games" ? { tagWarning: gameTags.warning } : {}) }; }
export function removeEntry(media, content, id) { const report = parseReport(media, content); const entry = report.entries.find((item) => item.id === id); if (!entry) throw new Error("作品已變更或不存在，請重新載入清單"); const lines = [...report.lines]; lines.splice(entry.lineStart, entry.lineEnd - entry.lineStart); return lines.join(report.eol); }
