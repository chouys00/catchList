# 下一 task 交接

## 交接模式

start-next-stage

## 整體目標

讓 CatchList 遊戲檢視器可穩定瀏覽超過 1,000 筆資料，避免一次完整渲染與重複 Steam 封面 API 請求。

## 目前階段與狀態

A4 已 accepted，放行結果 PASS；A1 至 A4 的千筆遊戲檢視器計畫已完成。

## 本 task 目標

無待交接階段。後續功能應另建任務與計畫。

## 完成條件

本計畫已完成；不得因整理文件而 commit 或寫入正式 `G:` 資料。

## 相關文件

- `PROJECT_SPEC.md`
- `PROJECT_ROADMAP.md`
- `STAGE_STATE.yaml`
- `DECISIONS.md`

## 已確認決策與限制

- 使用者指定 Terra＋高度，且希望每個階段使用新的 task 以控制上下文。
- 使用同一個已保存專案的 Local checkout，保留既有未提交功能分支狀態。
- 不使用 Computer Use；最後由使用者手動驗收。
- A1 已把遊戲列改為首次 50 筆、觸及 sentinel 後追加 50 筆；篩選會重設至前 50 筆，且追加不替換既有列。
- A1 已移除 Electron renderer 的「開啟全部 Steam」；超過 50 個連結的批次開啟會在 renderer 攔下。
- A2 已加入 Electron `userData` 封面快取與 8 秒逾時保護；封面回傳只替換對應 placeholder，不重建遊戲列。
- A3 已加入標籤索引與 resize 節流；同一個版面區間不重建清單，跨越 560px 才調整列標籤上限。

## 測試與驗證證據

`npm run reader:test` 已於 A4 實際通過 43 項，Windows symlink 權限限制略過 1 項。千筆 Electron harness 已確認初始 50、兩次續載、節點保持、篩選重設、封面請求批次、批次開啟保護與雙寬度無水平溢位；千筆 Markdown／sidecar fixture 與跨快取實例命中亦已通過。

## 已知問題與風險

工作樹已有既有未提交的社群標籤功能與 A1、A2、A3、A4 變更。A4 必須保留全部既有修改。隔離檢視器已啟動，資料位於 `C:\Users\patrick.zyx\AppData\Local\Temp\catchlist-reader-manual-npADtz\data`，封面快取位於同目錄的 `user-data`，不寫入正式資料。

## 工作區與 Git 狀態

工作目錄：`D:\練習\CatchList\.worktrees\steam-community-tags`。HEAD：`0919bf6a861b76306d45053b35278be99d819f71`；分支：`codex/steam-community-tags`。交接前仍須重新核對實際路徑、HEAD、分支與 `git status --short`。

## 建立限制

Codex 已保存專案目前指向 `D:\練習\CatchList` 根目錄，而非本工作樹。建立 A4 時必須明確選用或開啟 `D:\練習\CatchList\.worktrees\steam-community-tags`，否則停止，不得從根目錄重建或覆蓋未提交修改。
