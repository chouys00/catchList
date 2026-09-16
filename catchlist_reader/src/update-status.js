import fs from "node:fs";
import path from "node:path";

export const UPDATE_STATUS_FILE = ".catchlist-update-status.json";
const FILES = { anime: "動畫.md", movies: "電影.md", games: "遊戲.md", liveAction: "真人劇年度.md" };
const SEASONS = ["冬", "春", "夏", "秋"];

function period(media, year, value) {
  if (media === "anime") return { key: `${year}-Q${value}`, label: `${year} 年${SEASONS[value - 1]}季`, ordinal: year * 4 + value };
  if (media === "liveAction") return { key: `${year}`, label: `${year} 年全年度`, ordinal: year };
  return { key: `${year}-${String(value).padStart(2, "0")}`, label: `${year} 年 ${value} 月`, ordinal: year * 12 + value };
}

export function expectedPeriod(media, now = new Date()) {
  if (media === "liveAction") return null;
  if (media === "anime") {
    const target = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3 - 3, 1);
    return period(media, target.getFullYear(), Math.floor(target.getMonth() / 3) + 1);
  }
  const target = new Date(now.getFullYear(), now.getMonth() - 6, 1);
  return period(media, target.getFullYear(), target.getMonth() + 1);
}

/** 直接讀區段標題，因此沒有符合條件作品的月份／季度也算已收錄。 */
export function reportCoverage(media, content, now = new Date()) {
  const periods = new Map();
  for (const line of content.split(/\r?\n/)) {
    const match = media === "anime" ? line.match(/^(\d{4})\s+(冬|春|夏|秋)\s+>/)
      : media === "liveAction" ? line.match(/^(\d{4})\s+全年度(?:\s|$)/)
        : line.match(/^(\d{4})\s+(\d{1,2})月(?:\s|$)/);
    if (!match) continue;
    const value = media === "anime" ? SEASONS.indexOf(match[2]) + 1 : Number(match[2]);
    if (media !== "liveAction" && !(value >= 1 && value <= (media === "anime" ? 4 : 12))) continue;
    const entry = period(media, Number(match[1]), value);
    periods.set(entry.key, entry);
  }
  const latest = [...periods.values()].sort((a, b) => b.ordinal - a.ordinal)[0];
  const expected = expectedPeriod(media, now);
  return {
    latestLabel: latest?.label ?? null, latestKey: latest?.key ?? null,
    periodCount: periods.size, expectedLabel: expected?.label ?? null, expectedKey: expected?.key ?? null,
    // 判斷預期區段是否存在；最新區段較新不代表中間沒有缺漏。
    isCurrent: expected ? periods.has(expected.key) : null,
  };
}

export function readUpdateStatusFile(filepath) {
  let content;
  try { content = fs.readFileSync(filepath, "utf8"); }
  catch (error) { if (error.code === "ENOENT") return { version: 1, media: {} }; throw error; }
  const data = JSON.parse(content);
  if (data?.version !== 1 || !data.media || typeof data.media !== "object" || Array.isArray(data.media)) {
    throw new Error("更新紀錄格式不支援");
  }
  return data;
}

function timestamp(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
}

export function loadUpdateStatus(dataDir, { now = new Date() } = {}) {
  let saved = { media: {} };
  let warning = null;
  try { saved = readUpdateStatusFile(path.join(dataDir, UPDATE_STATUS_FILE)); }
  catch { warning = "無法讀取更新紀錄；報告仍可正常瀏覽。"; }
  const media = {};
  for (const [key, filename] of Object.entries(FILES)) {
    const raw = saved.media[key] ?? {};
    let content = "";
    let reportExists = false;
    try { content = fs.readFileSync(path.join(dataDir, filename), "utf8"); reportExists = true; }
    catch (error) { if (error.code !== "ENOENT") warning = "部分報告無法讀取，收錄進度暫時無法確認。"; }
    media[key] = {
      status: ["running", "success", "failed"].includes(raw.status) ? raw.status : "unknown",
      startedAt: timestamp(raw.startedAt), finishedAt: timestamp(raw.finishedAt), lastSuccessAt: timestamp(raw.lastSuccessAt),
      addedCount: Number.isInteger(raw.addedCount) && raw.addedCount >= 0 ? raw.addedCount : null,
      error: typeof raw.error === "string" ? raw.error : null,
      coverage: reportCoverage(key, content, now), reportExists,
    };
  }
  return { version: 1, warning, media };
}
