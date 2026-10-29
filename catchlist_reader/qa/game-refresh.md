# 單款遊戲資訊更新驗收

設計目的：讓使用者在瀏覽舊遊戲時，直接更新該款遊戲的社群標籤、好評率與評論數。

設計沿用閱讀器現有的深色工作區、灰色細框與萊姆綠狀態色。按鈕放在名稱與原文名稱下方，避免擠壓名稱、複製與時數入口；完成後在旁邊顯示更新日期。使用現有字型及色彩變數，不新增圖片或相依套件。

## 實際驗證

- `npm run reader:test`：151 項通過，包含既有收藏、分類、批次操作、搜尋、篩選及其他媒體流程。
- `test/game-refresh.test.js`：驗證報告與手動收錄的保存、穩定識別碼、收藏保留、候補資料、失敗不寫入、防重複與限流退避。
- `test-support/game-refresh-workflows.cjs`：使用正式 preload 與資料服務，在 Electron 的 Chromium 實際操作按鈕，驗證讀取中、完成、失敗保留及重新載入後保存。
- 1440 與 390 像素視窗：確認無水平溢出、更新按鈕在畫面內且可操作。
- 實際呼叫 `lookupSteamStats('413150')`：成功取得 Steam 評論摘要與繁中標籤。未寫入正式清單。
- `git diff --check`：通過。

## 畫面檢查

已查看 `output/game-refresh-qa/refresh-success-desktop.png` 與 `refresh-success-mobile.png`，確認名稱層級、文字對比、細框按鈕、更新日期與數值、標籤間距及窄版換行。載入狀態使用旋轉圖示與「更新中…」，並停用重複點擊；減少動態效果的系統偏好會停用旋轉。

此為桌面應用程式，畫面入口是 `src/renderer/index.html`，沒有瀏覽器伺服器網址。介面測試以固定 Steam 回應確保可重現；真實網路讀取另行驗證。雲端同步是否已完成上傳，無法由檔案複製結果判定。

## 可攜版驗證

`npm run reader:build` 成功，版本防護與建置前 151 項測試全部通過。已檢查打包後 `app.asar` 的版本為 1.0.62，且包含更新服務、保存模組與介面模組。

產生檔案：`D:\練習\CatchList\catchlist_reader\dist\CatchListReader-1.0.62-portable.exe`。

副本：`G:\我的雲端硬碟\CatchList\CatchListReader-1.0.62-portable.exe`。

兩者大小均為 94,791,890 bytes，SHA-256 均為 `A8680E5D39BF62BBF2B4709782E292FFBF9B5198FE02A40AED83827C630BA72E`。比對相同後已清理雲端資料夾頂層的 1.0.61 可攜版，本機 dist 歷史版本保留。

## 主要修改位置

`src/game-refresh-service.js`、`src/game-refresh-store.js`、`src/steam-game-lookup.js` 處理讀取及保存；`src/library.js` 合併最新資料；`src/main.js` 與 `src/preload.cjs` 串接桌面程式；`src/renderer/game-refresh-ui.js`、`app.js`、`item-template.js`、`styles.css` 提供按鈕及操作回饋。
