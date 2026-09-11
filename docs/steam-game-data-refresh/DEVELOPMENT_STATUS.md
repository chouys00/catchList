# 開發狀態

## 目前摘要

- 計畫修訂：4
- 狀態：已由 `steam-data-initialization` 取代，不再接續執行
- 最後停留階段：Y2022（needs_replan / CONCERNS，未寫入資料）
- 下一階段：無
- 已接受成果：Y2026～Y2023
- 未執行範圍：Y2022～Y2015，已由完整初始化涵蓋

## 階段進度

| 階段 | 狀態 | 閘門 | 備註 |
|---|---|---|---|
| Y2026 | accepted | PASS | 03、02、01；96 款、標籤 95/96 |
| Y2025 | accepted | PASS | 12 → 01；488 款、標籤 486/488 |
| Y2024 | accepted | PASS | 12 → 01；402 款、標籤 399/402 |
| Y2023 | accepted | PASS | 12 → 01；316 款、標籤 304/316 |
| Y2022 | needs_replan | CONCERNS | 未寫入；不再由本計畫執行 |
| Y2021 | planned | — | 未執行；已由完整初始化取代 |
| Y2020 | planned | — | 未執行；已由完整初始化取代 |
| Y2019 | planned | — | 未執行；已由完整初始化取代 |
| Y2018 | planned | — | 未執行；已由完整初始化取代 |
| Y2017 | planned | — | 未執行；已由完整初始化取代 |
| Y2016 | planned | — | 未執行；已由完整初始化取代 |
| Y2015 | planned | — | 未執行；已由完整初始化取代 |

## 目前採用的結果

- 雲端 `遊戲.md` 已由使用者授權替換為完整初始化結果，共 3,111 個唯一 AppID。
- 雲端檔案 SHA-256：`D4EBC532D6A04337FA8D9D49179CA1AAF1BE5728157898D65653329B765727CC`。
- 3,111 筆抓取原始資料保留於 `steam_discovery/.local-backups/passed-3111-raw-20260910/`。
- 舊 `steam_discovery/preview/` 中間成果已刪除並停止追蹤。
- Steam 套件測試：63 通過、0 失敗。

## 後續執行方式

不得再以 `staged-task-runner` 建立 Y2022～Y2015 task。日常新增資料改由既有的 `npm run update:games` 每月流程處理。
