---
name: find-anime
description: 搜尋季節動畫與名稱轉換。當使用者說「找」、「找動畫」、「搜尋動畫」、「查動畫」、「翻譯」、「名稱轉換」、「寫入」、「更新」、「補齊」、「同步」時自動觸發。Trigger on 找, 找動畫, 搜尋動畫, 翻譯, 名稱轉換, 寫入, 更新, 補齊, 同步.
---

# 找動畫

透過自然語言抓取 MAL（Jikan）季節動畫評分，並以 Bangumi 補上中文名稱。

> **腳本共用**：本 skill 不另存腳本，直接呼叫 `.cursor/skills/find-anime/` 下既有的 Node 腳本，與 Cursor / Claude 架構共用同一份程式，單一來源、行為一致。

## 可用動作

| 觸發關鍵字 | 動作 | 細節 |
|-----------|------|------|
| 找 / 找動畫 / 搜尋動畫 / 查動畫 | 搜尋季節動畫 | [find.md](find/find.md) |
| 翻譯 / 名稱轉換 / 中文 / 中文名 | 動畫名稱轉換 | [translate.md](translate/translate.md) |
| 寫入 / 寫入清單 / 存到檔案 | 將暫存動畫清單寫入檔案 | [write.md](write/write.md) |
| 更新 / 更新動畫 / 補齊 / 同步 | 自動補齊缺失季度 | [update.md](update/update.md) |

## 專案位置

`d:\練習\spiderMAL`（所有指令都在此目錄下執行）
