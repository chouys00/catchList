import { BrowserWindow, WebContentsView, screen, session, ipcMain, net } from "electron";
import { fileURLToPath } from "node:url";
import { allowedSteamNavigation, isTargetSteamApp } from "./steam-confirmation.js";
import { lookupSteamGame, lookupSteamStats, lookupSteamTags } from "./steam-game-lookup.js";

const shellUrl = new URL("./renderer/steam-confirmation.html", import.meta.url).href;
const preload = fileURLToPath(new URL("./steam-confirmation-preload.cjs", import.meta.url));

export class SteamAccess {
  constructor({ getParent, steamSession = session.fromPartition("persist:catchlist-steam") } = {}) {
    this.getParent = getParent;
    this.session = steamSession;
    this.fetcher = (url, options) => new URL(url).hostname === "store.steampowered.com"
      ? this.fetchStore(url, options) : fetch(url, options);
    this.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    this.session.setPermissionCheckHandler(() => false);
    this.session.on("will-download", event => event.preventDefault());
    this.onControl = (event, action) => {
      if (!this.window || event.sender !== this.window.webContents || event.senderFrame !== this.window.webContents.mainFrame) return;
      if (action === "cancel") this.window.close();
      if (action === "check") void this.check?.();
      if (action === "ready") this.send?.();
    };
    ipcMain.on("steam-confirmation:control", this.onControl);
  }
  // Electron 43 的 session.fetch 在 manual 轉址時會直接拒絕，無法取得 Location。
  // net.request 沿用同一 session 與官方 Cookie，同時保留轉址資訊供精確判斷。
  fetchStore(url, { signal, headers = {} } = {}) {
    return new Promise((resolve, reject) => {
      const request = net.request({ url, session: this.session, credentials: "include", redirect: "manual" });
      let settled = false;
      const finish = (error, response) => {
        if (settled) return;
        settled = true; signal?.removeEventListener("abort", abort);
        if (error) reject(error); else resolve(response);
      };
      const abort = () => { finish(signal.reason ?? new Error("已取消讀取")); request.abort(); };
      for (const [key, value] of Object.entries(headers)) if (key.toLowerCase() !== "cookie" && key.toLowerCase() !== "user-agent") request.setHeader(key, value);
      request.on("redirect", (status, _method, target) => {
        finish(null, new Response(null, { status, headers: { location: target } }));
        request.abort();
      });
      request.on("error", error => finish(error));
      request.on("response", incoming => {
        const chunks = []; let size = 0;
        incoming.on("data", chunk => {
          size += chunk.length;
          if (size > 8 * 1024 * 1024) { finish(new Error("Steam 回應過大")); request.abort(); }
          else chunks.push(chunk);
        });
        incoming.on("error", error => finish(error));
        incoming.on("end", () => {
          const responseHeaders = new Headers();
          for (const [key, values] of Object.entries(incoming.headers)) for (const value of Array.isArray(values) ? values : [values]) if (value != null) responseHeaders.append(key, value);
          const status = incoming.statusCode;
          finish(null, new Response([204, 205, 304].includes(status) ? null : Buffer.concat(chunks), { status, headers: responseHeaders }));
        });
      });
      if (signal?.aborted) { abort(); return; }
      signal?.addEventListener("abort", abort, { once: true });
      request.end();
    });
  }
  lookupGame(input, options = {}) { return lookupSteamGame(input, { ...options, fetcher: this.fetcher }); }
  lookupStats(input, options = {}) { return lookupSteamStats(input, { ...options, fetcher: this.fetcher }); }
  async status() { return { hasWebsiteData: (await this.session.cookies.get({})).length > 0 }; }
  async clear() {
    if (this.window) throw new Error("請先關閉 Steam 確認視窗");
    await this.session.clearStorageData();
    await this.session.clearCache();
    return this.status();
  }
  focus() { if (this.window && !this.window.isDestroyed()) this.window.focus(); }
  open({ appid, title, signal }) {
    if (signal.aborted) return Promise.resolve(false);
    if (this.window) { this.focus(); throw new Error("已有 Steam 確認視窗，請先完成或取消"); }
    const area = screen.getPrimaryDisplay().workAreaSize;
    const win = new BrowserWindow({ parent: this.getParent(), modal: true, width: Math.min(960, area.width), height: Math.min(760, area.height),
      minWidth: Math.min(360, area.width), minHeight: Math.min(500, area.height), backgroundColor: "#111315", title: "Steam 官方確認 · CatchList",
      show: false, webPreferences: { preload, sandbox: true, contextIsolation: true, nodeIntegration: false } });
    this.window = win;
    win.removeMenu();
    const view = new WebContentsView({ webPreferences: { session: this.session, sandbox: true, contextIsolation: true, nodeIntegration: false } });
    win.contentView.addChildView(view);
    let completed = false; let checking = false;
    let currentUrl = `https://store.steampowered.com/app/${appid}/?cc=tw&l=tchinese`;
    let message = "請在下方 Steam 官方頁面完成確認。完成後會自動重新讀取。";
    const send = () => { if (!win.isDestroyed()) win.webContents.send("steam-confirmation:state", { title, url: currentUrl, message, checking }); };
    this.send = send;
    const layout = () => {
      const [width, height] = win.getContentSize();
      const top = width <= 560 ? 202 : 156;
      view.setBounds({ x: 0, y: top, width, height: Math.max(0, height - top) });
    };
    const check = async () => {
      if (checking || signal.aborted || win.isDestroyed()) return;
      checking = true; message = "正在確認能否讀取遊戲標籤…"; send();
      try {
        await lookupSteamTags(appid, { signal, fetcher: this.fetcher });
        if (signal.aborted || win.isDestroyed()) return;
        completed = true; win.close();
      } catch (error) {
        message = error.code === "STEAM_VERIFICATION_REQUIRED" ? "Steam 尚未完成確認。請繼續操作官方頁面，再按「重新檢查」。" : error.message;
      } finally { checking = false; send(); }
    };
    this.check = check;
    const guard = (event, url) => {
      if (!allowedSteamNavigation(url)) { event.preventDefault(); message = "已停止離開允許的 Steam 官方網站。你可以取消後重新讀取。"; send(); }
    };
    view.webContents.on("will-navigate", guard);
    view.webContents.on("will-redirect", guard);
    view.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    view.webContents.on("did-navigate", (_event, url) => { currentUrl = url; send(); });
    const checkTarget = () => { if (isTargetSteamApp(view.webContents.getURL(), appid)) void check(); };
    view.webContents.on("did-finish-load", checkTarget);
    view.webContents.on("did-navigate-in-page", (_event, url, isMainFrame) => { if (isMainFrame) { currentUrl = url; send(); checkTarget(); } });
    view.webContents.on("did-fail-load", (_event, code, _description, _url, mainFrame) => {
      if (mainFrame && code !== -3) { message = "Steam 頁面載入失敗。請檢查網路，或取消後重試。"; send(); }
    });
    win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    win.webContents.on("will-navigate", event => event.preventDefault());
    win.on("resize", layout);
    return new Promise(resolve => {
      const abort = () => { if (!win.isDestroyed()) win.close(); };
      signal.addEventListener("abort", abort, { once: true });
      win.on("closed", () => {
        signal.removeEventListener("abort", abort);
        if (!view.webContents.isDestroyed()) view.webContents.close();
        this.window = null; this.check = null; this.send = null;
        resolve(completed);
      });
      win.loadURL(shellUrl).then(() => {
        if (win.isDestroyed()) return;
        layout(); send(); win.show();
        void view.webContents.loadURL(currentUrl).catch(() => {});
      }).catch(() => abort());
    });
  }
}
