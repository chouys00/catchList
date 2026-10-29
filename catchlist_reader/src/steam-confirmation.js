import { randomUUID } from "node:crypto";

export function allowedSteamNavigation(raw) {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && !url.username && !url.password && !url.port
      && ["store.steampowered.com", "login.steampowered.com", "steamcommunity.com"].includes(url.hostname);
  } catch { return false; }
}
export function isTargetSteamApp(raw, appid) {
  try {
    const url = new URL(raw);
    return allowedSteamNavigation(raw) && url.hostname === "store.steampowered.com"
      && url.pathname.match(/^\/app\/([1-9]\d*)(?:\/|$)/)?.[1] === String(appid);
  } catch { return false; }
}

/** 一次性請求只存在記憶體，不把網站狀態或資料夾路徑交給遠端網頁。 */
export class SteamConfirmation {
  constructor({ open }) { this.open = open; }
  issue({ appid, title, kind, valid, retry }) {
    if (this.request?.promise) throw new Error("請先完成目前的 Steam 確認");
    this.cancel();
    const request = { id: randomUUID(), appid, title, kind, valid, retry, controller: new AbortController() };
    this.request = request;
    return { status: "verification-required", requestId: request.id, appid, title };
  }
  cancel(kind, id) {
    const request = this.request;
    if (!request || (kind && request.kind !== kind) || (id && request.id !== id)) return;
    this.request = null;
    request.controller.abort();
  }
  start(id) {
    const request = this.request;
    if (!request || request.id !== id || !request.valid()) throw new Error("Steam 確認請求已失效，請重新讀取遊戲");
    if (request.promise) { this.open.focus?.(); return request.promise; }
    const valid = () => this.request === request && !request.controller.signal.aborted && request.valid();
    request.promise = (async () => {
      try {
        const confirmed = await this.open({ ...request, signal: request.controller.signal });
        if (!confirmed || !valid()) return { status: "cancelled" };
        const result = await request.retry({ signal: request.controller.signal, valid });
        if (!valid()) return { status: "cancelled" };
        return { status: "completed", result };
      } catch (error) {
        if (!valid()) return { status: "cancelled" };
        if (error.code === "STEAM_VERIFICATION_REQUIRED") throw new Error("Steam 仍要求確認，原資訊已保留。請稍後重新讀取");
        throw error;
      } finally {
        if (this.request === request) this.request = null;
      }
    })();
    return request.promise;
  }
}
