import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildImdbRatingIndex } from "./sources/imdb.js";
import { TmdbClient } from "./sources/tmdb.js";
import { filterByTaiwanSubscription } from "./availability.js";
import { WESTERN_COUNTRIES } from "./classifier.js";
import { createWikidataNameResolver } from "./names.js";
import { buildRegionalSelections } from "./pipeline.js";
import { REGION_KEYS } from "./schema.js";
import { scoreCandidate } from "./scoring.js";
import { DEFAULT_OUTPUT_FILE, INITIAL_BACKFILL_MONTHS, OBSERVATION_DELAY_MONTHS, defaultCachePaths } from "./config.js";
import { formatMonthSection, loadReportSections, writeMonthReport } from "./writer.js";

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const ORIGINS = Object.freeze({
  kr: ["KR"], jp: ["JP"], tw: ["TW"], cn: ["CN"], western: [...WESTERN_COUNTRIES]
});

function asUtcMonth(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function addMonths(date, count) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + count, 1));
}

function monthInfo(date) {
  const start = asUtcMonth(date);
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
  const key = start.toISOString().slice(0, 7);
  return { key, year: start.getUTCFullYear(), month: start.getUTCMonth() + 1, startDate: key + "-01", endDate: end.toISOString().slice(0, 10) };
}

export function observationEndMonth(referenceDate = new Date(), delayMonths = OBSERVATION_DELAY_MONTHS) {
  return monthInfo(addMonths(asUtcMonth(referenceDate), -delayMonths));
}

export function monthsEndingAt(endMonth, count = INITIAL_BACKFILL_MONTHS) {
  return Array.from({ length: count }, (_, index) => monthInfo(addMonths(
    new Date(Date.UTC(endMonth.year, endMonth.month - 1, 1)), index - count + 1
  )));
}

function parseMonthKey(key) {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(key ?? "");
  return match ? { year: Number(match[1]), month: Number(match[2]) } : null;
}

/** 已有報告由最早月份補到觀察期終點；全新報告則回補最近 12 個月。 */
export function pendingMonths(sections, { referenceDate = new Date(), delayMonths = OBSERVATION_DELAY_MONTHS, initialMonths = INITIAL_BACKFILL_MONTHS } = {}) {
  const end = observationEndMonth(referenceDate, delayMonths);
  const endIndex = end.year * 12 + end.month - 1;
  const existing = [...sections.keys()]
    .map(parseMonthKey)
    .filter(Boolean)
    .filter(({ year, month }) => year * 12 + month - 1 <= endIndex);
  if (existing.length === 0) return monthsEndingAt(end, initialMonths);

  const start = existing.reduce((earliest, current) => (
    current.year * 12 + current.month < earliest.year * 12 + earliest.month ? current : earliest
  ));
  const result = [];
  for (let current = new Date(Date.UTC(start.year, start.month - 1, 1)); current <= new Date(Date.UTC(end.year, end.month - 1, 1)); current = addMonths(current, 1)) {
    const info = monthInfo(current);
    if (!sections.has(info.key)) result.push(info);
  }
  return result;
}

export function parseCliArgs(argv) {
  const options = { dryRun: false, outputFile: DEFAULT_OUTPUT_FILE, month: null, imdbRatingsFile: null };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--dry-run") options.dryRun = true;
    else if (value === "--output") options.outputFile = argv[++index];
    else if (value === "--month") options.month = argv[++index];
    else if (value === "--imdb-ratings") options.imdbRatingsFile = argv[++index];
    else throw new Error(`不支援的參數：${value}`);
  }
  if (!options.outputFile) throw new Error("--output 需要檔案路徑。");
  if (options.month && !parseMonthKey(options.month)) throw new Error("--month 必須為 YYYY-MM。");
  return options;
}

async function collectMonthCandidates(client, month, { candidateConcurrency = 4 } = {}) {
  const discovered = [];
  for (const region of REGION_KEYS) {
    discovered.push(...await client.discoverMonth({ ...month, originCountries: ORIGINS[region] }));
  }
  const unique = new Map();
  for (const item of discovered) if (Number.isInteger(item?.id) && !unique.has(item.id)) unique.set(item.id, item);
  const candidates = [];
  const items = [...unique.values()];
  for (let index = 0; index < items.length; index += candidateConcurrency) {
    candidates.push(...await Promise.all(items
      .slice(index, index + candidateConcurrency)
      .map((item) => client.getCandidate(item))));
  }
  return candidates;
}

async function defaultProcessMonth(month, { client, imdbRatingsFile, wikidataResolver }) {
  const candidates = await collectMonthCandidates(client, month);
  let imdbIndex = new Map();
  if (imdbRatingsFile) {
    const targetIds = candidates.map((candidate) => candidate.externalIds?.imdbId).filter(Boolean);
    imdbIndex = (await buildImdbRatingIndex({ input: imdbRatingsFile, targetIds })).ratings;
  }
  const result = await buildRegionalSelections(candidates, { imdbIndex, wikidataResolver });
  const availability = await filterByTaiwanSubscription(result.selections, {
    getWatchProviders: (tmdbId) => client.getWatchProviders(tmdbId)
  });
  return { ...result, selections: availability.selections, availabilityExcluded: availability.excluded, candidates };
}

function previewExclusions(candidates) {
  return (candidates ?? []).flatMap((candidate) => {
    const scored = scoreCandidate(candidate);
    return scored.exclusionReasons.length > 0
      ? [`TMDb ${scored.tmdbId}：排除 ${scored.exclusionReasons.join(", ")}`]
      : [];
  });
}

/** 正式模式每完成一月立即原子寫入；預覽完全不寫入。 */
export async function runUpdate({
  outputFile = DEFAULT_OUTPUT_FILE,
  dryRun = false,
  requestedMonth = null,
  referenceDate = new Date(),
  updatedAt = referenceDate.toISOString().slice(0, 10),
  client = null,
  imdbRatingsFile = null,
  wikidataResolver = null,
  processMonth = null,
  log = () => {}
} = {}) {
  const sections = loadReportSections(outputFile);
  const observationEnd = observationEndMonth(referenceDate);
  const requested = requestedMonth ? monthInfo(new Date(`${requestedMonth}-01T00:00:00Z`)) : null;
  if (requested && !dryRun && requested.key > observationEnd.key) {
    throw new Error(`正式更新只能處理至 ${observationEnd.key}；較新月份請使用 --dry-run。`);
  }
  const months = requested ? [requested] : pendingMonths(sections, { referenceDate });
  const runtimeClient = processMonth ? client : (client ?? new TmdbClient({ cacheFile: defaultCachePaths().tmdb }));
  const runtimeResolver = processMonth ? wikidataResolver : (wikidataResolver ?? createWikidataNameResolver({ cacheFile: defaultCachePaths().wikidata }));
  const process = processMonth ?? ((month) => defaultProcessMonth(month, {
    client: runtimeClient, imdbRatingsFile, wikidataResolver: runtimeResolver
  }));
  const results = [];

  for (const month of months) {
    if (!dryRun && sections.has(month.key)) {
      results.push({ key: month.key, written: false, section: sections.get(month.key) });
      log(`已跳過 ${month.key}`);
      continue;
    }
    const processed = await process(month);
    const selections = Array.isArray(processed) ? processed : processed.selections ?? [];
    const section = formatMonthSection({ ...month, selections, updatedAt });
    if (dryRun) {
      log(`預覽 ${month.key}\n${section}`);
      for (const exclusion of previewExclusions(processed.candidates)) log(exclusion);
      results.push({ key: month.key, written: false, preview: section });
      continue;
    }
    const written = writeMonthReport(outputFile, { ...month, selections, updatedAt });
    results.push(written);
    log(`${written.written ? "已寫入" : "已跳過"} ${month.key}`);
  }
  runtimeClient?.flushCache?.();
  return { months, results };
}

async function main() {
  const options = parseCliArgs(process.argv.slice(2));
  const result = await runUpdate({
    outputFile: options.outputFile,
    dryRun: options.dryRun,
    requestedMonth: options.month,
    imdbRatingsFile: options.imdbRatingsFile,
    log: (line) => console.log(line)
  });
  console.log(`${options.dryRun ? "預覽" : "更新"}完成：${result.months.length} 個月份。`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

export { PACKAGE_ROOT };
