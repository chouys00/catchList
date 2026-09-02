# 專案 Roadmap

計畫版本：1

整體完成條件：REQ-001 至 REQ-005 已實作，完整 Reader 測試與 `git diff --check` 通過，不寫入正式 `G:` 資料，也不提交變更。

階段順序：D1。

## D1：刪除與復原局部更新

### 需求對應

- REQ-001、REQ-002、REQ-003、REQ-004、REQ-005

### 目標

讓 Electron 刪除與復原只回傳並套用受影響資料，移除完整 snapshot 造成的 2～3 秒等待。

### 非目標

不改格式、不取消備份、不寫正式資料，也不加入寫檔前先移除資料的樂觀更新。

### 前置條件與相依階段

無。既有 `reader-performance-scaling` A1～A4 已 accepted，本階段必須保留其分批顯示與封面快取行為。

### 預期成果

精簡的刪除／復原 IPC 結果、renderer 局部狀態更新、重複操作保護、失敗保留原資料，以及完整回歸測試證據。

### 實作方向

後端刪除成功後回傳媒體類型、刪除作品、復原狀態等最小資料，不再建立完整 snapshot。renderer 只替換受影響 library 的 entries；復原使用後端保存的刪除作品資料加回。只有後端確認成功後才改畫面狀態。

### 可能影響的系統或資料

`catchlist_reader/src/main.js`、`src/library.js`、`src/renderer/app.js`、必要的 renderer 狀態輔助模組、preload 介面與 Reader 測試。測試只寫暫存資料。

### 階段內任務與並行候選

循序執行。IPC 回傳格式、renderer 狀態更新與測試共用核心介面，不適合分派並行寫入。

### 必要測試

- 刪除結果不含完整 `libraries`，檔案已刪除指定作品且備份存在。
- 復原結果含可加回的作品資料，檔案內容與刪除前完全一致。
- renderer 成功時只更新指定 library；失敗時原資料不變；重複點擊不送出第二次操作。
- 搜尋、篩選、排序、筆數與遊戲分批顯示不回歸。
- `npm run reader:test`。
- `git diff --check`。

### 完成條件

所有必要測試通過，REQ-001 至 REQ-005 完成，沒有 blocking 驗收或未處理的資料安全問題。

### 人工或外部驗收

- 類型：non-blocking
- 項目：使用者日後以正式 Google 雲端硬碟資料確認一般刪除操作於 200 ms 內刷新。

### 風險與未知事項

現有工作樹有多項未提交功能，修改時必須局部合併。若局部狀態更新無法可靠重建 sections 或排序，允許只重新載入受影響的單一 Markdown，但不得退回完整 snapshot。
