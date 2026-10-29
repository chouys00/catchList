# 1.0.63 遊戲更新圖示與資訊密度

設計目的：縮減名稱下方獨立按鈕占用的高度，讓相同視窗能顯示更多遊戲。

依使用者最後確認，更新資訊放在「管理」欄最前方，以循環箭頭表示。沿用閱讀器的深色表格、灰色線條、既有字型與萊姆綠互動狀態；圖示大小與其他管理操作一致，不另加文字列。完整操作名稱保留在無障礙標籤，更新時間改放在滑鼠提示。

桌面管理欄加寬以容納五個操作；窄視窗的管理操作占用同一整列、靠右排列，避免新增圖示後換行。名稱與原文完整保留，未改字級或截斷文字。

## 已實際驗證

使用正式 preload 與資料服務，在 Electron 的 Chromium 測試 1440 與 390 像素視窗。測試案例採用使用者截圖中的長中文與原文名稱，確認更新圖示位於管理區、圖示沒有可見文字、五個操作不重疊、畫面無水平溢出。載入中、成功、失敗保留及重新載入後的保存均由既有互動流程驗證。

同樣欄寬下，測試以加入舊版獨立按鈕列的方式比較高度：桌面長名稱列由 129.06 px 降為 90.42 px，390 像素窄視窗由 339.13 px 降為 300.13 px。這是隔離測試資料的量測，實際列高仍由名稱長度、標籤與視窗寬度決定。

已查看 `output/game-refresh-management/refresh-success-desktop.png` 與 `refresh-success-mobile.png`，確認名稱層級、欄位對齊、圖示大小、文字對比、管理操作間距、窄版換行與更新提示。此為桌面應用程式，入口為 `src/renderer/index.html`，沒有本機伺服器網址。

## 修改位置

`src/renderer/game-refresh-ui.js`、`item-template.js`、`app.js` 與 `styles.css` 負責圖示位置、提示、讀取狀態及欄寬；`test-support/game-refresh-workflows.cjs` 沿用更新流程並加入排版與高度驗證。更新來源與保存規則維持 1.0.62 的行為。

## 發行結果

`npm run reader:build` 成功，版本防護與 151 項測試全部通過，`git diff --check` 及修改的 JavaScript 語法檢查通過。第一次建置因個人清單測試仍預期管理欄四個按鈕而停止；已同步確認五個操作並重跑，最終全部通過。已逐一核對 app.asar 中的四份介面檔案與工作目錄完全相同，打包版本為 1.0.63。

本機：`D:\練習\CatchList\catchlist_reader\dist\CatchListReader-1.0.63-portable.exe`。

副本：`G:\我的雲端硬碟\CatchList\CatchListReader-1.0.63-portable.exe`。

兩者 SHA-256 均為 `E3D8BB52785EFC0066B28B77822D7A8A6C250AE1EE5DD1BB89AD57FC16340A9E`，大小為 94,793,427 bytes。核對後已移除雲端資料夾頂層的 1.0.62，可攜版僅保留 1.0.63；本機歷史版本保留。Google Drive 是否完成上傳未驗證。

## 1.0.64 更新圖示改為第四個

依後續指定，管理欄調整為個人收藏、共樂收藏、隱藏、更新資訊、真正刪除。只調整圖示順序，欄寬與列高維持 1.0.63 的設計。

既有 Chromium 操作流程已確認五個按鈕的實際順序，桌面與窄視窗截圖在 `output/game-refresh-fourth/`。已檢查圖示順序、對齊、間距、列高與窄版排版；更新的成功、失敗、保存流程及完整 151 項測試皆通過。打包的 `item-template.js` 與工作目錄一致，封裝版本為 1.0.64。

`npm run reader:build` 成功產生 `D:\練習\CatchList\catchlist_reader\dist\CatchListReader-1.0.64-portable.exe`，並複製至 `G:\我的雲端硬碟\CatchList\CatchListReader-1.0.64-portable.exe`。兩者大小均為 94,793,772 bytes，SHA-256 均為 `2C25829D541606CEA6BB955F22BB1CEEB64DA099D1055492B2919139E3B6DAD5`。核對後移除雲端資料夾頂層的 1.0.63，僅保留新版；本機 dist 歷史檔保留。Google Drive 上傳狀態未驗證。
