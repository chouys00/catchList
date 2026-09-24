function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

export function dateLabel(value) {
  if (!value || !Number.isFinite(new Date(value).getTime())) return "尚無紀錄";
  return new Intl.DateTimeFormat("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
}

export const hiddenReasons = { not_interested: "暫不考慮", backlog: "候補", played: "玩過了" };

export function reasonOptions(selected) { return Object.entries(hiddenReasons).map(([key, label]) => `<option value="${key}" ${key === selected ? "selected" : ""}>${label}</option>`).join(""); }

export function entriesForView(entries, view) {
  if (view === "favorites") return entries.filter((entry) => entry.favorite);
  if (view === "all") return entries.filter((entry) => !entry.favorite);
  return entries;
}

export function viewNavigation(view, media, entries, hiddenCount, reasonCounts = {}) {
  const favoriteCount = entries.filter((entry) => entry.favorite).length;
  const tabs = [["all", "全部", entries.length - favoriteCount], ["favorites", media === "games" ? "待玩收藏" : "待看收藏", favoriteCount], ["hidden", "隱藏管理", hiddenCount]];
  if (media === "games") tabs.splice(2, 0, ...["backlog", "played", "not_interested"].map(reason => [reason, hiddenReasons[reason], reasonCounts[reason] ?? 0]));
  return `<nav class="library-views" aria-label="清單檢視">${tabs.map(([key, label, count]) => `<button type="button" class="view-button${view === key ? " active" : ""}" data-view="${key}" aria-pressed="${view === key}">${label}<span>${count}</span></button>`).join("")}</nav>`;
}

function hiddenRatings(record) {
  const entry = record.available ? record.entry : null;
  const score = record.media === "liveAction" ? entry?.imdbScore : entry?.score;
  const scoreLabel = !entry ? "—" : record.media === "liveAction"
    ? (score == null ? "IMDb 資料不足" : `IMDb ${score.toFixed(1)}`)
    : Number.isFinite(score) ? (record.media === "games" ? `${score}%` : score.toFixed(2)) : "—";
  // 與原清單一致：保留票數文字（例如 36k票），不重新展開為整數。
  const countLabel = !entry ? "—" : record.media === "games"
    ? (entry.reviews == null ? "評論讀取失敗" : entry.reviews === 0 ? "尚無評論" : `(${entry.reviews.toLocaleString()})`)
    : entry.votesLabel || "—";
  return `<div class="hidden-ratings"><div><span class="meta">評分</span><strong>${escapeHtml(scoreLabel)}</strong></div><div><span class="meta">評分數</span><strong>${escapeHtml(countLabel)}</strong></div></div>`;
}

export function hiddenListMarkup(records, query, reason = "all") {
  const needle = query.trim().toLocaleLowerCase("zh-Hant");
  const filtered = records.filter((entry) => (reason === "all" || (entry.reason ?? "played") === reason) && String(entry.title).toLocaleLowerCase("zh-Hant").includes(needle));
  return {
    count: filtered.length,
    markup: filtered.length ? filtered.map((entry) => `<article class="hidden-row"><div class="title"><strong>${escapeHtml(entry.title)}</strong><small>${entry.available ? escapeHtml(entry.periodLabel) : "原始報告已找不到這部作品"}</small></div>${hiddenRatings(entry)}${entry.media === "games" ? `<label class="hidden-reason"><span class="sr-only">${escapeHtml(entry.title)}的隱藏原因</span><select class="field" data-hidden-reason="${escapeHtml(entry.hideKey)}" ${entry.available ? "" : "disabled"}>${reasonOptions(entry.reason ?? "played")}</select></label>` : ""}<span class="meta">隱藏於 ${escapeHtml(dateLabel(entry.hiddenAt))}</span><button type="button" class="button compact" data-restore="${escapeHtml(entry.hideKey)}">${entry.available ? "恢復顯示" : "清除隱藏紀錄"}</button></article>`).join("") : `<div class="empty">${query.trim() ? "沒有符合名稱的隱藏作品。" : "目前沒有隱藏作品。"}</div>`,
  };
}

export function updateStatusMarkup(payload, active, open) {
  const status = payload?.updateStatus;
  const current = status?.media?.[active];
  const failed = Object.values(status?.media ?? {}).filter((item) => item.status === "failed").length;
  const coverage = current?.coverage;
  const headline = coverage?.latestLabel ? `收錄至 ${coverage.latestLabel}` : "收錄範圍尚無紀錄";
  const stateLabel = active === "liveAction" ? "年度清單另行整理" : current?.status === "success" ? "最近每月執行成功" : current?.status === "failed" ? "最近每月執行失敗" : current?.status === "running" ? "上次更新尚未記錄完成" : "尚無每月執行紀錄";
  const labels = { games: "遊戲", anime: "動畫", movies: "電影", liveAction: "真人劇" };
  const rows = Object.entries(labels).map(([media, label]) => {
    const item = status?.media?.[media];
    const file = payload?.libraries?.find((library) => library.media === media);
    const result = media === "liveAction" ? "年度研究後另行更新" : ({ success: "成功", failed: "失敗", running: "尚未記錄完成" })[item?.status] ?? "尚無執行紀錄";
    const progress = item?.coverage;
    const expected = progress?.expectedLabel ? `依收錄規則應到 ${progress.expectedLabel}${progress.isCurrent === false ? "，尚有待補資料" : ""}` : "";
    const count = Number.isInteger(item?.addedCount) ? ` · 新增 ${item.addedCount} 筆` : "";
    return `<div class="update-row"><strong>${label}</strong><div><span>${escapeHtml(progress?.latestLabel ? `收錄至 ${progress.latestLabel}` : file?.exists ? "報告尚無可辨識區段" : "找不到報告")}</span><small>${escapeHtml(expected)}</small><small>檔案修改：${escapeHtml(dateLabel(file?.updatedAt))}</small></div><div class="update-result${item?.status === "failed" ? " failed" : ""}"><span>${result}${count}</span>${media !== "liveAction" ? `<small>最近執行：${escapeHtml(dateLabel(item?.finishedAt ?? item?.startedAt))}</small><small>上次成功：${escapeHtml(dateLabel(item?.lastSuccessAt))}</small>` : ""}${item?.error ? `<small>${escapeHtml(item.error)}</small>` : ""}</div></div>`;
  }).join("");
  return `<details class="update-panel" ${open ? "open" : ""}><summary><span>${escapeHtml(headline)}</span><span class="update-summary-state${failed ? " failed" : ""}">${failed ? `${failed} 類更新失敗` : stateLabel}</span><span class="update-details-label">更新詳情</span></summary><div class="update-details">${status?.warning ? `<p class="status-warning" role="alert">${escapeHtml(status.warning)}</p>` : ""}${rows}<p class="update-note">執行紀錄由每月整批更新產生；單獨更新請以執行輸出為準。電影、遊戲延後六個月收錄，動畫收錄到上一季。Google Drive 上傳狀態請至同步程式確認。</p></div></details>`;
}
