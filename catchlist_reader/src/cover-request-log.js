import fs from "node:fs";
import path from "node:path";

import { isSteamStaticUrl } from "./steam-covers.js";

function appidFromUrl(url) {
  return String(url).match(/\/steam\/apps\/(\d+)\//)?.[1] ?? "未知";
}

export class CoverRequestLog {
  constructor(filePath, { fileSystem = fs, now = () => new Date() } = {}) {
    this.filePath = filePath;
    this.fs = fileSystem;
    this.now = now;
    this.counts = { detailRequests: 0, imageRequests: 0, cacheHits: 0, failedImages: 0 };
    this.sentImages = new Set();
    this.enabled = true;
    this.finished = false;
    try {
      this.fs.mkdirSync(path.dirname(filePath), { recursive: true });
      this.write("閱讀器啟動，開始記錄遊戲封面請求");
    } catch {
      this.enabled = false;
    }
  }

  write(message) {
    if (!this.enabled) return;
    try {
      this.fs.appendFileSync(this.filePath, `${this.now().toISOString()}  ${message}\n`, "utf8");
    } catch {
      this.enabled = false;
    }
  }

  recordDetailRequest(appid) {
    if (!/^\d+$/.test(String(appid))) return;
    this.counts.detailRequests += 1;
    this.write(`Steam 作品資料請求：AppID ${appid}（本次 ${this.counts.detailRequests} 次）`);
  }

  recordImage(details) {
    if (details.resourceType !== "image" || !isSteamStaticUrl(details.url)) return;
    const appid = appidFromUrl(details.url);
    if (this.sentImages.delete(details.id)) {
      const result = details.statusCode === 304 ? "網站確認快取仍有效" : `HTTP ${details.statusCode}`;
      this.write(`封面圖片網路回應：AppID ${appid}，${result}`);
      return;
    }
    if (details.fromCache) {
      this.counts.cacheHits += 1;
      this.write(`封面圖片使用快取：AppID ${appid}（本次 ${this.counts.cacheHits} 次）`);
      return;
    }
    // 少數情況可能錯過送出事件；保留完成事件的計數，不讓網路請求漏記。
    this.counts.imageRequests += 1;
    const result = details.statusCode === 304 ? "網站確認快取仍有效" : `HTTP ${details.statusCode}`;
    this.write(`封面圖片網路請求：AppID ${appid}，${result}（本次 ${this.counts.imageRequests} 次）`);
  }

  recordImageSent(details) {
    if (details.resourceType !== "image" || !isSteamStaticUrl(details.url)) return;
    this.sentImages.add(details.id);
    this.counts.imageRequests += 1;
    this.write(`封面圖片送往網站：AppID ${appidFromUrl(details.url)}（本次 ${this.counts.imageRequests} 次）`);
  }

  recordImageError(details) {
    if (details.resourceType !== "image" || !isSteamStaticUrl(details.url)) return;
    this.sentImages.delete(details.id);
    this.counts.failedImages += 1;
    this.write(`封面圖片載入失敗：AppID ${appidFromUrl(details.url)}，${details.error || "原因不明"}`);
  }

  finish() {
    if (this.finished) return;
    this.finished = true;
    const { detailRequests, imageRequests, cacheHits, failedImages } = this.counts;
    this.write(`本次合計：Steam 作品資料請求 ${detailRequests} 次；封面圖片網路請求 ${imageRequests} 次；封面圖片快取讀取 ${cacheHits} 次；封面圖片載入失敗 ${failedImages} 次`);
    this.write("閱讀器結束");
  }
}
