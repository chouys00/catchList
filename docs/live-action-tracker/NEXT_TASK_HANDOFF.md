# 下一 task 交接

## 交接模式

review-current-work

## 整體目標

完成真人劇追蹤器；TMDb 為候選與主要評分來源，IMDb 為佐證，Wikidata 補繁中名稱，五區獨立校準與排序。

## 完整階段序列與目標階段

A1 → A2 → A3 → A4 → A5；目標為 A4 required 獨立審查：Monorepo 與每月排程整合。

## 前置階段放行與目前狀態

A4 實作已完成，`STAGE_STATE.yaml` 為 `active_stage=A4`、`stage_status=under_review`、`gate_result=null`、`next_stage=null`、`handoff_mode=review-current-work`。只有獨立審查最終 PASS 才可接受 A4 並建立 A5。

## 剩餘階段與模型設定來源

剩餘 A4 審查與 A5。審查 task 必須使用 `$stage-gate-review`，唯讀核對 A4 的規格、Roadmap、實際 diff 與測試證據；不得修改、commit、建立 A5 或執行正式更新。建議審查使用 `gpt-5.6-terra`＋`high`：需獨立檢查根目錄排程與跨 workspace 相容性；這只是建議，並非模型已切換。

## 專案與 Git 狀態

- 路徑：`D:\練習\CatchList`；預期 HEAD：`e59ab24cf6901bee95ca58fd7a2ecae0e33d96cf`；分支：`master`；不得 commit、push、部署、刪除或正式寫入。
- 工作樹原本即非乾淨；保留 `.gitignore`、`AGENTS.md`、既有三個 writer、`packages/core`、`scripts`、`docs/live-action-tracker/`、`live_action_tracker/` 等已修改或未追蹤內容。接手前必須核對實際路徑、HEAD、分支、`git status --short` 與必要雜湊；不符即停止回報。
- 使用同一 saved project 的 Local checkout，完整保留未提交狀態；不得還原、覆蓋或誤納既有使用者修改。
- 接手前必要 SHA-256：`STAGE_STATE.yaml`=`F89FAF2AAB2D7C6BEBB2833995815B9CB5DBF99F685B90EC624F6258B041E324`、`PROJECT_SPEC.md`=`6AF23391A7EB1BCEF6F7BF2B705D702AF24C2A9D7C90359D208AB6E6663C0D19`、`PROJECT_ROADMAP.md`=`2EAFDAF07A9E5C15314FA9E5C2A0BDE12849D74DF104210CC1A851F055A89ECA`、`live_action_tracker/main.js`=`EB3B7369E2D00DFE5E2F701B02BE9EBCC2A1AAFB73D7922007999C869AAC3807`、`writer.js`=`0E821A8A18CAACB82AFCEEC3B640F48B6D64A4A5426931AB8860F13C43779D14`、`config.js`=`C266D60C573E6C11BD7A7FE9C979C8847B398B5AC8BE4EBFE57CE31BC0DA1214`。

## 已確認決定與限制

- A4 已完成根目錄 `update:tv`、四項總排程、Windows 執行相容與文件；不得因審查修改原始檔、執行正式回補、修改既有三份報告或既有三個更新器邏輯。
- 排程以 `PROJECTS` 固定順序執行動畫、電影、遊戲與真人劇；`runAllUpdates` 可注入假子程序結果，任何 `status !== 0` 均記錄失敗並繼續，最後回傳非零。
- 權杖仍僅從 `TMDB_API_TOKEN` 讀取；A4 沒有把權杖寫入任何設定、測試或記錄。
- `ACC-002` 仍是 non-blocking pending：已有固定輸出測試，但尚待使用者實際閱讀格式；`ACC-003` 是 A5 blocking，未獲明確同意前禁止正式雲端寫入。

## 測試與驗證證據

- A4：`node --check scripts/update-all.mjs` 與新增測試通過；根 workspace／鎖定檔／`update:tv` 可解析；`node --test scripts/test/*.test.mjs packages/core/test/*.test.js` 為 7／7 通過；`npm test --workspace live-action-tracker` 為 74／74 通過；A4 範圍 `git diff --check` 通過。
- A4 子程序皆為固定假結果，未執行外部網路請求、實際更新器或正式報告寫入。第一次根目錄 Node 測試受沙箱 `spawn EPERM` 影響，系統權限重跑同一離線指令後通過。
- `steam_discovery` 的 `npm test` 會對 Steam 發出 HTTP GET，雖曾成功執行，但不是離線斷言測試，也不作為 A4 的離線驗證證據。

## 並行執行紀錄

未使用。A4-T1～T3 共用根設定與排程檔，Roadmap 指定循序實作；審查須確認沒有遺漏的並行工作。

## 已知問題與風險

- A2／A3 未執行 IMDb、Wikidata、TMDb 實際網路請求或正式報告寫入；這些留給 A5 的權杖與暫存驗證，不阻擋 A4 審查。
- 動畫與電影 workspace 沒有 `test` script；因此無法執行不存在的測試。本階段以排程假子程序測試覆蓋它們的啟動順序與失敗隔離，沒有觸發其可能的網路或正式輸出。

## 本 task 任務與完成條件

依 `$stage-gate-review` 唯讀審查 A4-T1～T3 的成果。核對：根目錄 `update:tv` 指向 `live-action-tracker`；`update:all` 固定四項、成功與任一失敗均符合結束碼及後續執行規則；Windows 呼叫不使用 shell；`run_monthly.bat`、`AGENTS.md` 說明正確；測試為真實離線測試且不會觸發更新。最終 PASS 前不得建立 A5。
