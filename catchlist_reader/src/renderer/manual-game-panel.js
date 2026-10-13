const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

export function openManualGamePanel({ onSaved, onView, destination: initialDestination = "backlog" }) {
  if (document.querySelector("#manualGameDialog")) return;
  const trigger = document.querySelector('[data-action="add-game"]');
  const panel = document.createElement("dialog");
  panel.id = "manualGameDialog";
  panel.className = "manual-game-panel";
  panel.setAttribute("aria-labelledby", "manualGameTitle");
  panel.innerHTML = `<header class="manual-panel-heading"><div><p class="panel-kicker">個人遊戲清單</p><h2 id="manualGameTitle">新增遊戲</h2></div><button class="button subtle" type="button" data-panel-close aria-label="關閉新增遊戲">關閉</button></header>
    <div class="manual-panel-body"><p class="manual-intro">看到感興趣的遊戲，就先收進來。不限評價、評論數或發售狀態。</p>
    <form id="manualGameLookup"><label for="steamGameInput">Steam ID 或商店網址</label><input id="steamGameInput" class="field" autocomplete="off" placeholder="例如 413150 或 Steam 商店網址" required maxlength="2048"><button class="button" type="submit">讀取遊戲</button></form>
    <p class="manual-status" role="status" aria-live="polite"></p><div class="manual-preview"></div>
    <p class="manual-data-note">保留加入時的資料，本版不自動更新。手動清單會與報告放在同一個資料夾。</p></div>
    <footer class="manual-panel-footer"><fieldset class="manual-destination" hidden><legend>加入哪個清單？</legend><div class="manual-destination-options"><label class="watchlist-destination"><input type="radio" name="destination" value="watchlist"><span><strong>待觀察</strong><small>先記下興趣，等上市或評價累積後再決定</small></span></label><label><input type="radio" name="destination" value="backlog" checked><span><strong>候補</strong><small>有興趣，先留著</small></span></label><label><input type="radio" name="destination" value="favorites"><span><strong>收藏</strong><small>想玩，排進待玩清單</small></span></label></div></fieldset><div class="manual-panel-actions"><button class="button subtle" type="button" data-panel-close>取消</button><button class="button primary" type="button" data-panel-save disabled>加入清單</button></div></footer>`;
  document.body.append(panel);
  const form = panel.querySelector("form");
  const input = panel.querySelector("input");
  const status = panel.querySelector(".manual-status");
  const preview = panel.querySelector(".manual-preview");
  const save = panel.querySelector("[data-panel-save]");
  const destination = panel.querySelector(".manual-destination");
  const selectedDestination = () => destination.querySelector("input:checked").value;
  destination.querySelector(`input[value="${initialDestination === "watchlist" ? "watchlist" : "backlog"}"]`).checked = true;
  const destinationLabel = () => ({ backlog: "候補", favorites: "收藏", watchlist: "待觀察" })[selectedDestination()];
  destination.addEventListener("change", () => { save.textContent = `加入${destinationLabel()}`; });
  let generation = 0;
  let result = null;
  let saving = false;
  let savedAppid = null;
  let restoreFocus = true;
  let disposed = false;
  function close() { if (!saving) { panel.close(); cleanup(); } }
  function fail(error) { status.textContent = error.message || "讀取失敗，請稍後重試"; status.classList.add("failed"); }
  function cleanup() {
    if (disposed) return;
    disposed = true;
    generation++;
    void window.catchList.cancelGamePreview?.().catch(() => {});
    panel.remove();
    if (restoreFocus) (document.querySelector('[data-action="add-game"]') ?? trigger)?.focus({ preventScroll: true });
  }
  // close 事件可能延後到下一幀，必須先取消舊請求，避免快速重開後取消新預覽。
  panel.addEventListener("cancel", (event) => { event.preventDefault(); close(); });
  panel.addEventListener("close", cleanup);
  const outside = (event) => {
    const bounds = panel.getBoundingClientRect();
    return event.target === panel && (event.clientX < bounds.left || event.clientX >= bounds.right || event.clientY < bounds.top || event.clientY >= bounds.bottom);
  };
  let pressedOutside = false;
  panel.addEventListener("pointerdown", (event) => { pressedOutside = outside(event); });
  panel.addEventListener("click", (event) => {
    if (pressedOutside && outside(event)) close();
    pressedOutside = false;
  });
  panel.querySelectorAll("[data-panel-close]").forEach((button) => button.addEventListener("click", close));
  input.addEventListener("input", () => {
    generation++; result = null; save.disabled = true; preview.innerHTML = ""; status.textContent = ""; destination.hidden = true; save.textContent = "加入清單";
    form.querySelector("button").disabled = false;
    void window.catchList.cancelGamePreview?.().catch(() => {});
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const run = ++generation;
    result = null; save.disabled = true; preview.innerHTML = ""; destination.hidden = true;
    status.classList.remove("failed"); status.textContent = "正在讀取 Steam 資料…";
    form.querySelector("button").disabled = true;
    try {
      if (!window.catchList.previewGame) throw new Error("此預覽環境不支援新增，請使用桌面閱讀器");
      const response = await window.catchList.previewGame(input.value);
      if (!panel.open || run !== generation) return;
      result = response;
      if (response.duplicate) {
        const { entry, hidden } = response.duplicate;
        status.textContent = hidden ? "這款遊戲已收錄，目前被隱藏。" : "這款遊戲已經在清單中。";
        preview.innerHTML = `<h3>${escape(entry.title)}</h3>`;
        save.textContent = hidden ? "恢復並查看" : "查看遊戲";
        save.disabled = false;
        return;
      }
      const game = response.game;
      status.textContent = "確認遊戲後，選擇加入待觀察、候補或收藏。";
      const rating = game.reviews === null ? "評論讀取失敗" : game.reviews === 0 ? "尚無評論" : `${game.score}% 好評 · ${game.reviews.toLocaleString()} 則評論`;
      preview.innerHTML = `<div class="manual-cover-slot"></div><span class="manual-source">手動加入</span><h3>${escape(game.title)}</h3><dl><dt>發售資訊</dt><dd>${escape(game.releaseLabel)}</dd><dt>玩家評價</dt><dd>${rating}</dd><dt>中文支援</dt><dd>${({ supported: "支援中文", unsupported: "不支援中文", unknown: "待確認" })[game.chineseSupport]}</dd></dl>${game.warnings?.length ? `<p class="manual-warning">${game.warnings.map(escape).join("<br>")}</p>` : ""}`;
      destination.hidden = false; save.textContent = `加入${destinationLabel()}`; save.disabled = false;
      // 封面不阻擋新增；沿用既有安全封面解析與快取。
      void window.catchList.resolveGameCovers?.([game.appid]).then((covers) => {
        const url = covers[game.appid];
        if (run !== generation || !panel.open || !url) return;
        const img = document.createElement("img"); img.src = url; img.alt = game.title;
        preview.querySelector(".manual-cover-slot")?.append(img);
      }).catch(() => {});
    } catch (error) { if (run === generation && panel.open) fail(error); }
    finally { if (run === generation) form.querySelector("button").disabled = false; }
  });
  save.addEventListener("click", async () => {
    if (saving) return;
    if (savedAppid) { restoreFocus = false; close(); onView(savedAppid); return; }
    if (!result) return;
    saving = true; save.disabled = true;
    panel.querySelectorAll("[data-panel-close], input, form button").forEach((element) => { element.disabled = true; });
    try {
      if (result.duplicate) {
        if (result.duplicate.hidden) onSaved(await window.catchList.restoreHidden(result.duplicate.entry.hideKey));
        else onSaved(await window.catchList.load("games"));
        const appid = result.duplicate.entry.appid;
        saving = false; restoreFocus = false; close(); onView(appid); return;
      }
      const payload = await window.catchList.addGame(result.token, selectedDestination());
      onSaved(payload);
      savedAppid = payload.addedAppid;
      status.classList.remove("failed"); status.textContent = `已加入${destinationLabel()}。原有搜尋與篩選已保留。`;
      destination.hidden = true;
      save.textContent = "查看新增遊戲";
      form.hidden = true;
      panel.querySelectorAll("[data-panel-close]").forEach((button) => { button.textContent = "關閉"; });
    } catch (error) { fail(error); }
    finally {
      saving = false; save.disabled = false;
      panel.querySelectorAll("[data-panel-close], input, form button").forEach((element) => { element.disabled = false; });
    }
  });
  panel.showModal();
  input.focus();
}
