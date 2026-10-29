const bridge = window.steamConfirmation;
bridge.onState(({ title, url, message, checking }) => {
  document.querySelector("#steamTitle").textContent = title;
  document.querySelector("#steamUrl").textContent = url;
  document.querySelector("#steamUrl").title = url;
  document.querySelector("#steamMessage").textContent = message;
  document.querySelector("#steamCheck").disabled = checking;
  document.querySelector("#steamCheck").textContent = checking ? "檢查中…" : "重新檢查";
});
document.querySelector("#steamCheck").addEventListener("click", () => bridge.control("check"));
document.querySelector("#steamCancel").addEventListener("click", () => bridge.control("cancel"));
document.addEventListener("keydown", event => { if (event.key === "Escape") bridge.control("cancel"); });
bridge.control("ready");
