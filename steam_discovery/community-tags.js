import fs from "node:fs";
import path from "node:path";
import { delay } from "@catchlist/core";

const EMPTY_STORE = Object.freeze({
  version: 1,
  locale: "tchinese",
  games: {}
});

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

function normalizeTags(tags) {
  const normalized = [];

  for (const rawTag of Array.isArray(tags) ? tags : []) {
    if (typeof rawTag !== "string") {
      continue;
    }
    const tag = rawTag.replace(/\s+/g, " ").trim();
    if (!tag || normalized.includes(tag)) {
      continue;
    }
    normalized.push(tag);
    if (normalized.length === 20) {
      break;
    }
  }

  return normalized;
}

function createEmptyStore() {
  return {
    version: EMPTY_STORE.version,
    locale: EMPTY_STORE.locale,
    games: {}
  };
}

function validStoreRoot(store) {
  return store
    && typeof store === "object"
    && !Array.isArray(store)
    && store.version === 1
    && store.locale === "tchinese"
    && store.games
    && typeof store.games === "object"
    && !Array.isArray(store.games);
}

function normalizeGameRecords(games) {
  const normalizedGames = {};

  for (const [appid, entry] of Object.entries(games)) {
    if (!APPID_REGEX.test(appid)
      || !entry
      || typeof entry !== "object"
      || Array.isArray(entry)
      || !Array.isArray(entry.tags)
      || entry.tags.some((tag) => typeof tag !== "string")
      || typeof entry.fetchedAt !== "string"
      || !entry.fetchedAt.trim()) {
      continue;
    }

    normalizedGames[appid] = {
      tags: normalizeTags(entry.tags),
      fetchedAt: entry.fetchedAt
    };
  }

  return normalizedGames;
}

export function parseCommunityTags(html) {
  const tags = [];

  for (const match of String(html ?? "").matchAll(APP_TAG_REGEX)) {
    const tag = decodeHtml(match[1].replace(/<[^>]+>/g, " "))
      .replace(/\s+/g, " ")
      .trim();

    if (!tag || tags.includes(tag)) {
      continue;
    }

    tags.push(tag);
    if (tags.length === 20) {
      break;
    }
  }

  return tags;
}

export function loadTagStore(filepath) {
  if (!filepath || !fs.existsSync(filepath)) {
    return createEmptyStore();
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(filepath, "utf8"));
    if (!validStoreRoot(parsed)) {
      return createEmptyStore();
    }

    return {
      version: 1,
      locale: "tchinese",
      games: normalizeGameRecords(parsed.games)
    };
  } catch {
    return createEmptyStore();
  }
}

export function saveTagStore(filepath, store) {
  const directory = path.dirname(filepath);
  const tempFilepath = path.join(
    directory,
    `.${path.basename(filepath)}.${process.pid}.${Date.now()}.tmp`
  );
  const normalized = {
    version: 1,
    locale: "tchinese",
    games: loadTagStoreFromObject(store).games
  };

  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(tempFilepath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  fs.renameSync(tempFilepath, filepath);
}

function loadTagStoreFromObject(store) {
  if (!validStoreRoot(store)) {
    return createEmptyStore();
  }

  return {
    version: 1,
    locale: "tchinese",
    games: normalizeGameRecords(store.games)
  };
}

export async function backfillCommunityTags({
  appids,
  filepath,
  fetchTags,
  wait = delay,
  now = () => new Date().toISOString()
}) {
  const store = loadTagStore(filepath);
  const validAppids = [];
  const seen = new Set();
  const failed = [];
  let fetched = 0;
  let skipped = 0;
  let requested = 0;

  for (const appid of Array.isArray(appids) ? appids : []) {
    if (!APPID_REGEX.test(String(appid)) || seen.has(String(appid))) {
      continue;
    }
    seen.add(String(appid));
    validAppids.push(String(appid));
  }

  for (const appid of validAppids) {
    const existingTags = store.games[appid]?.tags;
    if (Array.isArray(existingTags) && existingTags.length > 0) {
      skipped += 1;
      continue;
    }

    if (requested > 0) {
      await wait(1500);
    }
    requested += 1;

    let tags = null;
    try {
      tags = await fetchTags(appid);
    } catch {
      tags = null;
    }

    const normalizedTags = normalizeTags(tags);
    if (normalizedTags.length === 0) {
      failed.push(appid);
      continue;
    }

    store.games[appid] = {
      tags: normalizedTags,
      fetchedAt: now()
    };
    saveTagStore(filepath, store);
    fetched += 1;
  }

  return { fetched, skipped, failed };
}
