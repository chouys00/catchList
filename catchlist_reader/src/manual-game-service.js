import crypto from "node:crypto";
import { sourceEntries, readHiddenEntries } from "./library.js";
import { readManualGames, addManualRecord } from "./manual-games.js";
import { parseSteamInput, lookupSteamGame } from "./steam-game-lookup.js";

export class ManualGameService {
  constructor({ lookup = lookupSteamGame, now = () => Date.now() } = {}) { this.lookup = lookup; this.now = now; this.nextRequest = 0; }
  cancel() { this.controller?.abort(); this.controller = null; this.preview = null; }
  duplicate(directory, appid) {
    const entry = sourceEntries(directory, "games", { strict: true }).entries.find((entry) => entry.appid === appid);
    return entry ? { entry, hidden: readHiddenEntries(directory).some((item) => item.hideKey === entry.hideKey) } : null;
  }
  async prepare(directory, input) {
    this.cancel();
    const appid = parseSteamInput(input);
    const duplicate = this.duplicate(directory, appid);
    if (duplicate) return { duplicate };
    if (this.now() < this.nextRequest) throw new Error("請稍候再讀取下一款遊戲");
    const raw = readManualGames(directory).raw;
    const controller = new AbortController();
    this.controller = controller;
    this.nextRequest = this.now() + 1500;
    try {
      const game = await this.lookup(appid, { signal: controller.signal });
      if (controller.signal.aborted || this.controller !== controller) throw new Error("已取消讀取");
      if (game.warnings?.some((message) => message.includes("限制請求"))) this.nextRequest = this.now() + 60000;
      const token = crypto.randomUUID();
      this.preview = { directory, raw, game, token };
      return { token, game };
    } catch (error) {
      if (error.message.includes("限制請求")) this.nextRequest = this.now() + 60000;
      throw error;
    }
  }
  commit(directory, token) {
    const preview = this.preview;
    if (!preview || preview.directory !== directory || preview.token !== token) throw new Error("遊戲預覽已失效，請重新讀取");
    if (this.duplicate(directory, preview.game.appid)) throw new Error("遊戲已收錄，請重新讀取清單");
    addManualRecord(directory, { ...preview.game, addedAt: new Date(this.now()).toISOString() }, preview.raw);
    this.cancel();
    return preview.game.appid;
  }
}
