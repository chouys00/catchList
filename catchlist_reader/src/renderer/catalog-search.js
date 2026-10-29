import { hiddenReasons } from "./personal-ui.js";

// IPC 回傳的是不可變快照；分類後的新快照自然使快取失效。
const snapshots = new WeakMap();
export function catalogGames(payload) {
  if (!payload) return [];
  if (snapshots.has(payload)) return snapshots.get(payload);
  const games = new Map();
  const key = entry => String(entry.appid ?? entry.id);
  for (const entry of payload.libraries?.find(library => library.media === "games")?.entries ?? []) {
    games.set(key(entry), { ...entry, catalogReason: null });
  }
  for (const record of payload.hiddenEntries ?? []) {
    if (record.media !== "games" || !record.available || !record.entry) continue;
    const entry = record.entry;
    games.set(key(entry), { ...entry, favorite: false, favoriteKind: null, hiddenKey: record.hideKey, catalogReason: record.reason ?? "played" });
  }
  const result = [...games.values()];
  snapshots.set(payload, result);
  return result;
}

export function catalogLabels(entry) {
  const labels = [];
  if (entry.favorite && !entry.catalogReason) labels.push(entry.favoriteKind === "shared" ? "共樂收藏" : "個人收藏");
  if (entry.catalogReason) labels.push(hiddenReasons[entry.catalogReason] ?? "隱藏管理");
  return labels.length ? labels : ["尚未分類"];
}
