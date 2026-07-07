# 名稱轉換（翻譯動畫名稱）

## 專案位置

`d:\練習\spiderMAL`

## 執行指令

```bash
node .cursor/skills/find-anime/translate/translate.js <原始名稱>
```

- **原始名稱**：通常為日文或原文標題，例如：`薫る花は凛と咲く`

## 觸發關鍵字與句型

當使用者訊息中包含以下任一關鍵詞時，會啟用此「名稱轉換」動作：

- `翻譯`
- `名稱轉換`
- `中文`
- `中文名`
- `中文名稱`

### 句型解析規則

- **「翻譯 XXX」**
  - 例：`翻譯 薫る花は凛と咲く`
  - 解析結果：`rawTitle = "薫る花は凛と咲く"`
- **「XXX 中文」 / 「XXX 中文名」 / 「XXX 中文名稱」**
  - 例：`薫る花は凛と咲く 中文名`
  - 解析結果：`rawTitle = "薫る花は凛と咲く"`

解析出的 `rawTitle` 會作為指令參數傳給：

```bash
node .cursor/skills/find-anime/translate/translate.js 薫る花は凛と咲く
```

## 資料來源

- **唯一資料來源：Bangumi**
  - 透過 Bangumi 提供的 API 依 `rawTitle` 進行搜尋。
  - 僅使用 Bangumi 的資料，不再依賴巴哈姆特或爬蟲。

### 查詢與選擇邏輯（概念）

1. 呼叫 Bangumi 搜尋 API，`keyword = rawTitle`，類型限定為動畫。
2. 從結果中：
   - 優先選擇有 `name_cn`（中文標題）的作品。
   - 若多筆，依分數、排名或與 `rawTitle` 的相似度選出最可能的一筆。
3. 若找到中文標題：
   - 回傳該中文名稱與來源標記 `Bangumi`。
4. 若找不到任何中文名稱：
   - 顯示提示訊息表示目前在 Bangumi 找不到對應的中文名。

## 輸出格式

執行成功且找到中文名稱時，終端機輸出範例：

```text
原始名稱：薫る花は凛と咲く
中文名稱：薰る花盛開之時
來源：Bangumi
連結：https://bangumi.tv/subject/xxxxxx
```

若 Bangumi 無法找到對應中文名稱，則可能輸出：

```text
原始名稱：薫る花は凛と咲く
目前在 Bangumi 找不到此作品的中文名稱。
```

## 範例

| 使用者輸入                     | 解析 rawTitle          | 執行指令                                                            |
|------------------------------|------------------------|---------------------------------------------------------------------|
| 翻譯 薫る花は凛と咲く          | `薫る花は凛と咲く`      | `node .cursor/skills/find-anime/translate/translate.js 薫る花は凛と咲く` |
| 薫る花は凛と咲く 中文名        | `薫る花は凛と咲く`      | `node .cursor/skills/find-anime/translate/translate.js 薫る花は凛と咲く` |
| 幫我查 薫る花は凛と咲く 的中文名稱 | `薫る花は凛と咲く`      | `node .cursor/skills/find-anime/translate/translate.js 薫る花は凛と咲く` |

