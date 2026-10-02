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
  const coverage = current?.coverage;
  const headline = coverage?.latestLabel ? `收錄至 ${coverage.latestLabel}` : "收錄範圍尚無紀錄";
  const noNew = item => item?.status === "unchanged" || (item?.status === "success" && item?.addedCount === 0);
  const dataState = item => item?.status === "failed" ? ["待確認", "failed"]
    : item?.status === "running" ? ["檢查中", ""]
      : item?.coverage?.isCurrent === true ? ["已補齊收錄期間", "current"]
        : item?.coverage?.isCurrent === false ? ["有待補期間", "pending"] : ["收錄狀態待確認", ""];
  const [stateLabel, stateClass] = active === "liveAction" ? ["年度清單", ""] : dataState(current);
  const labels = { games: "遊戲", anime: "動畫", movies: "電影", liveAction: "真人劇" };
  const rows = Object.entries(labels).filter(([media]) => media !== "liveAction").map(([media, label]) => {
    const item = status?.media?.[media];
    const file = payload?.libraries?.find((library) => library.media === media);
    const progress = item?.coverage;
    const [state, tone] = dataState(item);
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(item?.lastSuccessAt ?? "");
    const successDate = dateOnly ? item.lastSuccessAt.replaceAll("-", "/") : dateLabel(item?.lastSuccessAt);
    const count = item?.lastSuccessAt && item.lastSuccessAddedCount > 0 ? item.lastSuccessAddedCount.toLocaleString("zh-TW") : null;
    const missing = progress?.missingCount > 0 ? `<small class="update-gap">缺 ${progress.missingCount} 個${media === "anime" ? "季度" : "月份"}：${escapeHtml(progress.missingLabels?.join("、"))}${progress.missingCount > 3 ? "等" : ""}</small>` : "";
    return `<tr><th scope="row">${label}</th><td><strong class="update-data-state ${tone}">${escapeHtml(state)}</strong><small>${escapeHtml(progress?.latestLabel ? `收錄至 ${progress.latestLabel}` : file?.exists ? "報告尚無可辨識區段" : "找不到報告")}</small>${missing}${item?.status === "failed" ? '<small>最近檢查失敗，請展開檢查紀錄</small>' : ""}</td><td class="update-added-date" data-label="最後一次新增">${escapeHtml(successDate)}${dateOnly ? '<small>詳細時間未留存</small>' : ""}</td><td class="update-added-count" data-label="新增筆數">${count ? `<strong>${count}</strong><span> 筆</span>` : '<span class="update-unrecorded">未留存</span>'}</td></tr>`;
  }).join("");
  const records = Object.entries(labels).filter(([media]) => media !== "liveAction").map(([media, label]) => {
    const item = status?.media?.[media];
    const file = payload?.libraries?.find(library => library.media === media);
    const result = noNew(item) ? "檢查完成，無新增" : ({ success: "更新完成", failed: "檢查失敗", running: "檢查中，尚未完成" })[item?.status] ?? "尚無檢查紀錄";
    const count = !noNew(item) && Number.isInteger(item?.addedCount) ? ` · 新增 ${item.addedCount} 筆${item.status === "failed" && item.addedCount > 0 ? "（部分完成）" : ""}` : "";
    return `<div class="update-check-row"><strong>${label}</strong><div><span class="${item?.status === "failed" ? "failed" : ""}">${escapeHtml(result + count)}</span><small>最近檢查：${escapeHtml(dateLabel(item?.finishedAt ?? item?.startedAt))}</small>${item?.coverage?.expectedLabel ? `<small>目前應收錄至 ${escapeHtml(item.coverage.expectedLabel)}</small>` : ""}<small>檔案修改：${escapeHtml(dateLabel(file?.updatedAt))}</small>${item?.error ? `<p class="update-error">${escapeHtml(item.error)}</p>` : ""}</div></div>`;
  }).join("");
  const annual = status?.media?.liveAction?.coverage?.latestLabel;
  return `<details class="update-panel" ${open ? "open" : ""}><summary><span>${escapeHtml(headline)}</span><span class="update-summary-state ${stateClass}">${escapeHtml(stateLabel)}</span><span class="update-details-label">更新詳情</span></summary><section class="update-details" aria-label="資料更新詳情"><div class="update-intro"><h2>資料更新</h2><p>最後一次新增會保留，檢查沒有新資料時不會被取代。</p></div>${status?.warning ? `<p class="status-warning" role="alert">${escapeHtml(status.warning)}</p>` : ""}<table class="update-overview"><caption class="sr-only">目前收錄狀態與最後一次新增紀錄</caption><thead><tr><th scope="col">項目</th><th scope="col">目前資料狀態</th><th scope="col">最後一次新增</th><th scope="col">新增筆數</th></tr></thead><tbody>${rows}</tbody></table><div class="update-annual"><strong>真人劇</strong><div>${escapeHtml(annual ? `收錄至 ${annual}` : "尚無年度清單")}<small>年度研究後另行整理，不列入每月更新。</small></div></div><p class="update-note">電影、遊戲延後六個月收錄；動畫收錄到上一季。「已補齊」表示從報告既有起點到應收錄期間沒有缺段，不代表所有作品與評分都重新核對過。</p><details class="update-checks"><summary>檢查紀錄<span>最近執行結果與錯誤原因</span></summary>${records}<p class="update-note">執行紀錄來自整批更新或動畫回補；其他單獨更新請以執行輸出為準。Google Drive 上傳狀態請至同步程式確認。</p></details></section></details>`;
}
