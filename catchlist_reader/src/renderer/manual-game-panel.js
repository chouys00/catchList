import { favoriteIcon } from "./favorite-ui.js";
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
    <p class="manual-status" role="status" aria-live="polite"></p><section class="steam-inline-confirmation" hidden><strong>需要先完成 Steam 確認</strong><p>Steam 要求確認後才能補齊社群標籤。完成後會重新讀取預覽，再由你決定是否加入。</p><button class="button primary" type="button" data-steam-confirm>開啟 Steam 確認</button></section><div class="manual-preview"></div>
    <p class="manual-data-note">保留加入時的資料，本版不自動更新。手動清單會與報告放在同一個資料夾。</p></div>
    <footer class="manual-panel-footer"><fieldset class="manual-destination" hidden><legend>加入哪個清單？</legend><div class="manual-destination-options"><label class="watchlist-destination"><input type="radio" name="destination" value="watchlist"><span><strong>待觀察</strong><small>先記下興趣，等上市或評價累積後再決定</small></span></label><label><input type="radio" name="destination" value="backlog" checked><span><strong>候補</strong><small>有興趣，先留著</small></span></label><label><input type="radio" name="destination" value="favorites"><span><strong>${favoriteIcon()} 個人收藏</strong><small>想自己玩，排進個人清單</small></span></label><label><input type="radio" name="destination" value="shared"><span><strong>${favoriteIcon("shared")} 共樂收藏</strong><small>想跟別人一起玩</small></span></label></div></fieldset><div class="steam-website-tools"><button class="button subtle" type="button" data-steam-status aria-expanded="false">Steam 網頁狀態</button><div class="steam-website-details" hidden><p class="steam-website-message" role="status"></p><p>僅供這台電腦的閱讀器使用，可能包含 Steam 登入狀態。保存資料不代表確認仍有效。</p><button class="button" type="button" data-steam-clear>清除 Steam 網頁資料</button></div></div><div class="manual-panel-actions"><button class="button subtle" type="button" data-panel-close>取消</button><button class="button primary" type="button" data-panel-save disabled>加入清單</button></div></footer>`;
  document.body.append(panel);
  const form = panel.querySelector("form");
  const input = panel.querySelector("input");
  const status = panel.querySelector(".manual-status");
  const preview = panel.querySelector(".manual-preview");
  const save = panel.querySelector("[data-panel-save]");
  const destination = panel.querySelector(".manual-destination");
  const verificationPanel = panel.querySelector(".steam-inline-confirmation");
  const verify = panel.querySelector("[data-steam-confirm]");
  panel.querySelector(".manual-panel-body").prepend(verificationPanel);
  const selectedDestination = () => destination.querySelector("input:checked").value;
  destination.querySelector(`input[value="${["watchlist", "favorites", "shared"].includes(initialDestination) ? initialDestination : "backlog"}"]`).checked = true;
  const destinationLabel = () => ({ backlog: "候補", favorites: "個人收藏", shared: "共樂收藏", watchlist: "待觀察" })[selectedDestination()];
  destination.addEventListener("change", () => { save.textContent = `加入${destinationLabel()}`; });
  let generation = 0;
  let result = null;
  let saving = false;
  let savedAppid = null;
  let restoreFocus = true;
  let disposed = false;
  let verifying = false;
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
    generation++; result = null; save.disabled = true; preview.innerHTML = ""; status.textContent = ""; destination.hidden = true; verificationPanel.hidden = true; save.textContent = "加入清單";
    form.querySelector("button").disabled = false;
    void window.catchList.cancelGamePreview?.().catch(() => {});
  });
  function renderResponse(response, run) {
      if (!panel.open || run !== generation) return;
      result = response;
      verificationPanel.hidden = !response.verification;
      if (response.verification) panel.querySelector(".manual-panel-body").scrollTop = 0;
      verify.disabled = false;
      if (response.duplicate) {
        const { entry, hidden } = response.duplicate;
        status.textContent = hidden ? "這款遊戲已收錄，目前被隱藏。" : "這款遊戲已經在清單中。";
        preview.innerHTML = `<h3>${escape(entry.title)}</h3>`;
        save.textContent = hidden ? "恢復並查看" : "查看遊戲";
        save.disabled = false;
        return;
      }
      const game = response.game;
      if (!game) { status.textContent = "Steam 要求先完成官方確認，尚未取得可加入的遊戲資料。"; return; }
      status.textContent = response.verification ? "Steam 要求先完成確認。你也可以保留缺漏資訊加入清單。" : "確認遊戲後，選擇加入待觀察、候補、個人收藏或共樂收藏。";
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
  }
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const run = ++generation;
    result = null; save.disabled = true; preview.innerHTML = ""; destination.hidden = true; verificationPanel.hidden = true;
    status.classList.remove("failed"); status.textContent = "正在讀取 Steam 資料…";
    form.querySelector("button").disabled = true;
    try {
      if (!window.catchList.previewGame) throw new Error("此預覽環境不支援新增，請使用桌面閱讀器");
      renderResponse(await window.catchList.previewGame(input.value), run);
    } catch (error) { if (run === generation && panel.open) fail(error); }
    finally { if (run === generation) form.querySelector("button").disabled = false; }
  });
  verify.addEventListener("click", async () => {
    if (verifying || !result?.verification) return;
    const run = generation;
    verifying = true; verify.disabled = true; save.disabled = true;
    input.disabled = true; form.querySelector("button").disabled = true;
    status.classList.remove("failed"); status.textContent = "請在 Steam 官方視窗完成確認。";
    try {
      const confirmed = await window.catchList.confirmSteam(result.verification.requestId);
      if (!panel.open || run !== generation) return;
      if (confirmed.status === "completed") renderResponse(confirmed.result, run);
      else { verificationPanel.hidden = true; status.textContent = "已取消 Steam 確認。若目前有預覽，你仍可附缺漏警告加入；要再次確認，請重新讀取遊戲。"; }
    } catch (error) {
      if (run === generation && panel.open) { result = null; verificationPanel.hidden = true; fail(error); }
    } finally {
      verifying = false;
      if (run === generation && panel.open) {
        input.disabled = false; form.querySelector("button").disabled = false;
        verify.disabled = false; save.disabled = !result?.token && !result?.duplicate;
        if (!verificationPanel.hidden) verify.focus(); else input.focus();
      }
    }
  });
  const websiteDetails = panel.querySelector(".steam-website-details");
  const websiteMessage = panel.querySelector(".steam-website-message");
  const statusButton = panel.querySelector("[data-steam-status]");
  const describeWebsite = data => { websiteMessage.textContent = data.hasWebsiteData ? "已保存本機 Steam 網頁資料" : "目前沒有保存 Steam 網頁資料"; };
  statusButton.addEventListener("click", async () => {
    websiteDetails.hidden = !websiteDetails.hidden;
    statusButton.setAttribute("aria-expanded", String(!websiteDetails.hidden));
    if (websiteDetails.hidden) return;
    websiteMessage.textContent = "正在檢查本機狀態…";
    try { describeWebsite(await window.catchList.steamWebsiteStatus()); }
    catch { websiteMessage.textContent = "目前無法讀取 Steam 網頁狀態，請使用桌面閱讀器。"; }
  });
  panel.querySelector("[data-steam-clear]").addEventListener("click", async event => {
    event.target.disabled = true;
    try {
      const response = await window.catchList.clearSteamWebsiteData();
      describeWebsite(response);
      if (!response.cancelled) { verificationPanel.hidden = true; }
    } catch (error) { websiteMessage.textContent = error.message; }
    finally { event.target.disabled = false; }
  });
  save.addEventListener("click", async () => {
    if (saving || verifying) return;
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
