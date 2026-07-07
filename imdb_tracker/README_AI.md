# IMDb ➔ 豆瓣估算評分轉換器 | AI-Oriented Developer Documentation

本文件專為 AI 開發助手（LLM / AI Agent）設計，旨在提供 `imdb_tracker` 專案的核心邏輯、架構設計、模組職責及資料流向說明，以便 AI 能夠快速理解並安全地進行維護、除錯與功能擴充。

---

## 📌 專案定位與核心目的

此專案是一個自動化資料管道（Data Pipeline），主要解決 **IMDb 與豆瓣用戶評分習慣存在顯著差異** 的問題。透過收集 IMDb 熱門電影數據，並結合基於大數據統計的「豆瓣偏好修正係數」進行線性回歸估算，最終篩選出高口碑（估算分 $\ge 7.0$）且已穩定（沉澱期大於 6 個月）的電影，增量輸出為繁體中文 Markdown 報告 `電影.md`。

### 核心機制
1. **歷史沉澱期鎖定（6 個月機制）**：
   新上映電影的評分與投票數在初期會劇烈波動。為確保報告的準確性與不可變性（Immutable History），主程式**僅回補並鎖定 6 個月以前（含）的歷史月份電影資料**。近 6 個月內的電影不會寫入，待其評分沉澱後才進行抓取。
2. **國際發行資格過濾**：
   利用 IMDb 官方提供的發行地區數據，排除僅在印度本土或僅在美英印僑民社區上映的地方性電影，只保留真正具有國際發行影響力或已在台灣上映的影片。
3. **無 Key 備援與快取友善**：
   設計了同時支援 API（OMDb, TMDb）與免 Key（IMDb 公開 TSV.GZ 數據集串流解壓、Wikidata SPARQL 查詢、Google 翻譯）的混合同步邏輯，並內建本地檔案快取以防止觸發 API 頻率限制。

---

## 📂 系統架構與模組職責

```
imdb_tracker/
├── main.js              # 入口協調器 (Orchestrator)
├── config.js            # 全域組態與修正參數 (Configuration & Math Formula)
├── fetcher.js           # 數據源抓取與串流解析 (IMDb Gzip Stream Reader & OMDb API)
├── region_filter.js     # 國際市場過濾 (Market-based Region Filter)
├── translator.js        # 翻譯與上映日填充 (Metadata Enhancer: TMDb / Wikidata / Google)
├── writer.js            # 報告讀寫與增量更新 (Incremental Markdown Writer)
├── .title_cache.json    # 本地翻譯快取 (Local Cache, Git 忽略)
└── 電影.md              # 自動生成的結果報告 (Output Markdown Report)
```

### 1. `config.js` — 組態設定
* **職責**：管理系統門檻、API 金鑰及公式修正係數。
* **關鍵變數**：
  * `DOUBAN_THRESHOLD` (預設 `7.0`)：寫入 `電影.md` 的最低估算分門檻。
  * `MIN_VOTES_ABSOLUTE` (預設 `30,000`)：過濾熱門度的最低投票數。
  * `ADJUSTMENTS`：各類型電影的修正係數。

### 2. `main.js` — 執行流程控制
* **職責**：計算日期範圍、調度模組、執行增量更新。
* **流程**：
  1. 計算當前時間前推 6 個月的「沉澱期目標終點」`targetEnd`。
  2. 讀取現有 `電影.md`，找出已記錄的最早月份作為起點。
  3. 比對起點到目標終點之間，有哪些月份在 `電影.md` 中**缺漏**，將其列為待回補清單。
  4. 呼叫 `region_filter.js` 下載並建立國際發行 ID 集合。
  5. 逐年下載該年度 IMDb 資料，過濾出符合投票門檻的電影。
  6. 呼叫 `translator.js` 查詢中文片名與確切上映日期。
  7. 分組歸類到各月份，將結果傳給 `writer.js` 寫入 `電影.md`。

### 3. `fetcher.js` — 數據抓取與 Gzip 串流解析
* **職責**：下載 IMDb 官方每日更新的 TSV.GZ 數據集，或使用 OMDb API 查詢細節。
* **核心方法**：
  * `streamTsvGz(url, onRow)`：使用 `axios` 請求串流，並透過 `zlib.createGunzip()` 實時解壓，利用 `readline` 逐行解析，避免將數 GB 的 TSV 檔案一次載入記憶體。
  * `fetchFromDataset(targetYear)`：串流下載並關聯 `title.ratings.tsv.gz` 和 `title.basics.tsv.gz`，過濾出目標年份且 `votes >= MIN_VOTES_ABSOLUTE` 的電影。

### 4. `region_filter.js` — 國際市場過濾
* **職責**：解決 IMDb 數據中混入大量非主流、無國際發行電影的問題。
* **判定邏輯**：
  1. **強資格區域**：在台灣（`TW`）有發行紀錄的電影直接通過。
  2. **多市場群組發行**：在以下市場群組中，發行紀錄**跨越至少 2 個不同的群組**則視為國際發行：
     * `english` (美、英、澳、加、紐、愛)
     * `japanese` (日本)
     * `korean` (韓國)
     * `chinese` (港、澳、中)
     * `european` (德、法、意、西、荷、瑞典等)
     * `other` (墨、巴西、星、馬、泰、南非等)
  3. **僑民發行排除**：在英語群組中，若語言代碼為印度系語言（如 `ta` 泰米爾、`te` 泰盧固等），排除該發行紀錄計入英語群組，以過濾僅供僑民觀賞的非國際化印度片。
* **核心方法**：
  * `buildInternationalIdSet()`：下載並串流解析 `title.akas.tsv.gz`（發行版本對照表），產出符合資格的 `imdbId` 集合。

### 5. `translator.js` — 翻譯與元數據增強
* **職責**：獲取繁體中文（台灣優先）片名，並獲取精確到「日」的上映日期以供月份歸類。
* **獲取管道優先順序**：
  1. **TMDb API (有 Key 模式)**：藉由 `api_key` 以 `imdb_id` 查詢，精確度最高。
  2. **Wikidata SPARQL 查詢 (免 Key 模式)**：若無 TMDb Key，向維基數據查詢電影對應的 IMDb ID（`P345`），並擷取中文官方譯名與最早上映日期（`P577`）。
  3. **Google 翻譯 (免 Key 備援)**：若上述皆無結果，直接將英文片名透過 Google 翻譯網頁版 API 直譯為繁中。
* **核心方法**：
  * `enrichAndTranslateMovies(movies)`：協調翻譯，並讀寫 `.title_cache.json` 快取以加速二次執行。

### 6. `writer.js` — 增量報告寫入器
* **職責**：讀取、解析、合併並降序排列輸出 `電影.md`。
* **核心方法**：
  * `loadExistingSections(filepath)`：解析現有報告中，以 `------------------------------` 分隔的歷史區塊，建立 `Map<"YYYY-MM", BlockContent>`。
  * `updateReport(allMonthData)`：將新計算出來的月份區塊插入 Map 中（若已有同月份則覆蓋），並依照年月由新到舊（降序）排序，重新拼接寫入 `電影.md`。

---

## 📐 核心算法：IMDb ➔ 豆瓣估算評分公式

豆瓣估算評分的生成基於 100 部近 5 年熱門電影的 IMDb 評分與豆瓣評分進行的線性回歸分析（相關係數 $r = 0.773$），並依照電影類型偏好進行微調：

$$\text{豆瓣估算評分} = \min(10, \max(0, \text{IMDb 評分} + \text{類型修正值}))$$

### 類型修正值（`config.js` 中的 `ADJUSTMENTS`）

| 類型分類 | 修正值 | 判定邏輯 / 豆瓣偏好說明 |
| :--- | :---: | :--- |
| **華語本土電影** (`chinese`) | `+0.70` | 製作國家含有 China, Hong Kong, Taiwan。豆瓣對華語本土電影有強烈的情感加成。 |
| **動畫片** (`animation`) | `+0.30` | 類型中含有 Animation。豆瓣社群極度偏愛動畫電影。 |
| **紀錄片** (`documentary`) | `+0.10` | 類型中含有 Documentary。通常評分基數偏高。 |
| **文藝/劇情/得獎片** (`drama_arthouse`) | `+0.10` | 類型中含有 Drama, Biography, History, War, Music, Musical。符合豆瓣文藝社群胃口。 |
| **一般外國真人電影** (`base`) | `-0.15` | 預設基準值。一般好萊塢/外國真人電影。 |
| **喜劇片** (`comedy`) | `-0.10` | 類型中含有 Comedy。喜劇幽默感存在跨文化隔閡，豆瓣評分通常略低。 |
| **驚悚/恐怖片** (`horror`) | `-0.20` | 類型中含有 Horror。豆瓣對恐怖片題材評分極為嚴苛。 |
| **商業特效大片** (`action_blockbuster`) | `-0.50` | 標題符合 `BLOCKBUSTER_KEYWORDS`（如 Transformers, Godzilla, Avengers）。爆米花特效片在豆瓣上通常得分偏低。 |

* **判定優先順序**：華語片 `chinese` $\rightarrow$ 動畫 `animation` $\rightarrow$ 紀錄片 `documentary` $\rightarrow$ 特效大片 `action_blockbuster` $\rightarrow$ 恐怖 `horror` $\rightarrow$ 喜劇 `comedy` $\rightarrow$ 文藝劇情 `drama_arthouse` $\rightarrow$ 基準 `base`。

---

## 🛠️ 開發與維護指南

### 1. 安裝與執行
```bash
# 安裝 npm 套件 (axios, commander, dayjs)
npm install

# 執行主程式（預設會尋找歷史並補齊 6 個月前缺漏的月份）
node main.js
```

### 2. 快取與 API Key 設定
* 若要提高片名翻譯及上映日期的準確度，請在 `config.js` 中設定 `TMDB_API_KEY`。
* 暫存的 `.title_cache.json` 會儲存 `imdbId` 對應的中文片名與上映日，請勿刪除以避免重新拉取時觸發 API 流量限制。
