# 下一個 task 交接

## 交接模式

`start-next-stage`

## 整體目標

依現有 Steam 抓取器重新建立 2015-01 至 2026-03 的本機遊戲資料。只寫入 `steam_discovery/preview/`，不修改檢視器，也不寫入或覆蓋雲端 `遊戲.md`。每年一個 task，年度內逐月串行；年度 PASS 才可建立下一年。

## 目前階段與狀態

- 計畫修訂：2
- 前一階段：Y2025，`accepted / PASS`
- 目標階段：Y2024，`planned`
- 後續階段：Y2023 → Y2015
- 固定模型：`gpt-5.6-luna`
- 固定思考程度：`low`

## 建立 task 的必要結構

建立 task 時，`projectId` **必須**放在 `target` 內：

```js
{
  model: "gpt-5.6-luna",
  thinking: "low",
  target: {
    type: "project",
    projectId: "b6066e75-7984-4d3b-91da-170208ca6144",
    environment: { type: "local" }
  }
}
```

禁止將 `projectId` 放在最外層；那會造成 `create_thread received invalid arguments`。建立成功後先確認 task ID 與實際路徑為 `D:/練習/CatchList`，才可開始 Y2024。

## 本 task 目標

1. 讀取 `AGENTS.md` 與 `docs/steam-game-data-refresh/` 全部文件，核對 `STAGE_STATE.yaml`。
2. 執行 `npm test --workspace steam_discovery`。
3. 在同一 task 內依序抓取 2024-12 至 2024-01；一次只執行一個月：

   `npm run update --workspace steam_discovery -- --year 2025 --month MM --output "D:/練習/CatchList/steam_discovery/preview/遊戲.md"`

4. 年度月份完成後執行 `--backfill-tags`。社群標籤抓不到可留空並記錄，不阻擋年度。
5. 驗證月份、AppID、門檻、中文欄位、成功取得的標籤、檢視器可讀與雲端雜湊未變；PASS 後才交接 Y2023。

## 測試與驗證證據

- Y2025：2025-12 至 01 已完成；累積 584 筆 AppID、無重複。
- 累積標籤：581/584；3280350、2680010、3061810 留空並記錄，非阻擋。
- Steam 測試：22/22 通過。
- 檢視器測試：52 通過、1 略過、0 失敗。
- 雲端 SHA-256 基準：`BD288833CCDDF647414789CA10366317C37B5D11E92D187A064C546B151D0217`。

## 已知問題與風險

- Steam 限流或網路失敗：留在同月重試並記錄，不跳月。
- 需要改程式、模型不可用、雲端雜湊改變或完整性無法確認：判定 CONCERNS／FAIL，不建立下一年度 task。
- 不開子代理、不並行；`max_workers: 1`。

## 工作區與 Git 狀態

- 在修改前重新核對實際路徑、HEAD 與 `git status --short`。
- 既有未提交修改屬使用者；不得清理、commit、push 或覆寫。
