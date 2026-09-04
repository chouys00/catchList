# CatchList — 動畫／電影／遊戲／真人劇追蹤 monorepo

四個追蹤專案會把「值得看／玩」的清單增量寫入 Markdown 報告：

| 專案 | 內容 | 輸出 | 資料來源 |
|------|------|------|----------|
| `spiderMAL` | 每季動畫(評分 ≥ 7.70) | `動畫.md` | Jikan/MAL + Bangumi 中文名(AniList 備援) |
| `imdb_tracker` | 每月電影(豆瓣估算 ≥ 7.0、≥ 30000 票) | `電影.md` | IMDb 公開數據集 + Wikidata/TMDb 翻譯 |
| `steam_discovery` | 每月優質單機遊戲(壓倒性/極度好評) | `遊戲.md` | Steam 商店搜尋頁 + appdetails API |
| `live_action_tracker` | 每年真人劇必看（五區各 10 部） | `真人劇年度.md` | AI 年度研究＋IMDb 顯示資訊 |

共用邏輯在 `packages/core`(月份計算、Markdown 區段存取、HTTP 重試、JSON 快取)。

## 每月更新(排程任務請執行這個)

```
cd D:\練習\CatchList
npm run update:all
```

或直接執行 `run_monthly.bat`(同上,另會把完整輸出寫到 `logs\update-*.log`)。

也可單獨更新某個專案：`npm run update:anime` / `npm run update:movies` / `npm run update:games`。真人劇不列入每月排程；年度研究完成後，以 `npm run update:tv -- --year 2022 --input annual-selections/2022.json` 寫入。

### 執行特性(排程器/agent 須知)

- **冪等**:程式會解析既有報告找出缺漏的月份/季度,只回補缺的;無缺漏時幾秒內直接結束。同一個月重複執行是安全的。
- **沉澱期**：電影、遊戲只回補「6 個月前」的月份（讓評分沉澱），動畫回補到上一季。所以每月執行一次，每次通常只補 1 個月／季。
- **年度真人劇**：每年由 AI 研究各地口碑、創作代表性與年度話題，五區各列 10 部。IMDb 分數與票數只供閱讀，不參與篩選；寫入成功後，程式以「YYYY 全年度」區段辨識既有資料，直接略過同年，不重新讀取或改寫。
- **exit code**:全部成功 = 0;任何專案失敗 = 非 0。失敗時看 console 輸出或 `logs\` 下的記錄檔,重跑一次通常即可(常見原因是 API 限流或網路逾時)。
- **真人劇輸入與安全**：`annual-selections/YYYY.json` 是 AI 已完成年度研究後的結構化清單。正式輸出預設為 `G:/我的雲端硬碟/CatchList/真人劇年度.md`；舊版 `真人劇.md` 完整保留。`--dry-run` 可先預覽，正式寫入仍須由執行者確認。
- **執行時間**：動畫約幾分鐘；電影需串流下載 IMDb 資料集（數百 MB），約 10–20 分鐘；遊戲因請求間隔 1.5 秒，約 5–15 分鐘。真人劇年度研究由 AI 任務執行，不屬於每月排程。

## 開發須知

- 套件管理:npm workspaces,在根目錄執行 `npm install`。
- 各專案設定(輸出路徑、門檻)在各自的 `config.js`;spiderMAL 在 `.cursor/skills/find-anime/lib/constants.js`。真人劇年度來源放在 `live_action_tracker/annual-selections/`。
- spiderMAL 的程式碼位於 `.cursor/skills/find-anime/`(三套 IDE skill 共用同一份腳本,單一來源)。
- 報告檔同時是狀態來源(用區段標題判斷哪些月份／季度／年度已完成),手動編輯報告時不要更動「YYYY  M月」或「YYYY  全年度」標題行與 `------------------------------` 分隔線。

## 規劃中的功能

- 真人劇追蹤器的月度版本已完成 A1～A5；現行採年度 AI 編輯清單，規格與決策集中在 `docs/live-action-tracker/`。
- `docs/live-action-tracker/STAGE_STATE.yaml` 是真人劇追蹤器的控制狀態來源；實作或修訂前先讀取該資料夾內的規劃文件。

## 遊戲全語系資料重抓計畫

- 規格、Roadmap、狀態、決策與交接文件集中在 `docs/steam-game-data-refresh/`；執行前先讀取該資料夾全部文件。
- `docs/steam-game-data-refresh/STAGE_STATE.yaml` 是控制狀態來源。用 `staged-task-runner` 一年建立一個 task，同一 task 內逐月串行執行；年度 PASS 後才建立下一年 task。
- 固定使用 `gpt-5.6-luna`、`low` 思考程度。完整資料只寫 `steam_discovery/preview/`，不得修改檢視器或雲端 `遊戲.md`；搬移或覆蓋雲端資料仍須使用者另行明確授權。
