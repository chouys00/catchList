import { collectTagOptionsFromIndex, createTagIndex, filterAndSortGames } from "./game-browser.js";
import { renderItemTemplate } from "./item-template.js";
import { applyDeleteResult, applyUndoResult } from "./library-state.js";
import { createRadarRatingController, loadPrototypeRatings, prototypeRatingKey } from "./radar-rating.js";

const GAME_BATCH_SIZE = 50;

const mediaCopy = {
  games: { title: "遊戲探索", search: "搜尋遊戲名稱…" },
  anime: { title: "動畫探索", search: "搜尋動畫名稱…" },
  movies: { title: "電影探索", search: "搜尋電影名稱…" },
  liveAction: { title: "真人劇年度清單", search: "搜尋真人劇名稱…" },
};

const state = {
  active: "anime",
  payload: null,
  filters: {
    games: { query: "", year: "all", month: "all", min: "0", reviews: "0", qualityOpen: false, tags: [], tagsOpen: false, tagQuery: "", tagOptionsExpanded: false },
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
  gameTagCompact: window.matchMedia?.("(max-width: 560px)").matches ?? false,
  gameResizeFrame: null,
  filterDockCollapsed: false,
  filterDockLastScrollY: window.scrollY,
  filterDockScrollFrame: null,
  prototypeRatings: loadPrototypeRatings(),
  lastDeletedEntry: null,
  libraryMutationPending: false,
};

const app = document.querySelector("#app");
const folderLabel = document.querySelector("#folderLabel");
const dialog = document.querySelector("#confirmDialog");
const coverDialog = document.querySelector("#coverDialog");
const coverImage = document.querySelector("#coverImage");
const coverTitle = document.querySelector("#coverTitle");
const ratingDialog = document.querySelector("#ratingDialog");
const toast = document.querySelector("#toast");

const ratingController = createRadarRatingController({
  dialog: ratingDialog,
  ratings: state.prototypeRatings,
  onChange: ({ type, rating }) => {
    render();
    showToast(type === "save" ? `已暫存五角評分 ${rating.overall.toFixed(1)}／5` : "已取消暫存評分");
  },
});

function library(media = state.active) {
  return state.payload?.libraries?.find((item) => item.media === media) ?? { entries: [], sections: [], exists: false };
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

function options(values, selected, allLabel) {
  return [`<option value="all">${allLabel}</option>`, ...values.map((value) => `<option value="${escapeHtml(value)}" ${String(value) === String(selected) ? "selected" : ""}>${escapeHtml(value)}</option>`)].join("");
}

function filteredEntries() {
  const data = library();
  const filter = state.filters[state.active];
  if (state.active === "games") return filterAndSortGames(data.entries, filter);
  const query = filter.query.trim().toLocaleLowerCase("zh-Hant");
  return data.entries.filter((entry) => {
    if (query && !`${entry.title} ${entry.originalTitle ?? ""}`.toLocaleLowerCase("zh-Hant").includes(query)) return false;
    if (filter.year !== "all" && entry.year !== Number(filter.year)) return false;
    if (state.active === "anime" && filter.season !== "all" && entry.season !== filter.season) return false;
    if (state.active === "movies" && filter.category !== "all" && entry.category !== filter.category) return false;
    if (state.active === "liveAction" && filter.region !== "all" && entry.region !== filter.region) return false;
    if (state.active === "liveAction") return true;
    return entry.score >= Number(filter.min || 0);
  }).sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, "zh-Hant"));
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
  coverImage.alt = `遊戲封面：${title}`;
  coverTitle.textContent = title;
  coverDialog.showModal();
}

function scoreOptions(selected, game = false) {
  const values = game ? [80, 85, 90, 95, 97] : [7, 7.5, 8, 8.5, 9];
  const label = game ? "不限好評率" : "不限分數";
  return `<option value="0">${label}</option>${values.map((score) => `<option value="${score}" ${Number(selected) === score ? "selected" : ""}>最低 ${game ? `${score}%` : score.toFixed(1)}</option>`).join("")}`;
}

function reviewOptions(selected) {
  const values = [500, 1000, 2500, 5000, 10000, 25000];
  return `<option value="0">不限評論數</option>${values.map((reviews) => `<option value="${reviews}" ${Number(selected) === reviews ? "selected" : ""}>至少 ${reviews.toLocaleString()} 則</option>`).join("")}`;
}

function qualityFilterCount(filter) {
  return Number(Number(filter.min) > 0) + Number(Number(filter.reviews) > 0);
}

function toolbar(data, resultCount) {
  const filter = state.filters[state.active];
  const search = `<label class="search-control"><span class="sr-only">搜尋名稱</span><input class="field search" data-filter="query" value="${escapeHtml(filter.query)}" placeholder="${mediaCopy[state.active].search}" aria-label="搜尋名稱"><output class="result-count" data-result-count aria-live="polite">${resultCount} 筆</output></label>`;
  if (state.active === "games") {
    const years = [...new Set(data.entries.map((entry) => entry.year))].filter(Number.isFinite).sort((a, b) => b - a);
    const months = [...new Set(data.entries.map((entry) => entry.month))].filter(Number.isFinite).sort((a, b) => a - b);
    return `<div class="toolbar games">${search}<select class="field" data-filter="year" aria-label="遊戲年份">${options(years, filter.year, "所有年份")}</select><select class="field" data-filter="month" aria-label="遊戲月份">${options(months, filter.month, "所有月份")}</select><button class="button quality-toggle" type="button" data-action="toggle-quality" aria-controls="gameQualityPanel" aria-expanded="${filter.qualityOpen}">口碑門檻 <span>${qualityFilterCount(filter)}</span></button><button class="button tag-toggle" type="button" data-action="toggle-tags" aria-controls="gameTagPanel" aria-expanded="${filter.tagsOpen}">標籤 ${filter.tags.length}</button><button class="button subtle" type="button" data-action="clear-filters">清除篩選</button></div>`;
  }
  const years = [...new Set(data.entries.map((entry) => entry.year))].sort((a, b) => b - a);
  const third = state.active === "anime"
    ? `<select class="field" data-filter="season" aria-label="季度">${options(["春", "夏", "秋", "冬"], filter.season, "所有季度")}</select>`
    : state.active === "movies"
      ? `<select class="field" data-filter="category" aria-label="影片類別">${options([...new Set(data.entries.map((entry) => entry.category))].sort((a, b) => a.localeCompare(b, "zh-Hant")), filter.category, "所有類別")}</select>`
      : `<select class="field" data-filter="region" aria-label="地區">${options([...new Set(data.entries.map((entry) => entry.region))].sort((a, b) => a.localeCompare(b, "zh-Hant")), filter.region, "所有地區")}</select>`;
  const score = state.active === "liveAction" ? "" : `<select class="field" data-filter="min" aria-label="最低評分">${scoreOptions(filter.min)}</select>`;
  return `<div class="toolbar">${search}<select class="field" data-filter="year" aria-label="年份">${options(years, filter.year, "所有年份")}</select>${third}${score}</div>`;
}

function tagOptionMarkup({ tag, count, selected }) {
  return `<button class="game-tag filter-tag${selected ? " selected" : ""}" type="button" data-game-tag="${escapeHtml(tag)}" aria-pressed="${selected ? "true" : "false"}"><span>${escapeHtml(tag)}</span><small>${count}</small></button>`;
}

function gameTagIndex() {
  const entries = library("games").entries;
  if (state.gameTagEntries !== entries) {
    state.gameTagEntries = entries;
    state.gameTagIndex = createTagIndex(entries);
  }
  return state.gameTagIndex;
}

function syncGameTagViewport() {
  const compact = window.matchMedia?.("(max-width: 560px)").matches ?? false;
  const changed = state.gameTagCompact !== compact;
  state.gameTagCompact = compact;
  return changed;
}

function filterDock() {
  return app.querySelector("[data-filter-dock]");
}

function setFilterDockCollapsed(collapsed) {
  state.filterDockCollapsed = collapsed;
  filterDock()?.classList.toggle("is-collapsed", collapsed);
}

function filterDockMustStayOpen() {
  return state.active === "games" && (state.filters.games.tagsOpen || state.filters.games.qualityOpen);
}

function syncFilterDockOnScroll() {
  state.filterDockScrollFrame = null;
  const dock = filterDock();
  if (!dock) return;

  const currentScrollY = Math.max(0, window.scrollY);
  const previousScrollY = state.filterDockLastScrollY;
  state.filterDockLastScrollY = currentScrollY;
  const topbarBottom = document.querySelector(".topbar")?.getBoundingClientRect().bottom ?? 0;
  const dockIsPinned = dock.getBoundingClientRect().top <= topbarBottom + 1;

  if (!dockIsPinned || currentScrollY <= 0 || filterDockMustStayOpen()) {
    setFilterDockCollapsed(false);
    return;
  }

  const delta = currentScrollY - previousScrollY;
  if (Math.abs(delta) < 8) return;
  setFilterDockCollapsed(delta > 0);
}

function scheduleFilterDockSync() {
  if (state.filterDockScrollFrame) return;
  state.filterDockScrollFrame = window.requestAnimationFrame(syncFilterDockOnScroll);
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

function gameQualityPanel() {
  const filter = state.filters.games;
  return `<section class="quality-panel" id="gameQualityPanel" ${filter.qualityOpen ? "" : "hidden"} aria-label="遊戲口碑門檻"><label class="quality-field"><span>最低好評率</span><select class="field" data-filter="min" aria-label="最低好評率">${scoreOptions(filter.min, true)}</select></label><label class="quality-field"><span>最低評論數</span><select class="field" data-filter="reviews" aria-label="最低評論數">${reviewOptions(filter.reviews)}</select></label></section>`;
}

function displayedEntries(entries) {
  return entries.map((entry) => ({
    ...entry,
    ...(state.active === "games" ? { coverUrl: state.gameCovers.get(entry.appid) } : {}),
    personalRating: state.prototypeRatings.get(prototypeRatingKey(state.active, entry.id))?.overall ?? null,
  }));
}

function gameTagLimit() {
  return state.gameTagCompact ? 3 : 6;
}

function entriesMarkup(entries) {
  const visibleEntries = displayedEntries(entries);
  return visibleEntries.length
    ? visibleEntries.map((entry) => renderItemTemplate(entry, state.active, state.active === "games" ? {
      selectedTags: state.filters.games.tags,
      expanded: state.expandedGameTags.has(String(entry.appid ?? entry.id)),
      tagLimit: gameTagLimit(),
    } : undefined)).join("")
    : `<div class="empty">目前沒有符合條件的作品。<br>可調整搜尋文字或篩選條件。</div>`;
}

function gameLoadControlMarkup(visibleCount, totalCount) {
  if (visibleCount >= totalCount) return "";
  return `<div class="game-load-sentinel" data-game-load-sentinel aria-live="polite"><span data-game-load-progress>已顯示 ${visibleCount}／${totalCount} 筆</span><button class="button subtle" type="button" data-action="load-more-games" hidden>顯示更多遊戲</button></div>`;
}

function gameListMarkup(entries) {
  const visibleEntries = entries.slice(0, state.visibleGameCount);
  return `${entriesMarkup(visibleEntries)}${gameLoadControlMarkup(visibleEntries.length, entries.length)}`;
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
    if (entries.some((entry) => entry.isIntersecting)) void appendNextGameBatch();
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
  const entries = filteredEntries();
  const count = app.querySelector("[data-result-count]");
  const list = app.querySelector(".list");
  if (!count || !list) return;
  count.textContent = `${entries.length} 筆`;
  if (state.active === "games") {
    if (resetGames) state.visibleGameCount = GAME_BATCH_SIZE;
    list.innerHTML = gameListMarkup(entries);
    setupGameAutoLoad();
    if (hydrateCovers) void hydrateGameCovers(entries.slice(0, state.visibleGameCount));
    return;
  }
  list.innerHTML = entriesMarkup(entries);
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

function syncGameControls() {
  const filter = state.filters.games;
  for (const key of ["query", "year", "month", "min", "reviews", "tagQuery"]) {
    const control = app.querySelector(`[data-filter="${key}"]`);
    if (control) control.value = filter[key];
  }
}

function syncQualityControls() {
  const filter = state.filters.games;
  const toggle = app.querySelector('[data-action="toggle-quality"]');
  if (!toggle) return;
  toggle.setAttribute("aria-expanded", String(filter.qualityOpen));
  toggle.innerHTML = `口碑門檻 <span>${qualityFilterCount(filter)}</span>`;
}

function refreshGameBrowser(options) {
  refreshResults(options);
  syncQualityControls();
  refreshTagPanel();
}

function render() {
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.media === state.active));
  folderLabel.textContent = state.payload?.dataDir ?? "選擇資料夾";
  if (!state.payload?.dataDir) {
    app.innerHTML = `<section class="missing"><div class="missing-card"><p class="eyebrow">開始使用</p><h1>選擇清單資料夾</h1><p>請選擇放有「遊戲.md」、「動畫.md」或「電影.md」的 CatchList 資料夾。</p><button class="button primary" data-action="choose-folder">選擇資料夾</button></div></section>`;
    return;
  }
  const data = library();
  const entries = filteredEntries();
  const isGames = state.active === "games";
  if (isGames) syncGameTagViewport();
  const warning = isGames && data.tagWarning ? `<p class="tag-sidecar-warning" role="status">${escapeHtml(data.tagWarning)}。目前仍可使用報告內的遊戲類型。</p>` : "";
  stopGameAutoLoad();
  app.innerHTML = `<div class="layout"><section class="content"><h1 class="sr-only">${mediaCopy[state.active].title}</h1><div class="filter-dock${state.filterDockCollapsed ? " is-collapsed" : ""}" data-filter-dock>${warning}${toolbar(data, entries.length)}${isGames ? `${gameQualityPanel()}${gameTagPanel()}` : ""}</div><div class="list">${isGames ? gameListMarkup(entries) : entriesMarkup(entries)}</div></section></div>`;
  state.filterDockLastScrollY = window.scrollY;
  if (isGames) {
    syncTagOptionsOverflow();
    setupGameAutoLoad();
    void hydrateGameCovers(entries.slice(0, state.visibleGameCount));
  }
}

function ask({ eyebrow = "請確認", title, message, confirm = "確認", danger = false }) {
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
function showToast(message, undo = false) {
  clearTimeout(toastTimer);
  toast.innerHTML = `<span>${escapeHtml(message)}</span>${undo ? '<button data-action="undo">立即復原</button>' : ""}`;
  toast.classList.add("show");
  toastTimer = setTimeout(() => toast.classList.remove("show"), 8000);
}

async function load() {
  try { state.payload = await window.catchList.load(); render(); } catch (error) { showToast(error.message); }
}

document.addEventListener("click", async (event) => {
  const cover = event.target.closest("[data-cover]");
  if (cover) { showCover(cover.dataset.cover, cover.dataset.coverTitle); return; }
  const media = event.target.closest("[data-media]")?.dataset.media;
  if (media) {
    state.active = media;
    if (media === "games") state.visibleGameCount = GAME_BATCH_SIZE;
    setFilterDockCollapsed(false);
    render();
    return;
  }
  const tag = event.target.closest("[data-game-tag]")?.dataset.gameTag;
  if (tag && state.active === "games") {
    const tags = state.filters.games.tags;
    state.filters.games.tags = tags.includes(tag) ? tags.filter((value) => value !== tag) : [...tags, tag];
    refreshGameBrowser();
    return;
  }
  const expandKey = event.target.closest("[data-expand-tags]")?.dataset.expandTags;
  if (expandKey) {
    const key = String(expandKey);
    if (state.expandedGameTags.has(key)) state.expandedGameTags.delete(key); else state.expandedGameTags.add(key);
    refreshResults({ hydrateCovers: false, resetGames: false });
    return;
  }
  const action = event.target.closest("[data-action]")?.dataset.action;
  try {
    if (action === "home") window.scrollTo({ top: 0 });
    if (action === "choose-folder") { state.payload = await window.catchList.chooseDirectory(); state.expandedGameTags.clear(); state.visibleGameCount = GAME_BATCH_SIZE; render(); }
    if (action === "toggle-quality") { state.filters.games.qualityOpen = !state.filters.games.qualityOpen; setFilterDockCollapsed(false); render(); }
    if (action === "toggle-tags") { state.filters.games.tagsOpen = !state.filters.games.tagsOpen; setFilterDockCollapsed(false); refreshTagPanel(); }
    if (action === "close-tag-panel") { state.filters.games.tagsOpen = false; refreshTagPanel(); }
    if (action === "toggle-tag-options") { state.filters.games.tagOptionsExpanded = !state.filters.games.tagOptionsExpanded; refreshTagPanel(); }
    if (action === "clear-filters") {
      state.filters.games = { query: "", year: "all", month: "all", min: "0", reviews: "0", qualityOpen: state.filters.games.qualityOpen, tags: [], tagsOpen: state.filters.games.tagsOpen, tagQuery: "", tagOptionsExpanded: false };
      state.expandedGameTags.clear();
      syncGameControls();
      refreshGameBrowser();
      app.querySelector('[data-filter="query"]')?.focus();
    }
    if (action === "load-more-games") appendNextGameBatch();
    if (action === "undo") {
      if (state.libraryMutationPending) return;
      state.libraryMutationPending = true;
      const undoButton = event.target.closest('[data-action="undo"]');
      if (undoButton) undoButton.disabled = true;
      try {
        const result = await window.catchList.undoDelete();
        try {
          state.payload = applyUndoResult(state.payload, result, state.lastDeletedEntry);
        } catch {
          state.payload = await window.catchList.load();
        }
        state.lastDeletedEntry = null;
        toast.classList.remove("show");
        render();
        showToast(`已復原「${result.title}」`);
      } finally {
        state.libraryMutationPending = false;
        if (undoButton?.isConnected) undoButton.disabled = false;
      }
    }
    const ratingId = event.target.closest("[data-rate]")?.dataset.rate;
    if (ratingId) {
      const entry = library().entries.find((item) => item.id === ratingId);
      if (entry) ratingController.open({ key: prototypeRatingKey(state.active, entry.id), title: entry.title });
      return;
    }
    const openUrl = event.target.closest("[data-open]")?.dataset.open;
    if (openUrl) await window.catchList.openUrls([openUrl]);
    const entryId = event.target.closest("[data-delete]")?.dataset.delete;
    if (entryId) {
      if (state.libraryMutationPending) return;
      const entry = library().entries.find((item) => item.id === entryId);
      const confirmed = await ask({ eyebrow: "刪除作品", title: `刪除「${entry.title}」？`, message: "這筆資料會從 Markdown 真正刪除。系統會先備份，刪除後可立即復原。", confirm: "刪除", danger: true });
      if (confirmed) {
        state.libraryMutationPending = true;
        const deleteButton = event.target.closest("[data-delete]");
        if (deleteButton) { deleteButton.disabled = true; deleteButton.textContent = "刪除中…"; }
        try {
          const result = await window.catchList.deleteEntry(state.active, entryId);
          try {
            const applied = applyDeleteResult(state.payload, result);
            state.payload = applied.payload;
            state.lastDeletedEntry = applied.removed;
          } catch {
            state.payload = await window.catchList.load();
            state.lastDeletedEntry = null;
          }
          render();
          showToast(`已刪除「${entry.title}」`, true);
        } finally {
          state.libraryMutationPending = false;
          if (deleteButton?.isConnected) { deleteButton.disabled = false; deleteButton.textContent = "刪除"; }
        }
      }
    }
  } catch (error) { showToast(error.message); }
});

document.addEventListener("input", (event) => {
  if (event.target.matches('input[data-filter="query"]')) {
    state.filters[state.active].query = event.target.value;
    refreshResults();
    return;
  }
  if (state.active === "games" && event.target.matches('input[data-filter="tagQuery"]')) {
    state.filters.games.tagQuery = event.target.value;
    refreshTagPanel();
  }
});

document.addEventListener("change", (event) => {
  if (!event.target.matches("select[data-filter]")) return;
  state.filters[state.active][event.target.dataset.filter] = event.target.value;
  if (state.active === "games") refreshGameBrowser(); else render();
});

window.addEventListener("resize", () => {
  if (state.active !== "games" || state.gameResizeFrame) return;
  state.gameResizeFrame = window.requestAnimationFrame(() => {
    state.gameResizeFrame = null;
    if (syncGameTagViewport()) refreshResults({ hydrateCovers: false, resetGames: false });
    syncTagOptionsOverflow();
  });
});

window.addEventListener("scroll", scheduleFilterDockSync, { passive: true });

document.addEventListener("focusin", (event) => {
  if (!event.target.closest?.("[data-filter-dock]")) return;
  if (state.filterDockScrollFrame) {
    window.cancelAnimationFrame(state.filterDockScrollFrame);
    state.filterDockScrollFrame = null;
  }
  state.filterDockLastScrollY = Math.max(0, window.scrollY);
  setFilterDockCollapsed(false);
});

load();
