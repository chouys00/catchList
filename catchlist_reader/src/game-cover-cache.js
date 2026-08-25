import fs from "node:fs";
import path from "node:path";

import { isSteamStaticUrl } from "./steam-covers.js";

const CACHE_VERSION = 1;

function validAppid(appid) {
  return /^\d+$/.test(String(appid));
}

export class GameCoverCache {
  constructor(filePath, fileSystem = fs) {
    this.filePath = filePath;
    this.fs = fileSystem;
    this.covers = new Map();
    this.loaded = false;
  }

  load() {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const parsed = JSON.parse(this.fs.readFileSync(this.filePath, "utf8"));
      if (parsed?.version !== CACHE_VERSION || !parsed.covers || typeof parsed.covers !== "object") return;
      for (const [appid, coverUrl] of Object.entries(parsed.covers)) {
        if (validAppid(appid) && isSteamStaticUrl(coverUrl)) this.covers.set(appid, coverUrl);
      }
    } catch {
      // 缺檔或內容損壞時，保留空快取並於下次成功結果時重建。
    }
  }

  get(appid) {
    this.load();
    return this.covers.get(String(appid)) ?? null;
  }

  set(appid, coverUrl) {
    this.load();
    const key = String(appid);
    if (!validAppid(key) || !isSteamStaticUrl(coverUrl)) return false;
    this.covers.set(key, coverUrl);
    return this.persist();
  }

  persist() {
    const directory = path.dirname(this.filePath);
    const temporaryPath = path.join(directory, `.${path.basename(this.filePath)}.${process.pid}.tmp`);
    try {
      this.fs.mkdirSync(directory, { recursive: true });
      this.fs.writeFileSync(temporaryPath, JSON.stringify({
        version: CACHE_VERSION,
        covers: Object.fromEntries(this.covers),
      }), "utf8");
      this.fs.renameSync(temporaryPath, this.filePath);
      return true;
    } catch {
      try { this.fs.unlinkSync(temporaryPath); } catch {}
      return false;
    }
  }
}

export class GameCoverService {
  constructor({ cache, resolveCover }) {
    this.cache = cache;
    this.resolveCover = resolveCover;
    this.pending = new Map();
  }

  async resolve(appids) {
    const uniqueAppids = [...new Set(appids)].map(String).filter(validAppid);
    const covers = {};
    for (let index = 0; index < uniqueAppids.length; index += 4) {
      await Promise.all(uniqueAppids.slice(index, index + 4).map(async (appid) => {
        covers[appid] = await this.resolveOne(appid);
      }));
    }
    return covers;
  }

  async resolveOne(appid) {
    const cached = this.cache.get(appid);
    if (cached) return cached;
    if (!this.pending.has(appid)) {
      const pending = Promise.resolve()
        .then(() => this.resolveCover(appid))
        .then((coverUrl) => {
          if (coverUrl) this.cache.set(appid, coverUrl);
          return coverUrl ?? null;
        })
        .catch(() => null)
        .finally(() => this.pending.delete(appid));
      this.pending.set(appid, pending);
    }
    return this.pending.get(appid);
  }
}
