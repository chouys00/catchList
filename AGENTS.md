# CatchList — 動畫／電影／遊戲／真人劇追蹤 monorepo

四個追蹤專案會把「值得看／玩」的清單增量寫入 Markdown 報告：

| 專案 | 內容 | 輸出 | 資料來源 |
|------|------|------|----------|
| `spiderMAL` | 每季動畫(評分 ≥ 7.70) | `動畫.md` | Tenrai/MAL + Bangumi 中文名 |
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

動畫資料改由 Tenrai 提供 MAL 評分與作品資訊；只收當季首播，前季延續作品不重複收錄。`npm run refresh:anime -- --recent 3` 可重新核對最近三個已結束季度，依 MAL 編號只追加缺少作品，保留既有名稱與個人紀錄；每次執行的備份及核對明細保存於 `output/tenrai-migration/`。此回補入口不加入每月排程。

動畫新增前必須完成中文名稱核對：優先依 MAL 編號使用人工確認對照，再以 Bangumi 名稱、首播日期、類型及集數配對；必要時使用 AniList 的同 MAL 編號別名作備援搜尋。未確認中文名稱時，本批停止寫入，原因保存於 `output/anime-name-review/pending.json`，下次重新執行會重查。處理待補時需保留原 MAL 編號、季別、版本及來源網址；不得只憑搜尋排名或自行翻譯套用。只補新增項目，不自動更名既有報告，避免影響個人紀錄鍵。完整流程在 `spiderMAL/CHINESE_NAMES.md`。

### 執行特性(排程器/agent 須知)

- **有限度同時執行**：每月入口最多同時執行兩個追蹤器，各來源內部請求間隔不變；更新狀態由同一個父程序保存，任一失敗仍讓其他項目完成。

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

## 閱讀器版本與發行檔

- 每次修改 `catchlist_reader` 後，完成測試時一律遞增 `catchlist_reader/package.json` 的 patch 版本，並重建可攜版 `.exe`。
- 每次成功產生新版可攜版 `.exe` 後，須另外複製到 `G:\我的雲端硬碟\CatchList`，保留含版本號的檔名；確認來源與目的檔 SHA-256 相同後，才移除該資料夾內舊版的 `CatchListReader-<版本>-portable.exe`，讓雲端資料夾只保留最新閱讀器版本。依版本號比較，不以檔案時間判斷；若目的資料夾已有更高版本，不得以較舊版本取代。
- 上述複製及舊版閱讀器清理已由使用者授權，後續發行依此執行。清理範圍僅限該資料夾頂層可辨識的舊版閱讀器 `.exe`；不得刪除報告、個人紀錄、其他程式或本機 `dist` 歷史版本。新版複製或驗證失敗時保留舊版，並回報原因。檔案已放入同步資料夾不代表 Google Drive 已完成上傳。
- 回報時須附上實際產生的 `.exe` 路徑與版本；若重建失敗，須明確說明原因，不得視為完成。

## 規劃中的功能

- 真人劇追蹤器的月度版本已完成 A1～A5；現行採年度 AI 編輯清單，規格與決策集中在 `docs/live-action-tracker/`。
- `docs/live-action-tracker/STAGE_STATE.yaml` 是真人劇追蹤器的控制狀態來源；實作或修訂前先讀取該資料夾內的規劃文件。

## 遊戲全語系資料重抓計畫（已由初始化取代）

- 歷史規格、狀態、決策與驗收紀錄保留在 `docs/steam-game-data-refresh/`。
- 該計畫完成 Y2026～Y2023 後停止，Y2022～Y2015 未執行；不得再由 `staged-task-runner` 接續。
- 完整歷史資料已改由 `docs/steam-data-initialization/` 的流程建立。正常每月更新仍使用 `npm run update:games`。

## 遊戲大量資料初始化計畫

- 規格、Roadmap、狀態、決策、驗收與交接文件集中在 `docs/steam-data-initialization/`；執行前先讀取該資料夾全部文件。
- `docs/steam-data-initialization/STAGE_STATE.yaml` 是控制狀態來源。初始化流程與每月更新分開，不得把初始化入口加入 `update:all`。
- A1 通過前不得實作後續階段。初始化執行期只使用 FronkonGames 與單一 Steam 商店頁面，不得呼叫搜尋頁或 `appdetails`。
- 完整結果只寫 `steam_discovery/preview/initialization/`；不得覆蓋既有預覽或雲端 `遊戲.md`。

## 舊動畫來源與資訊回補計畫

- 規格、Roadmap、狀態、決策及交接在 docs/anime-legacy-enrichment/；執行前閱讀該資料夾文件。
- STAGE_STATE.yaml 是控制狀態來源。A1～A3 僅產生隔離預覽，正式報告、來源與個人紀錄不得修改。
- A4 須先取得使用者對具體預覽及套用列的確認；信心分數不等於正式寫入授權。
- 預覽輸出在 output/anime-legacy-enrichment/；不可把舊動畫回補加入 update:all。
