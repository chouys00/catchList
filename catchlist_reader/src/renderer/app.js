import { collectTagOptionsFromIndex, createTagIndex, filterAndSortGames } from "./game-browser.js";
import { renderItemTemplate } from "./item-template.js";
import { viewNavigation, hiddenListMarkup, updateStatusMarkup } from "./personal-ui.js";

const GAME_BATCH_SIZE = 50;
const MAX_EXTERNAL_BATCH_SIZE = 50;

const mediaCopy = {
  games: { title: "遊戲探索", search: "搜尋遊戲名稱…" },
  anime: { title: "動畫探索", search: "搜尋動畫名稱…" },
  movies: { title: "電影探索", search: "搜尋電影名稱…" },
  liveAction: { title: "真人劇年度必看", search: "搜尋真人劇名稱…" },
};

const state = {
  active: "games",
  view: "all",
  hiddenQuery: "",
  statusOpen: false,
  mutationPending: false,
  payload: null,
  filters: {
    games: { query: "", year: "all", month: "all", min: "0", minReviews: "0", chinese: "all", tags: [], tagsOpen: false, tagQuery: "", tagOptionsExpanded: false },
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
};

const app = document.querySelector("#app");
const folderLabel = document.querySelector("#folderLabel");
const dialog = document.querySelector("#confirmDialog");
const coverDialog = document.querySelector("#coverDialog");
const coverImage = document.querySelector("#coverImage");
const coverTitle = document.querySelector("#coverTitle");
const toast = document.querySelector("#toast");
const backToTop = document.querySelector("#backToTop");

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
  const entries = state.view === "favorites" ? data.entries.filter((entry) => entry.favorite) : data.entries;
  const filter = state.filters[state.active];
  if (state.active === "games") return filterAndSortGames(entries, filter);
  const query = filter.query.trim().toLocaleLowerCase("zh-Hant");
  return entries.filter((entry) => {
    if (query && !`${entry.title} ${entry.originalTitle ?? ""}`.toLocaleLowerCase("zh-Hant").includes(query)) return false;
    if (filter.year !== "all" && entry.year !== Number(filter.year)) return false;
    if (state.active === "anime" && filter.season !== "all" && entry.season !== filter.season) return false;
    if (state.active === "movies" && filter.category !== "all" && entry.category !== filter.category) return false;
    if (state.active === "liveAction" && filter.region !== "all" && entry.region !== filter.region) return false;
    return state.active === "liveAction" || entry.score >= Number(filter.min || 0);
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

function toolbar(data) {
  const filter = state.filters[state.active];
  const search = `<input class="field search" data-filter="query" value="${escapeHtml(filter.query)}" placeholder="${mediaCopy[state.active].search}" aria-label="搜尋名稱">`;
  if (state.active === "games") {
    const years = [...new Set(data.entries.map((entry) => entry.year))].filter(Number.isFinite).sort((a, b) => b - a);
    const months = [...new Set(data.entries.map((entry) => entry.month))].filter(Number.isFinite).sort((a, b) => a - b);
    return `<div class="toolbar games">${search}<select class="field" data-filter="year" aria-label="遊戲年份">${options(years, filter.year, "所有年份")}</select><select class="field" data-filter="month" aria-label="遊戲月份">${options(months, filter.month, "所有月份")}</select><select class="field" data-filter="min" aria-label="最低好評率">${scoreOptions(filter.min, true)}</select><select class="field reviews-filter" data-filter="minReviews" aria-label="最低評論數">${reviewOptions(filter.minReviews)}</select><select class="field chinese-filter" data-filter="chinese" aria-label="中文支援"><option value="all" ${filter.chinese === "all" ? "selected" : ""}>中文：全部</option><option value="supported" ${filter.chinese === "supported" ? "selected" : ""}>✓ 支援</option><option value="unsupported" ${filter.chinese === "unsupported" ? "selected" : ""}>× 不支援</option><option value="unknown" ${filter.chinese === "unknown" ? "selected" : ""}>— 待確認</option></select><button class="button tag-toggle" type="button" data-action="toggle-tags" aria-controls="gameTagPanel" aria-expanded="${filter.tagsOpen}">標籤 ${filter.tags.length}</button><button class="button subtle" type="button" data-action="clear-filters">清除篩選</button></div>`;
  }
  const years = [...new Set(data.entries.map((entry) => entry.year))].sort((a, b) => b - a);
  if (state.active === "liveAction") {
    const regions = [...new Set(data.entries.map((entry) => entry.region))].sort((a, b) => a.localeCompare(b, "zh-Hant"));
    return `<div class="toolbar">${search}<select class="field" data-filter="year" aria-label="年份">${options(years, filter.year, "所有年份")}</select><select class="field" data-filter="region" aria-label="地區">${options(regions, filter.region, "所有地區")}</select></div>`;
  }
  const third = state.active === "anime"
    ? `<select class="field" data-filter="season" aria-label="季度">${options(["春", "夏", "秋", "冬"], filter.season, "所有季度")}</select>`
    : `<select class="field" data-filter="category" aria-label="影片類別">${options([...new Set(data.entries.map((entry) => entry.category))].sort((a, b) => a.localeCompare(b, "zh-Hant")), filter.category, "所有類別")}</select>`;
  return `<div class="toolbar">${search}<select class="field" data-filter="year" aria-label="年份">${options(years, filter.year, "所有年份")}</select>${third}<select class="field" data-filter="min" aria-label="最低評分">${scoreOptions(filter.min)}</select></div>`;
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
  return state.active === "games" ? entries.map((entry) => ({ ...entry, coverUrl: state.gameCovers.get(entry.appid) })) : entries;
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
    : `<div class="empty">${state.view === "favorites" ? "目前沒有符合條件的收藏。<br>可調整篩選，或回到全部清單按作品旁的書籤加入收藏。" : "目前沒有符合條件的作品。<br>可調整搜尋文字或篩選條件。"}</div>`;
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
  return `<div class="game-column-header" aria-hidden="true"><span>封面</span><span>遊戲名稱</span><span>好評率</span><span>發售日</span><span class="center">中文</span><span>社群標籤</span><span class="center">管理</span></div>`;
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
  if (state.view === "hidden") return;
  const entries = filteredEntries();
  const count = app.querySelector("[data-result-count]");
  const openFiltered = app.querySelector('[data-action="open-filtered"]');
  const list = app.querySelector(".list");
  if (!count || !openFiltered || !list) return;
  count.textContent = `${entries.length} 筆結果`;
  openFiltered.disabled = entries.length === 0;
  openFiltered.textContent = state.active === "games" ? "開啟目前結果" : state.active === "liveAction" ? `開啟目前結果 ${entries.length}` : `搜尋目前結果 ${entries.length}`;
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
  for (const key of ["query", "year", "month", "min", "minReviews", "chinese", "tagQuery"]) {
    const control = app.querySelector(`[data-filter="${key}"]`);
    if (control) control.value = filter[key];
  }
}

function refreshGameBrowser(options) {
  refreshResults(options);
  refreshTagPanel();
}

function render() {
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
  const navigation = viewNavigation(state.view, state.active, data.entries, hidden.length);
  const update = updateStatusMarkup(state.payload, state.active, state.statusOpen);
  stopGameAutoLoad();
  if (state.view === "hidden") {
    const result = hiddenListMarkup(hidden, state.hiddenQuery);
    app.innerHTML = `<div class="layout"><section class="content">${navigation}${update}<div class="section-status"><div class="section-summary"><strong>隱藏管理</strong><span data-hidden-count>${result.count} 筆紀錄</span></div></div><p class="view-note">恢復後會回到全部清單，原有收藏也會保留。清除失效紀錄不會重建已刪除的作品。</p><input class="field hidden-search" data-hidden-query value="${escapeHtml(state.hiddenQuery)}" placeholder="搜尋隱藏作品名稱…" aria-label="搜尋隱藏作品名稱"><div class="hidden-list">${result.markup}</div></section></div>`;
    return;
  }
  const entries = filteredEntries();
  const isGames = state.active === "games";
  if (isGames) syncGameTagViewport();
  const openLabel = isGames ? "開啟目前結果" : state.active === "liveAction" ? `開啟目前結果 ${entries.length}` : `搜尋目前結果 ${entries.length}`;
  stopGameAutoLoad();
  app.innerHTML = `<div class="layout"><section class="content"><h1 class="sr-only">${mediaCopy[state.active].title}</h1><div class="section-status"><div class="section-summary"><strong>${isGames ? "全部月份" : "全部年代"}</strong><span data-result-count>${entries.length} 筆結果</span></div><div class="section-actions"><button class="button primary" data-action="open-filtered" ${entries.length ? "" : "disabled"}>${openLabel}</button></div></div>${toolbar(data)}${isGames ? gameTagPanel() : ""}${isGames ? gameColumnHeader() : ""}<div class="list">${isGames ? gameListMarkup(entries) : entriesMarkup(entries)}</div></section></div>`;
  app.querySelector(".content").insertAdjacentHTML("afterbegin", `${navigation}${update}${state.view === "favorites" ? '<p class="view-note">收藏有興趣的作品，下次從這裡接著挑。隱藏中的收藏請先到隱藏管理恢復。</p>' : ""}`);
  if (state.view === "favorites") app.querySelector(".section-summary strong").textContent = isGames ? "待玩收藏" : "待看收藏";
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
  try { state.payload = await window.catchList.load(); render(); return true; } catch (error) { showToast(error.message); return false; }
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
  const view = event.target.closest("[data-view]")?.dataset.view;
  if (view) {
    state.view = view;
    state.visibleGameCount = GAME_BATCH_SIZE;
    render();
    return;
  }
  const cover = event.target.closest("[data-cover]");
  if (cover) { showCover(cover.dataset.cover, cover.dataset.coverTitle); return; }
  const media = event.target.closest("[data-media]")?.dataset.media;
  if (media) {
    state.active = media;
    if (media === "games") state.visibleGameCount = GAME_BATCH_SIZE;
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
    if (action === "reload" && await load()) showToast("已重新讀取資料");
    const favoriteId = event.target.closest("[data-favorite]")?.dataset.favorite;
    const restoreKey = event.target.closest("[data-restore]")?.dataset.restore;
    if (favoriteId || restoreKey) {
      if (state.mutationPending) return;
      state.mutationPending = true;
      try {
        if (favoriteId) {
          const entry = library().entries.find((item) => item.id === favoriteId);
          if (!entry) throw new Error("作品已變更，請重新讀取");
          state.payload = await window.catchList.setFavorite(state.active, favoriteId, !entry.favorite);
          render();
          app.querySelector(`[data-favorite="${CSS.escape(favoriteId)}"]`)?.focus({ preventScroll: true });
          showToast(entry.favorite ? `已取消收藏「${entry.title}」` : `已收藏「${entry.title}」`);
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
    if (action === "choose-folder") { state.payload = await window.catchList.chooseDirectory(); state.expandedGameTags.clear(); state.visibleGameCount = GAME_BATCH_SIZE; render(); }
    if (action === "toggle-tags") { state.filters.games.tagsOpen = !state.filters.games.tagsOpen; refreshTagPanel(); }
    if (action === "close-tag-panel") { state.filters.games.tagsOpen = false; refreshTagPanel(); }
    if (action === "toggle-tag-options") { state.filters.games.tagOptionsExpanded = !state.filters.games.tagOptionsExpanded; refreshTagPanel(); }
    if (action === "clear-filters") {
      state.filters.games = { query: "", year: "all", month: "all", min: "0", minReviews: "0", chinese: "all", tags: [], tagsOpen: state.filters.games.tagsOpen, tagQuery: "", tagOptionsExpanded: false };
      state.expandedGameTags.clear();
      syncGameControls();
      refreshGameBrowser();
      app.querySelector('[data-filter="query"]')?.focus();
    }
    if (action === "open-filtered") {
      const entries = filteredEntries();
      const urls = entries.map((entry) => state.active === "games" || state.active === "liveAction" ? entry.url : entry.searchUrl);
      const label = state.active === "games" ? "開啟目前篩選結果的 Steam 商店頁面" : state.active === "liveAction" ? "開啟目前篩選結果的 IMDb 或 Google 頁面" : "使用 Google 搜尋目前篩選結果";
      await openBatch(urls, label);
    }
    if (action === "load-more-games") appendNextGameBatch();
    if (action === "undo") { const result = await window.catchList.undoLastOperation(); state.payload = result; toast.classList.remove("show"); render(); showToast(`已復原「${result.restored.title}」`); }
    const openUrl = event.target.closest("[data-open]")?.dataset.open;
    if (openUrl) await window.catchList.openUrls([openUrl]);
    const entryId = event.target.closest("[data-hide]")?.dataset.hide;
    if (entryId) {
      const entry = library().entries.find((item) => item.id === entryId);
      const confirmed = await ask({ eyebrow: "隱藏作品", title: `隱藏「${entry.title}」？`, message: "作品會從閱讀器隱藏，原始資料與收藏都會保留。可立即復原，或之後到隱藏管理恢復。", confirm: "隱藏", danger: true });
      if (confirmed) { state.payload = await window.catchList.hideEntry(state.active, entryId); render(); showToast(`已隱藏「${entry.title}」`, true); }
    }
    const deleteEntryId = event.target.closest("[data-delete]")?.dataset.delete;
    if (deleteEntryId) {
      const entry = library().entries.find((item) => item.id === deleteEntryId);
      const confirmed = await ask({ eyebrow: "真正刪除作品", title: `真正刪除「${entry.title}」？`, message: "這會從 Markdown 永久移除作品資料，且不會建立備份或提供復原。", confirm: "真正刪除", danger: true });
      if (confirmed) { state.payload = await window.catchList.deleteEntry(state.active, deleteEntryId); render(); showToast(`已真正刪除「${entry.title}」`); }
    }
  } catch (error) { showToast(error.message); }
});

document.addEventListener("input", (event) => {
  if (event.target.matches("[data-hidden-query]")) {
    state.hiddenQuery = event.target.value;
    const records = (state.payload.hiddenEntries ?? []).filter((entry) => entry.media === state.active);
    const result = hiddenListMarkup(records, state.hiddenQuery);
    app.querySelector(".hidden-list").innerHTML = result.markup;
    app.querySelector("[data-hidden-count]").textContent = `${result.count} 筆紀錄`;
    return;
  }
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

syncBackToTop();
load();
