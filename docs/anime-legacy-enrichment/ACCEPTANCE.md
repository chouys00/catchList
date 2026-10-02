# 驗收帳本

| 代號 | 階段 | 類型 | 狀態 | 證據 | 日期／決定者 |
|---|---|---|---|---|---|
| ACC-01 | A2 | non-blocking | pending | 外部來源缺口與失敗紀錄 | 尚未執行 |
| ACC-03 | A3→A4 | blocking | pending | 使用者確認指定 run、列與欄位差異 | 尚未確認 |
| ACC-04 | A4 | non-blocking | pending | 影片播放及 Drive 遠端同步 | 尚未驗證 |

ACC-03 必須由使用者確認，只有使用者能將驗收設為 waived。A3 可先交付預覽，未通過 ACC-03 不得進入 A4；到達此關卡時更新 blocking_acceptance_open。程式安全與完整性檢查由各階段執行者驗證並留證，不能用外部來源缺口豁免正式資料保護。
