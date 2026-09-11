# CatchList Reader

CatchList 的 Windows 桌面閱讀器，直接讀取同資料夾內的 `動畫.md`、`電影.md` 與 `遊戲.md`。

遊戲的官方類型與社群標籤都從 `遊戲.md` 讀取，不需要 `遊戲標籤.json`。新版遊戲紀錄會包含獨立的 `社群標籤:` 行；若該行是「尚未補齊社群標籤」，畫面會先顯示官方類型並保留缺漏提示。舊版完整初始化報告仍可直接使用原本內嵌的社群標籤。

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
