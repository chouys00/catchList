import fs from "node:fs";
import path from "node:path";
import { delay } from "@catchlist/core";

export const MISSING_COMMUNITY_TAGS = "尚未補齊社群標籤";
export const COMMUNITY_TAG_PREFIX = "社群標籤:";

const APP_TAG_REGEX = /<a[^>]*class="[^"]*app_tag[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
const APPID_REGEX = /^\d+$/;

function decodeHtml(value) {
  return String(value)
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, num) => String.fromCodePoint(parseInt(num, 10)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

export function normalizeCommunityTags(tags) {
  const normalized = [];

  for (const rawTag of Array.isArray(tags) ? tags : []) {
    if (typeof rawTag !== "string") continue;
    const tag = rawTag.replace(/\s+/g, " ").trim();
    if (!tag || normalized.includes(tag)) continue;
    normalized.push(tag);
    if (normalized.length === 20) break;
  }

  return normalized;
}

export function parseCommunityTags(html) {
  const tags = [];

  for (const match of String(html ?? "").matchAll(APP_TAG_REGEX)) {
    const tag = decodeHtml(match[1].replace(/<[^>]+>/g, " "))
      .replace(/\s+/g, " ")
      .trim();
    if (!tag || tags.includes(tag)) continue;
    tags.push(tag);
    if (tags.length === 20) break;
  }

  return tags;
}

function parseTagLine(line) {
  const match = String(line ?? "").match(/^\s+社群標籤:\s*(.*)\s*$/);
  if (!match || match[1].replace(/\s+/g, " ").trim() === MISSING_COMMUNITY_TAGS) return [];
  return normalizeCommunityTags(match[1].split(","));
}

export function parseReportCommunityTags(content) {
  const source = String(content ?? "");
  const lines = source.split(/\r?\n/);
  const legacyInitialization = /^# Steam 歷史初始化預覽\s*$/m.test(source);
  const games = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (!/^- \*\*(.+?)\*\* \((.*)\)(?: \[(.*)\])?\s*$/.test(lines[index])) continue;
    const detail = (lines[index + 1] ?? "").match(/^\s+\d{4}-\d{2}-\d{2} \| \d+% \([\d,]+\) \| (.+)\s*$/);
    if (!detail) continue;
    const tagLineIndex = /^\s+社群標籤:/.test(lines[index + 2] ?? "") ? index + 2 : null;
    const urlIndex = tagLineIndex == null ? index + 2 : index + 3;
    const url = (lines[urlIndex] ?? "").match(/^\s+https:\/\/store\.steampowered\.com\/app\/(\d+)\s*$/);
    if (!url || !APPID_REGEX.test(url[1])) continue;
    const tags = tagLineIndex == null
      ? (legacyInitialization ? normalizeCommunityTags(detail[1].split(",")) : [])
      : parseTagLine(lines[tagLineIndex]);
    games.push({ appid: url[1], tags, tagLineIndex, urlIndex });
    index = urlIndex;
  }

  return { lines, games, eol: source.includes("\r\n") ? "\r\n" : "\n" };
}

function atomicWrite(filepath, content) {
  const directory = path.dirname(filepath);
  const temporary = path.join(directory, `.${path.basename(filepath)}.${process.pid}.${Date.now()}.tmp`);
  try {
    fs.writeFileSync(temporary, content, "utf8");
    fs.renameSync(temporary, filepath);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

function replaceCommunityTags(content, appid, tags) {
  const parsed = parseReportCommunityTags(content);
  const game = parsed.games.find((entry) => entry.appid === String(appid));
  if (!game) throw new Error(`遊戲報告找不到 AppID ${appid}`);
  const value = tags.length ? tags.join(", ") : MISSING_COMMUNITY_TAGS;
  const line = `  ${COMMUNITY_TAG_PREFIX} ${value}`;
  if (game.tagLineIndex == null) parsed.lines.splice(game.urlIndex, 0, line);
  else parsed.lines[game.tagLineIndex] = line;
  return parsed.lines.join(parsed.eol);
}

export async function backfillCommunityTags({ filepath, fetchTags, wait = delay }) {
  if (!filepath || !fs.existsSync(filepath)) throw new Error(`找不到既有遊戲報告：${filepath}`);
  let content = fs.readFileSync(filepath, "utf8");
  const initial = parseReportCommunityTags(content);
  const pending = initial.games.filter((game) => game.tags.length === 0);
  const failed = [];
  let fetched = 0;
  let requested = 0;

  for (const game of pending) {
    if (requested > 0) await wait(1500);
    requested += 1;
    let tags = null;
    try {
      tags = await fetchTags(game.appid);
    } catch {
      tags = null;
    }
    const normalized = normalizeCommunityTags(tags);
    content = replaceCommunityTags(content, game.appid, normalized);
    atomicWrite(filepath, content);
    if (normalized.length) fetched += 1;
    else failed.push(game.appid);
  }

  return { fetched, skipped: initial.games.length - pending.length, failed };
}
