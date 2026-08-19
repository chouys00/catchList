# CatchList — 動畫／電影／遊戲／真人劇追蹤 monorepo

四個追蹤專案會把「值得看／玩」的清單增量寫入 Markdown 報告：

| 專案 | 內容 | 輸出 | 資料來源 |
|------|------|------|----------|
| `spiderMAL` | 每季動畫(評分 ≥ 7.70) | `動畫.md` | Jikan/MAL + Bangumi 中文名(AniList 備援) |
| `imdb_tracker` | 每月電影(豆瓣估算 ≥ 7.0、≥ 30000 票) | `電影.md` | IMDb 公開數據集 + Wikidata/TMDb 翻譯 |
| `steam_discovery` | 每月優質單機遊戲(壓倒性/極度好評) | `遊戲.md` | Steam 商店搜尋頁 + appdetails API |
| `live_action_tracker` | 每月優質真人劇（五區獨立排序） | `真人劇.md` | TMDb + IMDb + Wikidata |

共用邏輯在 `packages/core`(月份計算、Markdown 區段存取、HTTP 重試、JSON 快取)。

## 每月更新(排程任務請執行這個)

```
cd D:\練習\CatchList
npm run update:all
```

或直接執行 `run_monthly.bat`(同上,另會把完整輸出寫到 `logs\update-*.log`)。

也可單獨更新某個專案：`npm run update:anime` / `npm run update:movies` / `npm run update:games` / `npm run update:tv`。

### 執行特性(排程器/agent 須知)

- **冪等**:程式會解析既有報告找出缺漏的月份/季度,只回補缺的;無缺漏時幾秒內直接結束。同一個月重複執行是安全的。
- **沉澱期**：電影、遊戲與真人劇只回補「6 個月前」的月份（讓評分沉澱），動畫回補到上一季。所以每月執行一次，每次通常只補 1 個月／季。
- **逐月寫入**:每完成一個月份就立即寫入報告,中途失敗不影響已完成的部分,下次執行自動續補。
- **exit code**:全部成功 = 0;任何專案失敗 = 非 0。失敗時看 console 輸出或 `logs\` 下的記錄檔,重跑一次通常即可(常見原因是 API 限流或網路逾時)。
- **真人劇權杖**：執行 `update:tv` 或 `update:all` 前，真人劇會優先讀取程序環境的 `TMDB_API_TOKEN`，未設定時才讀取專案內 `live_action_tracker/.env` 的同名欄位。`.env` 僅限本機一般檔案，受 Git 排除，不得提交、寫入記錄檔或複製到同步資料夾。兩者皆未設定時，真人劇項目會在連線前失敗；其餘三項仍會繼續執行，總指令最後以非零結束碼回報。
- **執行時間**：動畫約幾分鐘；電影需串流下載 IMDb 資料集（數百 MB），約 10–20 分鐘；遊戲因請求間隔 1.5 秒，約 5–15 分鐘；真人劇時間會依 TMDb、Wikidata 與 IMDb 資料量而異。

## 開發須知

- 套件管理:npm workspaces,在根目錄執行 `npm install`。
- 各專案設定(輸出路徑、門檻)在各自的 `config.js`;spiderMAL 在 `.cursor/skills/find-anime/lib/constants.js`。
- spiderMAL 的程式碼位於 `.cursor/skills/find-anime/`(三套 IDE skill 共用同一份腳本,單一來源)。
- 報告檔同時是狀態來源(用區段標題判斷哪些月份已完成),手動編輯報告時不要更動「YYYY  M月」標題行與 `------------------------------` 分隔線。

## 規劃中的功能

- 真人劇追蹤器已完成 A1～A3，A4 正在整合根目錄排程；規格、階段、決策與下一步入口集中在 `docs/live-action-tracker/`。
- `docs/live-action-tracker/STAGE_STATE.yaml` 是真人劇追蹤器的控制狀態來源；實作或修訂前先讀取該資料夾內的規劃文件。
