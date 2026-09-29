import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { CoverRequestLog } from "../src/cover-request-log.js";

test("執行期間記錄 Steam 請求，區分網路與快取並在結束時合計", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "catchlist-cover-log-"));
  try {
    const file = path.join(directory, "logs", "steam-cover-requests.log");
    const log = new CoverRequestLog(file, { now: () => new Date("2026-09-29T00:00:00Z") });
    const image = {
      resourceType: "image",
      id: 1,
      url: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/282900/header.jpg",
      statusCode: 200,
      fromCache: false,
    };
    log.recordDetailRequest("282900");
    log.recordImageSent(image);
    log.recordImage(image);
    log.recordImage({ ...image, id: 2, fromCache: true });
    log.recordImageSent({ ...image, id: 3 });
    log.recordImage({ ...image, id: 3, fromCache: true, statusCode: 304 });
    log.recordImage({ ...image, resourceType: "script" });
    log.recordImage({ ...image, url: "https://example.com/steam/apps/282900/header.jpg" });
    log.finish();
    log.finish();
    const contents = fs.readFileSync(file, "utf8");
    assert.match(contents, /Steam 作品資料請求：AppID 282900/);
    assert.match(contents, /封面圖片送往網站：AppID 282900/);
    assert.match(contents, /封面圖片網路回應：AppID 282900，HTTP 200/);
    assert.match(contents, /封面圖片使用快取：AppID 282900/);
    assert.match(contents, /封面圖片網路回應：AppID 282900，網站確認快取仍有效/);
    assert.match(contents, /本次合計：Steam 作品資料請求 1 次；封面圖片網路請求 2 次；封面圖片快取讀取 1 次；封面圖片載入失敗 0 次/);
    assert.equal(contents.match(/閱讀器結束/g)?.length, 1);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
