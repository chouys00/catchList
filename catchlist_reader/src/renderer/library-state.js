function sectionsFromEntries(entries, previousSections = []) {
  const previous = new Map(previousSections.map((section) => [section.key, section]));
  const sections = new Map();
  for (const entry of entries) {
    if (sections.has(entry.sectionKey)) continue;
    sections.set(entry.sectionKey, previous.get(entry.sectionKey) ?? {
      key: entry.sectionKey,
      label: entry.periodLabel,
      year: entry.year,
      month: entry.month ?? null,
      season: entry.season ?? null,
    });
  }
  return [...sections.values()];
}

function updateLibrary(payload, media, update, canUndo) {
  if (!payload?.libraries?.some((item) => item.media === media)) {
    throw new Error("找不到要更新的清單");
  }
  return {
    ...payload,
    canUndo,
    libraries: payload.libraries.map((item) => item.media === media ? update(item) : item),
  };
}

export function applyDeleteResult(payload, result) {
  if (!result?.media || !result.entryId || result.canUndo !== true) {
    throw new Error("刪除結果格式不正確");
  }
  let removed = null;
  const nextPayload = updateLibrary(payload, result.media, (library) => {
    const index = library.entries.findIndex((entry) => entry.id === result.entryId);
    if (index < 0) throw new Error("刪除的作品已不在目前清單");
    removed = { media: result.media, entry: library.entries[index], index };
    const entries = library.entries.filter((_, entryIndex) => entryIndex !== index);
    return { ...library, entries, sections: sectionsFromEntries(entries, library.sections) };
  }, true);
  return { payload: nextPayload, removed };
}

export function applyUndoResult(payload, result, removed) {
  if (!result?.media || !result.entryId || result.canUndo !== false) {
    throw new Error("復原結果格式不正確");
  }
  if (!removed || removed.media !== result.media || removed.entry?.id !== result.entryId) {
    throw new Error("找不到可加回畫面的作品資料");
  }
  return updateLibrary(payload, result.media, (library) => {
    if (library.entries.some((entry) => entry.id === result.entryId)) return library;
    const entries = [...library.entries];
    entries.splice(Math.min(Math.max(removed.index, 0), entries.length), 0, removed.entry);
    return { ...library, entries, sections: sectionsFromEntries(entries, library.sections) };
  }, false);
}
