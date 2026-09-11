# Steam 大量資料初始化 Roadmap

- 計畫版本：3

## 執行原則

- 執行模式：`initialize`
- 規劃層級：`audited`
- 階段順序：A1 → A2 → A3 → A4 → A5 → A6
- 控制來源：`STAGE_STATE.yaml`
- 每個階段先完成自我驗證，再判定 `PASS`、`CONCERNS` 或 `FAIL`。
- A1 是技術可行性閘門。必須固定 FronkonGames 評論資料契約與商店頁硬性欄位規則。
- 平行候選只表示可由執行者重新評估；不得因本文件自動啟動子代理。

## A1：確認資料契約與單頁可行性

### 目標

確定 FronkonGames 的固定輸入格式、評論欄位契約與商店頁硬性欄位。

### 對應需求

`REQ-002`、`REQ-003`、`REQ-004`、`REQ-006`、`REQ-007`、`REQ-008`、`REQ-010`

### 工作內容

1. 固定 FronkonGames 版本、檔案格式、來源 URL、檔案雜湊與欄位結構。
2. 建立代表性頁面樣本：一般遊戲、年齡驗證、免費、內購、MMO、僅限 VR、可選 VR、搶先體驗、下架／地區不可用、無中文名稱。
3. 在 `cc=tw&l=tchinese` 的同一份回應中，辨識標題、發行時間、語言、社群標籤及各硬性排除訊號。
4. 證明能取得全球全部語言、終身累積的好評率與評論數，不得誤用最近 30 天或「您的語言」。
5. 官方 Steam Reviews API 只可保留為 A1 對照證據，不得成為初始化執行期的資料來源。
6. 寫下欄位來源、解析訊號、未知狀態與失敗條件。

### 產出

- 資料契約與欄位對照說明。
- 固定且移除非必要個資的 HTML 測試樣本。
- 頁面解析可行性測試。
- A1 驗證報告與明確的 `PASS`／`CONCERNS`／`FAIL`。

### 驗證

- 每個必要欄位至少有成功案例與缺失案例。
- FronkonGames 值與使用者已完成的 SteamSpy 抽樣一致；商店頁不會把最近或目前語言評價寫入該欄位。
- 年齡驗證或不完整的 HTTP 200 回應會被判為未知／待重試。
- 未呼叫 `search/results` 或 `appdetails` 取得正式資料。

### 完成條件

- 所有必要欄位都有可靠解析方式及失敗判定。
- FronkonGames 評論資料與商店頁硬性欄位都有明確來源、解析訊號與失敗判定。

### 平行候選

```yaml
parallel_candidates:
  - id: A1-P1
    scope: FronkonGames 版本、格式與欄位契約
    write_paths:
      - docs/steam-data-initialization/research/fronkon-contract.md
    depends_on: []
  - id: A1-P2
    scope: Steam 商店頁面代表樣本與欄位證據
    write_paths:
      - steam_discovery/test/fixtures/store-pages/
      - docs/steam-data-initialization/research/store-page-contract.md
    depends_on: []
parallel_notes: 兩項工作寫入位置分開，但主代理須整合結論並判定 A1 閘門。
```

## A2：資料集載入與第一輪篩選

### 目標

以固定資料集可重現地產生候選清單、排除清單與評論缺失清單。

### 對應需求

`REQ-001`、`REQ-002`、`REQ-003`、`REQ-004`、`REQ-005`、`REQ-014`

### 工作內容

1. 新增資料集下載／本機檔案載入器，驗證欄位與雜湊，支援串流或分批處理大型檔案。
2. 新增純函式篩選模組，正規化 `genres`、`categories`、`tags` 與別名。
3. 實作日期範圍、未四捨五入好評率、評論總數與第一輪排除規則。
4. 將 `0/0`、欄位錯誤、無效日期與門檻附近資料寫入獨立缺失／待確認清單，不混入一般未達門檻。
5. 為臨界值、文字／ID 對照及多重排除原因補齊測試。

### 產出

- `fronkon-dataset` 載入模組。
- `initialization-selection` 篩選模組。
- 固定輸入下可重現的候選、排除與缺失摘要。

### 驗證

- 85%、500／501 則數等臨界值測試。
- `0/0` 不會被當成普通不合格資料。
- `price = 0` 不會單獨觸發免費判定。
- 同一資料集重跑得到相同 AppID 與原因排序。

### 完成條件

- A2 單元測試全數通過。
- 每筆輸入都有可追查狀態。
- 大型資料集處理不需要把完整 CSV 文字一次載入記憶體。

### 平行候選

```yaml
parallel_candidates:
  - id: A2-P1
    scope: 資料集下載、快取、格式與結構驗證
    write_paths:
      - steam_discovery/fronkon-dataset.js
      - steam_discovery/test/fronkon-dataset.test.js
    depends_on:
      - A1
  - id: A2-P2
    scope: 第一輪篩選規則與臨界值測試
    write_paths:
      - steam_discovery/initialization-selection.js
      - steam_discovery/test/initialization-selection.test.js
    depends_on:
      - A1
parallel_notes: 共用資料列契約須在 A1 固定；整合前不可同時修改共用設定檔。
```

## A3：單頁解析、快取與續跑

### 目標

每個第一輪候選只抓一次商店頁面，可靠解析所需欄位，並能在失敗後續跑。

### 對應需求

`REQ-006`、`REQ-007`、`REQ-009`、`REQ-010`、`REQ-011`

### 工作內容

1. 建立 `store-page-details` 解析器，以 A1 固定樣本涵蓋正常與異常版面。
2. 建立單頁抓取器，固定地區／語言參數、合理 User-Agent、限速、退避重試與 `Retry-After`。
3. 分開保存原始頁面快取與結構化解析快取，兩者都有格式／解析器版本。
4. 建立進度與錯誤清單；成功頁面不重抓，解析器更新時能重用原始頁面。
5. 優先解析標籤／分類 ID；只有沒有穩定 ID 時才比對正規化文字。

### 產出

- 商店頁面解析器與固定樣本測試。
- 抓取、快取、重試與續跑模組。
- 結構化商店資料紀錄。

### 驗證

- 每個 AppID 最多一次成功網路回應即可產生全部欄位。
- 429、5xx、逾時、年齡驗證與不完整 200 有不同狀態與原因。
- 第二次執行會重用成功快取，只重試待處理項目。
- 更新解析器版本可離線重解析樣本與快取。

### 完成條件

- A1 的所有代表樣本測試通過。
- 不明欄位不會被轉成 `false`。
- 網路中斷後能從最後完成紀錄繼續。

### 平行候選

```yaml
parallel_candidates:
  - id: A3-P1
    scope: HTML 解析器與固定樣本測試
    write_paths:
      - steam_discovery/store-page-details.js
      - steam_discovery/test/store-page-details.test.js
    depends_on:
      - A1
  - id: A3-P2
    scope: 頁面快取、進度、錯誤與續跑
    write_paths:
      - steam_discovery/initialization-cache.js
      - steam_discovery/test/initialization-cache.test.js
    depends_on:
      - A1
parallel_notes: 兩者共用的結構化紀錄格式必須先固定；抓取器整合由主代理串行完成。
```

## A4：初始化命令與兩輪篩選整合

### 目標

串接資料集、第一輪篩選、單頁補查、第二輪篩選與專用報告輸出。

### 對應需求

`REQ-001`、`REQ-006`、`REQ-008`、`REQ-009`、`REQ-012`、`REQ-013`、`REQ-014`

### 工作內容

1. 新增 `steam_discovery/initialize.js` 與 workspace／根目錄初始化命令。
2. 實作 `--from`、`--through`、`--dataset`、`--output`、`--resume` 與小樣本模式。
3. 第二輪以商店頁面最新值重算好評率與排除條件。
4. 產生通過報告、排除明細、評論缺失、待重試、執行摘要與社群標籤資料。
5. 所有輸出先寫暫存檔，再以原子方式替換初始化專用檔案。
6. 不修改每月更新入口；需要共用程式時，先補等價測試。

### 預定命令介面

```powershell
npm run initialize:games -- --from 2015-01 --through 2026-02
npm run initialize:games -- --dataset <本機資料集> --from 2015-01 --through 2026-02 --resume
```

### 預定輸出

```text
steam_discovery/preview/initialization/
├── 遊戲.md
├── 遊戲標籤.json
├── 初始化摘要.json
├── 排除明細.json
├── 評論缺失.json
└── 待重試.json
```

### 驗證

- 小型固定資料集端到端測試。
- 重跑不產生重複 AppID 或重複月份。
- 每筆候選都有最終狀態及原因。
- 測試用攔截器確認初始化流程未呼叫搜尋頁或 `appdetails`。
- 輸出路徑防護拒絕雲端正式報告與既有月份預覽檔。

### 完成條件

- 固定樣本可由命令產生穩定報告與完整追蹤明細。
- 初始化命令與每月更新命令互不呼叫。
- 所有輸出都在初始化專用資料夾。

### 平行候選

```yaml
parallel_candidates: []
parallel_notes: 此階段改動入口、輸出格式與多個模組整合，採串行執行。
```

## A5：相容性與小規模實際驗證

### 目標

證明新流程不影響每月更新，並以少量實際頁面驗證限流、快取及輸出內容。

### 對應需求

`REQ-010`、`REQ-011`、`REQ-012`、`REQ-015`

### 工作內容

1. 執行既有 Steam 測試與新增初始化測試。
2. 比對既有 `update`、`update:games`、`update:all` 命令與輸出路徑。
3. 使用少量已知 AppID 實際抓取，不執行完整 11 年範圍。
4. 驗證限速、重試、快取命中、續跑及錯誤摘要。
5. 人工抽查通過與排除案例，確認中文名稱、評價口徑及排除原因易懂。

### 產出

- 測試與相容性報告。
- 小樣本初始化預覽。
- A5 驗收紀錄。

### 驗證

- 現有測試與新增測試全數通過。
- 每月更新程式未改變資料來源順序與正式輸出路徑。
- 小樣本第二次執行不重抓已成功頁面。
- Git 差異不包含雲端報告或既有月份預覽資料。

### 完成條件

- 自動測試為 `PASS`。
- `ACC-002` 已完成。
- 沒有未解決的高風險相容性問題。

### 平行候選

```yaml
parallel_candidates: []
parallel_notes: 相容性判定需要整體狀態，採串行驗證。
```

## A6：完整歷史初始化與結果稽核

### 目標

執行 2015-01 至 2026-02 的完整初始化，產生可稽核的本機預覽與未解決清單。

### 對應需求

`REQ-001`、`REQ-011`、`REQ-012`、`REQ-013`、`REQ-014`

### 工作內容

1. 使用 A1 固定的 FronkonGames 版本執行完整第一輪篩選。
2. 依限速規則抓取第一輪候選，必要時分批續跑。
3. 重試暫時性失敗；不對永久未知資料猜值。
4. 產生完整報告、每月統計、排除原因統計、評論缺失與待確認清單。
5. 抽查月份、臨界值與特殊類型，確認 FronkonGames 評論值沒有被「您的語言」或最近評價替代。
6. 僅回報可搬移的預覽位置；不合併或覆蓋正式資料。

### 產出

- `steam_discovery/preview/initialization/遊戲.md`
- 完整標籤、摘要、排除、評論缺失與待重試資料。
- A6 執行與稽核報告。

### 驗證

- 範圍只涵蓋 2015-01 至 2026-02。
- 所有第一輪候選都有通過、第二輪排除或待確認狀態。
- 通過報告無重複 AppID，月份排序穩定。
- 執行前後雲端 `遊戲.md` 與既有月份預覽未變更。
- 以快取重跑後，結果一致且不發出不必要請求。

### 完成條件

- 完整執行結束，或所有剩餘資料都有明確、可重試的未知原因。
- `ACC-003` 與 `ACC-004` 已完成。
- 使用者可依摘要決定是否另開搬移／合併工作。

### 平行候選

```yaml
parallel_candidates: []
parallel_notes: Steam 請求需由單一限速器協調，完整執行採串行與可續跑批次，不平行密集請求商店。
```
## 整體驗收對照

| 需求 | 階段 |
|---|---|
| REQ-001 | A2、A4、A6 |
| REQ-002 | A1、A2 |
| REQ-003～REQ-005 | A1、A2 |
| REQ-006～REQ-011 | A1、A3、A4、A5 |
| REQ-012～REQ-014 | A4、A5、A6 |
| REQ-015 | A4、A5 |
| REQ-001、REQ-011～REQ-014 | A6 |
