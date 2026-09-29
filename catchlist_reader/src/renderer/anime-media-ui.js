import { renderItemTemplate } from "./item-template.js";

const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export class AnimeMediaUI {
  constructor(root, showMessage) {
    this.root = root;
    this.showMessage = showMessage;
    this.cache = new Map();
    this.queue = [];
    this.entries = new Map();
    this.scope = null;
    this.busy = false;
    this.active = false;
    this.dialogToken = 0;
    this.generation = 0;
    document.addEventListener("click", event => {
      const edit = event.target.closest("[data-anime-edit]");
      const retry = event.target.closest("[data-anime-retry]");
      if (edit) this.openEditor(edit.dataset.animeEdit);
      if (retry) { this.cache.delete(retry.dataset.animeRetry); this.enqueue(retry.dataset.animeRetry, true); }
    });
    root.addEventListener("error", event => {
      const image = event.target;
      if (image.matches?.(".anime-cover img")) {
        image.parentElement.outerHTML = '<div class="anime-cover anime-cover-empty"><span>封面暫時無法載入</span></div>';
      }
    }, true);
  }

  decorate(entry) { return { ...entry, animeMedia: this.cache.get(entry.id) }; }
  stop() { this.active = false; this.observer?.disconnect(); this.queue = []; }

  reset() { this.stop(); this.generation++; this.cache.clear(); }

  setScope(scope) {
    if (scope === this.scope) return;
    this.scope = scope;
    this.reset();
    this.dialogToken++;
    this.dialog?.close();
  }

  attach(entries) {
    this.stop();
    this.active = true;
    this.entries = new Map(entries.map(entry => [entry.id, entry]));
    if (!window.catchList.resolveAnimeMedia) return;
    this.observer = new IntersectionObserver(items => {
      for (const item of items) if (item.isIntersecting) {
        this.observer.unobserve(item.target);
        this.enqueue(item.target.dataset.animeRow);
      }
    }, { rootMargin: "160px" });
    this.root.querySelectorAll("[data-anime-row]").forEach(row => this.observer.observe(row));
  }

  update(id) {
    const entry = this.entries.get(id);
    if (!entry || !this.active) return;
    const row = [...this.root.querySelectorAll("[data-anime-row]")].find(node => node.dataset.animeRow === id);
    if (row) row.outerHTML = renderItemTemplate(this.decorate(entry), "anime");
  }

  enqueue(id, retry = false) {
    if (!this.entries.has(id) || this.cache.has(id) || this.queue.some(item => item.id === id)) return;
    this.queue.push({ id, retry });
    void this.drain();
  }

  async drain() {
    if (this.busy) return;
    this.busy = true;
    try {
      while (this.active && this.queue.length) {
        const { id, retry } = this.queue.shift();
        const scope = this.scope;
        const generation = this.generation;
        this.cache.set(id, { status: "loading" });
        this.update(id);
        let result;
        try { result = await window.catchList.resolveAnimeMedia(id, retry); }
        catch { result = { status: "error" }; }
        if (this.scope === scope && this.generation === generation) { this.cache.set(id, result); this.update(id); }
      }
    } finally { this.busy = false; }
  }

  openEditor(id) {
    const entry = this.entries.get(id);
    if (!entry || !window.catchList.searchAnimeMedia) return;
    this.dialog?.remove();
    const token = ++this.dialogToken;
    const dialog = document.createElement("dialog");
    this.dialog = dialog;
    dialog.className = "dialog anime-picker";
    dialog.setAttribute("aria-labelledby", "animePickerTitle");
    dialog.innerHTML = `<div class="anime-picker-heading"><div><h2 id="animePickerTitle">選擇對應作品</h2><p>${escapeHtml(entry.title)}</p></div><button class="button" data-picker-close aria-label="關閉作品選擇">關閉</button></div><p class="anime-picker-note">請核對年份與季度。只更新封面、影片及補充資料，清單名稱與收藏不變。</p><form class="anime-picker-search"><input class="field" aria-label="作品名稱或 MAL 編號" value="${escapeHtml(entry.title)}" maxlength="200" placeholder="日文／英文名稱或 MAL 編號"><button class="button primary" type="submit">查詢</button></form><p class="anime-picker-status" role="status"></p><div class="anime-candidates"></div>`;
    document.body.append(dialog);
    const status = dialog.querySelector('[role="status"]');
    const results = dialog.querySelector(".anime-candidates");
    const fresh = () => token === this.dialogToken && dialog.open;
    const showCandidates = candidates => {
      results.innerHTML = candidates.map(item => `<button class="anime-candidate" type="button" data-mal-id="${Number(item.malId)}">${item.coverUrl ? `<img src="${escapeHtml(item.coverUrl)}" alt="" loading="lazy">` : '<span class="anime-candidate-placeholder"></span>'}<span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.originalTitle)}</small><small>${escapeHtml(item.year ?? "年份未提供")} · ${escapeHtml(item.format ?? "類型未提供")} · MAL ${Number(item.malId)}</small></span><span class="anime-select-label">選用</span></button>`).join("");
      status.textContent = candidates.length ? "點選正確作品以套用封面與宣傳影片。" : "找不到作品，可改用日文、英文名稱或 MAL 編號。";
    };
    dialog.querySelector("[data-picker-close]").onclick = () => dialog.close();
    dialog.addEventListener("close", () => { this.dialogToken++; });
    dialog.querySelector("form").onsubmit = async event => {
      event.preventDefault();
      const button = dialog.querySelector('button[type="submit"]');
      if (button.disabled) return;
      button.disabled = true;
      results.innerHTML = "";
      status.textContent = "正在查詢作品…";
      try { const result = await window.catchList.searchAnimeMedia(id, dialog.querySelector("input").value); if (fresh()) showCandidates(result.candidates); }
      catch (error) { if (fresh()) status.textContent = error.message; }
      finally { button.disabled = false; }
    };
    results.onclick = async event => {
      const candidate = event.target.closest("[data-mal-id]");
      if (!candidate || candidate.disabled) return;
      results.querySelectorAll("button").forEach(button => { button.disabled = true; });
      dialog.querySelector('button[type="submit"]').disabled = true;
      status.textContent = "正在取得封面與宣傳影片…";
      const scope = this.scope;
      try {
        const result = await window.catchList.selectAnimeMedia(id, Number(candidate.dataset.malId));
        if (scope === this.scope) { this.cache.set(id, result); this.update(id); }
        if (fresh()) { dialog.close(); this.showMessage("已更新這部動畫的封面與影片"); }
      } catch (error) { if (fresh()) status.textContent = error.message; }
      finally { results.querySelectorAll("button").forEach(button => { button.disabled = false; }); dialog.querySelector('button[type="submit"]').disabled = false; }
    };
    dialog.showModal();
    const cached = this.cache.get(id);
    if (cached?.candidates) showCandidates(cached.candidates);
    else if (cached?.status === "ready" && cached.malId) showCandidates([cached]);
    else dialog.querySelector("form").requestSubmit();
  }
}
