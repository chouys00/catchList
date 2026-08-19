# A5 完成紀錄

## 交接模式

complete

## 整體目標

真人劇追蹤器 A5「實際月份驗證與正式啟用」已完成。正式 2022 年報告採日台 7.5、韓陸歐美 8.0，且所有五區劇集均須有臺灣訂閱制；使用者已確認標準並授權覆寫。

## 完整階段序列與目標階段

A1 → A2 → A3 → A4 → A5；目標階段為 A5，這是最後一個階段。

## 前置階段放行與目前狀態

A4 required 獨立審查結果為規格符合性 PASS、程式碼品質 PASS、最終 PASS，已標記 accepted。`STAGE_STATE.yaml` 現為 `plan_revision=14`、`active_stage=A5`、`stage_status=accepted`、`gate_result=PASS`、`next_stage=null`、`handoff_mode=complete`、`blocking_acceptance_open=false`。使用者已決定維持原有 TMDb＋IMDb＋Wikidata 流程；所有五區另使用 TMDb／JustWatch 臺灣訂閱制資料；MyDramaList 不在 A5 範圍內。

## 剩餘階段與模型設定來源

沒有剩餘階段。A5 是最後階段，不建立下一個 task。

## 專案與 Git 狀態

- 路徑：`D:\練習\CatchList`；相同 saved project 的 Local checkout。
- 預期 HEAD：`e59ab24cf6901bee95ca58fd7a2ecae0e33d96cf`；分支：`master`。
- 工作樹原本即非乾淨，必須完整保留所有已修改與未追蹤內容。不得還原、覆蓋、commit、push、部署或刪除。
- 接手前先核對路徑、HEAD、分支、`git status --short` 與下列 SHA-256；任一不符時停止並回報：
  - `docs/live-action-tracker/STAGE_STATE.yaml`：`959EEA8F257EE554C091DA0B03EEC5D00206D5FFDDDB8A3650A1E88BC8E5536D`
  - `docs/live-action-tracker/PROJECT_SPEC.md`：`952E3807DEB8CE778FCADCC9C99B7C81A591A4DF73B93C2796702F86FC500124`
  - `docs/live-action-tracker/PROJECT_ROADMAP.md`：`645C316958CCA95B9E66B92F66EDA5F0759508C67F4344CEAA651620625D219D`
  - `docs/live-action-tracker/DEVELOPMENT_STATUS.md`：`00BF96B14515FCD2ACF087F081A62DE322A2387B8CEAA4D89B4BD2D5C65D24F1`
  - `docs/live-action-tracker/DEVELOPMENT_LOG.md`：`AB6EC07B83CF57B136557890C4031263167BC84298E905C23AD044E6C2F54997`
  - `docs/live-action-tracker/DECISIONS.md`：`F09FE57C038DE1532DCF6FB21C80FF5EE06D36BBEE983EF4EC2E28A27817D868`
  - `docs/live-action-tracker/ACCEPTANCE.md`：`666521890425885D7D1DCC6E19A7DCA18392EC87263F023D364C76CAA17403E9`
  - `live_action_tracker/main.js`：`B9CCDDECFD085E6AF3D0FF45F7BA978E7A6DDF8E996CC2BB8B4904982E91612C`
  - `live_action_tracker/availability.js`：`4FEAD9D6D3406D6EA86BED0EF60F6E8248AB21D3EBD97E25C16DE2F540D9F7C7`
  - `live_action_tracker/scoring.js`：`855A6F1B2D12F1F5D8D150730574E06B7794DFE38FD217715BC930F426A82EF3`
  - `live_action_tracker/calibration/thresholds.v6.json`：`56304B5C76BDFCED5494C0CDB90D1794901C8D1D8EED9543BFE95B3D48BFEF3B`
  - `live_action_tracker/writer.js`：`2735F589FDB43EB255C312123BABDB40D0906589CBCA79BA22B3968F07BD80EC`
  - `live_action_tracker/config.js`：`C266D60C573E6C11BD7A7FE9C979C8847B398B5AC8BE4EBFE57CE31BC0DA1214`
  - `live_action_tracker/package.json`：`F816971F17FEF5BF18E03FC6807D722852947DBD7A255E2D69D212218B826658`
  - `package.json`：`574ED439E4A15B2AB59A6DA8F64C7606D3ED178503D2DB748CFBA72133DF31B1`
  - `scripts/update-all.mjs`：`719C5A6088721E88E2195BD7D308507BE192776B0D7048EEF8F57812FCDEF5A2`

## 已確認決定與限制

- `TMDB_API_TOKEN` 優先從目的 task 的程序環境讀取；若未設定，才可讀取受 Git 排除的 `live_action_tracker/.env`。`.env` 不得提交、寫入記錄、快取、測試或交接內容；目的 task 只能回報是否可用，不能輸出值。
- A5-T1 先執行 `--dry-run` 實際月份預覽；A5-T2 只能寫入專案內經驗證的暫存路徑，連跑兩次並比對雜湊。已完成的 p75 暫存月份為 2025-12、2026-01、2026-02。
- `ACC-002` 仍是 non-blocking pending，須保留並提供固定或實際樣本供使用者閱讀。
- `ACC-003` 是 blocking，現已 accepted。使用者已確認維持各區 p75 票數門檻，並指定日劇、台劇為 7.5，韓劇、陸劇、歐美劇為 8.0；所有五區均須列有臺灣訂閱制，且已明確授權覆寫正式報告。
- 不得執行會修改既有 `動畫.md`、`電影.md`、`遊戲.md` 的驗證。四專案啟動驗證必須先確認所有輸出都安全導向暫存位置，否則改用不寫正式報告的啟動或排程證據並如實記錄限制。

## 測試與驗證證據

- A4 審查實測：`node --check scripts/update-all.mjs` 與 `scripts/test/update-all.test.mjs` 通過。
- `node --test scripts/test/*.test.mjs packages/core/test/*.test.js`：7／7 通過；測試為固定假子程序與暫存檔，沒有網路或正式報告寫入。
- `npm test --workspace live-action-tracker`：85／85 通過，沒有網路依賴，包含 `.env` 備援、環境變數優先序、有限併發、五區加權分覆蓋門檻與臺灣訂閱制篩選測試。
- `node --test scripts/test/*.test.mjs`：5／5 通過，為固定假子程序與暫存檔，沒有網路或正式報告寫入。
- A5 實際月份證據：2025-12、2026-01、2026-02 均完成 dry-run、兩次專案內暫存寫入與 SHA-256 一致；2022-01 dry-run 成功（韓 2、日 4、台 0、陸 2、歐美 11）。2022 全年正式報告已建立，SHA-256 `683ABA41F8E29B1FF0F7827440C064D58D3E0D614F693E8C9A2DE2EF6BD13320`，2022-12 重跑跳過且雜湊不變。
- 日台 7.5、韓陸歐美 8.0 暫存重算：只用既有快取，任何快取未命中即失敗；新版 SHA-256 `9265CD8BABB5F880655F55726B47D577C05AEFD3589813A79281608BA5830C7D`，連跑兩次一致。2022 年為韓 14、日 20、台 4、陸 14、歐美 19，沒有覆寫正式報告。
- 歐美劇臺灣訂閱制暫存驗證：只對既有 19 部歐美候選查詢 TMDb／JustWatch `TW` 資料；主報告 SHA-256 `316FE7E2E4EB9A2CEAFFFF159B323B99B1AFFB422BD7E9EE6BC9319B9A5766E4`、檢核表 `6502F1C8BF8430257BECCEFE839D2DD0E25C01C8CA51A386360C749A2B7FF5C3`，各自連跑兩次一致。歐美劇保留 14、排除 5，沒有覆寫正式報告。
- 全區臺灣訂閱制暫存驗證：只對既有 2022 年入選候選查詢 TMDb／JustWatch `TW` 資料；主報告 SHA-256 `F3989C85555DA264B80C96660012FFF3D4EAC38C86DC6E62F20B387A00814513`、檢核表 `2D87DA3213BAF09503E97C5161526DA686BE803C237ED3B7550811695B40FA07`，各自連跑兩次一致。保留韓 13、日 6、台 3、陸 3、歐美 14。使用者授權後，正式報告雜湊與主暫存報告相同。
- A4 範圍 `git diff --check` 通過。

## 並行執行紀錄

未使用。A5-T1～T4 互相相依，依 Roadmap 循序執行，不派子代理並行。

## 已知問題與風險

- 若程序環境與受 Git 排除的 `live_action_tracker/.env` 都沒有 `TMDB_API_TOKEN`，必須在網路請求前停止並請使用者安全設定，不能輸出值。
- IMDb 公開資料集可能下載數百 MB；執行前確認只用於個人非商業用途，並使用專案既有快取與暫存路徑。
- Wikidata、TMDb 可能逾時或限流；需保存實際降級與重試證據，不得把網路失敗誤判為資料為空。
- 正式報告位於同步雲端；本輪 2022 年明確授權已執行完畢。未來任何新增範圍仍須取得使用者另行明確同意。

## 本 task 任務

已完成，沒有後續 task。

## 完成條件

- `SUCCESS-001` 至 `SUCCESS-006` 皆有可靠證據；任何未驗證項目不得寫成通過。
- 至少一個實際月份完成預覽與專案內暫存報告，兩次執行雜湊一致。
- 外部資料、權杖缺失與暫時性錯誤的行為符合規格，未洩漏權杖。
- `ACC-003` 已由使用者確認暫存結果並明確授權正式寫入。
- 最終放行為 PASS；A5 已標記 accepted，且是最後階段。
