import { visibleGameTags } from "./game-browser.js";

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

function actions(entry, label, url) {
  const personal = Number.isFinite(entry.personalRating)
    ? `<button class="button compact personal-rating" data-rate="${entry.id}" aria-label="修改${escapeHtml(entry.title)}的五角評分"><span>我的</span> ${entry.personalRating.toFixed(1)}／5</button>`
    : `<button class="button compact rate" data-rate="${entry.id}" aria-label="為${escapeHtml(entry.title)}評分">評分</button>`;
  return `<div class="actions"><button class="button compact primary" data-open="${escapeHtml(url)}">${label}</button>${personal}<button class="button compact danger" data-delete="${entry.id}">刪除</button></div>`;
}

function renderGameTags(entry, view = {}) {
  const selectedTags = Array.isArray(view.selectedTags) ? view.selectedTags : [];
  const expanded = view.expanded === true;
  const tagLimit = Number.isInteger(view.tagLimit) && view.tagLimit > 0 ? view.tagLimit : 6;
  const { visible, hiddenCount, fallback } = visibleGameTags(entry, selectedTags, expanded, tagLimit);
  const key = escapeHtml(entry.appid ?? entry.id);
  const title = escapeHtml(entry.title);

  function toggleButton(noun) {
    if (expanded) {
      return `<button class="game-tag expand" type="button" data-expand-tags="${key}" aria-expanded="true" aria-label="收起${title}的${noun}">收起</button>`;
    }
    return hiddenCount > 0
      ? `<button class="game-tag expand" type="button" data-expand-tags="${key}" aria-expanded="false" aria-label="顯示${title}的其餘 ${hiddenCount} 個${noun === "社群標籤" ? "標籤" : "類型"}">＋${hiddenCount}</button>`
      : "";
  }

  if (fallback) {
    const genres = visible.map((genre) => `<span class="game-tag fallback">${escapeHtml(genre)}</span>`).join("");
    return `<div class="game-tags"><div class="game-tag-list">${genres}${toggleButton("遊戲類型")}</div><span class="tag-warning">尚未補齊社群標籤</span></div>`;
  }

  const selectedSet = new Set(selectedTags);
  const tags = visible.map((tag) => {
    const selected = selectedSet.has(tag);
    const selectedAttr = selected ? ` data-selected-tag="${escapeHtml(tag)}"` : "";
    const selectedClass = selected ? " selected" : "";
    return `<button class="game-tag${selectedClass}" type="button" data-game-tag="${escapeHtml(tag)}"${selectedAttr} aria-pressed="${selected ? "true" : "false"}">${escapeHtml(tag)}</button>`;
  }).join("");
  return `<div class="game-tags"><div class="game-tag-list">${tags}${toggleButton("社群標籤")}</div></div>`;
}

export function renderItemTemplate(entry, media, view) {
  if (media === "anime") {
    return `<article class="item anime"><span class="score">${entry.score.toFixed(2)}</span><div class="title"><strong>${escapeHtml(entry.title)}</strong></div><span class="meta">${escapeHtml(entry.periodLabel)}</span><span class="meta">${escapeHtml(entry.episodes)} · ${escapeHtml(entry.format)}</span>${actions(entry, "Google 搜尋", entry.searchUrl)}</article>`;
  }

  if (media === "movies") {
    return `<article class="item movies"><span class="score">${entry.score.toFixed(2)}</span><div class="title"><strong>${escapeHtml(entry.title)}</strong></div><span class="meta">${escapeHtml(entry.periodLabel)}</span><span class="meta">IMDb ${entry.imdbScore.toFixed(1)} · ${escapeHtml(entry.votesLabel)}</span><span class="meta">${escapeHtml(entry.category)}</span>${actions(entry, "Google 搜尋", entry.searchUrl)}</article>`;
  }

  if (media === "liveAction") {
    const imdb = entry.imdbScore == null ? "IMDb 資料不足" : `IMDb ${entry.imdbScore.toFixed(1)} · ${entry.imdbVotes.toLocaleString()} 票`;
    return `<article class="item live-action"><div class="title"><strong>${escapeHtml(entry.title)}</strong></div><span class="meta">${escapeHtml(entry.periodLabel)}</span><span class="meta">${escapeHtml(entry.region)}</span><span class="meta">${imdb}</span>${actions(entry, entry.imdbUrl ? "IMDb" : "Google 搜尋", entry.imdbUrl ?? entry.searchUrl)}</article>`;
  }

  const appid = escapeHtml(entry.appid);
  const cover = entry.coverUrl
    ? `<button class="game-cover" type="button" data-cover="${escapeHtml(entry.coverUrl)}" data-cover-title="${escapeHtml(entry.title)}" data-game-appid="${appid}"><img src="${escapeHtml(entry.coverUrl)}" alt="遊戲封面：${escapeHtml(entry.title)}"></button>`
    : `<div class="game-cover game-cover-loading" data-game-appid="${appid}" aria-label="遊戲封面載入中"></div>`;
  return `<article class="item games">${cover}<div class="title"><strong>${escapeHtml(entry.title)}</strong><small>${escapeHtml(entry.originalTitle)}</small></div><span class="meta">${escapeHtml(entry.releaseDate)}</span><span class="rating"><strong>${entry.score}%</strong><small>(${entry.reviews.toLocaleString()})</small></span>${renderGameTags(entry, view)}${actions(entry, "Steam", entry.url)}</article>`;
}
