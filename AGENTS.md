# CatchList — 動畫/電影/遊戲追蹤 monorepo

三個抓取專案,把「值得看/玩」的清單增量寫入 `D:/GoogleDrive_Sync/` 下的 Markdown 報告:

| 專案 | 內容 | 輸出 | 資料來源 |
|------|------|------|----------|
| `spiderMAL` | 每季動畫(評分 ≥ 7.70) | `動畫.md` | Jikan/MAL + Bangumi 中文名(AniList 備援) |
| `imdb_tracker` | 每月電影(豆瓣估算 ≥ 7.0、≥ 30000 票) | `電影.md` | IMDb 公開數據集 + Wikidata/TMDb 翻譯 |
| `steam_discovery` | 每月優質單機遊戲(壓倒性/極度好評) | `遊戲.md` | Steam 商店搜尋頁 + appdetails API |

共用邏輯在 `packages/core`(月份計算、Markdown 區段存取、HTTP 重試、JSON 快取)。

## 每月更新(排程任務請執行這個)

```
cd D:\練習\CatchList
npm run update:all
```

或直接執行 `run_monthly.bat`(同上,另會把完整輸出寫到 `logs\update-*.log`)。

也可單獨更新某個專案:`npm run update:anime` / `npm run update:movies` / `npm run update:games`。

### 執行特性(排程器/agent 須知)

- **冪等**:程式會解析既有報告找出缺漏的月份/季度,只回補缺的;無缺漏時幾秒內直接結束。同一個月重複執行是安全的。
- **沉澱期**:電影與遊戲只回補「6 個月前」的月份(讓評分沉澱),動畫回補到上一季。所以每月執行一次,每次通常只補 1 個月/季。
- **逐月寫入**:每完成一個月份就立即寫入報告,中途失敗不影響已完成的部分,下次執行自動續補。
- **exit code**:全部成功 = 0;任何專案失敗 = 非 0。失敗時看 console 輸出或 `logs\` 下的記錄檔,重跑一次通常即可(常見原因是 API 限流或網路逾時)。
- **執行時間**:動畫約幾分鐘;電影需串流下載 IMDb 數據集(數百 MB),約 10–20 分鐘;遊戲因請求間隔 1.5 秒,約 5–15 分鐘。

## 開發須知

- 套件管理:npm workspaces,在根目錄執行 `npm install`。
- 各專案設定(輸出路徑、門檻)在各自的 `config.js`;spiderMAL 在 `.cursor/skills/find-anime/lib/constants.js`。
- spiderMAL 的程式碼位於 `.cursor/skills/find-anime/`(三套 IDE skill 共用同一份腳本,單一來源)。
- 報告檔同時是狀態來源(用區段標題判斷哪些月份已完成),手動編輯報告時不要更動「YYYY  M月」標題行與 `------------------------------` 分隔線。
