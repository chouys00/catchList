# 1.0.66 Steam 評論來源修正

查核日期：2026-10-27。

## 原因與改動

舊 `/appreviews/<appid>?json=1` 在實測中回傳 HTTP 302 並轉至 Steam 首頁。原本禁止轉址的請求因此拋出 `TypeError: fetch failed`，更新服務保留舊資訊。

Steam 官方文件已公告舊來源停用：https://partner.steamgames.com/doc/webapi/IUserReviewsService?language=english 。

單款更新與手動新增共用的新來源為 `https://api.steampowered.com/IUserReviewsService/GetAppReviews/v1/`，使用 `input_json`、`languages: ["all"]`、`review_type: 0`、`purchase_type: 0`。不需金鑰，統計範圍仍是全語系 Steam 購買者；未變更預設離題評論過濾。新回應從 `response.query_summary` 讀取，並驗證總數與好評數。

繁中社群標籤仍由商店頁取得。連線、逾時、轉址與格式錯誤改為中文提示。評論及標籤任一不完整，整筆不保存；報告與個人紀錄不受影響。

## 已實際確認

- `node --test --experimental-test-isolation=none catchlist_reader/test/game-refresh.test.js catchlist_reader/test/manual-games.test.js`：19 項通過。
- `npm run reader:test`：解除子程序限制後，154 項全部通過，包含正式 preload 的更新圖示操作、保存、失敗保留、重新載入與窄視窗測試。初次在沙箱中執行的 11 項介面測試因 `spawn EPERM` 無法啟動，並非測試斷言失敗。
- 新增回歸案例涵蓋新介面查詢範圍、零評論、零好評、錯誤總數、連線失敗、逾時、302、非 JSON、缺漏摘要、取消，以及失敗不改寫舊資訊。
- 實際呼叫修正後的 `lookupSteamStats`：Colossus（1722800）為 94%、70 則評論、20 個標籤；Stardew Valley（413150）為 99%、901,434 則評論、20 個標籤。數值為查核當時回應，未寫入正式資料夾。
- 實際呼叫 `lookupSteamGame('1722800')`：94%、70 則評論、20 個標籤，無缺漏警告。
- `git -c core.whitespace=cr-at-eol diff --check`：通過；保留工作區既有 Windows 換行。

## 驗證界線

介面測試使用固定回應；真實 Steam 連線另以查詢函式測試。未在使用者目前開啟的 1.0.65 視窗套用更新或修改正式資料。匿名 API 仍可能受 Steam 限流，既有一分鐘等待規則保留。

## 可攜版交付

`npm run reader:build` 成功，建置前版本防護及 154 項測試再次通過。打包後 `app.asar` 版本為 1.0.66，內含的 `src/steam-game-lookup.js` 與工作區修正版逐位元組一致。

- 本機：`D:\練習\CatchList\catchlist_reader\dist\CatchListReader-1.0.66-portable.exe`。
- 雲端副本：`G:\我的雲端硬碟\CatchList\CatchListReader-1.0.66-portable.exe`。
- 兩份均為 94,794,824 bytes，SHA-256 均為 `4BFE2D9A66CD65885140E13560D773668FE349DE3B6308F08313C265A2F54D52`。
- 雲端副本驗證成功後，已移除雲端資料夾頂層的 1.0.65 舊版 EXE。本機歷史版保留，未修改報告或個人紀錄。
- Google Drive 是否已完成上傳仍未確認。請關閉原本的 1.0.65，再啟動 1.0.66。
