// ============================================================
// config.js — 設定檔：API Key、轉換公式、類型修正係數
// ============================================================

export const CONFIG = {
  // OMDb API Key（免費申請：https://www.omdbapi.com/apikey.aspx）
  // 不填也可以，工具會自動改用 IMDb 公開數據集
  OMDB_API_KEY: "YOUR_OMDB_API_KEY_HERE",

  // TMDb API Key（免費申請：https://www.themoviedb.org/settings/api）
  // 用於查詢電影的台灣中文片名，不填則保留英文原名
  TMDB_API_KEY: "YOUR_TMDB_API_KEY_HERE",

  // 輸出檔案
  OUTPUT_FILE: "D:/GoogleDrive_Sync/電影.md",

  // 預設抓取最近幾個月
  MONTHS_TO_FETCH: 3,

  // 單軌篩選門檻
  DOUBAN_THRESHOLD: 7.0,       // 豆瓣估算評分門檻
  MIN_VOTES_ABSOLUTE: 30000,   // 絕對最低投票數門檻 (熱門度指標)
};

// ============================================================
// 轉換公式：IMDb ➔ 豆瓣修正係數
// 基於 100 部電影大數據線性回歸（r = 0.773）
// ============================================================

export const ADJUSTMENTS = {
  base:             -0.15,   // 一般外國真人電影（基準）
  animation:        +0.30,   // 動畫片（豆瓣偏好動畫）
  documentary:      +0.10,   // 紀錄片
  drama_arthouse:   +0.10,   // 文藝/劇情/得獎片
  comedy:           -0.10,   // 喜劇（文化幽默差異）
  horror:           -0.20,   // 驚悚/恐怖片
  action_blockbuster: -0.50, // 重特效爆米花大片（豆瓣最嚴苛）
  chinese:          +0.70,   // 華語本土電影（主場情感共鳴）
};

export const ADJUSTMENT_LABELS = {
  base:               "一般外國片 (-0.15)",
  animation:          "動畫片 (+0.30)",
  documentary:        "紀錄片 (+0.10)",
  drama_arthouse:     "文藝劇情 (+0.10)",
  comedy:             "喜劇 (-0.10)",
  horror:             "驚悚恐怖 (-0.20)",
  action_blockbuster: "商業特效 (-0.50)",
  chinese:            "華語片 (+0.70)",
};

// 判斷為「特效商業大片」的關鍵字
export const BLOCKBUSTER_KEYWORDS = [
  "Godzilla", "Kong", "Transformers", "Fast &", "Fast X",
  "Avengers", "Justice League", "Aquaman", "Shazam",
  "Jurassic", "Mortal Kombat",
];

// 判斷為「華語電影」的製作國
export const CHINESE_COUNTRIES = ["China", "Hong Kong", "Taiwan"];

// 月份中文對照
export const MONTH_ZH = [
  "全年度", "1月", "2月", "3月", "4月", "5月", "6月",
  "7月", "8月", "9月", "10月", "11月", "12月",
];
