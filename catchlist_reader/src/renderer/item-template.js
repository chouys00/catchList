import { visibleGameTags } from "./game-browser.js";

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

function actions(entry, label, url) {
  return `<div class="actions"><button class="button compact primary" data-open="${escapeHtml(url)}">${label}</button><button class="button compact danger" data-hide="${entry.id}">隱藏</button></div>`;
}

function gameLanguageStatus(value) {
  const states = {
    supported: { label: "支援中文", icon: '<path d="m5 12 4 4L19 6"/>' },
    unsupported: { label: "不支援中文", icon: '<path d="M6 6l12 12M18 6 6 18"/>' },
    unknown: { label: "中文支援待確認", icon: '<path d="M6 12h12"/>' },
  };
  const key = value in states ? value : "unknown";
  const state = states[key];
  return `<span class="language-status ${key}" role="img" aria-label="${state.label}" title="${state.label}"><svg aria-hidden="true" viewBox="0 0 24 24">${state.icon}</svg></span>`;
}

function externalLinkIcon() {
  return '<svg class="external-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M14 5h5v5M19 5l-9 9"/><path d="M18 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>';
}

function hideIcon() {
  return '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 4.2A10.5 10.5 0 0 1 12 4c5.5 0 9 8 9 8a18 18 0 0 1-2.1 3.2M6.6 6.6C4.2 8.2 3 12 3 12s3.5 8 9 8a9.8 9.8 0 0 0 4.1-.9"/></svg>';
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

  const appid = escapeHtml(entry.appid);
  const cover = entry.coverUrl
    ? `<button class="game-cover" type="button" data-cover="${escapeHtml(entry.coverUrl)}" data-cover-title="${escapeHtml(entry.title)}" data-game-appid="${appid}"><img src="${escapeHtml(entry.coverUrl)}" alt="遊戲封面：${escapeHtml(entry.title)}"></button>`
    : `<div class="game-cover game-cover-loading" data-game-appid="${appid}" aria-label="遊戲封面載入中"></div>`;
  return `<article class="item games">${cover}<button class="title game-title-link" type="button" data-open="${escapeHtml(entry.url)}" aria-label="在 Steam 開啟 ${escapeHtml(entry.title)}"><strong class="title-primary">${escapeHtml(entry.title)}${externalLinkIcon()}</strong><small>${escapeHtml(entry.originalTitle)}</small></button><div class="game-facts"><span class="meta game-date">${escapeHtml(entry.releaseDate)}</span>${gameLanguageStatus(entry.chineseSupport)}<span class="rating"><strong>${entry.score}%</strong><small>(${entry.reviews.toLocaleString()})</small></span></div>${renderGameTags(entry, view)}<div class="game-management"><button class="icon-button danger" type="button" data-hide="${entry.id}" aria-label="隱藏 ${escapeHtml(entry.title)}" title="隱藏">${hideIcon()}</button></div></article>`;
}
