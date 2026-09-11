# 開發紀錄

## 2026-09-08：A1 完成驗證，結果為 CONCERNS

- 階段開始與結束 HEAD 都是 `853be450e76a495ec4e1da1a141561cea1d4df40`；沒有 commit、push、部署或建立 A2 task。
- 實際執行 `npm test --workspace steam_discovery`，32 項通過、0 項失敗。
- 新增 A1 契約檢查器、固定 HTML 樣本、Reviews API 對照樣本及 FronkonGames／商店頁研究文件。
- 全語系終身評價是唯一阻擋項：繁中商店頁只含全語系最近評價與繁中終身評價，沒有全球終身數值。A1 維持 `in_progress`，`gate_result` 為 `CONCERNS`。
- A1 本階段檔案：`steam_discovery/store-page-contract.js`、`steam_discovery/test/store-page-contract.test.js`、`steam_discovery/test/fixtures/store-pages/`、`docs/steam-data-initialization/research/` 與本計畫控制文件。
- 開始前既有修改未被覆寫；完整 Git 狀態與 `git diff --stat` 輸出記於本輪命令證據，A1 文件仍是使用者原先未追蹤的資料夾。
- 階段結束的 `git diff --stat` 為 18 個受追蹤檔案、19,786 行新增、3,726 行刪除；這些都在 A1 開始前已存在。Git 不會把未追蹤的 A1 文件計入此統計。

## 2026-09-08：初始化規劃

- 依使用者要求捨棄先前工作分支方向，從既有 Steam 改良成果切出 `codex/steam-initialize-data`。
- 比較目前分支與 `master`。目前分支比 `master` 多出全語系設定、繁簡中文支援欄位、社群標籤快取、預覽輸出注入、取樣模式與限流改良，選為基底。
- 最初的 PATH 指向舊版 Node，無法識別 `node --test`。使用專案附帶 Node 後，目前分支 26 項測試通過，`master` 16 項測試通過。
- 使用者切換 NVM 後再次驗證：Node v22.22.1、npm 10.9.4，`npm test --workspace steam_discovery` 為 26 項通過、0 項失敗。
- 查核 FronkonGames 欄位：含 AppID、名稱、發行日、價格、支援語言、正負評、分類、類型與標籤；不含可靠的繁中名稱、每筆更新時間、`is_free` 或商店內容類型。
- 查核 FronkonGames 抓取程式：評論資料來自 SteamSpy；既有 AppID 預設略過；缺少價格資訊與真正免費都可能寫成 `price = 0`。
- 抽查 Steam 商店頁面：一般頁面可見標題、日期、語言表與社群標籤；年齡限制頁可能只回傳不完整 HTML。繁中頁面可同時出現全語系最近評價與「您的語言」終身評價，尚未證實全語系終身值可穩定由同頁取得。
- 決定採 `audited` 規劃層級，先設 A1 可行性閘門，再安排資料載入、單頁解析、流程整合、相容性與完整執行。
- 本次只建立規劃文件與 `AGENTS.md` 索引，未實作初始化程式，未執行完整資料抓取，也未修改雲端報告。

## 2026-09-08：A2 完成，結果為 PASS

- 階段開始與結束 HEAD 都是 `853be450e76a495ec4e1da1a141561cea1d4df40`；沒有 commit、push、部署或建立 A3 task（依交接要求）。
- 新增 `steam_discovery/fronkon-dataset.js`：固定 FronkonGames URL、revision、位元組數與 SHA-256，支援串流下載、本機完整性驗證與 RFC 4180 逐列載入，不會把完整 CSV 文字一次載入記憶體。
- 新增 `steam_discovery/initialization-selection.js`：以未四捨五入的 85% 與大於 500 則評論進行第一輪判定，正規化 genres、categories、tags 的文字與 ID，保留多重排除原因。
- `0/0`、欄位異常、無效日期、84.5% 至未滿 85% 及正好 500 則評論列入 `missing`／待確認；`price = 0` 不單獨判定免費。
- 實際執行 `npm test --workspace steam_discovery`，41 項通過、0 項失敗；新增測試涵蓋串流 CSV、雜湊、欄位契約、下載、85%、500／501、文字／ID 對照、多重排除與可重現排序。`git diff --check` 對 A2 新檔沒有問題；顯示的尾端空白均來自交接前既有預覽檔。
- 開始前既有修改未被覆寫。本階段檔案：`steam_discovery/fronkon-dataset.js`、`steam_discovery/initialization-selection.js`、其兩份測試，以及本計畫控制文件。交接前既有的 A1 未追蹤檔案和 18 個受追蹤修改仍保留。

## 2026-09-08：A3 完成，結果為 PASS

- 階段開始與結束 HEAD 都是 `853be450e76a495ec4e1da1a141561cea1d4df40`；沒有 commit、push、部署或建立 A4 task（依交接要求）。
- 新增 `steam_discovery/store-page-details.js`：以 A1 固定樣本解析繁中臺灣商店頁，優先保存 `data-tagid`，未出現的硬性訊號皆維持 `unknown`。
- 新增 `steam_discovery/initialization-cache.js` 與 `store-page-fetcher.js`：原始 HTML 和結構化結果分開快取；成功頁面不重抓，解析器版本變更時能離線重解析。進度檔會區分年齡驗證、不完整 200、429、5xx、逾時與其他網路錯誤，供下次續跑。
- 實際執行 `npm test --workspace steam_discovery`，50 項通過、0 項失敗；新增測試涵蓋 A1 樣本、成功快取、離線重解析、429、5xx、逾時與年齡驗證。未對 Steam 發出實際請求。
- 開始前既有修改未被覆寫。本階段檔案：`steam_discovery/store-page-details.js`、`steam_discovery/initialization-cache.js`、`steam_discovery/store-page-fetcher.js` 與其兩份測試，以及本計畫控制文件。既有 18 個受追蹤修改與 A1、A2 未追蹤檔案仍保留。


## 2026-09-08：A4 完成，結果為 PASS

- 階段開始與結束 HEAD 都是 `853be450e76a495ec4e1da1a141561cea1d4df40`；沒有 commit、push、部署或建立 A5 task。
- 新增 `steam_discovery/initialize.js` 與 `npm run initialize:games`。流程固定串接 FronkonGames、第一輪篩選、每候選單頁補查、第二輪判定、快取與原子輸出。
- 初始化只接受 `steam_discovery/preview/initialization/` 作為輸出根目錄，產生 `遊戲.md`、標籤、摘要、排除、評論缺失與待重試資料；雲端正式報告和既有月份預覽均遭拒絕。
- 第二輪明確命中的免費、內購、MMO、僅限 VR、搶先體驗與分類標籤會排除；硬性欄位仍為 `unknown` 時列待重試，不會預設通過。全球全語系終身評價與評論數繼續只用 FronkonGames。
- 實際執行 `npm test --workspace steam_discovery`，53 項通過、0 項失敗；另執行 `node --check steam_discovery/initialize.js`、`npm run initialize:games -- --help` 與 Git 差異檢查。未下載完整資料集，未對 Steam 發出實際請求。
- 開始前既有 18 個受追蹤修改與 A1～A3 未追蹤檔案均保留。本階段新增或修改：根目錄與 Steam workspace 的 `package.json`、`initialize.js`、`initialization-selection.js`、`test/initialize.test.js` 及本計畫控制文件。
## 2026-09-08：A5 完成，結果為 PASS

- 階段開始與結束 HEAD 都是 `853be450e76a495ec4e1da1a141561cea1d4df40`；沒有 commit、push、部署或建立 A6 task。
- 實際讀取兩個繁中臺灣商店頁：AppID 275850 首次由網路取得正常頁，第二次命中結構化快取；AppID 1196590 是年齡驗證頁，維持 `retry`，修正後第二次會重新請求而不被結構化快取阻止。
- 發現並修正 `store-page-fetcher.js` 的待重試結構化快取問題，新增回歸測試。成功頁仍不重抓，待重試頁才會重新請求。
- 實際執行 `npm test --workspace steam_discovery`，54 項通過、0 項失敗；`node --check` 驗證 `main.js` 與 `store-page-fetcher.js`；`npm run update --workspace steam_discovery -- --help` 顯示既有月更介面。
- Git 差異確認 A5 僅新增初始化命令與修正初始化快取；根目錄 `update:all` 未加入初始化。未修改雲端 `遊戲.md` 或既有月份預覽。實際快取僅寫入 `steam_discovery/preview/initialization/a5-live-cache/`。
- 開始前既有 18 個受追蹤修改與 A1～A4 未追蹤檔案均保留。本階段檔案：`store-page-fetcher.js`、`test/initialization-cache.test.js`、初始化專用 A5 快取與本計畫控制文件。

## 2026-09-10：A6 完整歷史初始化與結果稽核，結果為 PASS

- 階段開始與結束 HEAD 都是 `853be450e76a495ec4e1da1a141561cea1d4df40`；未 commit、push、部署，亦未修改雲端正式報告或既有月份預覽。
- 固定 FronkonGames CSV 已在本機完成完整性驗證（401,140,503 bytes；SHA-256 `1b48008b01a799d82385d6e66ba0cb65dd477b6aa4b6c2ec8c443025ab6880ad`）。針對來源未宣告的 `DLC count` 欄與英文月份日期補齊相容處理與測試。
- 原始完整執行讀取 3,338 筆候選的允許 Steam 商店頁；最終決定後改用 `--offline` 重整，只讀既有結構化快取，未再發出網路請求。
- 離線重整實際結果：載入 125,855 筆、第一輪候選 3,338 筆、通過 0 筆、排除 122,008 筆、評論缺失 509 筆、待重試 3,338 筆；排除中有 42,899 筆為 `zero_total_reviews_discarded`，評論缺失清單的 0／0 筆數為 0。
- 使用者最終決定與 A2 的舊有「0／0 待確認」假設衝突；已由 DEC-012 取代。獨立 V1～V4 僅作稽核證據，未寫入或回填任何篩選欄位。
- 實際執行 Node 24 完整測試：59 項通過、0 項失敗。輸出路徑拒絕測試與離線無請求測試均通過。

## 2026-09-10：撤回 A6 PASS，修正年齡驗證阻擋

- 稽核確認 3,338 筆是第一輪候選，不是第二輪通過清單；第二輪全部為 `age_gate`，最終通過 0 筆。
- 先前把流程執行完成誤判成完整清單完成，A6 已改回 `in_progress`，放行結果改為 `FAIL`，ACC-003 改回 `pending`。
- ACC-004 的誤複製內容已修正；輸出安全驗收仍維持通過。
- 使用者已授權本機固定成人日期 Cookie、小量實際驗證及成功後續跑 3,338 筆；遠端 `遊戲.md` 不得修改。

## 2026-09-10：年齡驗證修正完成，第二輪負向判定待決

- `store-page-fetcher.js` 已加入固定成人日期 Cookie；不含帳號、登入狀態、真實生日或其他使用者個資。
- 實際驗證 AppID 1196590 與待重試清單前 5 款，HTTP 200 均取得完整商店頁，`pageState` 為 `complete`，不再是 `age_gate`。
- Node 24 完整測試 60 項通過、0 項失敗，新增商店頁請求 Cookie 回歸測試。
- 抽測同時確認完整頁面未出現免費、內購、MMO、VR 與搶先體驗的正向標記時，解析器依 DEC-006 將欄位保留為 `unknown`；第二輪仍會列為待重試。
- 因第二輪規格與使用者期待的實際清單衝突，狀態改為 `needs_replan`、A6 維持 `in_progress`、放行結果為 `CONCERNS`。完整 3,338 筆續跑暫停，未修改遠端 `遊戲.md`。

## 2026-09-10：A6 最終完成，結果為 PASS

- 使用者決定將全部 509 筆接近門檻資料直接排除，第一輪規則與輸出已改為此口徑。
- 以 `--offline` 重整，沒有發出 Steam 請求；最終載入 125,855 筆、通過 3,111 筆、排除 122,744 筆、評論缺失 0 筆、待重試 0 筆。
- Node 24 完整測試 61 項通過、0 項失敗。
- 執行後再次核對雲端 `遊戲.md`、既有本機預覽 `遊戲.md` 與標籤檔案雜湊，均未變更。
- A6 的 blocking 驗收 ACC-003、ACC-004 均通過；未 commit、push、部署或覆蓋遠端報告。
