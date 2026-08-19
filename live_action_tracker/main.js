import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_OUTPUT_FILE } from "./config.js";
import { REGION_KEYS } from "./schema.js";
import { annualKey, formatYearSection, loadAnnualReportSections, writeAnnualReport } from "./writer.js";

export const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));

function parseYear(value) {
  if (!/^\d{4}$/.test(value ?? "")) return null;
  const year = Number(value);
  return year >= 1900 && year <= 9999 ? year : null;
}

function asOptionalImdbData(show, index) {
  const hasScore = show.imdbScore != null;
  const hasVotes = show.imdbVotes != null;
  if (hasScore !== hasVotes) throw new Error(`第 ${index + 1} 筆作品的 IMDb 分數與票數必須同時提供。`);
  if (!hasScore) return { imdbScore: null, imdbVotes: null };
  const imdbScore = Number(show.imdbScore);
  const imdbVotes = Number(show.imdbVotes);
  if (!Number.isFinite(imdbScore) || imdbScore < 0 || imdbScore > 10) {
    throw new Error(`第 ${index + 1} 筆作品的 IMDb 分數必須介於 0 到 10。`);
  }
  if (!Number.isInteger(imdbVotes) || imdbVotes < 0) {
    throw new Error(`第 ${index + 1} 筆作品的 IMDb 票數必須是非負整數。`);
  }
  return { imdbScore, imdbVotes };
}

function validateImdbUrl(value, index) {
  if (value == null) return null;
  if (typeof value !== "string") throw new Error(`第 ${index + 1} 筆作品的 IMDb 連結格式無效。`);
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`第 ${index + 1} 筆作品的 IMDb 連結格式無效。`);
  }
  if (url.protocol !== "https:" || url.hostname !== "www.imdb.com" || !/^\/title\/tt\d+\/?$/.test(url.pathname)) {
    throw new Error(`第 ${index + 1} 筆作品的 IMDb 連結必須是 imdb.com/title/tt...。`);
  }
  return url.toString();
}

/**
 * 讀取 AI 年度研究結果。這裡只驗證輸入結構，絕不以外部評分或票數決定是否入選。
 */
export function loadAnnualSelections(inputFile, year) {
  let source;
  try {
    source = JSON.parse(fs.readFileSync(inputFile, "utf8"));
  } catch (error) {
    throw new Error(`無法讀取年度清單：${error.message}`);
  }
  if (!source || typeof source !== "object" || Array.isArray(source)) throw new Error("年度清單必須是 JSON 物件。");
  if (source.year !== year) throw new Error(`年度清單的 year 必須是 ${year}。`);
  if (!Array.isArray(source.selections)) throw new Error("年度清單缺少 selections 陣列。");

  const countByRegion = new Map(REGION_KEYS.map((region) => [region, 0]));
  const seen = new Set();
  const selections = source.selections.map((show, index) => {
    if (!show || typeof show !== "object") throw new Error(`第 ${index + 1} 筆作品必須是物件。`);
    if (!REGION_KEYS.includes(show.region)) throw new Error(`第 ${index + 1} 筆作品的 region 無效。`);
    if (typeof show.title !== "string" || show.title.trim().length === 0) throw new Error(`第 ${index + 1} 筆作品缺少 title。`);
    const title = show.title.trim();
    const key = `${show.region}:${title}`;
    if (seen.has(key)) throw new Error(`同一地區不可重複列入「${title}」。`);
    seen.add(key);
    countByRegion.set(show.region, countByRegion.get(show.region) + 1);
    return {
      region: show.region,
      title,
      imdbUrl: validateImdbUrl(show.imdbUrl, index),
      ...asOptionalImdbData(show, index)
    };
  });
  for (const region of REGION_KEYS) {
    if (countByRegion.get(region) !== 10) throw new Error(`${region} 必須剛好有 10 部年度必看作品。`);
  }
  return {
    selections,
    selectedAt: typeof source.selectedAt === "string" ? source.selectedAt : null,
    imdbDataDate: typeof source.imdbDataDate === "string" ? source.imdbDataDate : null
  };
}

export function parseCliArgs(argv) {
  const options = { dryRun: false, outputFile: DEFAULT_OUTPUT_FILE, year: null, inputFile: null };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--dry-run") options.dryRun = true;
    else if (value === "--output") options.outputFile = argv[++index];
    else if (value === "--year") options.year = parseYear(argv[++index]);
    else if (value === "--input") options.inputFile = argv[++index];
    else throw new Error(`不支援的參數：${value}`);
  }
  if (!options.outputFile) throw new Error("--output 需要檔案路徑。");
  if (!options.year) throw new Error("--year 必須是四位數年份。");
  if (!options.inputFile) throw new Error("--input 需要 AI 年度清單 JSON 檔案路徑。");
  return options;
}

/** 同年度已寫入時立即略過，不讀取輸入、不重新取得資料，也不改寫既有內容。 */
export async function runAnnualUpdate({
  outputFile = DEFAULT_OUTPUT_FILE,
  dryRun = false,
  year,
  inputFile = null,
  processYear = null,
  log = () => {}
} = {}) {
  if (!parseYear(String(year ?? ""))) throw new Error("year 必須是四位數年份。");
  const sections = loadAnnualReportSections(outputFile);
  const key = annualKey(year);
  if (!dryRun && sections.has(key)) {
    log(`已跳過 ${year} 全年度：既有年度清單不更新。`);
    return { year, key, written: false, skipped: true, section: sections.get(key) };
  }
  const annual = processYear ? await processYear({ year, inputFile }) : loadAnnualSelections(inputFile, year);
  const section = formatYearSection({ year, ...annual });
  if (dryRun) {
    log(`預覽 ${year} 全年度\n${section}`);
    return { year, key, written: false, skipped: false, preview: section };
  }
  const written = writeAnnualReport(outputFile, { year, ...annual });
  log(`${written.written ? "已寫入" : "已跳過"} ${year} 全年度`);
  return { year, ...written, skipped: !written.written };
}

async function main() {
  const options = parseCliArgs(process.argv.slice(2));
  const result = await runAnnualUpdate({ ...options, log: (line) => console.log(line) });
  console.log(result.skipped ? "年度清單維持原樣。" : `${options.dryRun ? "預覽" : "更新"}完成：${options.year} 全年度。`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
