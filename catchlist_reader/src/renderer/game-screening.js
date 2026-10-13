const escape = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

export function remainingScreeningGames(entries, seen) {
  return entries.filter(entry => !seen.has(String(entry.appid)));
}

export class GameScreening {
  constructor({ bridge, apply, notify, getEntries }) {
    this.bridge = bridge;
    this.apply = apply;
    this.notify = notify;
    this.getEntries = getEntries;
    this.dialog = document.createElement("dialog");
    this.dialog.className = "screening-dialog";
    this.dialog.setAttribute("aria-label", "遊戲截圖快篩");
    document.body.append(this.dialog);
    this.dialog.addEventListener("click", event => {
      const action = event.target.closest("[data-screen]")?.dataset.screen;
      if (action) void this.action(action);
    });
    this.dialog.addEventListener("cancel", event => { if (this.busy) event.preventDefault(); });
    this.dialog.addEventListener("close", () => { this.generation++; });
    this.dialog.addEventListener("keydown", event => {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.target.matches("input,select,textarea") || document.querySelector("#coverDialog[open]")) return;
      const action = { "1": "hide", "2": "favorite", "3": "next", ArrowRight: "next", Escape: "close" }[event.key];
      if (action) { event.preventDefault(); void this.action(action); }
    });
    this.generation = 0;
  }
  open(entries, directory) {
    this.entries = [...entries];
    this.key = `catchlist-screening-v1:${directory}`;
    try {
      const saved = JSON.parse(localStorage.getItem(this.key));
      this.seen = new Set(Array.isArray(saved?.seen) ? saved.seen : []);
      this.current = saved?.current;
    } catch { this.seen = new Set(); }
    this.undo = null;
    this.busy = false;
    this.dialog.showModal();
    this.render();
  }
  save() {
    try { localStorage.setItem(this.key, JSON.stringify({ seen: [...this.seen], current: this.current })); }
    catch { this.notify("無法保存快篩進度，本次仍可繼續使用"); }
  }
  render() {
    const remaining = remainingScreeningGames(this.entries, this.seen);
    this.entry = remaining.find(entry => String(entry.appid) === this.current) ?? remaining[0];
    this.current = this.entry ? String(this.entry.appid) : null;
    this.save();
    const count = this.entries.length - remaining.length;
    const header = `<header class="screening-header"><div><p class="eyebrow">遊戲探索 · 截圖快篩</p><h2>先看畫面，再決定想不想玩</h2></div><button class="button subtle" data-screen="close">返回清單 <kbd>Esc</kbd></button></header><div class="screening-progress"><span>本次篩選清單 · 已看 ${count} / ${this.entries.length}</span><span>剩餘 ${remaining.length} 款</span><progress value="${count}" max="${Math.max(1, this.entries.length)}" aria-label="快篩進度"></progress></div>`;
    const undo = this.undo ? `<button class="button subtle" data-screen="undo">復原上一款的${this.undo.action === "hide" ? "隱藏" : this.undo.action === "favorite" ? "收藏" : "略過"}</button>` : "";
    if (!this.entry) {
      this.dialog.innerHTML = `${header}<section class="screening-empty"><h3>${this.entries.length ? "這份清單已經看完" : "目前沒有可快篩的遊戲"}</h3><p>進度已保存。略過的作品仍保留在「全部」，收藏與隱藏可到各分類查看。</p>${undo}<button class="button" data-screen="reset">重新瀏覽這份清單</button><button class="button primary" data-screen="close">返回清單</button></section>`;
      this.dialog.querySelector('[data-screen="close"]').focus();
      return;
    }
    const entry = this.entry;
    this.dialog.innerHTML = `${header}<div class="screening-layout"><section class="screening-gallery" aria-label="實際遊戲截圖"><div class="screening-images" aria-live="polite"><div class="screening-image-state" role="status">正在讀取遊戲截圖…</div></div></section><aside class="screening-info"><p class="eyebrow">實機畫面預覽</p><h3>${escape(entry.title)}</h3><p class="screening-original">${escape(entry.originalTitle)}</p><div class="screening-facts"><span>發售日期<strong>${escape(entry.releaseDate ?? "未確認")}</strong></span><span>好評率<strong>${entry.score == null ? "—" : `${escape(entry.score)}%`}</strong></span><span>評論數<strong>${escape(entry.reviews?.toLocaleString() ?? "—")}</strong></span></div><div class="screening-tags">${(entry.tags ?? []).slice(0, 8).map(tag => `<span>${escape(tag)}</span>`).join("")}</div><button class="button subtle" data-screen="store">在 Steam 查看 ↗</button><p class="screening-help">只判斷是否合胃口。沒興趣的遊戲可在「隱藏管理」恢復，略過則留在原清單。</p></aside></div><footer class="screening-footer"><div class="screening-decisions"><button class="button screening-reject" data-screen="hide"><kbd>1</kbd> 沒興趣</button><button class="button primary" data-screen="favorite"><kbd>2</kbd> 待玩收藏</button><button class="button" data-screen="next"><kbd>3 / →</kbd> 略過／下一款</button></div><div class="screening-footer-note">${undo}<span>關閉後，下次從這款繼續</span></div></footer>`;
    this.dialog.querySelector('[data-screen="next"]').focus({ preventScroll: true });
    void this.loadImages(entry, ++this.generation);
  }
  async loadImages(entry, generation) {
    const target = this.dialog.querySelector(".screening-images");
    try {
      const urls = await this.bridge.resolveGameScreenshots(entry.appid);
      if (generation !== this.generation || !this.dialog.open) return;
      target.innerHTML = urls.length ? urls.map((url, index) => `<button class="screening-shot" data-screen="image-${index}" aria-label="放大 ${escape(entry.title)} 的第 ${index + 1} 張截圖"><img src="${escape(url)}" alt="${escape(entry.title)} 實際遊戲截圖 ${index + 1}"></button>`).join("") : '<div class="screening-image-state">商店沒有提供截圖，可開啟 Steam 查看。<button class="button" data-screen="retry">重試</button></div>';
      this.urls = urls;
      for (const img of target.querySelectorAll("img")) img.addEventListener("error", () => {
        const button = img.closest("button");
        button.classList.add("screening-shot-failed");
        button.innerHTML = '<span>圖片載入失敗，請重試</span>';
        button.dataset.screen = "retry";
      }, { once: true });
    } catch (error) {
      if (generation !== this.generation || !this.dialog.open) return;
      target.innerHTML = `<div class="screening-image-state" role="status">${escape(error.message)}<button class="button" data-screen="retry">重試截圖</button></div>`;
    }
  }
  async action(action) {
    if (this.busy) return;
    if (action === "close") { this.dialog.close(); return; }
    if (action === "reset") { this.entries = [...this.getEntries()]; this.seen.clear(); this.undo = null; this.render(); return; }
    if (action === "retry") { this.dialog.querySelector(".screening-images").innerHTML = '<div class="screening-image-state" role="status">正在重新讀取截圖…</div>'; void this.loadImages(this.entry, ++this.generation); return; }
    if (action === "store") { try { await this.bridge.openUrls([this.entry.url]); } catch (error) { this.notify(error.message); } return; }
    if (action.startsWith("image-")) {
      const imageDialog = document.querySelector("#coverDialog");
      document.querySelector("#coverImage").src = this.urls[Number(action.slice(6))];
      document.querySelector("#coverImage").alt = `${this.entry.title} 遊戲截圖`;
      document.querySelector("#coverTitle").textContent = this.entry.title;
      imageDialog.showModal();
      return;
    }
    if (!["hide", "favorite", "next", "undo"].includes(action)) return;
    this.busy = true;
    this.dialog.querySelectorAll("button").forEach(button => { button.disabled = true; });
    try {
      if (action === "undo" && this.undo) {
        const previous = this.undo;
        if (previous.action === "hide") this.apply(await this.bridge.undoLastOperation());
        if (previous.action === "favorite") this.apply(await this.bridge.setFavorite("games", previous.entry.id, previous.entry.favorite === true));
        this.seen.delete(String(previous.entry.appid));
        this.current = String(previous.entry.appid);
        this.undo = null;
      } else if (this.entry) {
        const entry = this.entry;
        if (action === "hide") this.apply(await this.bridge.hideEntry("games", entry.id, "not_interested"));
        if (action === "favorite") this.apply(await this.bridge.setFavorite("games", entry.id, true));
        this.seen.add(String(entry.appid));
        this.undo = { action, entry };
        this.current = null;
      }
      this.render();
    } catch (error) {
      this.notify(error.message);
      this.dialog.querySelector(".screening-notice")?.remove();
      const notice = document.createElement("p");
      notice.className = "screening-notice";
      notice.setAttribute("role", "alert");
      notice.textContent = error.message;
      this.dialog.append(notice);
    }
    finally { this.busy = false; this.dialog.querySelectorAll("button").forEach(button => { button.disabled = false; }); }
  }
}
