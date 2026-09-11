// ============================================================
// config.js — Steam 遊戲發掘工具設定檔
// ============================================================

export const CONFIG = {
  // 輸出檔案名稱
  OUTPUT_FILE: "G:/我的雲端硬碟/CatchList/遊戲.md",
  // 沉澱期（月）：往前推 N 個月以前上市的遊戲才列入考慮（確保評價有足夠時間累積）
  SETTLE_MONTHS: 6,

  // 評價門檻：好評率至少 85%，且總評論數必須大於 500 則
  MIN_POSITIVE_PCT: 85,
  MIN_TOTAL_REVIEWS_EXCLUSIVE: 500,

  // Steam 商店搜尋不是公開 Web API，沒有官方固定配額；保守節流以降低 429 風險。
  SEARCH_REQUEST_DELAY_MS: 10000,
  SEARCH_RATE_LIMIT_DELAY_MS: 60000,
  SEARCH_MAX_RETRIES: 2,
  // 舊年份資料可能超出初始索引範圍；定位時可逐步擴大，但不得無限掃描。
  SEARCH_MAX_START: 200000,
  SEARCH_MAX_LOCATE_ATTEMPTS: 20,

  // 搜尋語言：固定留空以搜尋全語系，避免漏掉只支援繁體或簡體中文的遊戲。
  SUPPORTED_LANG: "",

  // 過濾開關
  EXCLUDE_FREE_TO_PLAY: true,      // 是否排除免費遊戲
  EXCLUDE_VR_ONLY: true,           // 是否排除 VR 專用遊戲
  EXCLUDE_ADULT_CONTENT: false,    // 是否排除 18+ 成人/性內容遊戲 (預設不排除，色色很健康！)
  EXCLUDE_SOFTWARE: true,          // 是否排除非遊戲實用軟體 (例如桌布軟體、開發工具)

  // 每月中文對照
  MONTH_ZH: [
    "全年度", "1月", "2月", "3月", "4月", "5月", "6月",
    "7月", "8月", "9月", "10月", "11月", "12月",
  ]
};

// 排除的競技類 tag / genre 名稱與 ID
export const EXCLUDED_COMPETITIVE_TAGS = [
  1718,   // MOBA
  17698,  // Battle Royale (大逃殺)
  1753,   // MMORPG
  128,    // Massively Multiplayer (大型多人線上)
];

// 排除的實用軟體類別名稱 (用於過濾非遊戲軟體)
export const EXCLUDED_SOFTWARE_GENRES = [
  "Utilities",
  "Design & Illustration",
  "Web Publishing",
  "Software Training",
  "Education",
  "Audio Production",
  "Video Production",
];
