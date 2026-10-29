export async function requestSteamConfirmation(info) {
  const panel = document.createElement("dialog");
  panel.className = "dialog steam-verification-dialog";
  panel.setAttribute("aria-labelledby", "steamVerificationTitle");
  panel.innerHTML = `<form method="dialog"><p class="eyebrow">STEAM 官方確認</p><h2 id="steamVerificationTitle">需要先完成 Steam 確認</h2><p class="steam-verification-description"></p><p class="steam-session-note">確認狀態保存在這台電腦，Steam 仍可能再次要求確認。</p><div class="dialog-actions"><button class="button" value="cancel">取消</button><button class="button primary" value="confirm">開啟 Steam 確認</button></div></form>`;
  panel.querySelector(".steam-verification-description").textContent = `Steam 要求確認後才能讀取「${info.title}」的社群標籤。完成後會自動繼續更新。`;
  document.body.append(panel);
  const accepted = await new Promise(resolve => {
    panel.addEventListener("close", () => resolve(panel.returnValue === "confirm"), { once: true });
    panel.showModal();
    panel.querySelector('[value="confirm"]').focus();
  });
  panel.remove();
  if (!accepted) { await window.catchList.cancelSteamConfirmation(info.requestId); return { status: "cancelled" }; }
  return window.catchList.confirmSteam(info.requestId);
}
