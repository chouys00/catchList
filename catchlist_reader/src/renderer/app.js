import { openGameNote } from "./game-note-ui.js";
import { collectTagOptionsFromIndex, createTagIndex, createGameQuery, ratingRangeError } from "./game-browser.js";
import { openManualGamePanel } from "./manual-game-panel.js";
import { refreshingGames } from "./game-refresh-ui.js";
import { requestSteamConfirmation } from "./steam-verification-ui.js";
import { formatGameTitleCopyText, renderItemTemplate, renderGameTags } from "./item-template.js";
import { entriesForView, viewNavigation, hiddenListMarkup, updateStatusMarkup, hiddenReasons, reasonOptions } from "./personal-ui.js";

import { catalogGames } from "./catalog-search.js";
import { GameScreening } from "./game-screening.js";
import { AnimeMediaUI } from "./anime-media-ui.js";
import { RatingInputs, ratingInputMarkup } from "./rating-input.js";

const GAME_BATCH_SIZE = 50;
const MAX_EXTERNAL_BATCH_SIZE = 50;
const awaitingSteamGames = new Set();

const mediaCopy = {
  games: { title: "遊戲探索", search: "搜尋遊戲名稱或 Steam AppID…" },
  anime: { title: "動畫探索", search: "搜尋動畫名稱…" },
  movies: { title: "電影探索", search: "搜尋電影名稱…" },
  liveAction: { title: "真人劇年度必看", search: "搜尋真人劇名稱…" },
};

const state = {
  active: "games",
  view: "all",
  catalogSearch: false,
  catalogQuery: "",
  hiddenQuery: "",
  hiddenReason: "all",
  statusOpen: false,
  filtersOpen: false,
  mutationPending: false,
  selectMode: false,
  selectedGames: new Set(),
  payload: null,
  filters: {
    games: { manualOnly: "all", query: "", min: "", max: "", sort: "date", sortDirection: "desc", minReviews: "0", chinese: "all", playerMode: "all", tags: [], tagsOpen: false, tagQuery: "", tagOptionsExpanded: false },
    anime: { query: "", year: "all", season: "all", min: "0" },
    movies: { query: "", year: "all", category: "all", min: "0" },
    liveAction: { query: "", year: "all", region: "all" },
  },
  expandedGameTags: new Set(),
  gameCovers: new Map(),
  resolvedGameCovers: new Set(),
  pendingGameCovers: new Set(),
  visibleGameCount: GAME_BATCH_SIZE,
  gameLoadObserver: null,
  gameLoadInFlight: false,
  gameTagIndex: null,
  gameTagEntries: null,
  gameTagView: null,
  gameTagCompact: window.matchMedia?.("(max-width: 560px)").matches ?? false,
  gameResizeFrame: null,
};

const app = document.querySelector("#app");
const ratingInputs = new RatingInputs(app);
const folderLabel = document.querySelector("#folderLabel");
const dialog = document.querySelector("#confirmDialog");
const coverDialog = document.querySelector("#coverDialog");
const coverImage = document.querySelector("#coverImage");
const coverTitle = document.querySelector("#coverTitle");
const toast = document.querySelector("#toast");
const backToTop = document.querySelector("#backToTop");
const animeMediaUI = new AnimeMediaUI(app, (message) => showToast(message));
// 僅保留本次視窗的閱讀位置，不寫入個人紀錄。
const mediaPositions = new Map();
let loadRequest = 0;
let ratingInputTimer;

function rememberMediaPosition() {
  mediaPositions.set(state.active, { top: window.scrollY, gameCount: state.visibleGameCount });
}

function restoreMediaPosition(top) {
  // 遊戲可能只剩首批或篩選後的較短清單；先補足可捲動的內容。
  if (state.active === "games" && state.view !== "hidden") {
    while (document.documentElement.scrollHeight - window.innerHeight < top) {
      const previousCount = state.visibleGameCount;
      appendNextGameBatch();
      if (state.visibleGameCount === previousCount) break;
    }
  }
  window.scrollTo({ top, behavior: "instant" });
  syncBackToTop();
}

const gameScreening = new GameScreening({
  bridge: window.catchList,
  getEntries: () => filteredEntries(),
  apply: payload => { clearGameSelection(); state.payload = payload; render(); },
  notify: message => showToast(message),
});

function searchingCatalog() { return state.active === "games" && state.catalogSearch; }

function library(media = state.active) {
  const data = state.payload?.libraries?.find((item) => item.media === media) ?? { entries: [], sections: [], exists: false };
  if (media === "games" && searchingCatalog()) return { ...data, entries: catalogGames(state.payload) };
  if (media === "games" && Object.hasOwn(hiddenReasons, state.view)) {
    const classified = state.payload.classifiedEntries ??= {};
    const entries = classified[state.view] ??= (state.payload.hiddenEntries ?? [])
      .filter(record => record.media === "games" && (record.reason ?? "played") === state.view && record.available && record.entry)
      .map(record => record.entry);
    return { ...data, entries };
  }
  return data;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

function options(values, selected, allLabel) {
  return [`<option value="all">${allLabel}</option>`, ...values.map((value) => `<option value="${escapeHtml(value)}" ${String(value) === String(selected) ? "selected" : ""}>${escapeHtml(value)}</option>`)].join("");
}

const queryGames = createGameQuery();

function filteredEntries() {
  const data = library();
  const filter = state.filters[state.active];
  if (searchingCatalog()) return state.catalogQuery.trim() ? queryGames(data.entries, { query: state.catalogQuery, sort: filter.sort, sortDirection: filter.sortDirection }, "catalog") : [];
  if (state.active === "games") return queryGames(data.entries, filter, state.view);
  const entries = entriesForView(data.entries, state.view);
  const query = filter.query.trim().toLocaleLowerCase("zh-Hant");
  return entries.filter((entry) => {
    if (filter.newOnly && !entry.isNew) return false;
    if (query && !`${entry.title} ${entry.originalTitle ?? ""}`.toLocaleLowerCase("zh-Hant").includes(query)) return false;
    if (filter.year !== "all" && entry.year !== Number(filter.year)) return false;
    if (state.active === "anime" && filter.season !== "all" && entry.season !== filter.season) return false;
    if (state.active === "movies" && filter.category !== "all" && entry.category !== filter.category) return false;
    if (state.active === "liveAction" && filter.region !== "all" && entry.region !== filter.region) return false;
    return state.active === "liveAction" || entry.score >= Number(filter.min || 0);
  }).sort((a, b) => {
    if (filter.sort === "date") return b.year - a.year || (b.month ?? 0) - (a.month ?? 0) || b.score - a.score || a.title.localeCompare(b.title, "zh-Hant");
    if (filter.sort === "reviews") return Number(b.votes ?? 0) - Number(a.votes ?? 0) || b.score - a.score || a.title.localeCompare(b.title, "zh-Hant");
    return b.score - a.score || a.title.localeCompare(b.title, "zh-Hant");
  });
}

async function hydrateGameCovers(entries) {
  if (!window.catchList.resolveGameCovers) return;
  const appids = entries.map((entry) => entry.appid).filter((appid) => appid && !state.resolvedGameCovers.has(appid) && !state.pendingGameCovers.has(appid));
  if (appids.length === 0) return;
  appids.forEach((appid) => state.pendingGameCovers.add(appid));
  try {
    const covers = await window.catchList.resolveGameCovers(appids);
    appids.forEach((appid) => {
      state.resolvedGameCovers.add(appid);
      if (covers[appid]) state.gameCovers.set(appid, covers[appid]);
    });
  } catch {
    appids.forEach((appid) => state.resolvedGameCovers.add(appid));
  } finally {
    appids.forEach((appid) => state.pendingGameCovers.delete(appid));
  }
  if (state.active === "games") updateRenderedGameCovers(appids);
}

function updateRenderedGameCovers(appids) {
  for (const appid of appids) {
    const coverUrl = state.gameCovers.get(appid);
    if (!coverUrl) continue;
    const placeholder = [...app.querySelectorAll(".game-cover-loading[data-game-appid]")].find((element) => element.dataset.gameAppid === String(appid));
    if (!placeholder) continue;
    const title = placeholder.closest(".item.games")?.querySelector(".title strong")?.textContent ?? "遊戲";
    placeholder.outerHTML = `<button class="game-cover" type="button" data-cover="${escapeHtml(coverUrl)}" data-cover-title="${escapeHtml(title)}" data-game-appid="${escapeHtml(appid)}"><img src="${escapeHtml(coverUrl)}" alt="遊戲封面"></button>`;
  }
}

function showCover(url, title) {
  coverImage.src = url;
  coverImage.alt = `作品封面：${title}`;
  coverTitle.textContent = title;
  coverDialog.showModal();
}

function closeCoverFromBackdrop(event) {
  if (event.target !== coverDialog) return;
  const bounds = coverDialog.getBoundingClientRect();
  const outside = event.clientX < bounds.left
    || event.clientX > bounds.right
    || event.clientY < bounds.top
    || event.clientY > bounds.bottom;
  if (outside) coverDialog.close();
}

coverDialog.addEventListener("click", closeCoverFromBackdrop);

function scoreOptions(selected, game = false) {
  const values = game ? [85, 90, 95, 97] : [7, 7.5, 8, 8.5, 9];
  const label = game ? "不限好評率" : "不限分數";
  return `<option value="0">${label}</option>${values.map((score) => `<option value="${score}" ${Number(selected) === score ? "selected" : ""}>最低 ${game ? `${score}%` : score.toFixed(1)}</option>`).join("")}`;
}

function reviewOptions(selected) {
  const values = [500, 1000, 5000, 10000, 50000];
  return `<option value="0">評論：不限</option>${values.map((reviews) => `<option value="${reviews}" ${Number(selected) === reviews ? "selected" : ""}>${reviews.toLocaleString()}+</option>`).join("")}`;
}

function advancedToolbar(data) {
  const filter = state.filters[state.active];
  if (state.active === "games") {
    return `<div class="game-filter-layout">
      <div class="filter-panel-heading"><strong>條件篩選</strong><button class="button subtle compact" type="button" data-action="clear-filters">清除篩選</button></div>
      <div class="toolbar games game-filter-fields">
        <div class="filter-field rating-range"><span>好評率</span><div class="rating-bounds">${["max", "min"].map(key => ratingInputMarkup(key, filter[key])).join('<span class="rating-separator" aria-hidden="true">－</span>')}</div><small id="ratingRangeError" data-rating-error role="status">${ratingRangeError(filter)}</small></div>
        <label class="filter-field"><span>評論數</span><select class="field reviews-filter" data-filter="minReviews" aria-label="最低評論數">${reviewOptions(filter.minReviews)}</select></label>
        <label class="filter-field"><span>中文支援</span><select class="field chinese-filter" data-filter="chinese" aria-label="中文支援"><option value="all" ${filter.chinese === "all" ? "selected" : ""}>中文：全部</option><option value="supported" ${filter.chinese === "supported" ? "selected" : ""}>✓ 支援</option><option value="unsupported" ${filter.chinese === "unsupported" ? "selected" : ""}>× 不支援</option><option value="unknown" ${filter.chinese === "unknown" ? "selected" : ""}>— 待確認</option></select></label>
        <label class="filter-field"><span>收錄來源</span><select class="field" data-filter="manualOnly" aria-label="收錄來源"><option value="all" ${filter.manualOnly !== "manual" ? "selected" : ""}>來源：全部</option><option value="manual" ${filter.manualOnly === "manual" ? "selected" : ""}>只看手動加入</option></select></label>
      </div>
      <div class="game-filter-primary"><div class="mode-filter-group"><span class="filter-label" title="含任一多人功能即歸為多人">遊玩模式</span><div class="mode-segments" role="group" aria-label="遊玩模式">${[["all", "全部"], ["single", "單人"], ["multi", "多人"], ["unknown", "未確認"]].map(([value, label]) => `<button class="button mode-option" type="button" data-player-mode="${value}" aria-pressed="${filter.playerMode === value}">${label}</button>`).join("")}</div></div>
      <div class="game-filter-actions"><button class="button tag-toggle" type="button" data-action="toggle-tags" aria-controls="gameTagPanel" aria-expanded="${filter.tagsOpen}">標籤 ${filter.tags.length}</button></div></div>
    </div>`;
  }
  const years = [...new Set(data.entries.map((entry) => entry.year))].filter(Number.isFinite).sort((a, b) => b - a);
  if (state.active === "liveAction") {
    const regions = [...new Set(data.entries.map((entry) => entry.region))].sort((a, b) => a.localeCompare(b, "zh-Hant"));
    return `<div class="toolbar"><select class="field" data-filter="year" aria-label="年份">${options(years, filter.year, "所有年份")}</select><select class="field" data-filter="region" aria-label="地區">${options(regions, filter.region, "所有地區")}</select></div>`;
  }
  const third = state.active === "anime"
    ? `<select class="field" data-filter="season" aria-label="季度">${options(["春", "夏", "秋", "冬", "劇場版"], filter.season, "所有季度")}</select>`
    : `<select class="field" data-filter="category" aria-label="影片類別">${options([...new Set(data.entries.map((entry) => entry.category))].sort((a, b) => a.localeCompare(b, "zh-Hant")), filter.category, "所有類別")}</select>`;
  return `<div class="toolbar"><select class="field" data-filter="year" aria-label="年份">${options(years, filter.year, "所有年份")}</select>${third}<select class="field" data-filter="min" aria-label="最低評分">${scoreOptions(filter.min)}</select></div>`;
}

function activeFilterCount() {
  const filter = state.filters[state.active];
  const keys = state.active === "games" ? ["minReviews", "chinese", "playerMode", "manualOnly"] : ["year", "season", "category", "region", "min"];
  return keys.filter((key) => filter[key] && !["all", "0"].includes(filter[key])).length
    + (state.active === "games" ? ["min", "max"].filter(key => filter[key] !== "").length : 0)
    + (filter.tags?.length ?? 0);
}

function catalogSwitch() {
  return `<button class="button catalog-switch" type="button" role="switch" aria-checked="${searchingCatalog()}" data-action="toggle-catalog"><span class="switch-track" aria-hidden="true"></span>搜尋全部收錄</button>`;
}

function toolbar(data, count, openLabel) {
  const filter = state.filters[state.active];
  const sorts = state.active === "games" ? [["date:desc", "發售日最新"], ["date:asc", "發售日最舊"], ["score:desc", "好評率最高"], ["score:asc", "好評率最低"], ["reviews:desc", "評論數最多"], ["reviews:asc", "評論數最少"]]
    : [["score", "評分最高"], ["date", "年份最新"], ...(state.active === "anime" ? [] : [["reviews", "票數最多"]])];
  const selected = state.active === "games" ? `${filter.sort}:${filter.sortDirection}` : filter.sort ?? "score";
  const newCount = entriesForView(data.entries, state.view).filter((entry) => entry.isNew).length;
  const query = searchingCatalog() ? state.catalogQuery : filter.query;
  const search = `<div class="search-control"><input class="field search" data-filter="query" value="${escapeHtml(query)}" placeholder="${mediaCopy[state.active].search}" aria-label="搜尋名稱"><button class="search-clear" type="button" data-action="clear-search" aria-label="清除搜尋" ${query ? "" : "hidden"}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>`;
  return `<div class="browse-toolbar${state.active === "games" ? " games-toolbar" : ""}">${state.active === "games" ? `<div class="game-search-group">${search}${catalogSwitch()}</div>` : search}<select class="field sort-field" data-filter="sort" aria-label="排序方式">${sorts.map(([key, label]) => `<option value="${key}" ${key === selected ? "selected" : ""}>${label}</option>`).join("")}</select><button class="button new-filter" type="button" data-action="toggle-new" aria-pressed="${Boolean(filter.newOnly)}" ${state.payload.visitWarning || searchingCatalog() ? "disabled" : ""} title="本次來訪新增的作品；第一次使用先建立基準">新收錄 <span>${newCount}</span></button><button class="button filter-toggle" type="button" data-action="toggle-filters" ${searchingCatalog() ? "disabled" : ""} aria-controls="advancedFilters" aria-expanded="${state.filtersOpen && !searchingCatalog()}">篩選${activeFilterCount() ? ` · ${activeFilterCount()}` : ""}</button><span class="result-count" data-result-count>${count} 筆結果</span>${state.active === "games" ? `<button class="button select-toggle" type="button" data-action="toggle-select" aria-pressed="${state.selectMode}">多選</button>` : `<button class="button subtle batch-open" data-action="open-filtered" ${count ? "" : "disabled"}>${openLabel}</button>`}</div><section id="advancedFilters" aria-label="進階篩選" ${state.filtersOpen && !searchingCatalog() ? "" : "hidden"}>${advancedToolbar(data)}${state.active === "games" ? gameTagPanel() : '<button class="button subtle" type="button" data-action="clear-filters">清除篩選</button>'}</section>${searchingCatalog() ? `<div class="catalog-notice"><strong>全部收錄</strong><span>搜尋所有分類，暫不套用其他篩選</span><button type="button" class="button subtle compact" data-action="toggle-catalog">返回原本清單</button></div>` : ""}`;
}

function syncFilterSummary() {
  const button = app.querySelector('[data-action="toggle-filters"]');
  if (button) button.textContent = `篩選${activeFilterCount() ? ` · ${activeFilterCount()}` : ""}`;
}

function tagOptionMarkup({ tag, count, selected }) {
  return `<button class="game-tag filter-tag${selected ? " selected" : ""}" type="button" data-game-tag="${escapeHtml(tag)}" aria-pressed="${selected ? "true" : "false"}"><span>${escapeHtml(tag)}</span><small>${count}</small></button>`;
}

function gameTagIndex() {
  const source = library("games").entries;
  if (state.gameTagEntries !== source || state.gameTagView !== state.view) {
    state.gameTagEntries = source;
    state.gameTagView = state.view;
    state.gameTagIndex = createTagIndex(entriesForView(source, state.view));
  }
  return state.gameTagIndex;
}

function syncGameTagViewport() {
  const compact = window.matchMedia?.("(max-width: 560px)").matches ?? false;
  const changed = state.gameTagCompact !== compact;
  state.gameTagCompact = compact;
  return changed;
}

function gameTagPanelContent() {
  const filter = state.filters.games;
  const index = gameTagIndex();
  const allOptions = collectTagOptionsFromIndex(index, filter.tags, "");
  const filteredOptions = collectTagOptionsFromIndex(index, filter.tags, filter.tagQuery);
  const selected = filteredOptions.filter((option) => option.selected);
  const available = filteredOptions.filter((option) => !option.selected);
  const searching = filter.tagQuery.trim().length > 0;
  const scrollable = searching || filter.tagOptionsExpanded;
  return {
    selectedMarkup: selected.map(tagOptionMarkup).join(""),
    selectedHidden: selected.length === 0,
    availableMarkup: available.length ? available.map(tagOptionMarkup).join("") : `<p class="tag-panel-empty">沒有符合文字的社群標籤。</p>`,
    availableClass: `tag-options available-tags ${scrollable ? "scrollable" : "compact"}`,
    summary: `${available.length} 個符合 · 共 ${allOptions.length} 個標籤`,
    expanded: filter.tagOptionsExpanded,
  };
}

function gameTagPanel() {
  const filter = state.filters.games;
  const content = gameTagPanelContent();
  return `<section class="tag-panel" id="gameTagPanel" ${filter.tagsOpen ? "" : "hidden"} aria-label="社群標籤篩選"><div class="tag-panel-heading"><div class="tag-panel-title"><strong>社群標籤</strong><span>多選時需同時符合所有標籤</span></div><div class="tag-panel-controls"><input class="field" data-filter="tagQuery" value="${escapeHtml(filter.tagQuery)}" placeholder="搜尋標籤…" aria-label="搜尋社群標籤"><button class="button subtle" type="button" data-action="close-tag-panel">收起篩選</button></div></div><div class="selected-tags" data-selected-tags ${content.selectedHidden ? "hidden" : ""}><span>已選</span><div class="tag-options">${content.selectedMarkup}</div></div><div class="tag-options-meta"><span data-tag-summary>${content.summary}</span><button class="button subtle tag-options-toggle" type="button" data-action="toggle-tag-options" aria-controls="availableGameTags" aria-expanded="${content.expanded}" hidden>${content.expanded ? "收起" : "顯示更多"}</button></div><div class="${content.availableClass}" id="availableGameTags" data-available-tags>${content.availableMarkup}</div></section>`;
}

function displayedEntries(entries) {
  if (state.active === "anime") return entries.map(entry => animeMediaUI.decorate(entry));
  return state.active === "games" ? entries.map((entry) => ({ ...entry, coverUrl: state.gameCovers.get(entry.appid) })) : entries;
}

function gameTagLimit() {
  return state.gameTagCompact ? 3 : 6;
}

function entriesMarkup(entries) {
  const visibleEntries = displayedEntries(entries);
  return visibleEntries.length
    ? visibleEntries.map((entry) => renderItemTemplate(entry, state.active, state.active === "games" ? {
      backlog: searchingCatalog() ? ["backlog", "watchlist"].includes(entry.catalogReason) : ["backlog", "watchlist"].includes(state.view),
      catalogSearch: searchingCatalog(),
      selectMode: state.selectMode,
      selected: state.selectedGames.has(String(entry.appid)),
      selectedTags: searchingCatalog() ? [] : state.filters.games.tags,
      expanded: state.expandedGameTags.has(String(entry.appid ?? entry.id)),
      tagLimit: gameTagLimit(),
    } : undefined)).join("")
    : `<div class="empty">${searchingCatalog() ? (state.catalogQuery.trim() ? "全部收錄中沒有符合的遊戲。<br>可試試原文名稱或 Steam AppID。" : "輸入遊戲名稱或 Steam AppID<br>一次查詢全部、個人收藏、共樂收藏、待觀察、候補、玩過了與暫不考慮。") : ["favorites", "shared"].includes(state.view) ? `目前沒有符合條件的${state.active === "games" ? state.view === "shared" ? "共樂收藏" : "個人收藏" : "收藏"}。<br>可調整篩選，或回到全部清單按作品旁的收藏圖示加入。` : "目前沒有符合條件的作品。<br>可調整搜尋文字或篩選條件。"}</div>`;
}

function gameLoadControlMarkup(visibleCount, totalCount) {
  if (visibleCount >= totalCount) return "";
  return `<div class="game-load-sentinel" data-game-load-sentinel aria-live="polite"><span data-game-load-progress>已顯示 ${visibleCount}／${totalCount} 筆</span><button class="button subtle" type="button" data-action="load-more-games" hidden>顯示更多遊戲</button></div>`;
}

function gameListMarkup(entries) {
  const visibleEntries = entries.slice(0, state.visibleGameCount);
  return `${entriesMarkup(visibleEntries)}${gameLoadControlMarkup(visibleEntries.length, entries.length)}`;
}

function gameColumnHeader() {
  const filter = state.filters.games;
  const sortable = (key, label, text = label) => {
    const active = filter.sort === key;
    const ascending = filter.sortDirection === "asc";
    const next = active && !ascending ? "由小到大" : "由大到小";
    const order = key === "date" ? (next === "由小到大" ? "由舊到新" : "由新到舊") : next;
    return `<button class="column-sort${active ? " active" : ""}" type="button" data-game-sort="${key}" aria-pressed="${active}" aria-label="${label}，${active ? `目前${ascending ? "遞增" : "遞減"}，` : ""}點擊${order}" title="${label}：${order}">${text}<span class="sort-arrow" aria-hidden="true">${active ? ascending ? "↑" : "↓" : "↕"}</span></button>`;
  };
  return `<div class="game-column-header"><span>封面</span><span>遊戲名稱</span><div class="rating-column-sorts" role="group" aria-label="評價排序">${sortable("score", "好評率")}${sortable("reviews", "評論數", "評論")}</div>${sortable("date", "發售日")}<span class="center">中文</span><span class="center" title="一人圖示：單人；群像圖示：多人；問號：未確認">模式</span><span>社群標籤</span><span class="center">管理</span></div>`;
}

function applyGameSort(sort, sortDirection, focusHeader = false) {
  clearTimeout(ratingInputTimer);
  Object.assign(state.filters.games, { sort, sortDirection });
  refreshResults();
  const header = app.querySelector(".game-column-header");
  if (header) header.outerHTML = gameColumnHeader();
  const select = app.querySelector('select[data-filter="sort"]');
  if (select) select.value = `${sort}:${sortDirection}`;
  const visibleHeader = app.querySelector(".game-column-header");
  const start = visibleHeader?.getClientRects().length ? visibleHeader : app.querySelector(".list");
  start?.scrollIntoView({ block: "start", behavior: "instant" });
  if (focusHeader) app.querySelector(`[data-game-sort="${sort}"]`)?.focus({ preventScroll: true });
}

function stopGameAutoLoad() {
  state.gameLoadObserver?.disconnect();
  state.gameLoadObserver = null;
}

function setupGameAutoLoad() {
  stopGameAutoLoad();
  if (state.active !== "games") return;
  const sentinel = app.querySelector("[data-game-load-sentinel]");
  if (!sentinel) return;
  const moreButton = sentinel.querySelector('[data-action="load-more-games"]');
  if (typeof window.IntersectionObserver !== "function") {
    if (moreButton) moreButton.hidden = false;
    return;
  }
  state.gameLoadObserver = new IntersectionObserver((entries) => {
    if (sentinel.isConnected && app.querySelector("[data-game-load-sentinel]") === sentinel
      && entries.some((entry) => entry.isIntersecting)) void appendNextGameBatch();
  }, { rootMargin: "360px 0px" });
  state.gameLoadObserver.observe(sentinel);
}

function appendNextGameBatch() {
  if (state.active !== "games" || state.gameLoadInFlight) return;
  const entries = filteredEntries();
  const previousCount = Math.min(state.visibleGameCount, entries.length);
  if (previousCount >= entries.length) return;
  const nextCount = Math.min(previousCount + GAME_BATCH_SIZE, entries.length);
  const nextEntries = entries.slice(previousCount, nextCount);
  const list = app.querySelector(".list");
  const sentinel = list?.querySelector("[data-game-load-sentinel]");
  if (!list || !sentinel) return;
  state.gameLoadInFlight = true;
  state.visibleGameCount = nextCount;
  sentinel.insertAdjacentHTML("beforebegin", entriesMarkup(nextEntries));
  if (nextCount >= entries.length) {
    sentinel.remove();
    stopGameAutoLoad();
  } else {
    const progress = sentinel.querySelector("[data-game-load-progress]");
    if (progress) progress.textContent = `已顯示 ${nextCount}／${entries.length} 筆`;
  }
  state.gameLoadInFlight = false;
  void hydrateGameCovers(nextEntries);
}

function refreshResults({ hydrateCovers = true, resetGames = true } = {}) {
  const rangeError = app.querySelector("[data-rating-error]");
  if (rangeError) rangeError.textContent = ratingRangeError(state.filters.games);
  for (const input of app.querySelectorAll('.rating-input input')) input.setAttribute("aria-invalid", String(Boolean(ratingRangeError(state.filters.games))));
  syncFilterSummary();
  if (state.view === "hidden" && !searchingCatalog()) return;
  const entries = filteredEntries();
  const count = app.querySelector("[data-result-count]");
  const screeningLaunch = app.querySelector('[data-action="screen-games"]');
  if (screeningLaunch) screeningLaunch.disabled = !["all", "favorites", "shared"].includes(state.view) || searchingCatalog() || !entries.length;
  const openFiltered = app.querySelector('[data-action="open-filtered"]');
  const list = app.querySelector(".list");
  if (!count || !list) return;
  count.textContent = `${entries.length} 筆結果`;
  if (openFiltered) {
    openFiltered.disabled = entries.length === 0;
    openFiltered.textContent = state.active === "liveAction" ? `開啟目前結果 ${entries.length}` : `搜尋目前結果 ${entries.length}`;
  }
  if (state.active === "games") {
    if (resetGames) state.visibleGameCount = GAME_BATCH_SIZE;
    list.innerHTML = gameListMarkup(entries);
    setupGameAutoLoad();
    if (hydrateCovers) void hydrateGameCovers(entries.slice(0, state.visibleGameCount));
    return;
  }
  list.innerHTML = entriesMarkup(entries);
  if (state.active === "anime") animeMediaUI.attach(entries);
}

function refreshTagPanel() {
  const filter = state.filters.games;
  const panel = app.querySelector("#gameTagPanel");
  const toggle = app.querySelector('[data-action="toggle-tags"]');
  if (!panel || !toggle) return;
  panel.hidden = !filter.tagsOpen;
  toggle.setAttribute("aria-expanded", String(filter.tagsOpen));
  toggle.textContent = `標籤 ${filter.tags.length}`;
  const content = gameTagPanelContent();
  const selectedRoot = panel.querySelector("[data-selected-tags]");
  const selectedOptions = selectedRoot?.querySelector(".tag-options");
  if (selectedRoot && selectedOptions) {
    selectedRoot.hidden = content.selectedHidden;
    selectedOptions.innerHTML = content.selectedMarkup;
  }
  const availableRoot = panel.querySelector("[data-available-tags]");
  if (availableRoot) {
    availableRoot.className = content.availableClass;
    availableRoot.innerHTML = content.availableMarkup;
  }
  const summary = panel.querySelector("[data-tag-summary]");
  if (summary) summary.textContent = content.summary;
  const more = panel.querySelector('[data-action="toggle-tag-options"]');
  if (more) {
    more.setAttribute("aria-expanded", String(content.expanded));
    more.textContent = content.expanded ? "收起" : "顯示更多";
  }
  syncTagOptionsOverflow();
}

function syncTagOptionsOverflow() {
  const panel = app.querySelector("#gameTagPanel");
  const optionsRoot = panel?.querySelector("[data-available-tags]");
  const more = panel?.querySelector('[data-action="toggle-tag-options"]');
  if (!panel || panel.hidden || !optionsRoot || !more) return;
  const filter = state.filters.games;
  if (filter.tagQuery.trim()) {
    more.hidden = true;
    return;
  }
  if (filter.tagOptionsExpanded) {
    more.hidden = false;
    return;
  }
  more.hidden = optionsRoot.scrollHeight <= optionsRoot.clientHeight + 1;
}

function syncModeControls() {
  for (const button of app.querySelectorAll("[data-player-mode]")) {
    button.setAttribute("aria-pressed", String(button.dataset.playerMode === state.filters.games.playerMode));
  }
}

function syncGameControls() {
  syncModeControls();
  const filter = state.filters[state.active];
  for (const key of ["query", "year", "month", "season", "category", "region", "min", "max", "minReviews", "chinese", "playerMode", "tagQuery", "manualOnly"]) {
    const control = app.querySelector(`[data-filter="${key}"]`);
    if (control) control.value = filter[key];
  }
  const clearSearch = app.querySelector('[data-action="clear-search"]');
  if (clearSearch) clearSearch.hidden = !filter.query;
}

function refreshGameBrowser(options) {
  refreshResults(options);
  refreshTagPanel();
}

function batchToolbar() {
  return `<section class="game-batch-toolbar" aria-label="批次遊戲操作" ${state.selectMode ? "" : "hidden"}>
    <div class="batch-selection"><strong data-selection-count aria-live="polite">已選 ${state.selectedGames.size} 款</strong><button class="button subtle compact" data-action="select-loaded">全選已載入</button><button class="button subtle compact" data-action="clear-selection">取消全選</button></div>
    <div class="batch-actions"><select class="field" data-batch-reason aria-label="批次隱藏分類">${reasonOptions("backlog")}</select><button class="button" data-action="batch-hide" ${state.selectedGames.size ? "" : "disabled"}>批次隱藏</button><button class="button danger" data-action="batch-delete" ${state.selectedGames.size ? "" : "disabled"}>批次刪除</button><button class="button subtle" data-action="end-select">結束多選</button></div>
    <small>全選僅涵蓋已載入的遊戲；更改搜尋或篩選會清空勾選。</small>
  </section>`;
}
function syncGameSelection() {
  app.querySelectorAll("[data-select-game]").forEach(input => {
    input.checked = state.selectedGames.has(input.dataset.selectGame);
    input.closest(".item").classList.toggle("selected-game", input.checked);
    input.disabled = state.mutationPending;
  });
  const count = app.querySelector("[data-selection-count]");
  if (count) count.textContent = `已選 ${state.selectedGames.size} 款`;
  app.querySelectorAll(".game-batch-toolbar button, .game-batch-toolbar select").forEach(button => {
    button.disabled = state.mutationPending || (["batch-hide", "batch-delete"].includes(button.dataset.action) && !state.selectedGames.size);
  });
}
function clearGameSelection() { state.selectedGames.clear(); syncGameSelection(); }
async function runGameBatch(action) {
  if (!state.selectedGames.size || state.mutationPending) return;
  state.mutationPending = true;
  app.inert = true;
  syncGameSelection();
  try {
    const reason = app.querySelector("[data-batch-reason]").value;
    const preview = await window.catchList.previewGameBatch([...state.selectedGames], action, reason);
    const deleting = action === "delete";
    const confirmed = await ask({
      eyebrow: deleting ? "先備份，再永久刪除" : "批次隱藏",
      title: deleting ? `刪除 ${preview.count} 款遊戲？` : `移至「${hiddenReasons[reason]}」？`,
      message: deleting ? "將從下列來源永久移除所選遊戲，個人紀錄與收藏保留。刪除前會保存來源原檔與核對清單；備份供人工還原，沒有立即復原。" : `原始資料與收藏都會保留。實際變更 ${preview.changedCount} 款，已在此分類的 ${preview.skippedCount} 款會略過；完成後可立即復原。`,
      confirm: deleting ? "備份並刪除" : `隱藏 ${preview.changedCount} 款`, danger: deleting,
      details: `<p class="batch-sources">影響來源：${preview.sources.map(escapeHtml).join("、") || "無需變更"}</p><ol class="batch-preview-list" tabindex="0" aria-label="所選遊戲完整名單">${preview.selected.map(entry => `<li><strong>${escapeHtml(entry.title)}</strong><small>AppID ${escapeHtml(entry.appid)}${deleting ? ` · ${entry.sources.map(escapeHtml).join("、")}` : ""}</small></li>`).join("")}</ol>`,
    });
    if (!confirmed) { await window.catchList.cancelGameBatchPreview(); return; }
    const payload = await window.catchList.applyGameBatch(preview.token);
    state.payload = payload;
    state.selectedGames.clear();
    state.visibleGameCount = GAME_BATCH_SIZE;
    render();
    const result = payload.batchResult;
    if (deleting) {
      showToast(`已刪除 ${result.changedCount} 款遊戲。備份：${result.backupPath}`);
      await ask({ eyebrow: "批次刪除完成", title: `已刪除 ${result.changedCount} 款遊戲`, message: "備份已驗證並保存在下列位置。如需還原，請先保留目前來源檔，再使用此備份人工還原。", confirm: "完成", details: `<p class="backup-path">${escapeHtml(result.backupPath)}</p>` });
    } else showToast(`已移至「${hiddenReasons[reason]}」：${result.changedCount} 款，略過 ${result.skippedCount} 款`, result.changedCount > 0);
  } catch (error) { showToast(`${error.message}；勾選已保留。`); }
  finally { state.mutationPending = false; app.inert = false; syncGameSelection(); }
}

function render() {
  document.documentElement.style.setProperty("--reader-header-height", `${document.querySelector(".topbar").getBoundingClientRect().height}px`);
  ratingInputs.close();
  ratingInputs.resetWheel();
  animeMediaUI.stop();
  animeMediaUI.setScope(state.payload?.dataDir);
  closeHideMenu(false);
  if (state.payload?.visitWarning) {
    for (const filter of Object.values(state.filters)) filter.newOnly = false;
  }
  if (state.payload?.appVersion) {
    document.title = `CatchList 閱讀器 ${state.payload.appVersion}`;
    document.querySelector('.brand strong').textContent = `CatchList ${state.payload.appVersion}`;
  }
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.media === state.active));
  folderLabel.textContent = state.payload?.dataDir ?? "選擇資料夾";
  if (!state.payload?.dataDir) {
    app.innerHTML = `<section class="missing"><div class="missing-card"><p class="eyebrow">開始使用</p><h1>選擇清單資料夾</h1><p>請選擇放有「遊戲.md」、「動畫.md」、「電影.md」或「真人劇年度.md」的 CatchList 資料夾。</p><button class="button primary" data-action="choose-folder">選擇資料夾</button></div></section>`;
    return;
  }
  const data = library();
  const hidden = (state.payload.hiddenEntries ?? []).filter((entry) => entry.media === state.active);
  const navigation = viewNavigation(searchingCatalog() ? "catalog" : state.view, state.active, state.payload.libraries.find(item => item.media === state.active)?.entries ?? [], hidden.length, Object.fromEntries(Object.keys(hiddenReasons).map(reason => [reason, hidden.filter(record => (record.reason ?? "played") === reason && record.available).length])));
  const update = updateStatusMarkup(state.payload, state.active, state.statusOpen);
  const operations = state.active === "games" ? `${state.view === "hidden" && !searchingCatalog() ? catalogSwitch() : ""}<button class="button screening-launch" type="button" data-action="screen-games" ${!["all", "favorites", "shared"].includes(state.view) || searchingCatalog() || !filteredEntries().length ? "disabled" : ""}>截圖快篩 <span aria-hidden="true">→</span></button><button class="button add-game-button" type="button" data-action="add-game" ${data.warning ? "disabled" : ""}><span aria-hidden="true">＋</span>新增遊戲</button>` : "";
  const heading = `<div class="browse-heading">${navigation}<div class="browse-tools">${update}${operations}</div></div>${data.warning ? `<p class="status-warning" role="alert">${escapeHtml(data.warning)}</p>` : ""}${data.integrityWarning ? `<p class="status-warning" role="alert">${escapeHtml(data.integrityWarning)}</p>` : ""}`;
  stopGameAutoLoad();
  if (state.view === "hidden" && !searchingCatalog()) {
    const result = hiddenListMarkup(hidden, state.hiddenQuery, state.active === "games" ? state.hiddenReason : "all");
    app.innerHTML = `<div class="layout"><section class="content">${heading}<div class="section-status"><div class="section-summary"><strong>隱藏管理</strong><span data-hidden-count>${result.count} 筆紀錄</span></div></div><p class="view-note">恢復後會回到全部清單，原有收藏也會保留。清除失效紀錄不會重建已刪除的作品。</p><input class="field hidden-search" data-hidden-query value="${escapeHtml(state.hiddenQuery)}" placeholder="搜尋隱藏作品名稱…" aria-label="搜尋隱藏作品名稱">${state.active === "games" ? `<select class="field hidden-reason-filter" data-reason-filter aria-label="篩選隱藏原因"><option value="all">所有原因</option>${reasonOptions(state.hiddenReason)}</select>` : ""}<div class="hidden-list">${result.markup}</div></section></div>`;
    return;
  }
  const entries = filteredEntries();
  const viewData = { ...data, entries: entriesForView(data.entries, state.view) };
  const isGames = state.active === "games";
  if (isGames) syncGameTagViewport();
  const openLabel = state.active === "liveAction" ? `開啟目前結果 ${entries.length}` : `搜尋目前結果 ${entries.length}`;
  stopGameAutoLoad();
  app.innerHTML = `<div class="layout"><section class="content"><h1 class="sr-only">${mediaCopy[state.active].title}</h1>${heading}${isGames && state.view === "watchlist" && !searchingCatalog() ? `<aside class="watchlist-note" aria-label="待觀察說明"><div><strong>先留住興趣，之後再決定</strong><p>未上市、上市未滿六個月，或想再看看評價的遊戲，先放在這裡。一般列表不會顯示。</p><small>點遊戲名稱到 Steam 查看最新評價；決定想玩時，按書籤或書籤加雙人角標圖示移到個人收藏或共樂收藏。手動資料保留加入時的評價，月報收錄後才會改用報告資料。</small></div></aside>` : ""}${toolbar(viewData, entries.length, openLabel)}${state.payload.visitWarning ? `<p class="status-warning" role="alert">${escapeHtml(state.payload.visitWarning)}</p>` : ""}${state.filters[state.active].newOnly && !searchingCatalog() ? '<p class="new-note">顯示本次來訪新增的作品。首次使用先建立基準；重新讀取不會清除本次標記。</p>' : ""}${isGames ? batchToolbar() + gameColumnHeader() : ""}<div class="list">${isGames ? gameListMarkup(entries) : entriesMarkup(entries)}</div></section></div>`;
  if (isGames) {
    syncTagOptionsOverflow();
    setupGameAutoLoad();
    void hydrateGameCovers(entries.slice(0, state.visibleGameCount));
  }
  if (state.active === "anime") animeMediaUI.attach(entries);
}

function ask({ eyebrow = "請確認", title, message, confirm = "確認", danger = false, details = "" }) {
  const detail = document.querySelector("#dialogDetails");
  detail.innerHTML = details;
  detail.hidden = !details;
  dialog.classList.toggle("batch-dialog", Boolean(details));
  dialog.returnValue = "";
  document.querySelector("#dialogEyebrow").textContent = eyebrow;
  document.querySelector("#dialogTitle").textContent = title;
  document.querySelector("#dialogMessage").textContent = message;
  const confirmButton = document.querySelector("#dialogConfirm");
  confirmButton.textContent = confirm;
  confirmButton.classList.toggle("primary", !danger);
  confirmButton.classList.toggle("danger", danger);
  dialog.showModal();
  return new Promise((resolve) => dialog.addEventListener("close", () => resolve(dialog.returnValue === "confirm"), { once: true }));
}

let toastTimer;
let hideMenu;
function closeHideMenu(restoreFocus = true) {
  if (!hideMenu) return;
  const { element, trigger } = hideMenu;
  element.remove();
  trigger.setAttribute("aria-expanded", "false");
  if (restoreFocus) trigger.focus({ preventScroll: true });
  hideMenu = null;
}

function openHideMenu(trigger, entry) {
  closeHideMenu(false);
  const element = document.createElement("div");
  element.className = "hide-menu";
  element.setAttribute("role", "menu");
  element.setAttribute("aria-label", `隱藏 ${entry.title}`);
  element.innerHTML = Object.entries(hiddenReasons).map(([key, label]) => `<button type="button" role="menuitem" data-reason="${key}">${label}</button>`).join("")
    + (entry.hiddenKey ? '<button type="button" role="menuitem" data-reason="restore">恢復顯示</button>' : "");
  document.body.append(element);
  const rect = trigger.getBoundingClientRect();
  element.style.left = `${Math.max(8, Math.min(rect.right - element.offsetWidth, innerWidth - element.offsetWidth - 8))}px`;
  element.style.top = `${Math.max(8, rect.bottom + element.offsetHeight + 8 > innerHeight ? rect.top - element.offsetHeight - 4 : rect.bottom + 4)}px`;
  trigger.setAttribute("aria-expanded", "true");
  hideMenu = { element, trigger };
  element.querySelector("button").focus();
  element.addEventListener("keydown", event => {
    const buttons = [...element.querySelectorAll("button")];
    const index = buttons.indexOf(document.activeElement);
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      buttons[event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length].focus();
    }
    if (event.key === "Escape") { event.preventDefault(); closeHideMenu(); }
    if (event.key === "Tab") closeHideMenu();
  });
  element.addEventListener("click", async event => {
    const reason = event.target.closest("[data-reason]")?.dataset.reason;
    if (!reason || state.mutationPending) return;
    state.mutationPending = true;
    toast.classList.remove("show");
    toast.innerHTML = "";
    closeHideMenu();
    try {
      state.payload = entry.hiddenKey
        ? reason === "restore" ? await window.catchList.restoreHidden(entry.hiddenKey) : await window.catchList.setHiddenReason(entry.hiddenKey, reason)
        : await window.catchList.hideEntry("games", entry.id, reason);
      render();
      showToast(reason === "restore" ? `已恢復「${entry.title}」` : `「${entry.title}」已移至${hiddenReasons[reason]}`, reason !== "restore");
      (toast.querySelector("button") ?? app.querySelector('[data-view="backlog"]'))?.focus({ preventScroll: true });
    } catch (error) { showToast(error.message); }
    finally { state.mutationPending = false; }
  });
}
document.addEventListener("pointerdown", event => {
  if (hideMenu && !hideMenu.element.contains(event.target) && !hideMenu.trigger.contains(event.target)) closeHideMenu(false);
});
window.addEventListener("resize", () => closeHideMenu(false));
window.addEventListener("scroll", () => closeHideMenu(false));
function showToast(message, undo = false) {
  clearTimeout(toastTimer);
  toast.innerHTML = `<span>${escapeHtml(message)}</span>${undo ? '<button data-action="undo">立即復原</button>' : ""}`;
  toast.classList.add("show");
  toastTimer = setTimeout(() => toast.classList.remove("show"), 8000);
}

function scrollToTop() {
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
}

function syncBackToTop() {
  const visible = window.scrollY > 480;
  backToTop.classList.toggle("show", visible);
  backToTop.setAttribute("aria-hidden", String(!visible));
  backToTop.tabIndex = visible ? 0 : -1;
}

async function load() {
  clearGameSelection();
  const media = state.active;
  const request = ++loadRequest;
  try {
    const payload = await window.catchList.load(media);
    if (request !== loadRequest || state.active !== media) return false;
    const top = window.scrollY;
    state.payload = payload;
    animeMediaUI.reset();
    render();
    restoreMediaPosition(top);
    return true;
  } catch (error) {
    if (request === loadRequest && state.active === media) showToast(error.message);
    return false;
  }
}

async function openBatch(urls, label) {
  if (!urls.length) return;
  if (urls.length > MAX_EXTERNAL_BATCH_SIZE) {
    showToast(`一次最多開啟 ${MAX_EXTERNAL_BATCH_SIZE} 個連結，請先縮小篩選結果。`);
    return;
  }
  const confirmed = await ask({ title: `將開啟 ${urls.length} 個分頁`, message: `${label}。瀏覽器可能會詢問是否允許一次開啟多個分頁。`, confirm: "開啟分頁" });
  if (confirmed) await window.catchList.openUrls(urls);
}

document.addEventListener("click", async (event) => {
  if (state.mutationPending && event.target.closest("#app, .tab, [data-action=undo], [data-action=choose-folder]")) return;
  const refresh = event.target.closest("[data-refresh-game]");
  if (refresh) {
    const appid = refresh.dataset.refreshGame;
    if (refreshingGames.has(appid) || awaitingSteamGames.has(appid)) return;
    const directory = state.payload?.dataDir;
    refreshingGames.add(appid);
    refresh.disabled = true;
    refresh.setAttribute("aria-busy", "true");
    refresh.title = "更新中…";
    refresh.setAttribute("aria-label", `${refresh.getAttribute("aria-label")}，更新中`);
    try {
      let payload = await window.catchList.refreshGame(appid);
      if (payload.status === "verification-required") {
        refreshingGames.delete(appid);
        awaitingSteamGames.add(appid);
        refresh.setAttribute("aria-busy", "false");
        refresh.title = "等待 Steam 確認";
        const confirmation = await requestSteamConfirmation(payload);
        if (confirmation.status !== "completed") { showToast("已取消更新，原資訊已保留"); return; }
        payload = confirmation.result;
      }
      if (directory === state.payload?.dataDir && payload.dataDir === directory) state.payload = payload;
      showToast("已更新遊戲的標籤、好評率與評論數");
    } catch (error) { showToast(`更新失敗，保留原資訊：${error.message}`); }
    finally {
      refreshingGames.delete(appid);
      awaitingSteamGames.delete(appid);
      const y = window.scrollY;
      render();
      window.scrollTo({ top: y, behavior: "instant" });
      document.querySelector(`[data-refresh-game="${appid}"]`)?.focus({ preventScroll: true });
    }
    return;
  }
  const modeButton = event.target.closest("[data-player-mode]");
  if (modeButton && state.active === "games") {
    clearGameSelection();
    state.filters.games.playerMode = modeButton.dataset.playerMode;
    syncModeControls();
    refreshGameBrowser();
    return;
  }

  const view = event.target.closest("[data-view]")?.dataset.view;
  if (view) {
    clearGameSelection();
    state.catalogSearch = false;
    state.view = view;
    state.visibleGameCount = GAME_BATCH_SIZE;
    render();
    return;
  }
  const cover = event.target.closest("[data-cover]");
  if (cover) { showCover(cover.dataset.cover, cover.dataset.coverTitle); return; }
  const media = event.target.closest("[data-media]")?.dataset.media;
  if (media) {
    if (media === state.active) return;
    clearGameSelection();
    rememberMediaPosition();
    state.catalogSearch = false;
    state.active = media;
    if (media !== "games" && Object.hasOwn(hiddenReasons, state.view)) state.view = "all";
    const position = mediaPositions.get(media);
    if (media === "games") state.visibleGameCount = position?.gameCount ?? GAME_BATCH_SIZE;
    render();
    restoreMediaPosition(position?.top ?? 0);
    await load();
    return;
  }
  const sortKey = event.target.closest("[data-game-sort]")?.dataset.gameSort;
  if (sortKey && state.active === "games") {
    const filter = state.filters.games;
    applyGameSort(sortKey, filter.sort === sortKey && filter.sortDirection === "desc" ? "asc" : "desc", true);
    return;
  }
  const tag = event.target.closest("[data-game-tag]")?.dataset.gameTag;
  if (tag && state.active === "games") {
    clearGameSelection();
    const tags = state.filters.games.tags;
    state.filters.games.tags = tags.includes(tag) ? tags.filter((value) => value !== tag) : [...tags, tag];
    refreshGameBrowser();
    return;
  }
  const expandButton = event.target.closest("[data-expand-tags]");
  const expandKey = expandButton?.dataset.expandTags;
  if (expandKey) {
    const key = String(expandKey);
    if (state.expandedGameTags.has(key)) state.expandedGameTags.delete(key); else state.expandedGameTags.add(key);
    const entry = library().entries.find(entry => String(entry.appid ?? entry.id) === key);
    const tags = expandButton.closest(".game-tags");
    if (entry && tags) {
      const top = window.scrollY;
      const template = document.createElement("template");
      template.innerHTML = renderGameTags(entry, {
        catalogSearch: searchingCatalog(),
        selectedTags: searchingCatalog() ? [] : state.filters.games.tags,
        expanded: state.expandedGameTags.has(key), tagLimit: gameTagLimit(),
      });
      const replacement = template.content.querySelector(".game-tags");
      const nextButton = replacement.querySelector("[data-expand-tags]");
      const restoreFocus = document.activeElement === expandButton;
      // 保留原按鈕，鍵盤焦點、列節點與封面皆不受標籤更新影響。
      for (const attribute of nextButton.attributes) expandButton.setAttribute(attribute.name, attribute.value);
      expandButton.textContent = nextButton.textContent;
      nextButton.replaceWith(expandButton);
      tags.replaceChildren(...replacement.childNodes);
      if (restoreFocus) expandButton.focus({ preventScroll: true });
      window.scrollTo({ top, behavior: "instant" });
    }
    return;
  }
  const action = event.target.closest("[data-action]")?.dataset.action;
  try {
    if (action === "toggle-select") { state.selectMode = !state.selectMode; state.selectedGames.clear(); render(); return; }
    if (action === "end-select") { state.selectMode = false; state.selectedGames.clear(); render(); return; }
    if (action === "select-loaded") { app.querySelectorAll("[data-select-game]").forEach(input => state.selectedGames.add(input.dataset.selectGame)); syncGameSelection(); return; }
    if (action === "clear-selection") { clearGameSelection(); return; }
    if (action === "batch-hide" || action === "batch-delete") { await runGameBatch(action === "batch-hide" ? "hide" : "delete"); return; }
    if (action === "toggle-catalog" && state.active === "games") {
      clearGameSelection();
      state.catalogSearch = !state.catalogSearch;
      if (state.catalogSearch) state.catalogQuery = state.view === "hidden" ? state.hiddenQuery : state.filters.games.query;
      state.visibleGameCount = GAME_BATCH_SIZE;
      render();
      app.querySelector(searchingCatalog() || state.view !== "hidden" ? '[data-filter="query"]' : "[data-hidden-query]")?.focus({ preventScroll: true });
      return;
    }
    if (action === "add-game" && state.active === "games") {
      openManualGamePanel({ destination: ["watchlist", "favorites", "shared"].includes(state.view) ? state.view : "backlog", onSaved: (payload) => { clearGameSelection(); const y = window.scrollY; state.payload = payload; toast.classList.remove("show"); render(); window.scrollTo({ top: y, behavior: "instant" }); }, onView: viewGame });
    }
    if (action === "toggle-filters") {
      state.filtersOpen = !state.filtersOpen;
      app.querySelector("#advancedFilters").hidden = !state.filtersOpen;
      app.querySelector('[data-action="toggle-filters"]').setAttribute("aria-expanded", String(state.filtersOpen));
      if (state.filtersOpen && state.active === "games") syncTagOptionsOverflow();
    }
    if (action === "toggle-new") { clearGameSelection(); state.filters[state.active].newOnly = !state.filters[state.active].newOnly; render(); }
    if (action === "clear-search") {
      clearGameSelection();
      const input = app.querySelector('input[data-filter="query"]');
      if (searchingCatalog()) state.catalogQuery = ""; else state.filters[state.active].query = "";
      if (input) input.value = "";
      event.target.closest("[data-action=\"clear-search\"]").hidden = true;
      refreshResults();
      input?.focus({ preventScroll: true });
      return;
    }
    const noteId = event.target.closest("[data-game-note]")?.dataset.gameNote;
    if (noteId) {
      if (state.mutationPending) return;
      const entry = catalogGames(state.payload).find(item => item.id === noteId);
      if (!entry) throw new Error("遊戲已變更，請重新讀取");
      openGameNote(entry, {
        save: (id, text) => window.catchList.setGameNote(id, text),
        onSaved: payload => {
          const y = window.scrollY;
          state.payload = payload;
          render();
          window.scrollTo({ top: y, behavior: "instant" });
          showToast("備註已儲存");
        },
        onClose: () => app.querySelector(`[data-game-note="${CSS.escape(noteId)}"]`)?.focus({ preventScroll: true }),
      });
      return;
    }
    const favoriteId = event.target.closest("[data-favorite]")?.dataset.favorite;
    const restoreKey = event.target.closest("[data-restore]")?.dataset.restore;
    if (favoriteId || restoreKey) {
      clearGameSelection();
      if (state.mutationPending) return;
      state.mutationPending = true;
      try {
        if (favoriteId) {
          const entry = library().entries.find((item) => item.id === favoriteId);
          if (!entry) throw new Error("作品已變更，請重新讀取");
          const kind = event.target.closest("[data-favorite]").dataset.favoriteKind ?? "personal";
          const wasSelected = entry.favorite && (state.active !== "games" || (entry.favoriteKind ?? "personal") === kind);
          state.payload = await window.catchList.setFavorite(state.active, favoriteId, !wasSelected, kind);
          render();
          (app.querySelector(`[data-favorite="${CSS.escape(favoriteId)}"][data-favorite-kind="${kind}"]`) ?? app.querySelector(`[data-favorite="${CSS.escape(favoriteId)}"]`) ?? app.querySelector(`.view-button.active`))?.focus({ preventScroll: true });
          const name = state.active === "games" ? kind === "shared" ? "共樂收藏" : "個人收藏" : "收藏";
          showToast(`已${wasSelected ? "取消" : "加入"}${name}「${entry.title}」`);
        } else {
          const record = state.payload.hiddenEntries.find((item) => item.hideKey === restoreKey);
          state.payload = await window.catchList.restoreHidden(restoreKey);
          render();
          showToast(record?.available ? `已恢復「${record.title}」` : "已清除隱藏紀錄");
        }
      } finally { state.mutationPending = false; }
      return;
    }
    if (action === "home" || action === "back-to-top") scrollToTop();
    if (action === "screen-games") { clearGameSelection(); gameScreening.open(filteredEntries(), state.payload.dataDir); }
    if (action === "choose-folder") { clearGameSelection(); state.payload = await window.catchList.chooseDirectory(); state.expandedGameTags.clear(); state.visibleGameCount = GAME_BATCH_SIZE; render(); }
    if (action === "toggle-tags") { state.filters.games.tagsOpen = !state.filters.games.tagsOpen; refreshTagPanel(); }
    if (action === "close-tag-panel") { state.filters.games.tagsOpen = false; refreshTagPanel(); }
    if (action === "toggle-tag-options") { state.filters.games.tagOptionsExpanded = !state.filters.games.tagOptionsExpanded; refreshTagPanel(); }
    if (action === "clear-filters") {
      clearGameSelection();
      clearTimeout(ratingInputTimer);
      const filter = state.filters[state.active];
      Object.assign(filter, { manualOnly: "all", query: "", year: "all", month: "all", season: "all", category: "all", region: "all", min: "0", max: "", minReviews: "0", chinese: "all", playerMode: "all", tags: [], tagQuery: "", tagOptionsExpanded: false });
      if (state.active === "games") { filter.min = ""; delete filter.year; delete filter.month; }
      state.expandedGameTags.clear();
      syncGameControls();
      if (state.active === "games") refreshGameBrowser(); else refreshResults();
      app.querySelector('[data-filter="query"]')?.focus();
    }
    if (action === "open-filtered" && state.active !== "games") {
      const entries = filteredEntries();
      const urls = entries.map((entry) => state.active === "liveAction" ? entry.url : entry.searchUrl);
      const label = state.active === "liveAction" ? "開啟目前篩選結果的 IMDb 或 Google 頁面" : "使用 Google 搜尋目前篩選結果";
      await openBatch(urls, label);
    }
    if (action === "load-more-games") appendNextGameBatch();
    if (action === "undo") { clearGameSelection(); const result = await window.catchList.undoLastOperation(); state.payload = result; toast.classList.remove("show"); render(); showToast(`已復原「${result.restored.title}」`); }
    const copyTitleId = event.target.closest("[data-copy-title]")?.dataset.copyTitle;
    if (copyTitleId) {
      const entry = library().entries.find((item) => item.id === copyTitleId);
      if (!entry) throw new Error("作品已變更，請重新讀取");
      await window.catchList.copyText(state.active === "games" ? formatGameTitleCopyText(entry.title, entry.originalTitle) : entry.title);
      showToast(state.active === "games" ? "已複製遊戲名稱" : "已複製作品名稱");
      return;
    }
    const openUrl = event.target.closest("[data-open]")?.dataset.open;
    if (openUrl) await window.catchList.openUrls([openUrl]);
    const entryId = event.target.closest("[data-hide]")?.dataset.hide;
    if (entryId) {
      const entry = library().entries.find((item) => item.id === entryId);
      if (state.active === "games") { openHideMenu(event.target.closest("[data-hide]"), entry); return; }
      const confirmed = await ask({ eyebrow: "隱藏作品", title: `隱藏「${entry.title}」？`, message: "作品會從閱讀器隱藏，原始資料與收藏都會保留。可立即復原，或之後到隱藏管理恢復。", confirm: "隱藏", danger: true });
      if (confirmed) { state.payload = await window.catchList.hideEntry(state.active, entryId); render(); showToast(`已隱藏「${entry.title}」`, true); }
    }
    const deleteEntryId = event.target.closest("[data-delete]")?.dataset.delete;
    if (deleteEntryId) {
      const entry = library().entries.find((item) => item.id === deleteEntryId);
      const confirmed = await ask({ eyebrow: "真正刪除作品", title: `真正刪除「${entry.title}」？`, message: entry.manualAdded ? (entry.reportSource ? "這會同時從遊戲.md 與手動清單永久移除這款遊戲，不提供復原。" : "這會從手動清單永久移除這款遊戲，不提供復原。") : "這會從 Markdown 永久移除作品資料，且不會建立備份或提供復原。", confirm: "真正刪除", danger: true });
      if (confirmed) { state.payload = await window.catchList.deleteEntry(state.active, deleteEntryId); render(); showToast(`已真正刪除「${entry.title}」`); }
    }
  } catch (error) { showToast(error.message); }
});

document.addEventListener("input", (event) => {
  if (state.active === "games" && event.target.matches('.rating-input input[data-filter]')) {
    clearGameSelection();
    state.filters.games[event.target.dataset.filter] = event.target.validity.badInput ? "NaN" : event.target.value;
    clearTimeout(ratingInputTimer);
    ratingInputTimer = setTimeout(() => { if (state.active === "games") refreshResults(); }, 150);
    return;
  }
  if (event.target.matches("[data-hidden-query]")) {
    state.hiddenQuery = event.target.value;
    const records = (state.payload.hiddenEntries ?? []).filter((entry) => entry.media === state.active);
    const result = hiddenListMarkup(records, state.hiddenQuery, state.active === "games" ? state.hiddenReason : "all");
    app.querySelector(".hidden-list").innerHTML = result.markup;
    app.querySelector("[data-hidden-count]").textContent = `${result.count} 筆紀錄`;
    return;
  }
  if (event.target.matches('input[data-filter="query"]')) {
    clearGameSelection();
    if (searchingCatalog()) state.catalogQuery = event.target.value; else state.filters[state.active].query = event.target.value;
    const clear = event.target.closest(".search-control")?.querySelector('[data-action="clear-search"]');
    if (clear) clear.hidden = event.target.value.length === 0;
    refreshResults();
    return;
  }
  if (state.active === "games" && event.target.matches('input[data-filter="tagQuery"]')) {
    state.filters.games.tagQuery = event.target.value;
    refreshTagPanel();
  }
});

document.addEventListener("change", async (event) => {
  if (event.target.matches("[data-select-game]")) {
    if (state.mutationPending) return;
    const id = event.target.dataset.selectGame;
    if (event.target.checked) state.selectedGames.add(id); else state.selectedGames.delete(id);
    syncGameSelection();
    return;
  }
  if (event.target.matches("[data-reason-filter]")) { state.hiddenReason = event.target.value; render(); return; }
  if (event.target.matches("[data-hidden-reason]")) {
    if (state.mutationPending) return;
    state.mutationPending = true;
    try { state.payload = await window.catchList.setHiddenReason(event.target.dataset.hiddenReason, event.target.value); render(); showToast("已修改隱藏原因", true); }
    catch (error) { showToast(error.message); render(); }
    finally { state.mutationPending = false; }
    return;
  }
  if (!event.target.matches("select[data-filter]")) return;
  if (state.active === "games" && event.target.dataset.filter === "sort") {
    const [sort, direction] = event.target.value.split(":");
    applyGameSort(sort, direction);
    return;
  }
  clearGameSelection();
  state.filters[state.active][event.target.dataset.filter] = event.target.value;
  if (state.active === "games") refreshGameBrowser(); else render();
});

window.addEventListener("resize", () => {
  document.documentElement.style.setProperty("--reader-header-height", `${document.querySelector(".topbar").getBoundingClientRect().height}px`);
  if (state.active !== "games" || state.view === "hidden" || state.gameResizeFrame) return;
  state.gameResizeFrame = window.requestAnimationFrame(() => {
    state.gameResizeFrame = null;
    if (syncGameTagViewport()) refreshResults({ hydrateCovers: false, resetGames: false });
    syncTagOptionsOverflow();
  });
});

let backToTopFrame;
window.addEventListener("scroll", () => {
  if (backToTopFrame) return;
  backToTopFrame = window.requestAnimationFrame(() => {
    backToTopFrame = null;
    syncBackToTop();
  });
}, { passive: true });

document.addEventListener("toggle", (event) => {
  if (event.target.matches?.(".update-panel")) state.statusOpen = event.target.open;
}, true);

document.addEventListener("click", (event) => {
  if (!event.target.closest(".update-panel")) {
    const panel = app.querySelector(".update-panel");
    if (panel) panel.open = false;
    state.statusOpen = false;
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  const panel = app.querySelector(".update-panel");
  if (panel?.open) { panel.open = false; state.statusOpen = false; panel.querySelector("summary").focus(); }
});

function viewGame(appid) {
  clearGameSelection();
  clearTimeout(ratingInputTimer);
  state.catalogSearch = false;
  const entry = library("games").entries.find((item) => item.appid === appid);
  const hidden = state.payload.hiddenEntries.find((item) => item.media === "games" && item.entry?.appid === appid);
  state.view = hidden ? hidden.reason ?? "played" : entry?.favorite ? entry.favoriteKind === "shared" ? "shared" : "favorites" : "all";
  Object.assign(state.filters.games, { query: "", min: "", max: "", minReviews: "0", chinese: "all", playerMode: "all", tags: [], tagQuery: "", manualOnly: "all", newOnly: false });
  const index = filteredEntries().findIndex((entry) => entry.appid === appid);
  state.visibleGameCount = Math.max(GAME_BATCH_SIZE, Math.ceil((index + 1) / GAME_BATCH_SIZE) * GAME_BATCH_SIZE);
  render();
  const row = app.querySelector(`[data-game-row="${CSS.escape(appid)}"]`);
  row?.scrollIntoView({ block: "center", behavior: "instant" });
  row?.querySelector(".game-title-link")?.focus({ preventScroll: true });
}

syncBackToTop();
load();
