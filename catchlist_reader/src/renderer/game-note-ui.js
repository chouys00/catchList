// 備註沿用閱讀器的深色介面、字型與萊姆色，編輯時才展開。
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

export function noteButton(entry) {
  return `<button class="copy-title-button game-note-button${entry.note ? " has-note" : ""}" type="button" data-game-note="${escapeHtml(entry.id)}" aria-label="${entry.note ? "編輯" : "新增"} ${escapeHtml(entry.title)} 的備註" title="${entry.note ? "編輯備註" : "新增備註"}"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M14 4H5v16h14v-9M10 14l1-4 7-7 3 3-7 7z"/></svg></button>`;
}

export function noteSummary(entry) {
  return entry.note ? `<button class="game-note-summary" type="button" data-game-note="${escapeHtml(entry.id)}" title="${escapeHtml(entry.note)}" aria-label="查看或編輯 ${escapeHtml(entry.title)} 的備註：${escapeHtml(entry.note)}">${escapeHtml(entry.note.replace(/\s+/g, " "))}</button>` : "";
}

export function openGameNote(entry, { save, onSaved, onClose }) {
  const dialog = document.createElement("dialog");
  dialog.className = "dialog game-note-dialog";
  dialog.setAttribute("aria-labelledby", "gameNoteHeading");
  dialog.innerHTML = `<form><h2 id="gameNoteHeading">遊玩備註</h2><p class="game-note-name"></p><div class="game-note-presets" aria-label="快速填入備註">${["可以直接玩", "等後續更新", "需要 MOD"].map(text => `<button type="button" class="button compact" data-note-preset="${text}">${text}</button>`).join("")}</div><label for="gameNoteText" class="sr-only">備註內容</label><textarea id="gameNoteText" class="field" rows="4" maxlength="300" placeholder="例如：等 1.2 更新後再玩，先裝中文 MOD"></textarea><div class="game-note-footer"><span>留白儲存即可移除備註</span><output aria-live="polite"></output></div><p class="game-note-error" role="alert" hidden></p><div class="dialog-actions"><button type="button" class="button" data-note-cancel>取消</button><button type="submit" class="button primary">儲存備註</button></div></form>`;
  dialog.querySelector(".game-note-name").textContent = entry.title;
  const input = dialog.querySelector("textarea");
  input.value = entry.note ?? "";
  const count = () => { dialog.querySelector("output").textContent = `${input.value.length} / 300`; };
  count();
  input.addEventListener("input", count);
  for (const button of dialog.querySelectorAll("[data-note-preset]")) button.onclick = () => {
    const text = button.dataset.notePreset;
    input.value = input.value.trim() ? `${input.value.trim()}；${text}`.slice(0, 300) : text;
    count(); input.focus();
  };
  let saving = false;
  dialog.querySelector("[data-note-cancel]").onclick = () => dialog.close();
  dialog.addEventListener("cancel", event => { if (saving) event.preventDefault(); });
  dialog.addEventListener("close", () => { dialog.remove(); onClose?.(); }, { once: true });
  dialog.querySelector("form").onsubmit = async event => {
    event.preventDefault();
    if (saving) return;
    saving = true;
    dialog.querySelectorAll("button, textarea").forEach(el => { el.disabled = true; });
    const error = dialog.querySelector(".game-note-error");
    error.hidden = true;
    try {
      const payload = await save(entry.id, input.value);
      onSaved(payload);
      dialog.close();
    } catch (cause) {
      error.textContent = `未能儲存：${cause.message}`;
      error.hidden = false;
    } finally {
      saving = false;
      dialog.querySelectorAll("button, textarea").forEach(el => { el.disabled = false; });
    }
  };
  input.addEventListener("keydown", event => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); dialog.querySelector("form").requestSubmit(); }
  });
  document.body.append(dialog);
  dialog.showModal();
  input.focus();
}
