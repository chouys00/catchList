import fs from "node:fs";
import path from "node:path";
import { isSteamStaticUrl } from "./steam-covers.js";

export class GameScreenshots {
  constructor(filename, fetchImpl = fetch) {
    this.filename = filename;
    this.fetch = fetchImpl;
    this.pending = new Map();
    try {
      this.cache = JSON.parse(fs.readFileSync(filename, "utf8"));
      if (!this.cache || typeof this.cache !== "object" || Array.isArray(this.cache)) this.cache = {};
    }
    catch { this.cache = {}; }
  }
  async resolve(appid) {
    appid = String(appid);
    if (!/^\d{1,12}$/.test(appid)) throw new Error("遊戲編號不正確");
    const cached = this.cache?.[appid];
    if (cached?.expires > Date.now() && Array.isArray(cached.urls)) return cached.urls.filter(isSteamStaticUrl).slice(0, 3);
    if (this.pending.has(appid)) return this.pending.get(appid);
    const task = this.request(appid).finally(() => this.pending.delete(appid));
    this.pending.set(appid, task);
    return task;
  }
  async request(appid) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await this.fetch(`https://store.steampowered.com/api/appdetails?appids=${appid}&cc=tw&l=tchinese`, { signal: controller.signal });
      if (!response.ok) throw new Error("Steam 暫時無法讀取截圖，請重試");
      const payload = await response.json();
      if (!payload?.[appid]?.success) throw new Error("Steam 未提供這款遊戲的截圖，仍可開啟商店查看");
      const urls = [...new Set((payload[appid].data?.screenshots ?? []).map(item => item.path_full).filter(isSteamStaticUrl))].slice(0, 3);
      this.cache ??= {};
      this.cache[appid] = { urls, expires: Date.now() + (urls.length ? 30 * 86400000 : 3600000) };
      try {
        fs.mkdirSync(path.dirname(this.filename), { recursive: true });
        fs.writeFileSync(this.filename, JSON.stringify(this.cache), "utf8");
      } catch { /* A cache failure must not prevent screening. */ }
      return urls;
    } catch (error) {
      if (error.name === "AbortError") throw new Error("截圖讀取逾時，請重試或開啟商店");
      throw error;
    } finally { clearTimeout(timer); }
  }
}
