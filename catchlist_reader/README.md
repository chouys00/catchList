# CatchList Reader

CatchList 的 Windows 桌面閱讀器，直接讀取同資料夾內的 `動畫.md`、`電影.md` 與 `遊戲.md`。

目前版本為 `1.0.3`。每次調整閱讀器的介面或功能時，都必須將 `catchlist_reader/package.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml` 與兩套介面標題列的版本號同步遞增；`npm run reader:test` 會檢查這些設定是否一致。

## 開發

```powershell
npm run reader:dev
```

開發時若報告不在閱讀器旁，可設定資料夾：

```powershell
$env:CATCHLIST_DATA_DIR = 'G:\我的雲端硬碟\CatchList'
npm run reader:dev
```

## 測試與建置

```powershell
npm run reader:test
npm run reader:build
```

可攜版會輸出到 `catchlist_reader/dist/`。正式使用時，把 EXE 放到三份 Markdown 的同一資料夾。

刪除作品前會在資料資料夾的 `.catchlist-backups/` 建立備份；閱讀器內可復原最後一次刪除。
