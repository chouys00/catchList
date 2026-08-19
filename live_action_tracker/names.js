import fs from "node:fs";
import path from "node:path";
import axios from "axios";

export const WIKIDATA_LANGUAGE_PRIORITY = Object.freeze(["zh-tw", "zh-hant", "zh-hk"]);
const WIKIDATA_ENDPOINT = "https://www.wikidata.org/w/api.php";

function isRetryableWikidataError(error) {
  const status = error?.response?.status;
  return status == null || status === 429 || status >= 500;
}

function cleanName(value) {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return cleaned || null;
}

function tmdbName(translations, language) {
  return translations.find((entry) => entry?.iso_639_1 === "zh" && entry?.iso_3166_1 === language)
    ?.data?.name ?? null;
}

export function selectTraditionalChineseName(candidate, wikidataName = null) {
  for (const language of ["TW", "HK"]) {
    const name = cleanName(tmdbName(candidate.translations ?? [], language));
    if (name) return { displayName: name, nameSource: `tmdb-zh-${language.toLowerCase()}` };
  }
  const wiki = cleanName(wikidataName);
  if (wiki) return { displayName: wiki, nameSource: "wikidata" };
  return { displayName: cleanName(candidate.originalName) ?? `TMDb ${candidate.tmdbId}`, nameSource: "original" };
}

export function selectWikidataName(labels) {
  if (typeof labels === "string") return cleanName(labels);
  const entries = Array.isArray(labels)
    ? labels.map((label) => [String(label?.language ?? label?.lang ?? "").toLowerCase(), label?.value])
    : Object.entries(labels ?? {}).map(([language, value]) => [language.toLowerCase(), value?.value ?? value]);
  for (const language of WIKIDATA_LANGUAGE_PRIORITY) {
    const match = entries.find(([entryLanguage]) => entryLanguage === language);
    const name = cleanName(match?.[1]);
    if (name) return name;
  }
  return null;
}

export async function fetchWikidataLabels(wikidataId, {
  transport = axios.get,
  timeoutMs = 8_000,
  retries = 3,
  baseDelayMs = 500,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
} = {}) {
  if (!/^Q\d+$/.test(String(wikidataId ?? ""))) return {};
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await transport(WIKIDATA_ENDPOINT, {
        params: {
          action: "wbgetentities",
          ids: wikidataId,
          props: "labels",
          languages: WIKIDATA_LANGUAGE_PRIORITY.join("|"),
          languagefallback: "0",
          format: "json",
          origin: "*"
        },
        headers: { Accept: "application/json", "User-Agent": "CatchList/1.0" },
        timeout: timeoutMs
      });
      return response?.data?.entities?.[wikidataId]?.labels ?? {};
    } catch (error) {
      lastError = error;
      if (!isRetryableWikidataError(error) || attempt === retries) throw error;
      await sleep(baseDelayMs * (2 ** attempt));
    }
  }
  throw lastError;
}

export function createWikidataNameResolver({ cacheFile, fetchName = fetchWikidataLabels, now = () => Date.now(), ttlMs = 30 * 24 * 60 * 60 * 1000 } = {}) {
  if (typeof fetchName !== "function") throw new TypeError("Wikidata resolver 需要 fetchName 函式。");
  const file = cacheFile ?? path.join(process.cwd(), ".cache", "wikidata-names.json");
  let cache = {};
  try { cache = JSON.parse(fs.readFileSync(file, "utf8")); } catch { /* 尚無快取 */ }
  const save = () => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temporary = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(cache), "utf8");
    fs.renameSync(temporary, file);
  };
  return async function resolve(wikidataId) {
    if (!wikidataId) return null;
    const cached = cache[wikidataId];
    if (cached && now() - cached.savedAt < ttlMs) return cached.name ?? null;
    let name = null;
    try { name = selectWikidataName(await fetchName(wikidataId)); } catch { name = null; }
    cache[wikidataId] = { savedAt: now(), name };
    save();
    return name;
  };
}
