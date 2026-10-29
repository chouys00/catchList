import { sourceEntries } from "./library.js";
import { saveGameRefresh } from "./game-refresh-store.js";
import { lookupSteamStats, parseSteamInput } from "./steam-game-lookup.js";

export class GameRefreshService {
  constructor({ lookup = lookupSteamStats, now = () => Date.now() } = {}) {
    this.lookup = lookup; this.now = now; this.pending = false; this.nextRequest = 0;
  }
  async refresh(directory, input, { signal, valid = () => true } = {}) {
    const appid = parseSteamInput(input);
    const exists = () => sourceEntries(directory, "games", { strict: true }).entries.some(entry => entry.appid === appid);
    if (!exists()) throw new Error("遊戲已不在目前清單中");
    if (this.pending || this.now() < this.nextRequest) throw new Error("請稍候再更新遊戲資訊");
    this.pending = true; this.nextRequest = this.now() + 1500;
    try {
      const stats = await this.lookup(appid, { signal });
      if (signal?.aborted || !valid()) throw new Error("更新已取消，原資訊已保留");
      if (!exists()) throw new Error("遊戲已移除，未寫入更新資訊");
      saveGameRefresh(directory, appid, { ...stats, statsUpdatedAt: new Date(this.now()).toISOString() });
    } catch (error) {
      if (error.message.includes("限制請求")) this.nextRequest = this.now() + 60000;
      throw error;
    } finally { this.pending = false; }
  }
}
