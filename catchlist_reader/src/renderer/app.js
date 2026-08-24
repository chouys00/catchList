import { renderItemTemplate } from "./item-template.js";

const mediaCopy = {
  games: { title: "每月遊戲精選", intro: "按月份檢視值得玩的作品，直接開啟 Steam 商店頁面。", search: "搜尋遊戲名稱…" },
  anime: { title: "動畫探索", intro: "跨季度搜尋高評分動畫，從年份、季度與評分縮小範圍。", search: "搜尋動畫名稱…" },
  movies: { title: "電影探索", intro: "跨月份尋找值得看的電影，以豆瓣估算分數由高到低排列。", search: "搜尋電影名稱…" },
};

const state = {
  active: "games",
  payload: null,
  filters: {
    games: { query: "", genre: "all", period: null },
    anime: { query: "", year: "all", season: "all", min: "0" },
    movies: { query: "", year: "all", category: "all", min: "0" },
  },
};

const app = document.querySelector("#app");
const folderLabel = document.querySelector("#folderLabel");
const dialog = document.querySelector("#confirmDialog");
const toast = document.querySelector("#toast");

function library(media = state.active) {
  return state.payload?.libraries?.find((item) => item.media === media) ?? { entries: [], sections: [], exists: false };
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

function options(values, selected, allLabel) {
  return [`<option value="all">${allLabel}</option>`, ...values.map((value) => `<option value="${escapeHtml(value)}" ${String(value) === String(selected) ? "selected" : ""}>${escapeHtml(value)}</option>`)].join("");
}

function newestPeriod(data) {
  return [...data.sections].sort((a, b) => b.key.localeCompare(a.key))[0]?.key ?? null;
}

function filteredEntries() {
  const data = library();
  const filter = state.filters[state.active];
  const query = filter.query.trim().toLocaleLowerCase("zh-Hant");
  return data.entries.filter((entry) => {
    if (query && !`${entry.title} ${entry.originalTitle ?? ""}`.toLocaleLowerCase("zh-Hant").includes(query)) return false;
    if (state.active === "games") return entry.sectionKey === filter.period && (filter.genre === "all" || entry.genres.includes(filter.genre));
    if (filter.year !== "all" && entry.year !== Number(filter.year)) return false;
    if (state.active === "anime" && filter.season !== "all" && entry.season !== filter.season) return false;
    if (state.active === "movies" && filter.category !== "all" && entry.category !== filter.category) return false;
    return entry.score >= Number(filter.min || 0);
  }).sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, "zh-Hant"));
}

function rail(data) {
  if (state.active !== "games") return `<aside class="rail"><p class="eyebrow">跨期探索</p><p class="rail-note">預設顯示所有年代，依評分由高到低排列。</p></aside>`;
  const periods = [...data.sections].sort((a, b) => b.key.localeCompare(a.key));
  return `<aside class="rail"><p class="eyebrow">月份</p><div class="periods">${periods.map((period) => `<button class="period ${period.key === state.filters.games.period ? "active" : ""}" data-period="${period.key}">${escapeHtml(period.label)}</button>`).join("")}</div><p class="rail-note">月份標題會保留，刪除作品不會影響 CatchList 判斷更新進度。</p></aside>`;
}

function toolbar(data) {
  const filter = state.filters[state.active];
  const search = `<input class="field search" data-filter="query" value="${escapeHtml(filter.query)}" placeholder="${mediaCopy[state.active].search}" aria-label="搜尋名稱">`;
  if (state.active === "games") {
    const genres = [...new Set(data.entries.flatMap((entry) => entry.genres))].sort((a, b) => a.localeCompare(b, "zh-Hant"));
    return `<div class="toolbar games">${search}<select class="field" data-filter="genre" aria-label="遊戲類型">${options(genres, filter.genre, "所有類型")}</select><button class="button subtle" data-action="clear-filters">清除篩選</button></div>`;
  }
  const years = [...new Set(data.entries.map((entry) => entry.year))].sort((a, b) => b - a);
  const third = state.active === "anime"
    ? `<select class="field" data-filter="season" aria-label="季度">${options(["春", "夏", "秋", "冬"], filter.season, "所有季度")}</select>`
    : `<select class="field" data-filter="category" aria-label="影片類別">${options([...new Set(data.entries.map((entry) => entry.category))].sort((a, b) => a.localeCompare(b, "zh-Hant")), filter.category, "所有類別")}</select>`;
  return `<div class="toolbar">${search}<select class="field" data-filter="year" aria-label="年份">${options(years, filter.year, "所有年份")}</select>${third}<select class="field" data-filter="min" aria-label="最低評分"><option value="0">不限分數</option>${[7, 7.5, 8, 8.5, 9].map((score) => `<option value="${score}" ${Number(filter.min) === score ? "selected" : ""}>最低 ${score.toFixed(1)}</option>`).join("")}</select></div>`;
}

function render() {
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.media === state.active));
  folderLabel.textContent = state.payload?.dataDir ?? "選擇資料夾";
  if (!state.payload?.dataDir) {
    app.innerHTML = `<section class="missing"><div class="missing-card"><p class="eyebrow">開始使用</p><h1>選擇清單資料夾</h1><p>請選擇放有「遊戲.md」、「動畫.md」或「電影.md」的 CatchList 資料夾。</p><button class="button primary" data-action="choose-folder">選擇資料夾</button></div></section>`;
    return;
  }
  const data = library();
  if (state.active === "games" && !state.filters.games.period) state.filters.games.period = newestPeriod(data);
  const entries = filteredEntries();
  const openLabel = state.active === "games" ? "開啟本月全部" : `搜尋目前結果 ${entries.length}`;
  const allGames = state.active === "games" ? `<button class="button subtle" data-action="open-all-games">開啟全部 Steam</button>` : "";
  const currentPeriod = state.active === "games" ? data.sections.find((section) => section.key === state.filters.games.period)?.label : "全部年代";
  app.innerHTML = `<div class="layout">${rail(data)}<section class="content"><h1 class="sr-only">${mediaCopy[state.active].title}</h1><div class="section-status"><strong>${escapeHtml(currentPeriod)}</strong><span>${entries.length} 筆結果</span><span>${escapeHtml(mediaCopy[state.active].intro)}</span></div>${toolbar(data)}<div class="bulkbar"><span>${data.exists ? `${data.entries.length} 筆資料 · 已依分數排序` : `找不到 ${data.filename}`}</span><div class="bulk-actions"><button class="button primary" data-action="open-filtered" ${entries.length ? "" : "disabled"}>${openLabel}</button>${allGames}</div></div><div class="list">${entries.length ? entries.map((entry) => renderItemTemplate(entry, state.active)).join("") : `<div class="empty">目前沒有符合條件的作品。<br>可調整搜尋文字或篩選條件。</div>`}</div></section></div>`;
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
  try {
    state.payload = await window.catchList.load();
    render();
  } catch (error) {
    showToast(error.message);
  }
}

async function openBatch(urls, label) {
  if (!urls.length) return;
  const confirmed = await ask({ title: `將開啟 ${urls.length} 個分頁`, message: `${label}。瀏覽器可能會詢問是否允許一次開啟多個分頁。`, confirm: "開啟分頁" });
  if (confirmed) await window.catchList.openUrls(urls);
}

document.addEventListener("click", async (event) => {
  const media = event.target.closest("[data-media]")?.dataset.media;
  if (media) { state.active = media; render(); return; }
  const period = event.target.closest("[data-period]")?.dataset.period;
  if (period) { state.filters.games.period = period; render(); return; }
  const action = event.target.closest("[data-action]")?.dataset.action;
  try {
    if (action === "home") window.scrollTo({ top: 0 });
    if (action === "choose-folder") { state.payload = await window.catchList.chooseDirectory(); state.filters.games.period = null; render(); }
    if (action === "clear-filters") { state.filters.games.query = ""; state.filters.games.genre = "all"; render(); }
    if (action === "open-filtered") {
      const entries = filteredEntries();
      await openBatch(entries.map((entry) => state.active === "games" ? entry.url : entry.searchUrl), state.active === "games" ? "開啟目前月份的 Steam 商店頁面" : "使用 Google 搜尋目前篩選結果");
    }
    if (action === "open-all-games") await openBatch(library("games").entries.map((entry) => entry.url), "開啟清單內全部 Steam 商店頁面");
    if (action === "undo") { const result = await window.catchList.undoDelete(); state.payload = result; toast.classList.remove("show"); render(); showToast(`已復原「${result.restored.title}」`); }
    const openUrl = event.target.closest("[data-open]")?.dataset.open;
    if (openUrl) await window.catchList.openUrls([openUrl]);
    const entryId = event.target.closest("[data-delete]")?.dataset.delete;
    if (entryId) {
      const entry = library().entries.find((item) => item.id === entryId);
      const confirmed = await ask({ eyebrow: "刪除作品", title: `刪除「${entry.title}」？`, message: "這筆資料會從 Markdown 真正刪除。系統會先備份，刪除後可立即復原。", confirm: "刪除", danger: true });
      if (confirmed) { state.payload = await window.catchList.deleteEntry(state.active, entryId); render(); showToast(`已刪除「${entry.title}」`, true); }
    }
  } catch (error) { showToast(error.message); }
});

document.addEventListener("input", (event) => {
  if (!event.target.matches("[data-filter]")) return;
  state.filters[state.active][event.target.dataset.filter] = event.target.value;
  render();
  if (event.target.dataset.filter === "query") document.querySelector('[data-filter="query"]')?.focus();
});

document.addEventListener("change", (event) => {
  if (!event.target.matches("select[data-filter]")) return;
  state.filters[state.active][event.target.dataset.filter] = event.target.value;
  render();
});

load();
