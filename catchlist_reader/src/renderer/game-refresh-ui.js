export const refreshingGames = new Set();

export function refreshButton(entry, escapeHtml) {
  const busy = refreshingGames.has(String(entry.appid));
  const updated = entry.statsUpdatedAt ? `；上次更新：${new Date(entry.statsUpdatedAt).toLocaleString("zh-TW")}` : "";
  const label = `更新 ${entry.title} 的標籤、好評率與評論數`;
  const hint = busy ? "更新中…" : `更新資訊${updated}`;
  return `<button class="icon-button game-refresh-button" type="button" data-refresh-game="${escapeHtml(entry.appid)}" aria-label="${escapeHtml(busy ? `${label}，更新中` : label)}" title="${escapeHtml(hint)}" aria-busy="${busy}" ${busy ? "disabled" : ""}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1"/></svg></button>`;
}
