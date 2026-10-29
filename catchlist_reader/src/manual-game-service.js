import crypto from "node:crypto";
import path from "node:path";
import { sourceEntries, readHiddenEntries, readFavorites, HIDDEN_ENTRIES_FILE, FAVORITES_FILE } from "./library.js";
import { readManualGames, addManualRecord, readOptional, gameKey } from "./manual-games.js";
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
  commit(directory, token, destination = "backlog") {
    const preview = this.preview;
    if (!preview || preview.directory !== directory || preview.token !== token) throw new Error("遊戲預覽已失效，請重新讀取");
    if (!["backlog", "favorites", "shared", "watchlist"].includes(destination)) throw new Error("請選擇候補或收藏，也可加入待觀察");
    if (this.duplicate(directory, preview.game.appid)) throw new Error("遊戲已收錄，請重新讀取清單");
    const addedAt = new Date(this.now()).toISOString();
    const key = gameKey(preview.game.appid);
    const isFavorite = ["favorites", "shared"].includes(destination);
    const name = !isFavorite ? HIDDEN_ENTRIES_FILE : FAVORITES_FILE;
    const before = readOptional(path.join(directory, name));
    const records = !isFavorite ? readHiddenEntries(directory) : readFavorites(directory);
    const entry = { media: "games", title: preview.game.title, ...(!isFavorite
      ? { hideKey: key, hiddenAt: addedAt, reason: destination }
      : { key, savedAt: addedAt, favoriteKind: destination === "shared" ? "shared" : "personal" }) };
    const entries = [...records.filter((record) => (record.key ?? record.hideKey) !== key), entry];
    const changes = [{ name, before, after: `${JSON.stringify({ version: 1, entries }, null, 2)}\n` }];
    // 刪除後重新加入時，清除另一分類留下的個人紀錄，以本次選擇為準。
    const otherName = !isFavorite ? FAVORITES_FILE : HIDDEN_ENTRIES_FILE;
    const otherBefore = readOptional(path.join(directory, otherName));
    const otherRecords = !isFavorite ? readFavorites(directory) : readHiddenEntries(directory);
    const otherEntries = otherRecords.filter((record) => (record.key ?? record.hideKey) !== key);
    if (otherEntries.length !== otherRecords.length) changes.push({ name: otherName, before: otherBefore, after: `${JSON.stringify({ version: 1, entries: otherEntries }, null, 2)}\n` });
    addManualRecord(directory, { ...preview.game, addedAt }, preview.raw, changes);
    this.cancel();
    return preview.game.appid;
  }
}
