# 真人劇追蹤器開發紀錄

## 2026-08-14｜規劃初始化

- task／階段：規劃，尚未開始 A1 實作。
- 實際改動：建立 audited 文件設定，包含規格、Roadmap、狀態、決策、驗收與交接；在 `AGENTS.md` 加入規劃文件索引。
- 實際測試與結果：尚未執行程式測試；本次只有文件一致性與路徑檢查。
- 既有功能影響：未修改現有抓取器程式或報告。
- 限制：尚未用 TMDb 實際資料量測五區覆蓋率與門檻。
- 下一步：執行 A1，完成 24 個月校準樣本與離線測試。

## 2026-08-17｜A1 離線實作完成，等待獨立審查與權杖

- task／階段：A1，資料來源探查與區域校準。
- 開始與結束 HEAD：`e59ab24cf6901bee95ca58fd7a2ecae0e33d96cf`；未 commit。
- 開始前既有修改：保留交接列出的 `AGENTS.md`、三個既有追蹤器、`packages/core`、`scripts` 與其他未追蹤文件；沒有還原或納入 A1 修改。
- 實際改動：新增 `live_action_tracker` workspace、候選資料契約、TMDb 分頁／重試／快取用戶端、真人劇排除、五區分類、24 個月校準統計、聚合摘要與 `thresholds.v1.json`。根目錄只修改 workspace 清單、鎖定檔及快取忽略規則；未修改 `scripts/` 或 `packages/core/`。
- 離線測試：`npm test --workspace live-action-tracker` 通過 41 項；涵蓋固定回應、完整分頁、429／5xx 重試、快取失效、缺欄位、類型排除、跨國優先序、Bayesian、百分位、樣本不足與設定重現。
- 其他檢查：所有 A1 JavaScript 檔案通過 `node --check`；`package-lock.json` 與門檻設定可解析；追蹤檔 `git diff --check` 通過。
- 實際連線：未執行。`TMDB_API_TOKEN` 未設定；校準指令在網路請求前以結束碼 1 中止，沒有建立快取或校準摘要。
- 既有功能影響：尚未加入 `update:all`、`update:tv` 或正式報告寫入，既有三個更新器的程式未由 A1 修改。
- 並行執行：未使用。A1-T2 與 A1-T3 共用 A1-T1 的新契約與 workspace 狀態，主 task 採循序實作並執行整合測試。
- 限制：`ACC-001` 仍為 pending，五區實際覆蓋率、繁中名稱比例與投票分布沒有證據；A1 放行結果不得為 PASS。
- 下一步：執行 required 獨立審查。審查後維持 A1 阻擋，等程序環境提供權杖再補 A1-T5，不建立 A2。

## 2026-08-17｜A1 第一次獨立審查與修正

- 審查 task：`01a00db6-82c7-7af3-9b53-7fe857b5dfe0`。
- 審查結果：規格符合性 FAIL、程式碼品質 FAIL、最終 FAIL。`ACC-001` 尚未完成；另發現繁中覆蓋率只檢查 TW／HK 地區碼，會把 `en-TW` 名稱誤算成繁中。
- 實際修正：繁中名稱覆蓋改為同時要求 `iso_639_1` 為 `zh`，且 `iso_3166_1` 為 TW 或 HK；加入 `en-TW` 不得計入的反例測試。
- 修正後驗證：`npm test --workspace live-action-tracker` 通過 42 項；`calibration/run.js` 通過 `node --check`。
- 剩餘阻擋：`ACC-001` 維持 pending，尚未執行 24 個月實際連線校準。
- 下一步：再次執行 required 獨立審查，確認程式碼問題已修正；無論程式碼品質結果為何，缺少 blocking 驗收時不得接受 A1。

## 2026-08-17｜A1 第二次獨立審查

- 審查 task：`01a00dba-7529-7dc1-a4c9-f9309d08d2f8`。
- 審查結果：規格符合性 FAIL、程式碼品質 PASS、最終 FAIL。
- 修正確認：繁中覆蓋率同時檢查 `iso_639_1=zh` 與 TW／HK 地區碼；`zh-TW` 正例為 1，`en-TW` 反例為 0。未發現其他 A1 程式碼缺陷。
- 審查實測：workspace 測試 42／42 通過；A1 JavaScript 語法、JSON 解析、A1 diff 與新增檔尾端空白檢查通過；缺權杖校準在網路前以結束碼 1 中止。
- 範圍核對：A1 未修改 `scripts/`、`packages/core/` 或正式報告；未發現權杖與大量第三方資料。整體工作樹的 `steam_discovery/open_links.html` 既有尾端空白不屬於 A1。
- 阻擋原因：`ACC-001` 仍為 pending，沒有五區 24 個月實際校準證據。
- 下一步：保持 A1 `under_review` 與 gate FAIL。等程序環境提供 `TMDB_API_TOKEN` 後執行 A1-T5，再重新審查；不得建立 A2。

## 2026-08-17｜計畫修訂第 2 版

- task／階段：規劃修訂，A1 尚未開始實作。
- 實際改動：明確規定各區以 24 個月歷史樣本判斷前 20%，不按單月強制取固定比例；加入月份區段與 TMDb ID 雙重防重複規則。
- 實際測試與結果：未執行程式測試；已檢查規格、Roadmap、決策、狀態與交接文件的一致性。
- 既有功能影響：未修改現有抓取器程式或正式報告。
- 限制：尚未用 TMDb 實際資料量測五區覆蓋率與門檻。
- 下一步：執行 A1，完成 24 個月校準樣本與離線測試。

## 2026-08-17｜A1 實際校準完成並進入最終審查

- task／階段：A1-T5，資料來源探查與區域校準。
- 開始與結束 HEAD：`e59ab24cf6901bee95ca58fd7a2ecae0e33d96cf`；未 commit。
- 實際連線：以 TMDb API Read Access Token 執行 `npm run calibrate --workspace live-action-tracker`，完成 2024-03 至 2026-02 的五區 24 個月校準，最終結束碼 0。權杖只存在單次程序環境變數，轉交暫存檔於網路請求前刪除，沒有寫入設定、記錄、快取、測試或 Git。
- 實際資料：韓、日、台、陸、歐美 discover 筆數分別為 1,513、1,581、152、8,752、11,649；真人劇候選為 483、498、87、1,996、2,271；有評分門檻樣本為 352、362、51、964、1,624，五區皆高於最低 20 筆。
- 覆蓋率：類型欄位覆蓋率為韓 67.4%、日 70.3%、台 78.9%、陸 35.9%、歐美 69.6%；TMDb 繁中名稱覆蓋率為韓 26.0%、日 51.6%、台 52.0%、陸 24.5%、歐美 7.3%。
- 門檻結果：各區投票數第 25 百分位為韓 3、日 1、台 1、陸 1、歐美 2；Bayesian 加權分第 80 百分位約為韓 7.990、日 7.911、台 8.342、陸 8.280、歐美 7.573。沒有固定名額，也沒有跨區借用門檻。
- 實際修正：修正 npm workspace 工作目錄造成快取與摘要多一層路徑；快取改為每 50 筆或每月批次原子寫入；候選以最多 4 個有限併發載入；零票或無評分作品保留於覆蓋統計但不納入門檻樣本。
- 實際測試：`npm test --workspace live-action-tracker` 通過 47／47；所有 A1 JavaScript 通過 `node --check`；`package-lock.json`、`calibration-summary.v1.json`、`thresholds.v1.json` 可解析；缺權杖校準在網路前以結束碼 1 中止；快取忽略規則與權杖樣式掃描通過。
- 既有功能影響：未修改 `scripts/`、`packages/core/`、既有追蹤器或正式報告；未加入 `update:all` 或 `update:tv`。
- 並行執行：未使用子代理實作。TMDb 候選載入在單一程序內採有限併發，主 task 完成全部整合驗證。
- 限制：台劇有評分樣本只有 51 筆，但仍高於 Roadmap 的 20 筆最低要求。歐美繁中名稱覆蓋率只有 7.3%，A2 必須依規劃使用 Wikidata 備援。
- 下一步：執行 required 獨立審查；只有最終 PASS 才接受 A1 並交接 A2。

## 2026-08-17｜A1 最終獨立審查通過

- 審查方式：依 `$stage-gate-review` 由獨立審查者唯讀核對規格、Roadmap、工作區範圍、實際校準摘要與測試證據。
- 審查結果：規格符合性 PASS、程式碼品質 PASS、最終 PASS；沒有阻擋問題。
- 審查實測：workspace 測試 47／47 通過；A1 JavaScript 語法與 JSON 解析通過；缺權杖時在網路前安全中止；快取受 Git 排除，專案與文件未發現疑似權杖。
- 範圍核對：A1 成果限於 `live_action_tracker/`、`docs/live-action-tracker/`、根目錄 workspace 設定與快取忽略規則；沒有把 `scripts/`、`packages/core/`、既有追蹤器或 `AGENTS.md` 的既有修改納入 A1。
- 非阻擋疑慮：台劇有效評分樣本 51 筆，後續持續觀察門檻穩定性；歐美繁中名稱覆蓋率 7.3%，A2 依既定規劃加入 Wikidata 備援。
- 階段結果：A1 標記為 accepted，gate 為 PASS，允許交接 A2。

## 2026-08-17｜A2 實作完成，等待 conditional 獨立審查

- task／階段：A2，篩選、評分佐證與名稱整合；開始前 A1 為 `accepted / PASS`，開始後切換為 A2 `in_progress`。
- 開始與結束 HEAD：`e59ab24cf6901bee95ca58fd7a2ecae0e33d96cf`；未 commit。
- 開始前既有修改：保留交接列出的所有既有修改與未追蹤檔案，沒有還原、覆蓋或 commit。
- 實際改動：新增 `sources/imdb.js` 的 gzip TSV 串流目標 ID 索引；新增 `scoring.js` 的 TMDb 門檻入選、Bayesian 區內排序、信心等級與 IMDb 來源一致性；新增 `names.js` 的 TMDb／Wikidata／原名優先序與原子快取；新增 `pipeline.js` 固定資料端到端整合。
- 測試改動：新增 IMDb 缺 ID、重複 ID、格式錯誤、缺漏、來源一致／分歧／不足、名稱降級／快取、同 ID 去重／同名不同 ID 保留、區域零入選與端到端測試。
- 實際測試：`npm test --workspace live-action-tracker` 通過 57／57；A2 及 A1 測試均包含在內。A2 JavaScript 檔案全部通過 `node --check`；`git diff --check` 只報既有 `steam_discovery/open_links.html` 尾端空白，未修改該檔案。根目錄 `npm test` 不可執行，原因是根 `package.json` 沒有 `test` script。
- 安全檢查：`live_action_tracker/.cache/` 受 `.gitignore` 排除；未發現疑似權杖。未執行 IMDb 網路下載、Wikidata 網路查詢、TMDb 連線或正式報告寫入。
- 既有功能影響：未修改 `scripts/`、`packages/core/`、正式報告或總排程；A2 僅提供 A3 可使用的處理模組與固定測試。
- 並行執行：未使用子代理。A2-T1～T3 原列候選，但共同依賴候選資料與整合介面，且沒有安全不重疊的工作樹；依規則採循序實作，主 task 完成 A2-T4 與整合驗證。
- 審查判定：A2 新增跨模組資料介面與版本化評分／名稱資料契約，符合 conditional 審查的「資料格式／公開介面」條件，因此轉為 required；目前狀態 `under_review`，尚無獨立審查 PASS。
- 下一步：完成 required 獨立審查；審查 PASS 後才可標記 A2 `accepted / PASS` 並建立 A3 交接。

## 2026-08-17｜A2 第一次獨立審查與修正

- 審查 task：`01a00ebc-a951-7820-ad10-85e30633ff00`。
- 審查結果：規格符合性 FAIL、程式碼品質 FAIL、最終 FAIL。
- 阻擋問題：原流程把五區候選先做全域 Bayesian 排序後才分組；Wikidata resolver 沒有套用 `zh-tw`、`zh-hant`、`zh-hk` 優先序；IMDb gzip 串流路徑缺少自動化測試。
- 實際修正：候選先按五區固定順序分組，再只在區內排序；新增 Wikidata labels 查詢與嚴格語系優先序；新增記憶體 gzip TSV、跨區排序、Wikidata 查詢參數及端到端固定區序測試。
- 修正後驗證：`npm test --workspace live-action-tracker` 通過 62／62；所有 `live_action_tracker` JavaScript 通過 `node --check`。
- 既有功能影響：修正只變更 A2 的 `scoring.js`、`names.js` 與相關測試，未修改 `scripts/`、`packages/core/`、正式報告或既有三個追蹤器。
- 下一步：執行第二次 required 獨立審查；PASS 前維持 A2 `under_review`，不得建立 A3。

## 2026-08-17｜A2 第二次獨立審查與修正

- 審查 task：`01a00ec1-407a-7c63-9cf6-213615dfe3ee`。
- 審查結果：規格符合性 FAIL、程式碼品質 FAIL、最終 FAIL。
- 修正確認：第一次審查的跨區排序、Wikidata 語系優先序與 gzip 測試缺口均已修正。
- 新增阻擋問題：Wikidata 請求雖有逾時，遇到 429、5xx 或暫時性網路錯誤時沒有重試，不符合 `QUAL-001`。
- 實際修正：Wikidata 查詢加入最多三次指數退避重試；429、5xx 與無回應狀態可重試，404 等非暫時性錯誤立即失敗。resolver 最終仍會安全降級為原名。
- 修正後驗證：`npm test --workspace live-action-tracker` 通過 64／64；`names.js` 與名稱測試通過 `node --check`。
- 下一步：執行第三次 required 獨立審查；PASS 前維持 A2 `under_review`，不得建立 A3。

## 2026-08-17｜A2 第三次獨立審查通過

- 審查 task：`01a00ec4-8245-7c02-b208-49ac7715bed7`。
- 審查結果：規格符合性 PASS、程式碼品質 PASS、最終 PASS；沒有阻擋問題。
- 審查基準：分支 `master`、HEAD `e59ab24cf6901bee95ca58fd7a2ecae0e33d96cf`；交接指定 14 份檔案 SHA-256 全數相符，既有未提交工作樹完整保留。
- 審查實測：`npm test --workspace live-action-tracker` 通過 64／64；A2 相關 JavaScript 語法檢查通過；A2 範圍的 `git diff --check` 通過。
- 修正確認：五區固定順序且僅區內排序；Wikidata 嚴格採 `zh-tw`、`zh-hant`、`zh-hk`；IMDb gzip 串流測試存在；Wikidata 對 429、5xx 採指數退避，404 不重試。
- 完成條件：IMDb 缺漏不影響 TMDb 入選、TMDb ID 去重、同名不同 ID 保留、零入選與名稱降級均有離線證據。
- 非阻擋疑慮：A2 未執行 IMDb／Wikidata 實際網路請求或正式報告寫入；這些不屬 A2 必要離線驗證，正式寫入仍受 A5 與使用者明確同意限制。
- 階段結果：A2 標記為 `accepted`，gate 為 PASS，允許交接 A3。

## 2026-08-17｜A3 月份回補與 Markdown 報告完成

- task／階段：A3，月份回補與 Markdown 報告；A2 已為 `accepted / PASS`，本階段結束後標記為 `accepted / PASS`。
- 開始與結束 HEAD：`e59ab24cf6901bee95ca58fd7a2ecae0e33d96cf`；未 commit。
- 開始前既有修改：完整保留交接列出的既有已修改與未追蹤檔案，未還原、覆蓋、commit 或納入其他三個追蹤器的工作。
- 實際改動：新增真人劇設定與 writer；固定頁首、五區順序、區內 Bayesian 排序、空區／空月份標記、名稱與 Markdown 清理、TMDb 連結與 IMDb／信心欄位。主流程新增六個月觀察期、首次回補 12 個月、既有報告自最早月份到終點的缺月與跨年偵測、月份區段跳過、TMDb ID 去重、`--dry-run`、`--output`、`--month` 與本機 IMDb ratings 檔案參數。
- 寫入行為：正式模式每成功完成一個月份便以 `@catchlist/core` 原子寫檔；第二個月份失敗時，第一個月份保留，下次只處理尚缺月份。預覽不建立或修改輸出檔；未達觀察期的指定月份僅可預覽。
- 實際測試：`node --check live_action_tracker/main.js`、`writer.js`、`config.js` 通過；`npm test --workspace live-action-tracker` 通過 74／74，涵蓋首次 12 個月、跨年缺月、觀察期、五區／空輸出、名稱與連結、TMDb ID、重跑、預覽與逐月失敗續補；A3 新增檔案未發現尾端空白。
- 既有功能影響：未修改既有三個報告、既有三個更新器、`scripts/update-all.mjs` 或正式雲端 `真人劇.md`；測試只寫入系統暫存目錄。
- 並行執行：未使用。A3-T1～T3 共用主流程與 writer 狀態，依 Roadmap 循序完成。
- 非阻擋驗收：`ACC-002` 保持 pending，已有固定樣本自動測試證據，仍待使用者閱讀格式。
- 下一步：依 A4 required 審查規則前置，使用 `start-next-stage` 交接 A4；不得在未重新核對既有未提交整合檔案前修改根目錄排程。

## 2026-08-17｜A4 Monorepo 與每月排程整合完成，等待獨立審查

- task／階段：A4，Monorepo 與每月排程整合；開始前已核對路徑、`master`、HEAD `e59ab24cf6901bee95ca58fd7a2ecae0e33d96cf`、交接列出的工作樹與六份 SHA-256，全部相符。
- 實際改動：根目錄新增 `npm run update:tv`，沿用 `live-action-tracker` workspace 的 `update` 指令；`update:all` 固定依序處理動畫、電影、遊戲與真人劇，任何一項失敗仍繼續後續項目，最後以非零結束碼彙整失敗。排程邏輯延續既有 `npm-invocation.mjs` 的 Windows Node 執行 npm CLI 方式，不使用 shell。
- 測試改動：新增 `scripts/test/update-all.test.mjs`，以注入的假子程序結果驗證根 workspace／`update:tv` 設定、四項成功、真人劇失敗與既有電影失敗後仍執行真人劇；沒有呼叫實際更新器、網路或正式報告。
- 文件改動：更新 `run_monthly.bat` 註解與 `AGENTS.md`，說明四項排程、`TMDB_API_TOKEN`、`update:tv` 單獨執行與失敗隔離。
- 實際測試：`node --check scripts/update-all.mjs`、`node --check scripts/test/update-all.test.mjs`、根 workspace／鎖定檔解析與 A4 範圍 `git diff --check` 通過；`node --test scripts/test/*.test.mjs packages/core/test/*.test.js` 以系統權限重跑後 7／7 通過；`npm test --workspace live-action-tracker` 為 74／74 通過。
- 已知測試限制：第一次根目錄 Node 測試在沙箱內因測試框架啟動子程序遭 `spawn EPERM`，提升權限重跑同一離線指令後通過。動畫與電影 workspace 沒有 `test` script；本階段沒有執行它們的更新指令，避免網路與正式寫入。
- 既有功能影響：未修改既有三個更新器的程式或設定，未執行 `update:all`、`update:tv` 或 `run_monthly.bat`，未寫入既有三份報告或正式 `真人劇.md`；原有未提交修改均保留。
- 並行執行：未使用。A4-T1～T3 共用根設定與排程檔，依 Roadmap 循序完成。
- 下一步：建立 required 獨立審查 task；只有最終 PASS 才能接受 A4 並建立 A5。

## 2026-08-17｜A4 第一次獨立審查的疑慮修正

- 審查 task：`01a00ed7-9f44-7592-8d97-931a1de55287`。
- 審查結果：CONCERNS；不得接受 A4 或建立 A5。
- 發現與修正：`NEXT_TASK_HANDOFF.md` 的 `STAGE_STATE.yaml` 雜湊仍是 A3 的舊值。已改為當前 A4 `under_review` 狀態的 `F89FAF2AAB2D7C6BEBB2833995815B9CB5DBF99F685B90EC624F6258B041E324`。
- 證據更正：`steam_discovery/test.js` 會以 axios 對 Steam 搜尋頁送出 HTTP GET，即使錯誤會被捕捉，也不是離線斷言測試。已從 A4 的離線測試證據移除，沒有重新執行。
- 狀態：維持 A4 `under_review`，`gate_result=null`、`handoff_mode=review-current-work`；重新建立 required 唯讀獨立審查 task。

## 2026-08-17｜A4 最終獨立審查通過並交接 A5

- 審查方式：依 `$stage-gate-review` 唯讀核對 A4 的規格、Roadmap、工作區、排程實作與離線測試證據。
- 審查結果：規格符合性 PASS、程式碼品質 PASS、最終 PASS；沒有阻擋問題。
- 審查基準：分支 `master`、HEAD `e59ab24cf6901bee95ca58fd7a2ecae0e33d96cf`；交接指定 12 份檔案 SHA-256 全數相符，既有未提交工作樹完整保留。
- 審查實測：A4 JavaScript 語法檢查通過；根目錄離線測試 7／7 通過；真人劇 workspace 離線測試 74／74 通過；A4 範圍 `git diff --check` 通過。
- 行為確認：`update:tv` 可解析；`update:all` 固定依序執行動畫、電影、遊戲、真人劇；單一失敗不阻止後續，最後回傳非零；Windows npm 呼叫採 Node 執行 npm CLI，`shell: false`。
- 未執行項目：未執行 `update:all`、`update:tv`、`run_monthly.bat`、外部網路請求或正式報告寫入。
- 非阻擋限制：`ACC-002` 維持 pending；IMDb、Wikidata、TMDb 實際連線與暫存報告驗證留在 A5。
- 階段結果：A4 標記為 accepted／PASS。依使用者指示建立 A5 `start-next-stage` task；正式雲端 `真人劇.md` 仍須另行明確同意才可寫入。

## 2026-08-17｜A5 前置核對因缺少權杖暫停

- task／階段：A5，實際月份驗證與正式啟用；已將 `STAGE_STATE.yaml` 設為 `in_progress`、`gate_result: FAIL`、`handoff_mode: continue-current-work`。
- 前置核對：路徑 `D:\練習\CatchList`、分支 `master`、HEAD `e59ab24cf6901bee95ca58fd7a2ecae0e33d96cf` 與交接文件列出的 13 份 SHA-256 全部相符；既有工作樹修改完整保留。
- 實際檢查：目的 task 程序環境的 `TMDB_API_TOKEN` 未設定。未發出 TMDb、Wikidata 或 IMDb 網路請求，未執行 A5-T1～T3，未修改任何正式報告或三個既有報告。
- 安全結論：依 A5 交接規則，在網路請求前停止；沒有尋找其他權杖來源，也沒有輸出或保存任何權杖值。
- 放行結果：FAIL（必要前置條件未滿足），A5 維持 `in_progress`；`ACC-003` 維持 blocking／pending，不能標記 A5 accepted。
- 下一步：使用者需在程序環境安全設定 `TMDB_API_TOKEN` 後，續接 A5-T1；權杖設定不等於正式報告寫入授權。

## 2026-08-17｜A5 實際月份驗證完成，等待人工驗收

- task／階段：A5-T1～T3，實際月份驗證與正式啟用；採循序執行，未使用子代理。
- 權杖處理：沿用 A1 的安全方式，從已登入的 TMDb API 設定頁取得 Read Access Token，只轉交至單次程序。程序在外部請求前讀取並刪除一次性暫存檔，結束時清除環境變數；專案、記錄與終端輸出均未保存權杖。
- A5-T1：以 2026-02 執行實際 TMDb 連線、完整 dry-run、IMDb ratings 串流合併及 Wikidata 名稱降級。預覽包含五區清單及排除原因；排除原因統計為 `missing_genres` 319、`single_episode` 257、`unscripted_type` 181、`documentary` 153、`reality` 82、`animation` 31、`talk` 27、`news` 3。
- 實測修正：首次報告所有類型顯示「未提供」。原因是 `normalizeShowCandidate` 只保留 `genreIds`，writer 讀取的 `genreNames` 未加入固定契約。已在 `schema.js` 保留 TMDb details 的類型名稱，並在 `tmdb.test.js` 補回歸斷言；相關 15 項測試通過。
- A5-T2：修正版暫存報告為 `live_action_tracker/.cache/a5-validation/真人劇-A5-2026-02-fixed-v2.md`。第一次寫入成功，第二次正確跳過既有月份；兩次 SHA-256 均為 `5640B665C3C1074FD7CD40F9BF782A1588E473085D36B575F478F291CFF83B27`。舊版暫存報告保留作為修正前證據，未刪除。
- 實際清單：共 22 部，韓劇 3、日劇 2、台劇 1、陸劇 4、歐美劇 12；類型欄位無缺漏。另有 10 部低信心、9 部 IMDb 資料不足、2 部來源意見分歧，需由使用者判斷門檻結果是否符合用途。
- A5-T3：所有 `live_action_tracker` JavaScript 通過 `node --check`；`npm test --workspace live-action-tracker` 通過 74／74，包含缺權杖、TMDb 429／5xx、名稱缺漏、Wikidata 失敗與重試降級。根目錄 `node --test scripts/test/*.test.mjs packages/core/test/*.test.js` 第一次在沙箱因 `spawn EPERM` 失敗，以系統權限重跑後 7／7 通過，包含四個更新器固定順序與失敗隔離；沒有啟動實際四項更新或寫正式報告。
- 安全證據：正式 `G:\我的雲端硬碟\CatchList\真人劇.md` 仍不存在；動畫、電影與遊戲報告的大小及修改時間與 A5 執行前相同。一次性權杖暫存檔已刪除。
- Git 證據：開始與結束 HEAD 均為 `e59ab24cf6901bee95ca58fd7a2ecae0e33d96cf`、分支 `master`；既有未提交工作樹完整保留，未 commit、push、部署或修改正式報告。A5 程式修改限於 `live_action_tracker/schema.js`、`live_action_tracker/test/tmdb.test.js`，另更新階段文件；驗證產物位於已忽略的 `.cache`。
- 放行結果：CONCERNS。技術驗證已通過，但 `ACC-002` 與 blocking `ACC-003` 仍待使用者閱讀實際報告並確認；A5 維持 `in_progress`，不得標記 accepted。
- 下一步：使用者確認修正版五區分類、數量與門檻結果。若接受，先更新人工驗收；第一次正式寫入仍須另行明確授權。

## 2026-08-18｜A5 改採第 75 百分位後重跑

- 使用者決定：目前不正式寫入報告，將最低票數由各區第 25 百分位改為第 75 百分位後重跑 A5；Bayesian 加權分數仍採第 80 百分位，沒有固定名額或跨區共用門檻。
- 校準版本：保留 `calibration-summary.v1.json` 與 `thresholds.v1.json`，SHA-256 分別維持 `6924571CBD4627B15EFEC683D3F17BB217C52F11D146AC354F216887262FC387`、`C828F14B5CFF5BC4B83F900BAF4D6AF33449783253618AEBBFC273635468B9A9`；使用 A1 實際快取另產生 v2，SHA-256 分別為 `770D20F2C93654B7BD3AD91B7AF0C1BB0A68847AD88C558300B068182BBF355F`、`4E8FDAE358E79429C3C5C7FA9C1B13419540E6842DEC9EEA3B42D4B676B42D95`。
- v2 門檻：韓 32 票／7.660、日 7 票／7.520、台 11.5 票／7.900、陸 4 票／8.030、歐美 33 票／7.050；五區來源均為 `calibrated`。
- 實際連線：首次受執行環境 SSL 阻擋，在 dry-run 前安全失敗，沒有產生報告；改以允許外部連線的相同程序重試後，TMDb 權杖與連線驗證通過。每次一次性權杖檔都在網路請求前刪除，程序結束後清除環境變數，未輸出或寫入專案。
- A5 重跑：以 v2 門檻完成 2026-02 dry-run、第一次暫存寫入及第二次冪等重跑。暫存報告為 `live_action_tracker/.cache/a5-validation/真人劇-A5-2026-02-p75-v3.md`，兩次 SHA-256 均為 `FE918D1066E405BD0173CB550E3C3FE83B1AB6F93BB351A3A0D56C6CEECD8CE0`。
- 清單結果：共 12 部，韓 2、日 0、台 0、陸 1、歐美 9；全部達各區 p75，信心皆為高。IMDb 資料不足 1 部、來源意見分歧 3 部，其餘 8 部來源一致。
- 驗證結果：p75 公式針對性測試 18／18、完整真人劇測試 75／75、根目錄離線測試 7／7 與所有真人劇 JavaScript 語法檢查通過；涵蓋缺權杖在傳輸前失敗、TMDb 429／5xx 重試、Wikidata 失敗降級、四個更新器順序與單項失敗隔離。
- 安全結果：正式 `G:\我的雲端硬碟\CatchList\真人劇.md` 仍不存在；動畫、電影與遊戲報告的大小與修改時間未變。沒有執行正式四專案更新、commit、push、部署或刪除。
- 放行結果：CONCERNS。技術驗證通過，但 `ACC-002` 與 blocking `ACC-003` 仍待使用者檢閱；A5 維持 `in_progress`，本次重跑不構成正式寫入授權。

## 2026-08-18｜A5 本機 `.env` 備援與相鄰月份驗證

- 使用者決定：改採專案內 `.env`，並由 Git 排除，讓真人劇追蹤器可以長期讀取 TMDb Token。
- 規劃修訂：計畫版本升為 3，新增 A5-T0；`REQ-015` 改為程序環境優先、本機 `live_action_tracker/.env` 備援。DEC-010 記錄 `.env` 只能是一般檔案、只讀取 `TMDB_API_TOKEN`，不得提交、記錄、快取、測試或複製到同步資料夾。
- 實作與安全：新增 `env.js`、`.env.example` 與 Git 排除規則。實際 `.env` 已建立且 `git status --ignored` 顯示為 `!!`；檔案內容未顯示、未寫進文件、記錄或測試。環境變數仍覆蓋 `.env`，注入測試環境不會意外讀取本機檔案。
- 驗證：本機 `.env` 成功建立 `TmdbClient` 而未發出網路請求；`.env` 單元測試與完整 `npm test --workspace live-action-tracker` 通過 78／78；`.gitignore` 命中與範圍 `git diff --check` 通過。
- 2026-01：使用本機 `.env` 完成 dry-run、兩次暫存寫入與冪等重跑，SHA-256 均為 `1F9A63FC19064F315477F6BAADCDF6BDA44820AA0A1161144BC166B1916B3663`。入選為韓 4、日 3、台 0、陸 5、歐美 9；日劇並未被 p75 長期排除。
- 2025-12：使用本機 `.env` 完成 dry-run、兩次暫存寫入與冪等重跑，SHA-256 均為 `55492AF7F2FC0335A0CDF47660C6DB16575E237F3E74F5763D09B0414EAABDC6`。入選為韓 2、日 0、台 0、陸 5、歐美 4。
- 判讀：台劇在 2025-12、2026-01、2026-02 均為 0；三個月不足以直接改門檻，先保留為 ACC-003 的使用者判斷項目。正式雲端報告不存在，動畫、電影與遊戲報告未被修改。

## 2026-08-18｜A5 MyDramaList 二次核對可行性

- task／階段：A5-T5；依使用者明確指示驗證「TMDb 找候選後，以 MyDramaList 二次核對」的可行性。計畫版本升為 4，新增 REQ-018 與 SUCCESS-007；DEC-011 限定本輪只做公開頁面人工核對，不爬取、不使用未確認 API、不登入，也不變更正式更新器。
- 實際嘗試：以 MyDramaList 首頁作單一公開頁面讀取，瀏覽器安全政策封鎖 `mydramalist.com`。未輸入資料、未登入、未取得作品頁、未發送表單、未下載資料，也沒有改以爬蟲、非官方 API 或其他繞過方式重試。
- 判讀：本次失敗是存取環境限制，不能視為作品不存在、沒有評分或 MyDramaList 不適合作為資料來源。尚未能驗證日、韓、台各一部的條目匹配與評分人數。
- 安全與既有功能：沒有寫入正式 `真人劇.md`，未修改動畫、電影、遊戲報告，未輸出任何權杖；只更新計畫與驗收文件。
- 放行結果：CONCERNS。A5 維持 `in_progress`，ACC-003 維持 blocking／pending；等待使用者提供可正式取得的來源介面、授權，或可供人工核對的公開評分資料。

## 2026-08-18｜A5 回復原有資料來源流程

- 使用者決定：若 MyDramaList 無法穩定取得資料，維持原本 TMDb＋IMDb＋Wikidata 流程。
- 規劃修訂：計畫版本升為 5；移除 REQ-018、SUCCESS-007 與 A5-T5，A5-T4 恢復只相依 A5-T3。DEC-012 取代 DEC-011 的後續執行與驗收影響；先前 MyDramaList 存取受阻紀錄保留為歷史證據。
- 影響：沒有修改任何正式更新程式、校準門檻或暫存月份結果。A5 仍為 `in_progress`／`CONCERNS`，只等待使用者確認既有 p75 暫存報告與是否另行授權首次正式寫入。

## 2026-08-18｜A5 p75 門檻人工確認

- 使用者決定：維持現有五區 p75 TMDb 票數門檻與 Bayesian 加權分數規則，不再降低低票數地區的票數門檻。
- 證據：已向使用者說明 p75 依近 24 個月各區有效評分樣本的票數分布計算；目前門檻為韓 32、日 7、台 11.5、陸 4、歐美 33。使用者明確回覆「好，保持這樣吧」。
- 影響：新增 DEC-013；未修改程式、校準檔、暫存報告或正式報告。此確認不等於首次正式寫入授權，A5 維持 `in_progress`／`CONCERNS`，ACC-003 維持 pending。

## 2026-08-18｜A5 正式回補範圍縮小與 TMDb 逾時修正

- 使用者決定：在原先正式回補 2022-01 至 2026-02 的授權後，於完成前明確縮小為只寫入 2022-01 至 2022-12。
- 實際結果：首次 2022-01 正式背景執行已結束；正式 `真人劇.md` 未建立，標準錯誤為 `timeout of 15000ms exceeded`。因此未將此失敗視為空月份或寫入成功，也沒有修改動畫、電影或遊戲報告。
- 修正：`collectMonthCandidates` 改為每批最多 4 部候選詳情，避免一次對每個候選同時送出 details、translations、external IDs 請求；TMDb 原有重試、快取與逐月原子寫入保持不變。
- 驗證：`node --test live_action_tracker/test/main.test.js live_action_tracker/test/tmdb.test.js` 實際通過 16／16，包含新增的有限併發測試。
- 規劃：計畫版本升為 7，新增 DEC-015；A5 維持 `in_progress`，下一步是用修正後程式重跑 2022-01 dry-run。

## 2026-08-18｜A5 2022 年正式回補完成

- 實際連線：修正後以 2022-01 完成 TMDb、IMDb 與 Wikidata 實際 dry-run；入選為韓 2、日 4、台 0、陸 2、歐美 11，無標準錯誤。
- 正式寫入：2022-01 至 2022-12 共 12 個月份依序原子寫入 `G:\我的雲端硬碟\CatchList\真人劇.md`。主控記錄顯示每月完成，標準錯誤為空；不曾並行處理月份。
- 冪等與範圍：2022-12 重跑正確顯示「已跳過」，正式報告 SHA-256 前後皆為 `683ABA41F8E29B1FF0F7827440C064D58D3E0D614F693E8C9A2DE2EF6BD13320`；月份為 1 至 12 且沒有重複。動畫、電影與遊戲報告的最後修改時間皆早於本次作業。
- 驗證：`npm test --workspace live-action-tracker` 通過 79／79；`node --test scripts/test/*.test.mjs` 通過 5／5。未執行任何其他三個更新器的實際網路更新。
- 放行結果：CONCERNS。技術、正式寫入、冪等與回歸驗證通過；`ACC-003` 仍是 blocking pending，等待使用者閱讀 2022 年正式報告並確認五區結果。

## 2026-08-18｜A5 歐美劇 7.5 門檻離線重整

- 使用者決定：歐美劇 Bayesian 加權分提高至 7.5，並指示不重新獲取外部資料。
- 實作：新增 `thresholds.v3.json`，保留 v2 原始 p80 校準資料，只將歐美 `minimumWeightedScore` 覆蓋為 7.5；其他區域及 p75 票數門檻不變。執行期優先使用最新版本化設定。
- 離線驗證：用快取 TTL 無限、任何快取未命中即失敗的傳輸器重算 2022 全年暫存報告；未發出 TMDb、Wikidata 或 IMDb 網路請求。歐美由 153 部降至 67，韓 27、日 19、台 1、陸 13 均不變。
- 冪等與測試：暫存報告連跑兩次 SHA-256 均為 `56F968943646CD191A403CCAC220FA130E20E97C00F36A2CAC09981EF733B85D`；`npm test --workspace live-action-tracker` 通過 80／80。
- 安全：沒有覆寫正式雲端 `真人劇.md`，也沒有修改動畫、電影或遊戲報告。等待使用者檢閱新版暫存清單與另行明確覆寫授權。

## 2026-08-18｜A5 台劇加權分 7.5 門檻離線重整

- 使用者決定：台劇 Bayesian 加權分調整為 7.5，並維持不重新獲取外部資料。
- 實作：新增 `thresholds.v4.json`，保留既有校準與歐美劇覆蓋值，只將台劇 `minimumWeightedScore` 覆蓋為 7.5；台劇 p75 票數門檻仍為 11.5。
- 離線驗證：以任何快取未命中即失敗的傳輸器重算 2022 全年暫存報告，未發出 TMDb、Wikidata 或 IMDb 網路請求。台劇由 1 部增至 4 部，歐美維持 67，韓 27、日 19、陸 13 不變。
- 冪等與測試：暫存報告 SHA-256 為 `046D0528EF1603D57CFA8CC8076AAB293D837B63877ED571DD53D2E4FA8CFF55`；`npm test --workspace live-action-tracker` 通過 81／81。
- 安全：沒有覆寫正式雲端 `真人劇.md`，也沒有修改動畫、電影或遊戲報告。A5 維持 `in_progress`／`CONCERNS`，等待使用者檢閱新版暫存清單與另行明確覆寫授權。

## 2026-08-18｜A5 五區加權分統一為 7.5

- 使用者決定：五個區域的 Bayesian 加權分門檻均統一為 7.5；歐美分類仍維持原本整合的歐美區，不依國家細分。
- 實作：新增 `thresholds.v5.json`，保留各區 p75 票數門檻，只將韓、日、台、陸、歐美的 `minimumWeightedScore` 都覆蓋為 7.5。
- 離線驗證：以任何快取未命中即失敗的傳輸器重算 2022 全年暫存報告，未發出 TMDb、Wikidata 或 IMDb 網路請求。結果為韓 38、日 20、台 4、陸 41、歐美 67；相較原正式報告為韓 27→38、日 19→20、台 1→4、陸 13→41、歐美 153→67。
- 冪等與測試：暫存報告連跑兩次 SHA-256 均為 `754D684BD0DAB676B4BE1CD360A3CB98E3F6450491CEC30E5479D22BC85A058A`；`npm test --workspace live-action-tracker` 通過 80／80，且 `node --check` 通過。
- 安全：沒有覆寫正式雲端 `真人劇.md`，也沒有修改動畫、電影或遊戲報告。A5 維持 `in_progress`／`CONCERNS`，等待使用者檢閱新版暫存清單與另行明確覆寫授權。

## 2026-08-18｜A5 日台 7.5、韓陸歐美 8.0 離線重整

- 使用者決定：日劇、台劇維持 Bayesian 加權分 7.5；韓劇、陸劇、歐美劇調整為 8.0。歐美分類仍維持既有合併區。
- 實作：新增 `thresholds.v6.json`，保留五區 p75 票數門檻，只調整五區加權分覆蓋值。
- 離線驗證：以任何快取未命中即失敗的傳輸器重算 2022 全年暫存報告，未發出 TMDb、Wikidata 或 IMDb 網路請求。結果為韓 14、日 20、台 4、陸 14、歐美 19。
- 冪等與測試：暫存報告連跑兩次 SHA-256 均為 `9265CD8BABB5F880655F55726B47D577C05AEFD3589813A79281608BA5830C7D`；`npm test --workspace live-action-tracker` 通過 80／80，且 `node --check` 通過。
- 安全：沒有覆寫正式雲端 `真人劇.md`，也沒有修改動畫、電影或遊戲報告。A5 維持 `in_progress`／`CONCERNS`，等待使用者檢閱新版暫存清單與另行明確覆寫授權。

## 2026-08-19｜A5 歐美劇臺灣訂閱制暫存驗證

- 使用者決定：歐美劇增加正式附加條件，必須列有臺灣訂閱制串流。日、韓、台、陸劇不套用。
- 實作：新增 TMDb 劇集串流供應商查詢、臺灣 `flatrate` 篩選與 JustWatch 出處標示。供應商資料失敗會往外拋出，不能誤判為未上架。
- 實際連線：只對既有 2022 年 19 部歐美候選查詢 TMDb／JustWatch 的 `TW` 資料；候選、IMDb 與名稱仍只讀既有快取。保留 14 部、排除 5 部。排除作品為《權欲 第四章》、《最後一戰》、《Harina》、《Hasta que la plata nos separe》與《Dejémonos de Vargas》。
- 冪等與測試：主暫存報告兩次 SHA-256 均為 `316FE7E2E4EB9A2CEAFFFF159B323B99B1AFFB422BD7E9EE6BC9319B9A5766E4`；串流檢核表兩次均為 `6502F1C8BF8430257BECCEFE839D2DD0E25C01C8CA51A386360C749A2B7FF5C3`；`npm test --workspace live-action-tracker` 通過 85／85，所有變更檔案的 JavaScript 語法檢查通過。根目錄離線測試在受限環境因 `spawn EPERM` 無法建立子程序，以系統權限重跑同一指令後通過 5／5。
- 安全：所有輸出限於專案 `.cache`；沒有覆寫正式雲端 `真人劇.md`，也沒有修改動畫、電影或遊戲報告。A5 維持 `in_progress`／`CONCERNS`，等待使用者檢閱。

## 2026-08-19｜A5 全區臺灣訂閱制暫存驗證

- 使用者決定：臺灣訂閱制附加條件擴及韓、日、台、陸、歐美五區所有劇集。
- 實作：共用篩選器改為逐部查詢 TMDb／JustWatch 的 `TW` `flatrate`；五區皆在缺資料時排除，在查詢失敗時停止，不把外部錯誤誤判為沒有上架。報告對所有保留作品顯示供應商與 JustWatch 出處。
- 實際連線：只對既有 2022 年入選候選查詢串流可用性；候選、IMDb 與名稱仍只讀既有快取。保留韓 13、日 6、台 3、陸 3、歐美 14 部，分別排除 1、14、1、11、5 部。
- 冪等與測試：主暫存報告兩次 SHA-256 均為 `F3989C85555DA264B80C96660012FFF3D4EAC38C86DC6E62F20B387A00814513`；串流檢核表兩次均為 `2D87DA3213BAF09503E97C5161526DA686BE803C237ED3B7550811695B40FA07`；`npm test --workspace live-action-tracker` 通過 85／85，相關 JavaScript 語法檢查通過。
- 安全與限制：所有輸出限於專案 `.cache`；沒有覆寫正式雲端 `真人劇.md`，也沒有修改動畫、電影或遊戲報告。串流資料是 2026-08-19 當下狀態，不代表 2022 年的歷史上架狀態。A5 維持 `in_progress`／`CONCERNS`，等待使用者檢閱。

## 2026-08-19｜A5 全區臺灣訂閱制標準定案

- 使用者確認：五區都採「臺灣訂閱制可看」作為正式附加條件，沿用已驗證的 TMDb／JustWatch `TW` `flatrate` 判定與現有分數、票數門檻。
- 驗收影響：篩選規則與 2022 暫存結果已由使用者確認；`ACC-003` 尚未 accepted，因正式雲端報告覆寫仍需要使用者另行明確授權。
- 安全：沒有覆寫正式 `真人劇.md`，也沒有修改動畫、電影或遊戲報告；A5 維持 `in_progress`／`CONCERNS`。

## 2026-08-19｜A5 正式覆寫與最終驗收

- 使用者授權：使用者明確要求「覆寫正式真人劇報告」。
- 正式寫入：以已驗證的 2022 全區臺灣訂閱制暫存清單完整覆寫 `G:\我的雲端硬碟\CatchList\真人劇.md`。

## 年度 AI 編輯清單改版（2026-08-19）

- 使用者決定：真人劇改為每年一次的年度必看清單，五區各 10 部；由 AI 參考口碑、創作代表性與年度話題選擇，IMDb 分數與票數只供閱讀，不影響入選。
- 實際改動：`update:tv` 改為接收 `--year` 與 `--input annual-selections/YYYY.json`；新報告輸出至 `G:/我的雲端硬碟/CatchList/真人劇年度.md`，以「YYYY 全年度」作完成標記。同年區段已存在時直接略過，不讀取輸入、不重新處理、不改寫內容。
- 排程：真人劇移出 `update:all` 與 `run_monthly.bat`，每月排程只保留動畫、電影、遊戲。舊版 `真人劇.md` 完整保留，未遷移或覆寫。
- 資料：新增 `annual-selections/2022.json`，含使用者確認格式的五區各 10 部作品與 2026-08-17 的 IMDb 顯示快照；《消失的孩子》保留 IMDb 資料不足。
- 驗證：JavaScript 語法檢查通過；真人劇離線測試 79／79、根目錄離線測試 6／6 通過；實際執行 2022 年 `--dry-run` 成功，沒有建立或修改雲端年度報告。

## 移除月度版遺留元件（2026-08-19）

- 實際改動：刪除只供舊月度流程使用的 TMDb、IMDb、Wikidata、串流可用性、候選分類、評分、校準程式與對應測試；移除真人劇 workspace 的 `axios` 直接依賴和 `calibrate` 指令。
- 保留範圍：真人劇 workspace 僅剩年度 JSON 輸入、五區標籤、年度 Markdown writer、更新器與六項測試。本機 `.env` 沒有刪除，但年度流程不會讀取它。
- 相依性核對：其餘三個追蹤器未引用上述真人劇檔案；`axios` 仍由 core、電影、遊戲及動畫使用，未從專案整體移除。
- 驗證：真人劇離線測試 6／6、根目錄離線測試 6／6、2022 年實際 `--dry-run` 均通過；未呼叫外部 API，也沒有建立或修改雲端年度報告。
- 完整性驗證：來源與正式檔 SHA-256 均為 `F3989C85555DA264B80C96660012FFF3D4EAC38C86DC6E62F20B387A00814513`；正式檔含 12 個月份、每月五區段落與 39 筆臺灣訂閱制標示。動畫、電影與遊戲報告雜湊均未變。
- 放行：使用者確認篩選標準與正式寫入，`ACC-002`、`ACC-003` 改為 accepted；A5 最終為 `accepted／PASS`。A5 是最後階段，不建立下一個 task。
