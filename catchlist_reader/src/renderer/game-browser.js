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

function gameTitle(entry) {
  return `${entry.title ?? ""} ${entry.originalTitle ?? ""}`.toLocaleLowerCase("zh-Hant");
}

function normalizeList(values) {
  return Array.isArray(values) ? values.map((value) => cleanText(value)).filter(Boolean) : [];
}

export function filterAndSortGames(entries, filters = {}) {
  const query = normalizedQuery(filters.query);
  const min = Number(filters.min || 0);
  const selectedTags = normalizeList(filters.tags);

  return entries
    .filter((entry) => {
      if (query && !gameTitle(entry).includes(query)) return false;
      if (filters.year && filters.year !== "all" && entry.year !== Number(filters.year)) return false;
      if (filters.month && filters.month !== "all" && entry.month !== Number(filters.month)) return false;
      if (filters.chinese && filters.chinese !== "all" && entry.chineseSupport !== filters.chinese) return false;
      if (entry.score < min) return false;
      const tags = normalizeList(entry.tags);
      return selectedTags.every((tag) => tags.includes(tag));
    })
    .sort((left, right) => {
      return String(right.releaseDate ?? "").localeCompare(String(left.releaseDate ?? ""))
        || Number(right.score ?? 0) - Number(left.score ?? 0)
        || Number(right.reviews ?? 0) - Number(left.reviews ?? 0)
        || String(left.title ?? "").localeCompare(String(right.title ?? ""), "zh-Hant");
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
