const DEFAULT_OPTIONS = Object.freeze({
  from: "2015-01",
  through: "2026-02",
  minimumPositivePct: 85,
  minimumTotalReviewsExclusive: 500,
  nearPositivePctDelta: 0.5
});

const EXCLUSIONS = [
  { code: "free_to_play", ids: [], names: ["free to play", "free-to-play", "free game"] },
  { code: "software", ids: [], names: ["utilities", "design & illustration", "web publishing", "software training", "education", "audio production", "video production", "software"] },
  { code: "mmorpg", ids: [1753], names: ["mmorpg", "massively multiplayer role-playing game"] },
  { code: "moba", ids: [1718], names: ["moba", "multiplayer online battle arena"] },
  { code: "massively_multiplayer", ids: [20, 128], names: ["massively multiplayer", "massively-multiplayer", "mmo"] },
  { code: "pvp", ids: [], names: ["pvp", "player versus player", "player-vs-player"] }
];
const ENGLISH_MONTHS = Object.freeze({ Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06", Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12" });

function compareText(left, right) {
  return String(left).localeCompare(String(right), "en");
}

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‐‑–—]/g, "-")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function parseCollection(value) {
  if (Array.isArray(value)) return value;
  if (value == null || value === "") return [];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      try {
        const parsed = JSON.parse(value.replace(/'/g, '"'));
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // FronkonGames 的複合欄位有時是 Python 風格字串；退回分隔文字。
      }
    }
    return value.split(/[;,|]/).map((item) => item.trim()).filter(Boolean);
  }
  return [value];
}

export function normalizeTaxonomy(value) {
  const values = [];
  for (const item of parseCollection(value)) {
    if (typeof item === "object" && item !== null) {
      const id = item.id ?? item.ID ?? item.tagid ?? null;
      const name = item.description ?? item.name ?? item.label ?? "";
      values.push({ id: id == null ? null : String(id), name: normalizeText(name) });
    } else {
      const text = String(item).trim();
      const idMatch = text.match(/^\d+$/);
      values.push({ id: idMatch ? text : null, name: idMatch ? "" : normalizeText(text) });
    }
  }
  return values
    .filter((entry) => entry.id || entry.name)
    .sort((left, right) => compareText(`${left.id ?? ""}:${left.name}`, `${right.id ?? ""}:${right.name}`));
}

function parseInteger(value) {
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value);
  return null;
}

function normalizeMonth(value) {
  const match = String(value ?? "").trim().match(/^(\d{4})[-/]?(\d{1,2})(?:[-/]\d{1,2})?$/);
  if (match) {
    const month = Number(match[2]);
    if (month >= 1 && month <= 12) return `${match[1]}-${String(month).padStart(2, "0")}`;
  }
  // 固定 FronkonGames 資料集的正式欄位使用英文月份，例如 "Aug 1, 2023"。
  const englishDate = String(value ?? "").trim().match(/^([A-Z][a-z]{2})\s+\d{1,2},\s+(\d{4})$/);
  return englishDate && ENGLISH_MONTHS[englishDate[1]] ? `${englishDate[2]}-${ENGLISH_MONTHS[englishDate[1]]}` : null;
}

function normalizeDate(value) {
  const numericDate = String(value ?? "").trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (numericDate) {
    const month = Number(numericDate[2]);
    const day = Number(numericDate[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${numericDate[1]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
  const englishDate = String(value ?? "").trim().match(/^([A-Z][a-z]{2})\s+(\d{1,2}),\s+(\d{4})$/);
  if (!englishDate || !ENGLISH_MONTHS[englishDate[1]]) return null;
  const day = Number(englishDate[2]);
  return day >= 1 && day <= 31 ? `${englishDate[3]}-${ENGLISH_MONTHS[englishDate[1]]}-${String(day).padStart(2, "0")}` : null;
}

function valuesFor(row, key) {
  return normalizeTaxonomy(row[key]);
}

function findExclusions(row) {
  const sources = ["genres", "categories", "tags"];
  const reasons = [];
  for (const rule of EXCLUSIONS) {
    const matches = [];
    for (const source of sources) {
      for (const value of valuesFor(row, source)) {
        if (rule.ids.includes(Number(value.id)) || rule.names.includes(value.name)) {
          matches.push(`${source}:${value.id ?? value.name}`);
        }
      }
    }
    if (matches.length) reasons.push(`${rule.code}:${matches.sort(compareText).join(",")}`);
  }
  return reasons.sort(compareText);
}

function normalizedRow(row) {
  const sourceReleaseDate = row.releaseDate ?? row["Release date"];
  return {
    appid: parseInteger(row.appid ?? row.AppID),
    name: String(row.name ?? row.Name ?? "").trim(),
    releaseMonth: normalizeMonth(sourceReleaseDate),
    releaseDate: normalizeDate(sourceReleaseDate),
    positive: parseInteger(row.positive ?? row.Positive),
    negative: parseInteger(row.negative ?? row.Negative),
    genres: valuesFor(row, "genres" in row ? "genres" : "Genres"),
    categories: valuesFor(row, "categories" in row ? "categories" : "Categories"),
    tags: valuesFor(row, "tags" in row ? "tags" : "Tags"),
    price: row.price ?? row.Price ?? null
  };
}

function sortResult(left, right) {
  return compareText(String(left.appid ?? ""), String(right.appid ?? ""));
}

export function selectFirstRound(row, suppliedOptions = {}) {
  const options = { ...DEFAULT_OPTIONS, ...suppliedOptions };
  const normalized = normalizedRow(row);
  const reasons = [];
  if (normalized.appid == null || normalized.appid <= 0) {
    return { ...normalized, status: "excluded", reasons: ["invalid_appid"] };
  }
  if (!normalized.releaseMonth) reasons.push("invalid_release_date");
  else if (normalized.releaseMonth < options.from || normalized.releaseMonth > options.through) reasons.push("outside_date_range");

  if (normalized.positive == null || normalized.negative == null || normalized.positive < 0 || normalized.negative < 0) {
    reasons.push("invalid_review_counts");
  }
  const totalReviews = normalized.positive == null || normalized.negative == null
    ? null
    : normalized.positive + normalized.negative;
  // 使用者最終決定：固定來源的 0/0 資料不進候選、不補外部資料，直接捨棄。
  if (totalReviews === 0) return { ...normalized, totalReviews, positivePct: null, status: "excluded", reasons: ["zero_total_reviews_discarded"] };
  const positivePct = totalReviews && totalReviews > 0
    ? (normalized.positive / totalReviews) * 100
    : null;

  const missingReasons = reasons.filter((reason) => reason !== "outside_date_range");
  if (missingReasons.length) return { ...normalized, totalReviews, positivePct, status: "missing", reasons: missingReasons.sort(compareText) };
  if (reasons.includes("outside_date_range")) return { ...normalized, totalReviews, positivePct, status: "excluded", reasons };

  const exclusionReasons = findExclusions({ genres: normalized.genres, categories: normalized.categories, tags: normalized.tags });
  if (exclusionReasons.length) return { ...normalized, totalReviews, positivePct, status: "excluded", reasons: exclusionReasons };

  const nearPercentage = positivePct < options.minimumPositivePct
    && positivePct >= options.minimumPositivePct - options.nearPositivePctDelta;
  if (nearPercentage) {
    return { ...normalized, totalReviews, positivePct, status: "excluded", reasons: ["positive_pct_near_threshold_discarded"] };
  }
  if (positivePct < options.minimumPositivePct) {
    return { ...normalized, totalReviews, positivePct, status: "excluded", reasons: ["positive_pct_below_threshold"] };
  }
  if (totalReviews <= options.minimumTotalReviewsExclusive) {
    return { ...normalized, totalReviews, positivePct, status: "excluded", reasons: [totalReviews === options.minimumTotalReviewsExclusive ? "review_count_at_threshold_discarded" : "review_count_below_threshold"] };
  }
  return { ...normalized, totalReviews, positivePct, status: "candidate", reasons: [] };
}

export function selectFirstRoundAll(rows, options = {}) {
  const results = Array.from(rows, (row) => selectFirstRound(row, options)).sort(sortResult);
  return {
    candidates: results.filter((result) => result.status === "candidate"),
    excluded: results.filter((result) => result.status === "excluded"),
    missing: results.filter((result) => result.status === "missing"),
    summary: {
      total: results.length,
      candidates: results.filter((result) => result.status === "candidate").length,
      excluded: results.filter((result) => result.status === "excluded").length,
      missing: results.filter((result) => result.status === "missing").length
    }
  };
}

/**
 * 第二輪只採用商店頁能證實的排除訊號；評論數仍固定使用 FronkonGames。
 * 硬性欄位若缺失，不能把 unknown 當作否，必須交由呼叫端列為待重試。
 */
export function selectSecondRound(firstRound, details) {
  const unknownFields = ["isFree", "hasInAppPurchases", "hasMMO", "vrMode", "isEarlyAccess"]
    .filter((field) => details?.[field] == null || details[field] === "unknown");
  if (details && ["age_gate", "incomplete_200"].includes(details.pageState)) {
    return { status: "excluded", reasons: [`store_page_unavailable:${details.pageState}`] };
  }
  if (!details || details.retry || details.pageState !== "complete") {
    return { status: "retry", reasons: details?.reasons?.length ? details.reasons : ["store_page_unavailable"] };
  }
  if (unknownFields.length) return { status: "retry", reasons: unknownFields.map((field) => `unknown_${field}`) };

  const reasons = [];
  if (details.isFree === true) reasons.push("free_to_play:store_page");
  if (details.hasInAppPurchases === true) reasons.push("in_app_purchases:store_page");
  if (details.hasMMO === true) reasons.push("massively_multiplayer:store_page");
  if (details.vrMode === "only") reasons.push("vr_only:store_page");
  if (details.isEarlyAccess === true) reasons.push("early_access:store_page");
  const tagReasons = findExclusions({
    genres: firstRound.genres,
    categories: firstRound.categories,
    tags: details.tagRecords?.length ? details.tagRecords : details.communityTags
  });
  reasons.push(...tagReasons);
  return reasons.length
    ? { status: "excluded", reasons: reasons.sort(compareText) }
    : { status: "passed", reasons: [] };
}
