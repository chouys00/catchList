function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

function actions(entry, label, url) {
  return `<div class="actions"><button class="button compact primary" data-open="${escapeHtml(url)}">${label}</button><button class="button compact danger" data-delete="${entry.id}">刪除</button></div>`;
}

export function renderItemTemplate(entry, media) {
  if (media === "anime") {
    return `<article class="item anime"><span class="score">${entry.score.toFixed(2)}</span><div class="title"><strong>${escapeHtml(entry.title)}</strong></div><span class="meta">${escapeHtml(entry.periodLabel)}</span><span class="meta">${escapeHtml(entry.episodes)} · ${escapeHtml(entry.format)}</span>${actions(entry, "Google 搜尋", entry.searchUrl)}</article>`;
  }

  if (media === "movies") {
    return `<article class="item movies"><span class="score">${entry.score.toFixed(2)}</span><div class="title"><strong>${escapeHtml(entry.title)}</strong></div><span class="meta">${escapeHtml(entry.periodLabel)}</span><span class="meta">IMDb ${entry.imdbScore.toFixed(1)} · ${escapeHtml(entry.votesLabel)}</span><span class="meta">${escapeHtml(entry.category)}</span>${actions(entry, "Google 搜尋", entry.searchUrl)}</article>`;
  }

  const cover = entry.coverUrl
    ? `<button class="game-cover" type="button" data-cover="${escapeHtml(entry.coverUrl)}" data-cover-title="${escapeHtml(entry.title)}"><img src="${escapeHtml(entry.coverUrl)}" alt="遊戲封面：${escapeHtml(entry.title)}"></button>`
    : '<div class="game-cover game-cover-loading" aria-label="遊戲封面載入中"></div>';
  return `<article class="item games">${cover}<div class="title"><strong>${escapeHtml(entry.title)}</strong><small>${escapeHtml(entry.originalTitle)}</small></div><span class="meta">${escapeHtml(entry.releaseDate)}</span><span class="rating"><strong>${entry.score}%</strong><small>(${entry.reviews.toLocaleString()})</small></span><span class="meta">${escapeHtml(entry.genres.join("、"))}</span>${actions(entry, "Steam", entry.url)}</article>`;
}
