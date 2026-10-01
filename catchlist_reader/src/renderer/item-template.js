import { catalogLabels } from "./catalog-search.js";
import { visibleGameTags } from "./game-browser.js";

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

function actions(entry, label, url) {
  return `<div class="actions"><button class="button compact primary" data-open="${escapeHtml(url)}">${label}</button>${favoriteButton(entry)}<button class="button compact" data-hide="${entry.id}">隱藏</button><button class="button compact danger" data-delete="${entry.id}">真正刪除</button></div>`;
}

function favoriteButton(entry) {
  const label = entry.favorite ? "取消收藏" : "加入收藏";
  return `<button class="icon-button favorite-button${entry.favorite ? " saved" : ""}" type="button" data-favorite="${escapeHtml(entry.id)}" aria-pressed="${Boolean(entry.favorite)}" aria-label="${label} ${escapeHtml(entry.title)}" title="${label}"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6 3h12v18l-6-4-6 4z"/></svg></button>`;
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

function gamePlayerModeStatus(value) {
  const states = {
    single: { style: "supported", name: "單人", label: "單人：官方列單人，未列多人功能", icon: '<circle cx="12" cy="6" r="4"/><path d="M4 20v-2a8 8 0 0 1 16 0v2c-4 2-12 2-16 0Z"/>' },
    multi: { style: "multiplayer", name: "多人", label: "多人：含官方多人功能，也可能支援單人", icon: '<circle cx="12" cy="5.5" r="3.5"/><circle cx="4" cy="8" r="2.7"/><circle cx="20" cy="8" r="2.7"/><path d="M0 18v-2a4 4 0 0 1 6-3.5A8 8 0 0 0 4 18v1c-1.5-.1-3-.4-4-1Zm24 0v-2a4 4 0 0 0-6-3.5 8 8 0 0 1 2 5.5v1c1.5-.1 3-.4 4-1ZM6 20v-3a6 6 0 0 1 12 0v3c-3 1.8-9 1.8-12 0Z"/>' },
    unknown: { style: "unknown", name: "未確認", label: "遊玩模式未確認：缺少官方功能資料", icon: '<path d="M10 15v-1c0-2 4-2 4-4a2 2 0 0 0-4 0H8a4 4 0 0 1 8 0c0 3-4 3.5-4 4v1Z"/><circle cx="11" cy="18" r="1.2"/>' },
  };
  const key = Object.hasOwn(states, value) ? value : "unknown";
  const status = states[key];
  return `<span class="language-status player-mode ${status.style}" data-mode="${key}" role="img" aria-label="${status.label}" title="${status.label}"><svg aria-hidden="true" viewBox="0 0 24 24">${status.icon}</svg><span class="mobile-mode-label">${status.name}</span></span>`;
}

function externalLinkIcon() {
  return '<svg class="external-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M14 5h5v5M19 5l-9 9"/><path d="M18 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>';
}

function copyIcon() {
  return '<svg aria-hidden="true" viewBox="0 0 24 24"><rect x="8" y="8" width="11" height="11" rx="1"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>';
}

function gameTimeButton(entry) {
  const name = String(entry.originalTitle ?? "").trim() || String(entry.title ?? "").trim();
  if (!name) return "";
  const url = `https://howlongtobeat.com/?q=${encodeURIComponent(name)}`;
  return `<button class="copy-title-button game-time-button" type="button" data-open="${escapeHtml(url)}" aria-label="在 HowLongToBeat 查詢 ${escapeHtml(name)} 的遊戲時數" title="查詢遊戲時數（HowLongToBeat）"><svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/></svg></button>`;
}

export function formatGameTitleCopyText(title, originalTitle) {
  const names = [title, originalTitle].map((value) => String(value ?? "").trim()).filter(Boolean);
  return [...new Set(names)].join("\n");
}

function searchableTitle(entry) {
  const title = escapeHtml(entry.title);
  const url = escapeHtml(`https://www.google.com/search?q=${encodeURIComponent(entry.title)}`);
  return `<div class="title title-actions"><div class="game-title-actions"><button class="game-title-link" type="button" data-open="${url}" aria-label="使用 Google 搜尋 ${title}" title="使用 Google 搜尋"><strong class="title-primary">${title}${externalLinkIcon()}</strong></button><button class="copy-title-button" type="button" data-copy-title="${escapeHtml(entry.id)}" aria-label="複製 ${title} 的名稱" title="複製名稱">${copyIcon()}</button></div></div>`;
}

function hideIcon() {
  return '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 4.2A10.5 10.5 0 0 1 12 4c5.5 0 9 8 9 8a18 18 0 0 1-2.1 3.2M6.6 6.6C4.2 8.2 3 12 3 12s3.5 8 9 8a9.8 9.8 0 0 0 4.1-.9"/></svg>';
}

function deleteIcon() {
  return '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg>';
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
    if (view.catalogSearch) return `<span class="game-tag">${escapeHtml(tag)}</span>`;
    const selected = selectedSet.has(tag);
    const selectedAttr = selected ? ` data-selected-tag="${escapeHtml(tag)}"` : "";
    const selectedClass = selected ? " selected" : "";
    return `<button class="game-tag${selectedClass}" type="button" data-game-tag="${escapeHtml(tag)}"${selectedAttr} aria-pressed="${selected ? "true" : "false"}">${escapeHtml(tag)}</button>`;
  }).join("");
  return `<div class="game-tags"><div class="game-tag-list">${tags}${toggleButton("社群標籤")}</div></div>`;
}

export function renderItemTemplate(entry, media, view) {
  if (media === "anime") {
    const score = entry.score == null ? "—" : entry.score.toFixed(2);
    const media = entry.animeMedia;
    const episodes = entry.episodes ?? media?.episodes;
    const format = entry.format ?? media?.format;
    const details = episodes && format ? `${episodes} · ${format}` : "集數與類型未提供";
    const cover = media?.coverUrl
      ? `<button class="anime-cover" type="button" data-cover="${escapeHtml(media.coverUrl)}" data-cover-title="${escapeHtml(entry.title)}" aria-label="放大 ${escapeHtml(entry.title)} 的動畫封面"><img src="${escapeHtml(media.coverUrl)}" alt="${escapeHtml(entry.title)} 動畫封面" loading="lazy" decoding="async"></button>`
      : `<div class="anime-cover anime-cover-empty"><svg aria-hidden="true" viewBox="0 0 32 40"><rect x="5" y="4" width="22" height="32" rx="1"/><path d="m12 15 10 5-10 5z"/></svg><span>${!media || media.status === "loading" ? "封面待載入" : "尚無封面"}</span></div>`;
    const trailer = media?.trailerUrl
      ? `<button class="anime-trailer-link" data-open="${escapeHtml(media.trailerUrl)}" aria-label="在 YouTube 觀看 ${escapeHtml(entry.title)} 的宣傳影片"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m9 5 11 7-11 7z"/></svg><span><strong>觀看宣傳影片${externalLinkIcon()}</strong><small>${escapeHtml(media.trailerTitle)}</small><small>${escapeHtml(media.trailerAuthor || "YouTube")}</small></span></button>`
      : `<div class="anime-trailer-empty"><strong>${!media || media.status === "loading" ? "正在查詢封面與影片" : media.status === "error" || media.trailerUnavailable ? "影片資訊暫時無法讀取" : media.status === "unmatched" ? "需要確認對應作品" : "來源尚無宣傳影片"}</strong><small>${media?.status === "unmatched" ? "選擇正確季度或版本後即可顯示" : media?.status === "error" ? "稍後可重新查詢" : media?.status === "ready" ? "仍可點選名稱搜尋作品" : "首次查詢後會保存結果"}</small></div>`;
    const edit = (media?.status === "error" || media?.trailerUnavailable) ? `<button class="anime-media-edit" data-anime-retry="${escapeHtml(entry.id)}">重新查詢</button>` : "";
    return `<article class="item anime" data-anime-row="${escapeHtml(entry.id)}">${cover}<div class="anime-info"><div class="anime-facts"><span class="score">${score}</span><span class="meta">${escapeHtml(entry.periodLabel)}</span><span class="meta">${escapeHtml(details)}</span></div>${searchableTitle(entry)}<div class="anime-row-controls">${favoriteButton(entry)}<button class="icon-button" data-hide="${escapeHtml(entry.id)}" title="隱藏" aria-label="隱藏 ${escapeHtml(entry.title)}">${hideIcon()}</button><button class="icon-button danger" data-delete="${escapeHtml(entry.id)}" title="真正刪除" aria-label="真正刪除 ${escapeHtml(entry.title)}">${deleteIcon()}</button></div></div><div class="anime-media">${trailer}<div class="anime-media-options">${edit}<button class="anime-media-edit" data-anime-edit="${escapeHtml(entry.id)}">${media?.status === "unmatched" ? "選擇作品" : "校正作品"}</button></div>${media?.cacheWarning ? `<small class="status-warning">${escapeHtml(media.cacheWarning)}</small>` : ""}</div></article>`;
  }

  if (media === "movies") {
    return `<article class="item movies"><span class="score">${entry.score.toFixed(2)}</span>${searchableTitle(entry)}<span class="meta">${escapeHtml(entry.periodLabel)}</span><span class="meta">IMDb ${entry.imdbScore.toFixed(1)} · ${escapeHtml(entry.votesLabel)}</span><span class="meta">${escapeHtml(entry.category)}</span>${actions(entry, "Google 搜尋", entry.searchUrl)}</article>`;
  }

  if (media === "liveAction") {
    const imdb = entry.imdbScore == null ? "IMDb 資料不足" : `IMDb ${entry.imdbScore.toFixed(1)} · ${escapeHtml(entry.votesLabel)}`;
    return `<article class="item live-action">${searchableTitle(entry)}<span class="meta">${escapeHtml(entry.periodLabel)}</span><span class="meta">${escapeHtml(entry.region)}</span><span class="meta">${imdb}</span>${actions(entry, entry.hasImdbUrl ? "開啟 IMDb" : "Google 搜尋", entry.url)}</article>`;
  }

  const appid = escapeHtml(entry.appid);
  const cover = entry.coverUrl
    ? `<button class="game-cover" type="button" data-cover="${escapeHtml(entry.coverUrl)}" data-cover-title="${escapeHtml(entry.title)}" data-game-appid="${appid}"><img src="${escapeHtml(entry.coverUrl)}" alt="遊戲封面：${escapeHtml(entry.title)}"></button>`
    : `<div class="game-cover game-cover-loading" data-game-appid="${appid}" aria-label="遊戲封面載入中"></div>`;
  return `<article class="item games" data-game-row="${appid}">${cover}<div class="title game-title-cell"><div class="game-title-actions"><button class="game-title-link" type="button" data-open="${escapeHtml(entry.url)}" aria-label="在 Steam 開啟 ${escapeHtml(entry.title)}"><strong class="title-primary">${escapeHtml(entry.title)}${externalLinkIcon()}</strong></button><button class="copy-title-button" type="button" data-copy-title="${escapeHtml(entry.id)}" aria-label="複製 ${escapeHtml(entry.title)} 的中英文名稱" title="複製中英文名稱">${copyIcon()}</button>${gameTimeButton(entry)}</div><small>${escapeHtml(entry.originalTitle)}</small>${view?.catalogSearch ? `<span class="catalog-classification"><span>所在分類</span> ${catalogLabels(entry).map(escapeHtml).join(" · ")}</span>` : ""}${entry.manualAdded ? `<span class="manual-source" title="${escapeHtml(`手動加入於 ${entry.addedAt?.slice(0, 10) ?? ""}；${entry.reportSource ? "目前顯示每月報告資料" : "保留加入時資料，不自動更新"}`)}">手動加入</span>` : ""}</div><div class="game-facts"><span class="rating"><strong>${entry.score == null ? "—" : `${entry.score}%`}</strong><small>${entry.reviews == null ? "評論讀取失敗" : entry.reviews === 0 ? "尚無評論" : `(${entry.reviews.toLocaleString()})`}</small></span><span class="meta game-date">${escapeHtml(entry.releaseDate ?? entry.releaseLabel ?? "未公布日期")}</span>${gameLanguageStatus(entry.chineseSupport)}${gamePlayerModeStatus(entry.playerMode)}</div>${renderGameTags(entry, view)}<div class="game-management">${favoriteButton(view?.backlog ? { ...entry, favorite: false } : entry)}<button class="icon-button" type="button" aria-haspopup="menu" aria-expanded="false" data-hide="${entry.id}" aria-label="隱藏 ${escapeHtml(entry.title)}" title="隱藏">${hideIcon()}</button><button class="icon-button danger" type="button" data-delete="${entry.id}" aria-label="真正刪除 ${escapeHtml(entry.title)}" title="真正刪除">${deleteIcon()}</button></div></article>`;
}
