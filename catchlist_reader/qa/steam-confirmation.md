# Steam 官方確認流程驗收

## 設計與範圍

用途是讓閱讀器使用者親自在 Steam 官方頁面完成必要確認，然後繼續更新或補齊新增預覽。視覺沿用現有深灰工作區、暖白文字、萊姆綠操作色、細框，以及既有 serif 標題與 sans 控制字型；不新增圖片、字型或相依套件。

第四個更新圖示保留位置。遇到確認頁停止旋轉，先顯示說明對話框；手動新增則在可捲動面板的頂端顯示確認入口。確認視窗的本機工具列與 Steam 遠端網頁分開，工具列顯示目前網址、重新檢查與取消。窄視窗工具列換行，按鈕至少 44px 高。

## 實作界線

- `persist:catchlist-steam` 保存 Steam 正常核發的網站狀態，不代填生日、不延長期限、不取得外部瀏覽器資料，也不把 Cookie 交給清單前端或寫入雲端資料。
- 遠端 `WebContentsView` 沒有 preload 或 Node.js；只允許指定 Steam HTTPS 主頁導覽，拒絕新視窗、下載與額外權限，不略過憑證錯誤。
- 確認請求綁定資料夾、AppID、操作及一次性編號。取消、資料夾切換、面板關閉或主視窗關閉會使請求失效；確認後只重跑一次，保存前重新檢查有效性。
- 同款年齡轉址與已知確認頁表單才觸發互動。一般轉址、限流、網路錯誤及缺標籤不冒充年齡確認；只有網址改變不代表確認成功。
- Electron 43 的 `session.fetch({redirect: 'manual'})` 實測會以 `Redirect was cancelled` 拒絕，無法讀取 Location。產品因此使用 `net.request` 的同一 session、`credentials: 'include'` 與手動轉址事件，保存官方 Cookie 並保留轉址資訊。這是原計畫的必要技術調整。

## 測試方式

`test/steam-confirmation.test.js` 驗證頁面辨識、同款轉址、允許網域、缺漏預覽、一次性重試、取消與失效請求。既有更新保存測試繼續驗證失敗不改報告或個人紀錄。

`test/steam-confirmation-workflows.test.js` 啟動正式 `main.js`、正式 preload、資料服務與確認視窗；隔離 profile 內使用模擬網頁及無涉真實 Steam 年齡或登入的測試 Cookie。由於 Electron 的 `net.request` 不走自訂 protocol handler，測試注入 Chromium session 傳輸，產品網路傳輸另做真實連線驗證。

互動驗證包含 1440／390px 提示對話框、960／390px 確認視窗、取消不寫入、非法導覽被攔截、遠端無本機橋接、更新保存、手動新增共用狀態、失效後再次確認，以及完成後只更新預覽而不自動加入。第二個程序讀取保存狀態，並驗證清除專用 session 不影響 defaultSession。

畫面證據在 `output/steam-confirmation-qa/`。`webContents.capturePage` 僅能擷取本機工具列；本環境未提供該確認子視窗的原生擷取來源，限制記錄在 `capture-note.txt`，不宣稱完整遠端網頁截圖通過。已檢查本機提示與工具列的標題層級、字體一致性、主要按鈕、對比、長網址省略、窄版換行、44px 控制高度及確認入口可見性；遠端網頁另以 DOM 互動驗證。

真實連線驗收腳本為 `test-support/steam-confirmation-live.cjs`，使用獨立暫存 profile，只讀遊戲資訊，不寫正式清單。官方頁面的生日、登入及其他確認由使用者本人操作；未完成時不得宣稱真實確認流程通過。

## 2026-10-27 真實驗收

使用者回報已看到視窗並完成官方確認。當時程式未留下自動續讀的完成紀錄；依使用者要求已關閉本次真實驗收視窗，不再重新開啟遊戲頁面。

隨後以 `test-support/steam-confirmation-probe.cjs` 在背景讀取同一份隔離 profile，實際成功取得 Futa Slug EX 的 90% 好評、374 則評論與 19 個標籤，結果在 `output/steam-confirmation-qa/live-result.json`。一般遊戲 Stardew Valley 亦成功取得 20 個標籤。

這確認了官方確認狀態可由產品網路傳輸沿用。另補上帶遊戲名稱路徑與頁內導覽的完成偵測；修正後的自動關閉及續讀由模擬頁面驗證，未再要求使用者開啟真實頁面重測。

## 測試與發行結果

- 相關單元測試 27 項通過；正式主程序的完整互動測試通過，包含手動新增、取消、清除前取消／確認、跨程序保存及其他 session 保護。
- `npm run reader:build` 成功；建置前版本防護與完整 163 項測試全部通過。背景測試視窗停用節流，避免失焦時延遲對話框關閉事件；這只調整測試設定。
- 已核對打包後 `app.asar` 版本為 1.0.67，14 個相關程式與介面檔案與工作區逐位元組相同。
- 本機：`D:\練習\CatchList\catchlist_reader\dist\CatchListReader-1.0.67-portable.exe`。
- 雲端副本：`G:\我的雲端硬碟\CatchList\CatchListReader-1.0.67-portable.exe`。
- 兩份均為 94,801,116 bytes，SHA-256 均為 `51FFF4CC822A198C60BC5BDC8BB6C008F0B61D62A5A8E5A020C83373A285E0A0`。比對成功後已清理雲端頂層 1.0.66 舊版閱讀器，本機歷史版本保留。
- 已確認本次真實驗收、背景檢查及模擬確認測試的 Electron 程序皆已結束。未自動啟動新版或重新開啟真實遊戲頁面。
- 未修改正式清單或個人紀錄。Google Drive 是否已完成上傳尚未確認；隔離驗收狀態未移入正式 profile，正式版首次使用可能仍需由本人完成確認。
