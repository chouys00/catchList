# 搜尋季節動畫

## 專案位置

`d:\練習\spiderMAL`

## 執行指令

```bash
node .cursor/skills/find-anime/find/find.js [年份] [季節] [最低評分]
```

- **季節**可填：`winter`（冬）、`spring`（春）、`summer`（夏）、`fall`（秋）
- 省略參數時預設為 **2025 winter，評分 >= 7.70**
- 執行後會自動查詢每部動畫的 Bangumi 中文名稱，輸出含中文名的完整清單

## 使用流程

1. 從使用者輸入判斷年份與季節
   - 有指定 → 帶入對應參數
   - 未指定 → 使用預設值（2025 winter）
2. 在 `d:\練習\spiderMAL` 目錄執行指令
3. 將輸出結果顯示給使用者

## 季節對應

| 使用者說 | season 參數 |
|---------|-------------|
| 冬季 / winter / 冬天 | `winter` |
| 春季 / spring / 春天 | `spring` |
| 夏季 / summer / 夏天 | `summer` |
| 秋季 / fall / 秋天   | `fall`   |

## 範例

| 使用者輸入 | 執行指令 |
|-----------|---------|
| 找動畫 | `node .cursor/skills/find-anime/find/find.js` |
| 找 2024 春季動畫 | `node .cursor/skills/find-anime/find/find.js 2024 spring` |
| 搜尋 2025 秋天的動畫 | `node .cursor/skills/find-anime/find/find.js 2025 fall` |
| 幫我查 2023 夏季動畫 | `node .cursor/skills/find-anime/find/find.js 2023 summer` |
| 找 2022 冬季評分 8 以上 | `node .cursor/skills/find-anime/find/find.js 2022 winter 8` |
