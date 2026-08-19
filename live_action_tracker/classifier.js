import { EXCLUSION_REASONS } from "./schema.js";

const EXCLUDED_GENRES = new Map([
  [16, EXCLUSION_REASONS.ANIMATION],
  [99, EXCLUSION_REASONS.DOCUMENTARY],
  [10763, EXCLUSION_REASONS.NEWS],
  [10764, EXCLUSION_REASONS.REALITY],
  [10767, EXCLUSION_REASONS.TALK]
]);

const SCRIPTED_TYPES = new Set(["Scripted", "Miniseries"]);
const ASIAN_PRIORITY = [["KR", "kr"], ["JP", "jp"], ["TW", "tw"], ["CN", "cn"]];

export const WESTERN_COUNTRIES = Object.freeze(new Set([
  "US", "CA", "MX", "AR", "BR", "CL", "CO", "PE", "UY", "GB", "IE", "FR", "DE",
  "ES", "PT", "IT", "NL", "BE", "LU", "CH", "AT", "DK", "NO", "SE", "FI", "IS",
  "PL", "CZ", "SK", "HU", "RO", "BG", "GR", "HR", "SI", "RS", "BA", "ME", "MK",
  "AL", "EE", "LV", "LT", "UA", "MD", "AU", "NZ"
]));

export function classifyRegion(originCountries) {
  if (!Array.isArray(originCountries) || originCountries.length === 0) return null;
  const countries = new Set(originCountries.map((code) => String(code).toUpperCase()));
  for (const [country, region] of ASIAN_PRIORITY) {
    if (countries.has(country)) return region;
  }
  return [...countries].some((country) => WESTERN_COUNTRIES.has(country)) ? "western" : null;
}

export function evaluateLiveAction(candidate) {
  const reasons = [];
  if (candidate.adult) reasons.push(EXCLUSION_REASONS.ADULT);
  if (!Array.isArray(candidate.genreIds) || candidate.genreIds.length === 0) {
    reasons.push(EXCLUSION_REASONS.MISSING_GENRES);
  } else {
    for (const genreId of candidate.genreIds) {
      const reason = EXCLUDED_GENRES.get(genreId);
      if (reason && !reasons.includes(reason)) reasons.push(reason);
    }
  }
  if (!candidate.type) {
    reasons.push(EXCLUSION_REASONS.MISSING_TYPE);
  } else if (!SCRIPTED_TYPES.has(candidate.type)) {
    reasons.push(EXCLUSION_REASONS.UNSCRIPTED_TYPE);
  }
  if (candidate.episodeCount === 1) reasons.push(EXCLUSION_REASONS.SINGLE_EPISODE);
  if (!Array.isArray(candidate.originCountries) || candidate.originCountries.length === 0) {
    reasons.push(EXCLUSION_REASONS.MISSING_ORIGIN_COUNTRY);
  }
  const region = classifyRegion(candidate.originCountries);
  if (candidate.originCountries?.length && !region) reasons.push(EXCLUSION_REASONS.UNSUPPORTED_REGION);

  return { accepted: reasons.length === 0, region, reasons };
}
