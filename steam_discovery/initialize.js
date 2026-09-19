import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Command } from "commander";
import { FRONKON_DATASET, downloadFronkonDataset, loadFronkonDataset } from "./fronkon-dataset.js";
import { createInitializationCache } from "./initialization-cache.js";
import { selectFirstRound, selectSecondRound } from "./initialization-selection.js";
import { getStorePageDetails } from "./store-page-fetcher.js";
import { parseStorePageDetails, STORE_PAGE_PARSER_VERSION } from "./store-page-details.js";
import { MISSING_COMMUNITY_TAGS } from "./community-tags.js";

const MODULE_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
export const INITIALIZATION_OUTPUT_ROOT = path.join(MODULE_DIRECTORY, "preview", "initialization");
const OUTPUT_FILES = Object.freeze({
  report: "遊戲.md",
  summary: "初始化摘要.json",
  excluded: "排除明細.json",
  missing: "評論缺失.json",
  retry: "待重試.json"
});

function compareAppid(left, right) { return String(left.appid).localeCompare(String(right.appid), "en"); }
function compareMonth(left, right) { return `${left.releaseMonth}:${left.appid}`.localeCompare(`${right.releaseMonth}:${right.appid}`, "en"); }

function assertMonth(value, option) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(value))) throw new Error(`${option} 必須是 YYYY-MM。`);
  return value;
}

export function resolveInitializationOutput(output, outputRoot = INITIALIZATION_OUTPUT_ROOT) {
  const safeRoot = path.resolve(outputRoot);
  const candidate = path.resolve(output || safeRoot);
  if (candidate !== safeRoot) {
    throw new Error(`初始化輸出只能是 ${safeRoot}。`);
  }
  return candidate;
}

function atomicWrite(filepath, value) {
  fs.mkdirSync(path.dirname(filepath), { recursive: true });
  const temporary = `${filepath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, value, "utf8");
  fs.renameSync(temporary, filepath);
}

function parseOptions(argv) {
  const program = new Command();
  program
    .option("--from <month>", "起始月份 YYYY-MM", "2015-01")
    .option("--through <month>", "結束月份 YYYY-MM", "2026-02")
    .option("--dataset <filepath>", "已驗證的 FronkonGames CSV")
    .option("--output <directory>", "初始化專用輸出資料夾")
    .option("--resume", "保留並使用既有快取續跑")
    .option("--offline", "只使用既有快取，不發出商店頁請求")
    .option("--sample-limit <count>", "只處理前幾筆第一輪候選，供固定樣本驗證使用");
  program.parse(argv);
  return program.opts();
}

function outputRecord(first, details, second, fetchedAt) {
  return {
    appid: String(first.appid),
    name: details.title,
    sourceName: first.name,
    releaseMonth: first.releaseMonth,
    releaseDate: first.releaseDate,
    positivePct: first.positivePct,
    totalReviews: first.totalReviews,
    positive: first.positive,
    negative: first.negative,
    communityTags: details.tagRecords?.length ? details.tagRecords : details.communityTags,
    genres: first.genres,
    supportsChinese: details.supportTChinese === true || details.supportSChinese === true,
    fetchedAt,
    status: second.status,
    reasons: second.reasons
  };
}

function markdown(records) {
  const grouped = new Map();
  for (const record of records.sort(compareMonth)) {
    const entries = grouped.get(record.releaseMonth) ?? [];
    entries.push(record);
    grouped.set(record.releaseMonth, entries);
  }
  const generatedOn = new Date().toISOString().slice(0, 10);
  const lines = ["# Steam 歷史初始化預覽", ""];
  for (const [month, games] of [...grouped].sort(([left], [right]) => left.localeCompare(right))) {
    const [year, rawMonth] = month.split("-");
    lines.push(`${year}  ${Number(rawMonth)}月  (更新時間: ${generatedOn})`, "");
    for (const game of games) {
      const displayName = game.name || game.sourceName;
      const originalName = game.sourceName || displayName;
      const genres = taxonomyNames(game.genres).join(", ") || "未分類";
      const tags = tagNames(game).join(", ") || MISSING_COMMUNITY_TAGS;
      const chineseSupport = chineseSupportLabel(game);
      lines.push(`- **${displayName}** (${originalName}) [AppID: ${game.appid} | 中文支援: ${chineseSupport}]`);
      lines.push(`  ${game.releaseDate} | ${Math.round(game.positivePct)}% (${game.totalReviews.toLocaleString("en-US")}) | ${genres}`);
      lines.push(`  社群標籤: ${tags}`);
      lines.push(`  https://store.steampowered.com/app/${game.appid}`, "");
    }
    lines.push("------------------------------", "");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

function chineseSupportLabel(game) {
  if (game.supportsChinese === true) return "支援中文";
  return "中文支援待確認";
}

function tagNames(record) {
  const seen = new Set();
  const values = [];
  for (const tag of record.communityTags ?? []) {
    const name = typeof tag === "string" ? tag : tag?.name;
    const normalized = String(name ?? "").replace(/\s+/g, " ").trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    values.push(normalized);
    if (values.length === 20) break;
  }
  return values;
}

function taxonomyNames(records) {
  return (records ?? [])
    .map((record) => typeof record === "string" ? record : record?.name)
    .map((name) => String(name ?? "").trim())
    .filter(Boolean);
}

function dedupeCandidates(rows) {
  const selected = new Map();
  for (const row of rows) {
    if (!selected.has(String(row.appid))) selected.set(String(row.appid), row);
  }
  return [...selected.values()].sort(compareAppid);
}

/** 可注入相依，讓端到端測試不需連網。 */
export async function runInitialization({
  argv = process.argv,
  logger = console,
  datasetExpected = FRONKON_DATASET,
  loadDataset = loadFronkonDataset,
  downloadDataset = downloadFronkonDataset,
  createCache = createInitializationCache,
  getDetails = getStorePageDetails,
  outputRoot = INITIALIZATION_OUTPUT_ROOT
} = {}) {
  const options = parseOptions(argv);
  const from = assertMonth(options.from, "--from");
  const through = assertMonth(options.through, "--through");
  if (from > through) throw new Error("--from 不可晚於 --through。");
  const output = resolveInitializationOutput(options.output, outputRoot);
  const sampleLimit = options.sampleLimit == null ? null : Number(options.sampleLimit);
  if (sampleLimit != null && (!Number.isSafeInteger(sampleLimit) || sampleLimit <= 0)) throw new Error("--sample-limit 必須是正整數。");

  const dataset = path.resolve(options.dataset || path.join(output, "fronkon-games.csv"));
  if (!options.dataset && !fs.existsSync(dataset)) {
    logger.log(`下載固定 FronkonGames 資料集至 ${dataset}`);
    await downloadDataset(dataset, { expected: datasetExpected });
  }
  const first = { candidates: [], excluded: [], missing: [] };
  let loadedRows = 0;
  for await (const row of loadDataset({ filepath: dataset, expected: datasetExpected })) {
    loadedRows += 1;
    const result = selectFirstRound(row, { from, through });
    first[result.status === "candidate" ? "candidates" : result.status]?.push(result);
    if (loadedRows % 10000 === 0) logger.log(`第一輪已讀取 ${loadedRows} 筆資料。`);
  }
  const candidates = dedupeCandidates(first.candidates);
  const limited = sampleLimit == null ? candidates : candidates.slice(0, sampleLimit);
  logger.log(`第一輪完成：候選 ${candidates.length} 筆，排除 ${first.excluded.length} 筆，資料缺失 ${first.missing.length} 筆。`);
  const cache = createCache(path.join(output, "cache"));
  const passed = [];
  const secondExcluded = [];
  const retry = [];
  let processed = 0;
  for (const candidate of limited) {
    processed += 1;
    try {
      const cached = options.offline ? cache.loadStructured(candidate.appid, STORE_PAGE_PARSER_VERSION) : null;
      const raw = options.offline && !cached && typeof cache.loadRaw === "function"
        ? cache.loadRaw(candidate.appid)
        : null;
      const details = cached
        ? cached.details
        : raw
          ? { ...parseStorePageDetails(raw.html, { appid: candidate.appid, status: raw.status }), parserVersion: STORE_PAGE_PARSER_VERSION }
          : options.offline
            ? { pageState: "offline_cache_missing", retry: true, reasons: ["offline_cache_missing"] }
            : (await getDetails(candidate.appid, { cache })).details;
      if (raw && typeof cache.saveStructured === "function") cache.saveStructured(candidate.appid, details, raw.fetchedAt);
      const result = selectSecondRound(candidate, details);
      const structured = typeof cache.loadStructured === "function"
        ? cache.loadStructured(candidate.appid, STORE_PAGE_PARSER_VERSION)
        : null;
      const record = outputRecord(candidate, details, result, structured?.parsedAt ?? new Date().toISOString());
      if (result.status === "passed") passed.push(record);
      else if (result.status === "excluded") secondExcluded.push(record);
      else retry.push(record);
    } catch (error) {
      retry.push({ appid: String(candidate.appid), releaseMonth: candidate.releaseMonth, status: "retry", reasons: ["store_request_failed"], error: error.message });
    }
    if (processed % 100 === 0 || processed === limited.length) logger.log(`第二輪已處理 ${processed}/${limited.length} 筆候選。`);
  }
  cache.flush?.();
  const excluded = [...first.excluded.map((record) => ({ ...record, finalStatus: "first_round_excluded" })), ...secondExcluded]
    .sort(compareAppid);
  const missing = first.missing.map((record) => ({ ...record, finalStatus: "review_missing" })).sort(compareAppid);
  const summary = {
    schemaVersion: 1, source: { revision: datasetExpected.revision, sha256: datasetExpected.sha256 },
    range: { from, through }, resume: Boolean(options.resume), sampleLimit,
    totals: { loaded: first.candidates.length + first.excluded.length + first.missing.length, firstRoundCandidates: candidates.length, processedCandidates: limited.length, passed: passed.length, excluded: excluded.length, reviewMissing: missing.length, retry: retry.length }
  };
  atomicWrite(path.join(output, OUTPUT_FILES.report), markdown(passed));
  atomicWrite(path.join(output, OUTPUT_FILES.summary), `${JSON.stringify(summary, null, 2)}\n`);
  atomicWrite(path.join(output, OUTPUT_FILES.excluded), `${JSON.stringify(excluded, null, 2)}\n`);
  atomicWrite(path.join(output, OUTPUT_FILES.missing), `${JSON.stringify(missing, null, 2)}\n`);
  atomicWrite(path.join(output, OUTPUT_FILES.retry), `${JSON.stringify(retry.sort(compareAppid), null, 2)}\n`);
  logger.log(`初始化完成：通過 ${passed.length} 筆，排除 ${excluded.length} 筆，評論缺失 ${missing.length} 筆，待重試 ${retry.length} 筆。`);
  return { output, passed, excluded, missing, retry, summary };
}

async function main(argv = process.argv) { return runInitialization({ argv }); }
const direct = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (direct) main().catch((error) => { console.error(`初始化失敗：${error.message}`); process.exitCode = 1; });
