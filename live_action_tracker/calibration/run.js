import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TmdbClient } from "../sources/tmdb.js";
import { evaluateLiveAction, WESTERN_COUNTRIES } from "../classifier.js";
import { REGION_KEYS } from "../schema.js";
import { buildCalibrationSummary, buildThresholdSettings } from "./statistics.js";

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const ORIGINS = {
  kr: ["KR"],
  jp: ["JP"],
  tw: ["TW"],
  cn: ["CN"],
  western: [...WESTERN_COUNTRIES]
};

function shiftMonth(date, offset) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1));
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

export function calibrationMonths(referenceDate = new Date()) {
  const currentMonth = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), 1));
  const eligibleEnd = shiftMonth(currentMonth, -6);
  return Array.from({ length: 24 }, (_, index) => {
    const start = shiftMonth(eligibleEnd, index - 23);
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
    return { key: isoDate(start).slice(0, 7), startDate: isoDate(start), endDate: isoDate(end) };
  });
}

export function calibrationOutputPaths() {
  return {
    summary: path.join(PACKAGE_ROOT, "calibration", "calibration-summary.v2.json"),
    thresholds: path.join(PACKAGE_ROOT, "calibration", "thresholds.v2.json")
  };
}

export function parseCalibrationArgs(argv) {
  const options = { reuseCache: false };
  for (const value of argv) {
    if (value === "--reuse-cache") options.reuseCache = true;
    else throw new Error(`不支援的校準參數：${value}`);
  }
  return options;
}

function hasTraditionalChineseName(candidate) {
  return candidate.translations.some((entry) => entry?.iso_639_1 === "zh"
    && ["TW", "HK"].includes(entry?.iso_3166_1)
    && typeof entry?.data?.name === "string" && entry.data.name.trim() !== "");
}

export async function runCalibration({
  client = new TmdbClient(), referenceDate = new Date(), candidateConcurrency = 4
} = {}) {
  const months = calibrationMonths(referenceDate);
  const regionSamples = Object.fromEntries(REGION_KEYS.map((region) => [region, {
    samples: [], monthsCovered: 0, discoverCount: 0, detailsLoaded: 0, genrePresent: 0,
    traditionalChineseNames: 0
  }]));

  try {
    for (const region of REGION_KEYS) {
      const seen = new Set();
      for (const month of months) {
        const discovered = await client.discoverMonth({ ...month, originCountries: ORIGINS[region] });
        regionSamples[region].discoverCount += discovered.length;
        regionSamples[region].monthsCovered += 1;
        const uniqueItems = discovered.filter((item) => {
          if (seen.has(item.id)) return false;
          seen.add(item.id);
          return true;
        });
        for (let index = 0; index < uniqueItems.length; index += candidateConcurrency) {
          const candidates = await Promise.all(uniqueItems
            .slice(index, index + candidateConcurrency)
            .map((item) => client.getCandidate(item)));
          for (const candidate of candidates) {
            regionSamples[region].detailsLoaded += 1;
            if (candidate.genreIds.length > 0) regionSamples[region].genrePresent += 1;
            if (hasTraditionalChineseName(candidate)) regionSamples[region].traditionalChineseNames += 1;
            const classification = evaluateLiveAction(candidate);
            if (classification.accepted && classification.region === region) {
              regionSamples[region].samples.push({
                tmdbId: candidate.tmdbId,
                voteAverage: candidate.voteAverage,
                voteCount: candidate.voteCount
              });
            }
          }
        }
        client.flushCache?.();
      }
    }
  } finally {
    client.flushCache?.();
  }

  return buildCalibrationSummary(regionSamples, {
    generatedAt: new Date().toISOString(),
    window: { start: months[0].key, end: months.at(-1).key, monthCount: months.length }
  });
}

async function main() {
  const options = parseCalibrationArgs(process.argv.slice(2));
  const client = options.reuseCache
    ? new TmdbClient({ cacheTtlMs: Number.POSITIVE_INFINITY })
    : new TmdbClient();
  const summary = await runCalibration({ client });
  const { summary: summaryOutput, thresholds: thresholdsOutput } = calibrationOutputPaths();
  fs.writeFileSync(summaryOutput, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  fs.writeFileSync(thresholdsOutput, `${JSON.stringify(buildThresholdSettings(summary), null, 2)}\n`, "utf8");
  console.log(`校準摘要已寫入 ${summaryOutput}`);
  console.log(`門檻設定已寫入 ${thresholdsOutput}`);
  if (Object.values(summary.regions).some((region) => !region.sufficient)) process.exitCode = 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
