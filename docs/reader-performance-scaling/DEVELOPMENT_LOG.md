# 開發紀錄

## 2026-08-25｜完成｜A4｜PASS

- 工作目錄：`D:\練習\CatchList\.worktrees\steam-community-tags`；開始與結束 HEAD 均為 `0919bf6a861b76306d45053b35278be99d819f71`，分支為 `codex/steam-community-tags`。
- 既有社群標籤功能與 A1、A2、A3 的未提交修改完整保留；本階段未 commit、push、部署或寫入正式 `G:` 資料。
- A4 自動驗證通過：1,000 筆隔離 Markdown／sidecar、首批 50 張封面跨快取實例命中、Electron 的 50／100／150 續載、節點保持、篩選重設、外部開啟保護與桌機／手機無水平溢位。
- 使用者已於隔離 1,000 筆檢視器確認操作結果為 OK，ACC-001 blocking 手動驗收通過。驗收 fixture 的標籤數字是資料筆數統計：`策略` 為 1,000 筆，`自動續載` 與 `千筆驗收` 各為交替配置的 500 筆；不屬於正式遊戲資料。
- 最終驗證：`npm run reader:test` 通過 43 項、略過 1 項 Windows symlink 權限測試；`git diff --check` 通過。僅出現既有檔案的 LF／CRLF 轉換警告，未發現空白錯誤。

## 2026-08-25｜自動驗證完成｜A4｜CONCERNS

- 工作目錄：`D:\練習\CatchList\.worktrees\steam-community-tags`；開始與目前 HEAD 均為 `0919bf6a861b76306d45053b35278be99d819f71`，分支為 `codex/steam-community-tags`。
- 開始前既有社群標籤功能與 A1、A2、A3 的未提交修改完整保留；本階段未 commit、push、部署或寫入正式 `G:` 資料。
- 新增可重複產生的 1,000 筆 Markdown／`遊戲標籤.json` 隔離 fixture。實際驗證其可由 Reader 解析為 1,000 筆，並確認首批 50 張封面跨新快取實例全部命中，第二個實例的 Steam resolver 呼叫數為 0。
- 擴充 Electron harness：以 1,000 筆資料確認初始 50 筆、兩次 sentinel 續載至 100／150 筆、前 50 列節點保持、篩選重設至 50 筆、過量批次開啟沒有外部呼叫，並確認 1440px 桌機與 390px 手機均無水平溢位。
- 新增 `npm run manual:large-games --workspace catchlist-reader`：建立暫存隔離資料與獨立 `userData` 封面快取後啟動可見閱讀器；2026-08-25 已實際啟動，資料位於 `C:\Users\patrick.zyx\AppData\Local\Temp\catchlist-reader-manual-npADtz\data`，不寫入正式資料。
- 首次手動驗收發現虛構 AppID 沒有實際 Steam 圖片資產；已改讓隔離 fixture 的 1,000 個快取鍵共用經 HEAD 請求確認為 HTTP 200 的 Portal 2 靜態封面，供驗收可見的快取與圖片載入行為。這不影響正式清單的每款遊戲封面對應規則。
- 實際測試：`npm run reader:test` 通過 43 項、略過 1 項 Windows symlink 權限測試；手動啟動命令已成功執行；`node --check catchlist_reader/test-support/launch-large-game-manual.mjs` 與 `git diff --check` 均通過。僅出現既有檔案的 LF／CRLF 轉換警告，未發現空白錯誤。
- 放行暫為 `CONCERNS`：ACC-001 是 blocking 手動驗收，尚待使用者確認無卡頓、可自動續載與封面快取行為。

## 2026-08-25｜開工｜A4

- 工作目錄：`D:\練習\CatchList\.worktrees\steam-community-tags`。
- 開始 HEAD：`0919bf6a861b76306d45053b35278be99d819f71`，分支：`codex/steam-community-tags`。
- 開始前已有社群標籤功能與 A1、A2、A3 的未提交修改；A4 僅會修改千筆整合驗證、隔離手動驗收啟動與相關文件，完整保留既有內容。
- A4 狀態改為 `in_progress`；執行模式維持 sequential，未使用子代理。

## 2026-08-24｜完成｜A3｜PASS

- 工作目錄：`D:\練習\CatchList\.worktrees\steam-community-tags`；開始與結束 HEAD 均為 `0919bf6a861b76306d45053b35278be99d819f71`，分支為 `codex/steam-community-tags`。
- 開始前既有社群標籤功能與 A1、A2 的未提交修改完整保留；本階段未 commit、push、部署或寫入正式 `G:` 資料。
- 新增可重用的社群標籤計數索引；標籤搜尋與已選標籤組合只過濾索引快照，保留原有計數、排序、搜尋、已選置頂與 AND 規則。
- resize 改為以 `requestAnimationFrame` 合併；同一個版面區間只同步標籤面板溢位狀態，不重建清單。跨越 560px 時才重建遊戲列，將每列顯示標籤數從 6 切換為 3，或反向切換。
- 擴充單元與 Electron harness：驗證索引與原規則一致、同寬 resize 保留列節點與搜尋輸入節點、桌機與手機分別顯示 6 與 3 個列標籤。
- 實際測試：`npm run reader:test` 通過 42 項，Windows symlink 權限限制略過 1 項；`git diff --check` 通過。僅出現既有檔案的 LF／CRLF 轉換警告，未發現空白錯誤。
- A4 交接文件已備妥。未自動建立新 task：Codex 已保存專案的路徑是 `D:\練習\CatchList` 根目錄，無法保證新 task 會使用目前含未提交修改的 `.worktrees\steam-community-tags` 工作樹。

## 2026-08-24｜開工｜A3

- 工作目錄：`D:\練習\CatchList\.worktrees\steam-community-tags`。
- 開始 HEAD：`0919bf6a861b76306d45053b35278be99d819f71`，分支：`codex/steam-community-tags`。
- 開始前已有社群標籤功能與 A1、A2 的未提交修改；A3 只在標籤索引、resize 節流與相關測試範圍內新增修改，保留既有內容。
- A3 狀態改為 `in_progress`；執行模式維持 sequential，未使用子代理。

## 2026-08-24｜完成｜A2｜PASS

- 工作目錄：`D:\練習\CatchList\.worktrees\steam-community-tags`；開始與結束 HEAD 均為 `0919bf6a861b76306d45053b35278be99d819f71`，分支為 `codex/steam-community-tags`。
- 開始前既有社群標籤功能與 A1 的未提交修改完整保留；本階段未 commit、push、部署或寫入正式 `G:` 資料。
- 新增 `game-cover-cache.js`：只保存經驗證的 Steam static HTTPS 封面網址，使用版本化 JSON、暫存檔後更名的原子寫入；缺檔、損壞或無法寫入時安全退回記憶體快取。
- 主程序改由快取服務處理封面：先讀記憶體與磁碟快取，僅對未命中 AppID 呼叫 Steam；同一 AppID 的同時請求共用同一個進行中的作業。
- Steam appdetails 請求新增 8 秒逾時；renderer 的封面回傳只替換對應 placeholder，不替換遊戲列。
- 新增快取與逾時測試，並擴充 Electron harness：驗證快取跨新實例命中、壞快取回復、首批只請求 50 款封面，以及封面更新後首列節點保持不變。
- 實際測試：`npm run reader:test` 通過 41 項，Windows symlink 權限限制略過 1 項；`git diff --check` 通過。僅出現既有檔案的 LF／CRLF 轉換警告，未發現空白錯誤。
- 非阻擋人工驗收仍待使用者比較首次與第二次啟動時的封面載入。
- A3 交接文件已備妥。未自動建立新 task：Codex 已保存專案的路徑是 `D:\練習\CatchList` 根目錄，無法保證新 task 會使用目前含未提交修改的 `.worktrees\steam-community-tags` 工作樹。

## 2026-08-24｜開工｜A2

- 工作目錄：`D:\練習\CatchList\.worktrees\steam-community-tags`。
- 開始 HEAD：`0919bf6a861b76306d45053b35278be99d819f71`，分支：`codex/steam-community-tags`。
- 開始前已有社群標籤功能與 A1 的未提交修改；A2 只在封面取得、快取與相關測試範圍內新增修改，保留既有內容。
- A2 狀態改為 `in_progress`；執行模式維持 sequential，未使用子代理。

## 2026-08-24｜完成｜A1｜PASS

- 工作目錄：`D:\練習\CatchList\.worktrees\steam-community-tags`；開始與結束 HEAD 均為 `0919bf6a861b76306d45053b35278be99d819f71`，分支為 `codex/steam-community-tags`。
- 開始前既有社群標籤功能的未提交修改與新增檔案完整保留；本階段未 commit、push、部署或寫入正式 `G:` 資料。
- 修改 `app.js`、`item-template.js` 與樣式：遊戲結果首次顯示 50 筆，`IntersectionObserver` 觸及 sentinel 時只追加下一批 50 筆；瀏覽器不支援 observer 時顯示「顯示更多遊戲」按鈕。封面回傳只替換對應封面 placeholder，不重建遊戲列。
- 移除 Electron renderer 的「開啟全部 Steam」控制；任何超過 50 個連結的批次開啟會在 renderer 攔下並提示使用者先縮小篩選。
- 擴充 preview、Electron harness 與 renderer 測試，以 1,000 筆 fixture 驗證初始 50 筆、兩次自動續載至 100／150、前 50 列節點保持、篩選重設至 50、無全部開啟與過量批次不呼叫外部開啟。
- 實際測試：`npm run reader:test` 通過 38 項，Windows symlink 權限限制略過 1 項；`git diff --check` 通過。僅出現既有檔案的 LF／CRLF 轉換警告，未發現空白錯誤。
- 非阻擋人工驗收仍待使用者以大量資料確認捲動感受。
- A2 交接文件已備妥。未自動建立新 task：Codex 已保存專案的路徑是 `D:\練習\CatchList` 根目錄，無法保證新 task 會使用目前含未提交修改的 `.worktrees\steam-community-tags` 工作樹。

## 2026-08-24｜開工｜A1

- 工作目錄：`D:\練習\CatchList\.worktrees\steam-community-tags`。
- 開始 HEAD：`0919bf6a861b76306d45053b35278be99d819f71`，分支：`codex/steam-community-tags`。
- 開始前已存在社群標籤功能的未提交修改與新增檔案；本階段會保留它們，不重建或覆蓋。
- A1 狀態改為 `in_progress`；執行模式維持 sequential，未使用子代理。

## 2026-08-24｜規劃｜A1 至 A4

- 建立分階段計畫，範圍為千筆遊戲檢視器的漸進渲染、封面快取、標籤索引與整合驗證。
- 已唯讀量測 1,000 筆合成資料：純篩選與排序約 4 ms；標籤雙重統計約 7.5 ms；完整列 HTML 約 1.27 MB、9,000 個按鈕。
- 尚未修改功能程式碼或執行本計畫的測試。
