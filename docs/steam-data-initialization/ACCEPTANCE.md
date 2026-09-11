# 驗收紀錄

只有使用者能豁免標示為「阻擋」的人工驗收。自動測試通過不能取代資料口徑驗證。

## ACC-001：A1 資料契約與來源可行性

- 階段：A1
- 類型：阻擋
- 狀態：passed
- 驗收內容：FronkonGames 固定版本、檔案雜湊、欄位結構與串流載入方式明確；商店頁可辨識名稱、日期、標籤、語言與硬性排除訊號；年齡驗證及不完整 HTTP 200 維持未知／待重試。
- 評論口徑：全球全語系終身評價與評論數使用 FronkonGames `positive`／`negative`。使用者已抽查多款正常且遠離門檻的遊戲，與同日 SteamSpy 一致。最近評價與目前語言評價不會被使用。
- API 邊界：Steam Reviews API 只保留 A1 對照證據，不是正式初始化來源；是否另開複核工作尚未決定。
- 證據：`research/fronkon-contract.md`、`research/store-page-contract.md`、`research/A1_VERIFICATION_REPORT.md`，以及 32 項通過的 Steam 測試。
- 決定者：使用者，2026-09-08。
- 豁免：無。

## ACC-002：每月更新相容性

- 階段：A5
- 類型：阻擋
- 狀態：passed
- 驗收內容：既有 Steam 測試與初始化測試全數通過；`update:games` 與 `update:all` 未被初始化入口接管；每月更新的資料來源順序與輸出位置未改變。
- 通過條件：自動測試、命令與 Git 差異檢查皆通過。
- 證據：`npm test --workspace steam_discovery` 共 54 項通過；`npm run update --workspace steam_discovery -- --help` 顯示原有每月更新命令；根目錄 `update:all` 未加入初始化。
- 豁免：無。
## ACC-003：完整初始化內容抽查

- 階段：A6
- 類型：阻擋
- 狀態：passed
- 驗收內容：3,338 筆第一輪候選均已完成第二輪判定，最終 3,111 筆通過、227 筆第二輪排除，沒有待重試資料。509 筆接近門檻資料已依使用者決定直接排除。
- 通過條件：通過與排除清單可追查；0／0、接近門檻與不完整商店頁均未預設通過。
- 證據：`初始化摘要.json`、`遊戲.md`、`排除明細.json`、`A6_EXECUTION_AUDIT.md`；Node 24 完整測試 61 項通過。
- 豁免：無。
## ACC-004：輸出安全

- 階段：A6
- 類型：阻擋
- 狀態：passed
- 驗收內容：輸出根目錄由程式限制為 `steam_discovery/preview/initialization/`；不得修改遠端 `遊戲.md` 或既有月份預覽。
- 通過條件：路徑拒絕測試通過；完整續跑前後再次核對受保護檔案。
- 證據：`test/initialize.test.js`、`A6_EXECUTION_AUDIT.md`，以及 59 項已通過測試。
- 豁免：無。
## ACC-005：A4 固定樣本整合

- 階段：A4
- 類型：自動驗證
- 狀態：passed
- 驗收內容：固定小樣本能經過兩輪篩選，原子寫入六種初始化專用輸出；重跑沒有重複 AppID 或月份；拒絕雲端正式報告與既有月份預覽。
- 證據：`steam_discovery/test/initialize.test.js` 與 `npm test --workspace steam_discovery` 的 53 項通過。
