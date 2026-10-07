import { entriesForView } from "./personal-ui.js";

const titleCollator = new Intl.Collator("zh-Hant");
const descendingDate = (left, right) => left === right ? 0 : left < right ? 1 : -1;

function ratingBound(value) {
  return cleanText(value) === "" ? null : Number(value);
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function normalizedQuery(value) {
  return cleanText(value).toLocaleLowerCase("zh-Hant");
}

function reorderTags(tags, selectedTags) {
  const selected = [];
  const selectedSet = new Set(selectedTags.map((tag) => cleanText(tag)).filter(Boolean));
  const remaining = [];

  for (const tag of selectedTags) {
    const value = cleanText(tag);
    if (value && tags.includes(value) && !selected.includes(value)) selected.push(value);
  }

  for (const tag of tags) {
    const value = cleanText(tag);
    if (!value) continue;
    if (selectedSet.has(value)) continue;
    remaining.push(value);
  }

  return [...selected, ...remaining];
}

function gameSearchText(entry) {
  return `${entry.title ?? ""} ${entry.originalTitle ?? ""} ${entry.appid ?? ""}`.toLocaleLowerCase("zh-Hant");
}

function normalizeList(values) {
  return Array.isArray(values) ? values.map((value) => cleanText(value)).filter(Boolean) : [];
}

export function filterAndSortGames(entries, filters = {}, prepared = null) {
  const query = normalizedQuery(filters.query);
  const min = ratingBound(filters.min);
  const max = ratingBound(filters.max);
  const validRange = !ratingRangeError(filters);
  const minReviews = Number(filters.minReviews || 0);
  const selectedTags = normalizeList(filters.tags);

  return entries
    .filter((entry) => {
      if (filters.playerMode && filters.playerMode !== "all" && (entry.playerMode ?? "unknown") !== filters.playerMode) return false;
      if (filters.manualOnly === "manual" && !entry.manualAdded) return false;
      if (query && !(prepared?.get(entry)?.searchText ?? gameSearchText(entry)).includes(query)) return false;
      if (filters.newOnly && !entry.isNew) return false;
      if (filters.chinese && filters.chinese !== "all" && entry.chineseSupport !== filters.chinese) return false;
      if (validRange && (min !== null || max !== null) && (entry.score == null || (min !== null && entry.score < min) || (max !== null && entry.score > max))) return false;
      if (minReviews > 0 && (entry.reviews == null || entry.reviews < minReviews)) return false;
      const tags = prepared?.get(entry)?.tags ?? normalizeList(entry.tags);
      return selectedTags.every((tag) => tags.includes(tag));
    })
    .sort((left, right) => {
      const key = filters.sort === "score" ? "score" : filters.sort === "reviews" ? "reviews" : "releaseDate";
      if ((left[key] == null) !== (right[key] == null)) return left[key] == null ? 1 : -1;
      const direction = filters.sortDirection === "asc" ? -1 : 1;
      const primary = key === "releaseDate"
        ? descendingDate(String(left.releaseDate ?? ""), String(right.releaseDate ?? ""))
        : Number(right[key] ?? 0) - Number(left[key] ?? 0);
      if (primary) return direction * primary;
      return descendingDate(String(left.releaseDate ?? ""), String(right.releaseDate ?? ""))
        || Number(right.score ?? 0) - Number(left.score ?? 0)
        || Number(right.reviews ?? 0) - Number(left.reviews ?? 0)
        || titleCollator.compare(String(left.title ?? ""), String(right.title ?? ""));
    });
}

export function createTagIndex(entries) {
  const counts = new Map();
  for (const entry of entries) {
    for (const tag of new Set(normalizeList(entry.tags))) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return { counts };
}

export function collectTagOptionsFromIndex(index, selectedTags = [], query = "") {
  const counts = index?.counts instanceof Map ? index.counts : new Map();
  const selected = normalizeList(selectedTags);
  const selectedSet = new Set(selected);
  const tagQuery = normalizedQuery(query);

  const options = selected.map((tag) => ({
    tag,
    count: counts.get(tag) ?? 0,
    selected: true,
  }));

  const remaining = [...counts.entries()]
    .filter(([tag]) => !selectedSet.has(tag))
    .filter(([tag]) => !tagQuery || normalizedQuery(tag).includes(tagQuery))
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "zh-Hant"))
    .map(([tag, count]) => ({ tag, count, selected: false }));

  if (!tagQuery) return [...options, ...remaining];

  return [
    ...options,
    ...remaining,
  ].filter((option, index, array) => {
    if (index < options.length) return true;
    return array.findIndex((candidate) => candidate.tag === option.tag) === index;
  });
}

export function collectTagOptions(entries, selectedTags = [], query = "") {
  return collectTagOptionsFromIndex(createTagIndex(entries), selectedTags, query);
}

export function visibleGameTags(entry, selectedTags = [], expanded = false, limit = 6) {
  const tags = normalizeList(entry.tags);
  const fallback = tags.length === 0;
  const source = fallback ? normalizeList(entry.genres) : tags;
  const ordered = reorderTags(source, selectedTags);

  if (expanded || ordered.length <= limit) {
    return { visible: ordered, hiddenCount: 0, fallback };
  }

  return {
    visible: ordered.slice(0, limit),
    hiddenCount: Math.max(ordered.length - limit, 0),
    fallback,
  };
}

/** 每份 IPC 清單視為不可變快照；新清單或篩選條件才重新計算。 */
export function createGameQuery() {
  let source, prepared, previousKey, result;
  return (entries, filters = {}, view = "all") => {
    if (source !== entries) {
      source = entries;
      prepared = new Map(entries.map(entry => [entry, { searchText: gameSearchText(entry), tags: normalizeList(entry.tags) }]));
      previousKey = null;
    }
    const key = JSON.stringify([view, filters.query, filters.min, filters.max, filters.minReviews, filters.chinese, filters.playerMode, filters.manualOnly, filters.newOnly, filters.sort, filters.sortDirection, filters.tags]);
    if (key !== previousKey) {
      result = filterAndSortGames(entriesForView(entries, view), filters, prepared);
      previousKey = key;
    }
    return result;
  };
}

export function ratingRangeError(filters) {
  const min = ratingBound(filters.min);
  const max = ratingBound(filters.max);
  return [min, max].some(value => value !== null && (!Number.isFinite(value) || value < 0 || value > 100))
    || (min !== null && max !== null && min > max)
    ? "請輸入 0～100%，上限須大於或等於下限；目前不套用好評率條件。" : "";
}
