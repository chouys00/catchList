# 真人劇追蹤器 Roadmap

- 計畫版本：13
- 文件設定：audited
- 建立日期：2026-08-14
- 階段順序：A1 → A2 → A3 → A4 → A5
- 整體完成條件：`PROJECT_SPEC.md` 的 `SUCCESS-001` 至 `SUCCESS-006` 全部有實際證據，A5 人工驗收通過，且 `STAGE_STATE.yaml` 標記 A5 為 `accepted`。

## A1：資料來源探查與區域校準

### 需求對應

- REQ-001、REQ-002、REQ-003、REQ-004、REQ-005、REQ-006、REQ-008、REQ-015、REQ-016

### 目標

建立最小 workspace、穩定的候選資料結構與校準工具，實際量測近 24 個合格月份在五個地區的 TMDb 覆蓋率、類型品質、中文名覆蓋率及投票分布，產生可審查的門檻設定。

### 非目標

不寫正式 `真人劇.md`，不加入 `update:all`，不完成 IMDb 大型資料集整合。

### 前置條件與相依階段

- 無前置階段。
- 實際連線驗證需要使用者在執行環境設定 `TMDB_API_TOKEN`，不得把值寫進專案。

### 預期成果

- `live_action_tracker` workspace 與測試骨架。
- TMDb 用戶端、資料正規化、類型排除與地區分類。
- 24 個月校準指令、統計摘要與版本化門檻設定。
- 小型固定測試樣本，不包含權杖或大量第三方資料。

### 實作方向

先定義內部 `ShowCandidate` 欄位與排除原因代碼，再抓 TMDb 候選及 details／translations／external IDs。校準只輸出統計摘要，不保存完整第三方資料。門檻以各區 24 個月樣本計算；樣本數不足時輸出警告並採明文備援值。

### 可能影響的系統或資料

- 新增 workspace、根目錄 workspace 清單與鎖定檔。
- 只讀 TMDb；只寫專案內快取、測試與校準摘要。

### 階段內任務與並行候選

```yaml
- id: A1-T1
  title: 建立 workspace、候選資料契約與環境變數檢查
  depends_on: []
  parallel_candidate: false
- id: A1-T2
  title: 實作 TMDb 候選與詳細資料用戶端
  depends_on: [A1-T1]
  parallel_candidate: true
  parallel_group: A1-P1
  mode: disjoint_write
  scope:
    read_paths: [live_action_tracker/schema.js, packages/core/]
    write_paths: [live_action_tracker/sources/tmdb.js, live_action_tracker/test/tmdb.test.js]
    forbidden_write_paths: [package-lock.json, scripts/, packages/core/]
  deliverable: 可用固定回應測試的 TMDb 用戶端
  verification: [執行 TMDb 用戶端單元測試]
  join_verification: [執行 live_action_tracker 全部離線測試]
- id: A1-T3
  title: 實作真人劇排除與五區分類
  depends_on: [A1-T1]
  parallel_candidate: true
  parallel_group: A1-P1
  mode: disjoint_write
  scope:
    read_paths: [live_action_tracker/schema.js]
    write_paths: [live_action_tracker/classifier.js, live_action_tracker/test/classifier.test.js]
    forbidden_write_paths: [package-lock.json, scripts/, packages/core/, live_action_tracker/sources/]
  deliverable: 分類函式、排除原因與固定測試
  verification: [執行分類單元測試]
  join_verification: [執行 live_action_tracker 全部離線測試]
- id: A1-T4
  title: 實作校準統計並產生門檻摘要
  depends_on: [A1-T2, A1-T3]
  parallel_candidate: false
- id: A1-T5
  title: 執行實際連線校準與紀錄證據
  depends_on: [A1-T4]
  parallel_candidate: false
```

### 必要測試

- 無權杖時在網路請求前失敗，錯誤訊息不含敏感值。
- 分頁終止、重試、快取失效與 API 回應缺欄位測試。
- 真人劇排除、跨國合製優先序及五區分類參數化測試。
- Bayesian 計算、百分位、樣本不足備援與設定重現測試。
- 有權杖時執行 24 個月實際校準，保存聚合統計與命令結果。

### 完成條件

- 五區都有樣本數與覆蓋率結果，或清楚列出資料不足的地區。
- 校準設定可由固定樣本重現，且沒有把第三方完整資料或權杖加入 Git。
- A1 所有離線測試通過，實際連線校準成功。

### 人工或外部驗收

- 類型：blocking
- 項目：`ACC-001`，確認執行環境可讀取 TMDb 權杖並完成實際校準；使用者不必自行決定分數門檻。

### 獨立審查

- required

### 風險與未知事項

- TMDb 的地區、類型或翻譯覆蓋不足，可能需要在 A1 結束時修訂 A2 資料策略。
- 若校準顯示某區樣本太少，不得直接進 A2；先將後續階段設為 `needs_replan`。

## A2：篩選、評分佐證與名稱整合

### 需求對應

- REQ-005、REQ-006、REQ-007、REQ-008、REQ-009、REQ-010、QUAL-001、QUAL-002、QUAL-005、QUAL-006

### 目標

完成可重現的入選判斷、區內排序、IMDb 評分佐證、繁中名稱優先序、TMDb ID 去重與信心等級。門檻採各區歷史樣本，不按單月強制取固定比例。

### 非目標

不寫正式報告，不整合總排程。

### 前置條件與相依階段

- A1 已接受，門檻設定與候選資料契約已定版。

### 預期成果

- IMDb ratings 串流索引或只保留目標 ID 的記憶體索引。
- 評分、信心、來源一致性與中文名稱模組。
- 端到端固定資料測試。

### 實作方向

IMDb 只下載官方非商業資料集，依 TMDb 提供的 IMDb ID 合併。入選仍以各區 TMDb 校準結果為準；IMDb 只增加可讀的佐證標記。名稱缺漏時查 Wikidata，並以 JSON 快取控制查詢量。

### 可能影響的系統或資料

- 下載 IMDb 壓縮 TSV，執行時可能使用數百 MB 網路流量。
- 新增本機快取，快取路徑需加入 `.gitignore`。

### 階段內任務與並行候選

```yaml
- id: A2-T1
  title: 實作 IMDb 目標 ID 評分索引
  depends_on: []
  parallel_candidate: true
  parallel_group: A2-P1
  mode: disjoint_write
  scope:
    read_paths: [live_action_tracker/schema.js, imdb_tracker/fetcher.js]
    write_paths: [live_action_tracker/sources/imdb.js, live_action_tracker/test/imdb.test.js]
    forbidden_write_paths: [live_action_tracker/scoring.js, live_action_tracker/names.js, packages/core/]
  deliverable: IMDb ID 到評分與票數的索引
  verification: [以小型 gzip TSV 固定資料測試串流解析]
  join_verification: [執行 live_action_tracker 全部離線測試]
- id: A2-T2
  title: 實作入選、區內排序與信心等級
  depends_on: []
  parallel_candidate: true
  parallel_group: A2-P1
  mode: disjoint_write
  scope:
    read_paths: [live_action_tracker/schema.js, live_action_tracker/calibration/]
    write_paths: [live_action_tracker/scoring.js, live_action_tracker/test/scoring.test.js]
    forbidden_write_paths: [live_action_tracker/sources/, live_action_tracker/names.js, packages/core/]
  deliverable: 可重現的篩選與排序模組
  verification: [執行分數、百分位與邊界值測試]
  join_verification: [執行 live_action_tracker 全部離線測試]
- id: A2-T3
  title: 實作繁中名稱優先序與 Wikidata 備援
  depends_on: []
  parallel_candidate: true
  parallel_group: A2-P1
  mode: disjoint_write
  scope:
    read_paths: [live_action_tracker/schema.js, imdb_tracker/translator.js]
    write_paths: [live_action_tracker/names.js, live_action_tracker/test/names.test.js]
    forbidden_write_paths: [live_action_tracker/sources/imdb.js, live_action_tracker/scoring.js, packages/core/]
  deliverable: 名稱選擇與快取模組
  verification: [執行語系優先序、缺值與控制字元測試]
  join_verification: [執行 live_action_tracker 全部離線測試]
- id: A2-T4
  title: 整合候選處理流程與固定資料端到端測試
  depends_on: [A2-T1, A2-T2, A2-T3]
  parallel_candidate: false
```

### 必要測試

- IMDb TSV 串流解析、缺 ID、重複 ID 與格式錯誤測試。
- TMDb 入選資格不受 IMDb 缺漏影響。
- IMDb 來源一致、意見分歧與資料不足標記測試。
- 中文名稱優先序、Wikidata 查詢失敗與快取測試。
- 同 TMDb ID 去重與同名不同 ID 保留測試。
- 品質不足的月份或地區可以零入選，不得為了固定名額降低門檻。

### 完成條件

- 固定輸入可穩定產生五區入選清單、排序與所有顯示欄位。
- 所有外部缺漏都有明確降級行為，沒有機器翻譯片名。
- A2 全部離線測試通過。

### 人工或外部驗收

- 類型：none
- 項目：無。

### 獨立審查

- conditional；若 A1 門檻或資料契約在本階段改變則 required。

### 風險與未知事項

- Wikidata 查詢可能逾時或限流，必須允許保留原名完成月份。

## A3：月份回補與 Markdown 報告

### 需求對應

- REQ-009、REQ-011、REQ-012、REQ-013、REQ-017、QUAL-003、QUAL-004、QUAL-005

### 目標

完成六個月觀察期、缺漏月份偵測、月份區段防重複、TMDb ID 去重、逐月原子寫入、空月份鎖定與安全預覽模式。

### 非目標

不加入總排程，不寫入現有三份報告。

### 前置條件與相依階段

- A2 已接受。

### 預期成果

- `main.js`、`writer.js`、設定與 CLI 參數。
- `真人劇.md` 格式固定測試。
- 預覽輸出與暫存檔測試。

### 實作方向

沿用 `@catchlist/core` 的月份、區段與安全寫檔功能。正式模式每完成一個月份立即合併寫檔；預覽模式完全不碰正式路徑。

### 可能影響的系統或資料

- 正式模式可新增或更新 `G:/我的雲端硬碟/CatchList/真人劇.md`。
- 測試只能使用臨時資料夾或明確的測試輸出路徑。

### 階段內任務與並行候選

- `A3-T1`：定義 Markdown 格式與 writer 固定輸出測試，循序執行。
- `A3-T2`：實作月份回補、觀察期與缺漏偵測，相依 A3-T1。
- `A3-T3`：實作預覽模式、錯誤恢復與端到端暫存報告測試，相依 A3-T2。

本階段會共同修改主流程與 writer，沒有安全的並行候選。

### 必要測試

- 首次回補 12 個月、既有報告缺月、未到觀察期與跨年測試。
- 五區固定順序、空區、空月份、名稱清理與連結格式快照測試。
- 同月份連跑兩次內容不變。
- 已存在 `YYYY  M月` 區段時跳過寫入；同批候選含重複 TMDb ID 時只保留一筆。
- 模擬第二個月份失敗，第一個月份仍保留且下次只補未完成月份。
- `--dry-run` 不建立或修改正式報告。

### 完成條件

- 在臨時輸出路徑完成完整回補與重跑測試。
- 報告每筆資料可追溯到 TMDb，原始分數與信心說明清楚。
- A3 全部離線測試通過。

### 人工或外部驗收

- 類型：non-blocking
- 項目：`ACC-002`，閱讀一份固定樣本報告，確認格式容易理解。

### 獨立審查

- none

### 風險與未知事項

- 既有 Markdown 區段解析只以年月為鍵；任何新頁首都必須有測試，避免最上方區塊被誤判。

## A4：Monorepo 與每月排程整合

### 需求對應

- REQ-001、REQ-014、REQ-015、REQ-016、QUAL-004

### 目標

新增根目錄指令、workspace 與第四個排程項目，保留各專案失敗隔離及 Windows 安全執行方式。

### 非目標

不執行正式報告回補，不提交或推送 Git。

### 前置條件與相依階段

- A3 已接受。
- 整合前重新檢查工作樹內既有 `scripts/update-all.mjs`、npm 呼叫與安全寫檔修改。

### 預期成果

- `npm run update:tv`。
- `npm run update:all` 執行四個專案並彙整失敗。
- 更新 `run_monthly.bat`、根目錄說明與 `AGENTS.md` 的現況段落。

### 實作方向

沿用 `scripts/npm-invocation.mjs` 的 Windows 呼叫方式。測試以假的子程序結果驗證執行順序與失敗隔離，不呼叫實際網路更新。

### 可能影響的系統或資料

- 修改根目錄 `package.json`、`package-lock.json`、`scripts/update-all.mjs`、`run_monthly.bat` 與文件。
- 不改既有三個 workspace 的更新邏輯。

### 階段內任務與並行候選

- `A4-T1`：整合 workspace 與根目錄指令，循序執行。
- `A4-T2`：加入總排程並補失敗隔離測試，相依 A4-T1。
- `A4-T3`：更新批次檔與使用說明，相依 A4-T2。

共用根設定與排程檔會互相影響，本階段循序執行。

### 必要測試

- 根目錄 workspace 與 `update:tv` 指令解析測試。
- 四個專案全部成功、真人劇單獨失敗及其他專案失敗的排程測試。
- Windows npm 呼叫測試。
- 執行完整離線測試套件。

### 完成條件

- 四個更新項目固定執行，單一失敗不阻止後續項目。
- 既有三個更新器相關測試通過，沒有改變輸出設定。
- 文件清楚說明權杖設定、單獨執行與失敗處理。

### 人工或外部驗收

- 類型：none
- 項目：無。

### 獨立審查

- required

### 風險與未知事項

- 目前排程與安全寫檔有未提交修改，整合時若介面與本計畫不同，必須保留既有修改並調整真人劇整合方式。

## A5：實際月份驗證與正式啟用

### 需求對應

- REQ-002 至 REQ-017、QUAL-001 至 QUAL-006

### 目標

用實際權杖與外部資料完成預覽、暫存報告、冪等重跑及總排程啟動驗證，確認門檻產出的清單符合「值得注意的優質真人劇」用途後才允許正式寫入。

### 非目標

未取得使用者明確同意前，不寫入或覆蓋正式 `真人劇.md`，不提交、不推送、不建立排程器工作。

### 前置條件與相依階段

- A4 已接受。
- `TMDB_API_TOKEN` 已在測試程序環境中可用，或已安全寫入受 Git 排除的 `live_action_tracker/.env`。

### 預期成果

- 受 Git 排除的本機 `.env` 讀取、環境變數優先序與缺漏失敗測試。
- 至少一個月份的實際預覽與暫存報告。
- 實際連線、重跑、失敗恢復與四專案啟動證據。
- 人工驗收紀錄與必要的門檻微調決策。

### 實作方向

先以 `--dry-run` 檢查候選與排除原因，再把輸出導向專案臨時資料夾完成兩次重跑。任何正式雲端報告寫入都視為另外的高影響操作，執行前再次取得使用者同意。

### 可能影響的系統或資料

- 會讀取 TMDb、Wikidata 與 IMDb 公開資料。
- 驗證階段只寫專案內暫存資料；正式雲端路徑仍受人工核准保護。

### 階段內任務與並行候選

- `A5-T0`：修訂 `.env` 安全規則、實作本機權杖讀取與 Git 排除，循序執行。
- `A5-T1`：執行實際月份預覽並檢查排除原因，相依 A5-T0。
- `A5-T2`：產生暫存報告並執行冪等重跑，相依 A5-T1。
- `A5-T3`：執行完整測試、獨立審查與人工驗收，相依 A5-T2。
- `A5-T4`：使用者已明確同意後，正式回補 2022-01 至 2022-12（含）共 12 個月，相依 A5-T3；先以 2022-01 dry-run 核對，再逐月原子寫入、記錄每月結果並確認可續跑。候選詳情採有限併行，避免外部 API 逾時；不得修改其他三份報告、commit、push 或建立排程器工作。
- `A5-T5`：使用者指定將歐美劇 Bayesian 加權分門檻提高至 7.5，相依 A5-T4；只以既有 TMDb、IMDb、Wikidata 快取重算 2022 年專案內暫存報告，先檢查差異與冪等，未另行明確同意前不得覆寫正式雲端報告。
- `A5-T6`：使用者指定將台劇 Bayesian 加權分門檻調整至 7.5，相依 A5-T5；只以既有快取重算 2022 年專案內暫存報告，確認台劇增量與冪等，未另行明確同意前不得覆寫正式雲端報告。
- `A5-T7`：使用者指定五區 Bayesian 加權分門檻統一為 7.5，相依 A5-T6；只以既有快取重算 2022 年專案內暫存報告，確認各區差異與冪等，未另行明確同意前不得覆寫正式雲端報告。
- `A5-T8`：使用者指定韓劇、陸劇、歐美劇的 Bayesian 加權分門檻提高至 8.0，日劇、台劇維持 7.5，相依 A5-T7；只以既有快取重算 2022 年專案內暫存報告，確認各區差異與冪等，未另行明確同意前不得覆寫正式雲端報告。
- `A5-T9`：使用者指定歐美劇增加「臺灣訂閱制可看」正式附加條件，相依 A5-T8；以 TMDb／JustWatch 的 `TW` `flatrate` 資料篩選 2022 年歐美候選，產生兩次專案內暫存報告並比對雜湊。不得爬取串流平台頁面、不得覆寫正式雲端報告。
- `A5-T10`：使用者指定五區所有劇集均增加「臺灣訂閱制可看」正式附加條件，相依 A5-T9；以 TMDb／JustWatch 的 `TW` `flatrate` 資料篩選 2022 年既有入選候選，產生兩次專案內暫存報告與逐區檢核表並比對雜湊。不得爬取串流平台頁面、不得覆寫正式雲端報告。

### 必要測試

- 實際月份完整翻頁、詳細資料、翻譯、外部 ID 與 IMDb 合併。
- 暫存報告連跑兩次雜湊一致。
- 權杖缺失、429、部分名稱缺漏與 Wikidata 失敗的降級測試。
- 根目錄完整離線測試，以及不寫正式報告的四專案啟動驗證。

### 完成條件

- `SUCCESS-001` 至 `SUCCESS-006` 都有實際證據。
- `ACC-001`、`ACC-002`、`ACC-003` 完成，blocking 項目全數通過。
- 獨立審查結果為 PASS；CONCERNS 需記錄處理方式，FAIL 不得前進。

### 人工或外部驗收

- 類型：blocking
- 項目：`ACC-003`，使用者確認暫存報告的五區分類、數量與門檻結果可接受，並另行決定是否授權第一次正式寫入。

### 獨立審查

- required

### 風險與未知事項

- 實際清單可能顯示特定地區過多或過少。門檻微調必須以新決策記錄，不可直接改寫 A1 證據。
